import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { User } from "@prisma/client";
import argon2 from "argon2";
import { createHash, randomBytes } from "crypto";
import { CookieOptions } from "express";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { AuthenticatedUser } from "./auth.types";

interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auditLogs: AuditLogsService
  ) {}

  getCookieName(): string {
    return this.config.get<string>("SESSION_COOKIE_NAME") ?? "avidity_session";
  }

  getCookieOptions(): CookieOptions {
    return {
      ...this.getBaseCookieOptions(),
      maxAge: this.getSessionTtlHours() * 60 * 60 * 1000
    };
  }

  getClearCookieOptions(): CookieOptions {
    return this.getBaseCookieOptions();
  }

  private getBaseCookieOptions(): CookieOptions {
    const secure = (this.config.get<string>("COOKIE_SECURE") ?? "false").toLowerCase() === "true";
    const sameSite = (this.config.get<string>("COOKIE_SAME_SITE") ?? "lax") as CookieOptions["sameSite"];
    const configuredDomain = this.config.get<string>("COOKIE_DOMAIN") || undefined;
    const domain = configuredDomain === "localhost" ? undefined : configuredDomain;

    return {
      httpOnly: true,
      secure,
      sameSite,
      domain,
      path: "/"
    };
  }

  async login(input: LoginDto, context: RequestContext) {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email }
    });

    if (!user || user.deletedAt || !user.isActive) {
      await this.auditLogs.create({
        entityType: "User",
        action: "auth.login_failure",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { email, reason: "unknown_or_inactive_user" }
      });
      throw new UnauthorizedException("Invalid email or password.");
    }

    const passwordMatches = await argon2.verify(user.passwordHash, input.password);
    if (!passwordMatches) {
      await this.auditLogs.create({
        userId: user.id,
        entityType: "User",
        entityId: user.id,
        action: "auth.login_failure",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { email, reason: "invalid_password" }
      });
      throw new UnauthorizedException("Invalid email or password.");
    }

    const sessionToken = randomBytes(32).toString("base64url");
    const tokenHash = this.hashSessionToken(sessionToken);
    const expiresAt = new Date(Date.now() + this.getSessionTtlHours() * 60 * 60 * 1000);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      }
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "User",
      entityId: user.id,
      action: "auth.login_success",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return {
      sessionToken,
      user: await this.buildAuthenticatedUser(user.id)
    };
  }

  async validateSessionToken(sessionToken: string | undefined): Promise<AuthenticatedUser | null> {
    if (!sessionToken) {
      return null;
    }

    const session = await this.prisma.session.findFirst({
      where: {
        tokenHash: this.hashSessionToken(sessionToken),
        revokedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      include: {
        user: {
          include: {
            groups: {
              include: {
                group: {
                  include: {
                    roles: {
                      include: {
                        role: {
                          include: {
                            permissions: {
                              include: {
                                permission: true
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!session || session.user.deletedAt || !session.user.isActive) {
      return null;
    }

    return this.toAuthenticatedUser(session.user);
  }

  async logout(sessionToken: string | undefined, context: RequestContext) {
    if (!sessionToken) {
      return;
    }

    const session = await this.prisma.session.updateMany({
      where: {
        tokenHash: this.hashSessionToken(sessionToken),
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });

    await this.auditLogs.create({
      entityType: "Session",
      action: "auth.logout",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { revokedSessions: session.count }
    });
  }

  private getSessionTtlHours(): number {
    return Number(this.config.get<string>("SESSION_TTL_HOURS") ?? 12);
  }

  private hashSessionToken(sessionToken: string): string {
    return createHash("sha256").update(sessionToken).digest("hex");
  }

  private async buildAuthenticatedUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        groups: {
          include: {
            group: {
              include: {
                roles: {
                  include: {
                    role: {
                      include: {
                        permissions: {
                          include: {
                            permission: true
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!user) {
      throw new UnauthorizedException("Session user was not found.");
    }

    return this.toAuthenticatedUser(user);
  }

  private toAuthenticatedUser(
    user: User & {
      groups: Array<{
        group: {
          roles: Array<{
            role: {
              permissions: Array<{
                permission: {
                  name: string;
                };
              }>;
            };
          }>;
        };
      }>;
    }
  ): AuthenticatedUser {
    const permissions = new Set<string>();
    for (const userGroup of user.groups) {
      for (const groupRole of userGroup.group.roles) {
        for (const rolePermission of groupRole.role.permissions) {
          permissions.add(rolePermission.permission.name);
        }
      }
    }

    return {
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      forcePasswordChange: user.forcePasswordChange,
      permissions: [...permissions].sort()
    };
  }
}
