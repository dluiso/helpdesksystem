import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { User } from "@prisma/client";
import argon2 from "argon2";
import { createHash, randomBytes } from "crypto";
import { CookieOptions } from "express";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { MailDeliveryService } from "../mailboxes/mail-delivery.service";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { AuthenticatedUser } from "./auth.types";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { VerifyMfaLoginDto } from "./dto/verify-mfa-login.dto";
import { decryptSecret, generateSecurityToken, hashSecurityToken, verifyTotpCode } from "./auth-security.util";

interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auditLogs: AuditLogsService,
    private readonly moduleRef: ModuleRef
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
    await this.verifyTurnstileIfNeeded("login", input.captchaToken, context);
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        groups: { include: { group: { include: { roles: { include: { role: true } } } } } }
      }
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

    if (await this.userRequiresMfa(user)) {
      if (!user.mfaEnabled || !user.totpSecretEncrypted) {
        await this.auditLogs.create({
          userId: user.id,
          entityType: "User",
          entityId: user.id,
          action: "auth.login_failure",
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: { email, reason: "mfa_required_not_configured" }
        });
        throw new UnauthorizedException("Multi-factor authentication is required for this account.");
      }
      const challengeToken = generateSecurityToken();
      await this.prisma.mfaLoginChallenge.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          tokenHash: hashSecurityToken(challengeToken),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          ipAddress: context.ipAddress,
          userAgent: context.userAgent
        }
      });

      await this.auditLogs.create({
        userId: user.id,
        entityType: "User",
        entityId: user.id,
        action: "auth.mfa_challenge_created",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      });

      return { mfaRequired: true, challengeToken };
    }

    const sessionToken = await this.createSession(user.id, context);

    await this.auditLogs.create({
      userId: user.id,
      entityType: "User",
      entityId: user.id,
      action: "auth.login_success",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return {
      mfaRequired: false,
      sessionToken,
      user: await this.buildAuthenticatedUser(user.id)
    };
  }

  async verifyMfaLogin(input: VerifyMfaLoginDto, context: RequestContext) {
    const challenge = await this.prisma.mfaLoginChallenge.findUnique({
      where: { tokenHash: hashSecurityToken(input.challengeToken) },
      include: { user: true }
    });
    if (!challenge || challenge.usedAt || challenge.expiresAt <= new Date() || !challenge.user.isActive || challenge.user.deletedAt || !challenge.user.totpSecretEncrypted) {
      throw new UnauthorizedException("The authentication challenge is invalid or expired.");
    }

    const secret = decryptSecret(challenge.user.totpSecretEncrypted, this.getSecretEncryptionKey());
    const recoveryCodeMatched = await this.consumeRecoveryCode(challenge.user.id, input.code);
    if (!recoveryCodeMatched && !verifyTotpCode(secret, input.code)) {
      await this.auditLogs.create({
        userId: challenge.user.id,
        entityType: "User",
        entityId: challenge.user.id,
        action: "auth.mfa_failure",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      });
      throw new UnauthorizedException("The authentication code was not accepted.");
    }

    await this.prisma.mfaLoginChallenge.update({
      where: { id: challenge.id },
      data: { usedAt: new Date() }
    });

    const sessionToken = await this.createSession(challenge.user.id, context);
    await this.auditLogs.create({
      userId: challenge.user.id,
      entityType: "User",
      entityId: challenge.user.id,
      action: recoveryCodeMatched ? "auth.mfa_recovery_code_success" : "auth.mfa_success",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return {
      sessionToken,
      user: await this.buildAuthenticatedUser(challenge.user.id)
    };
  }

  async forgotPassword(input: ForgotPasswordDto, context: RequestContext) {
    await this.verifyTurnstileIfNeeded("passwordReset", input.captchaToken, context);
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const settings = user ? await this.getSecuritySettings(user.organizationId) : null;

    if (user && !user.deletedAt && user.isActive && settings?.passwordResetEnabled !== false) {
      const token = generateSecurityToken();
      const expiresAt = new Date(Date.now() + (settings?.passwordResetTokenTtlMinutes ?? 30) * 60 * 1000);
      await this.prisma.passwordResetToken.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          tokenHash: hashSecurityToken(token),
          expiresAt
        }
      });

      try {
        await this.sendPasswordResetEmail(user.organizationId, user.email, token);
        await this.auditLogs.create({
          userId: user.id,
          entityType: "User",
          entityId: user.id,
          action: "auth.password_reset_requested",
          ipAddress: context.ipAddress,
          userAgent: context.userAgent
        });
      } catch (error) {
        await this.auditLogs.create({
          userId: user.id,
          entityType: "User",
          entityId: user.id,
          action: "auth.password_reset_email_failed",
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: { message: error instanceof Error ? error.message : "Unknown error" }
        });
      }
    } else {
      await this.auditLogs.create({
        entityType: "User",
        action: "auth.password_reset_requested",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { email, result: "generic" }
      });
    }

    return { ok: true };
  }

  async resetPassword(input: ResetPasswordDto, context: RequestContext) {
    const reset = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashSecurityToken(input.token) },
      include: { user: true }
    });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date() || reset.user.deletedAt || !reset.user.isActive) {
      throw new UnauthorizedException("The password reset link is invalid or expired.");
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: reset.userId },
        data: {
          passwordHash: await argon2.hash(input.newPassword, { type: argon2.argon2id }),
          forcePasswordChange: false
        }
      }),
      this.prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      this.prisma.session.updateMany({ where: { userId: reset.userId, revokedAt: null }, data: { revokedAt: new Date() } })
    ]);

    await this.auditLogs.create({
      userId: reset.userId,
      entityType: "User",
      entityId: reset.userId,
      action: "auth.password_reset_completed",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return { ok: true };
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

  private async createSession(userId: string, context: RequestContext) {
    const sessionToken = randomBytes(32).toString("base64url");
    const tokenHash = this.hashSessionToken(sessionToken);
    const expiresAt = new Date(Date.now() + this.getSessionTtlHours() * 60 * 60 * 1000);

    await this.prisma.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      }
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() }
    });

    return sessionToken;
  }

  private async userRequiresMfa(user: User & { groups: Array<{ group: { roles: Array<{ role: { name: string } }> } }> }) {
    const settings = await this.getSecuritySettings(user.organizationId);
    const isAdmin = user.groups.some((membership) => membership.group.roles.some((roleMembership) => roleMembership.role.name.toLowerCase().includes("admin")));
    return user.mfaEnabled || settings.mfaRequiredForAllUsers || (settings.mfaRequiredForAdmins && isAdmin);
  }

  private async consumeRecoveryCode(userId: string, code: string) {
    const normalized = code.trim().toLowerCase();
    if (!normalized.includes("-")) {
      return false;
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { recoveryCodesHash: true } });
    if (!user) {
      return false;
    }
    let matchedHash: string | null = null;
    for (const hash of user.recoveryCodesHash) {
      if (await argon2.verify(hash, normalized)) {
        matchedHash = hash;
        break;
      }
    }
    if (!matchedHash) return false;
    await this.prisma.user.update({
      where: { id: userId },
      data: { recoveryCodesHash: { set: user.recoveryCodesHash.filter((hash) => hash !== matchedHash) } }
    });
    return true;
  }

  private async getSecuritySettings(organizationId: string) {
    const settings = await this.prisma.systemSetting.findUnique({
      where: { organizationId },
      select: {
        applicationName: true,
        companyName: true,
        supportEmail: true,
        passwordResetEnabled: true,
        passwordResetTokenTtlMinutes: true,
        mfaRequiredForAdmins: true,
        mfaRequiredForAllUsers: true,
        turnstileEnabled: true,
        turnstileSecretReference: true,
        turnstileProtectLogin: true,
        turnstileProtectPasswordReset: true
      }
    });
    return {
      applicationName: settings?.applicationName ?? this.config.get<string>("APP_NAME") ?? "Avidity IT Management Tool",
      companyName: settings?.companyName ?? this.config.get<string>("DEFAULT_COMPANY_NAME") ?? "Avidity Technologies",
      supportEmail: settings?.supportEmail ?? this.config.get<string>("DEFAULT_SUPPORT_EMAIL") ?? "support@aviditytechnologies.com",
      passwordResetEnabled: settings?.passwordResetEnabled ?? true,
      passwordResetTokenTtlMinutes: settings?.passwordResetTokenTtlMinutes ?? 30,
      mfaRequiredForAdmins: settings?.mfaRequiredForAdmins ?? false,
      mfaRequiredForAllUsers: settings?.mfaRequiredForAllUsers ?? false,
      turnstileEnabled: settings?.turnstileEnabled ?? false,
      turnstileSecretReference: settings?.turnstileSecretReference ?? null,
      turnstileProtectLogin: settings?.turnstileProtectLogin ?? false,
      turnstileProtectPasswordReset: settings?.turnstileProtectPasswordReset ?? false
    };
  }

  private async verifyTurnstileIfNeeded(flow: "login" | "passwordReset", token: string | undefined, context: RequestContext) {
    const settings = await this.prisma.systemSetting.findFirst({
      orderBy: { createdAt: "asc" },
      select: {
        turnstileEnabled: true,
        turnstileSecretReference: true,
        turnstileProtectLogin: true,
        turnstileProtectPasswordReset: true
      }
    });
    const required = settings?.turnstileEnabled && (flow === "login" ? settings.turnstileProtectLogin : settings.turnstileProtectPasswordReset);
    if (!required) {
      return;
    }
    if (!token) {
      throw new UnauthorizedException("Security verification is required.");
    }
    const secret = this.resolveSecret(settings.turnstileSecretReference);
    if (!secret) {
      throw new UnauthorizedException("Security verification is not configured.");
    }
    const formData = new URLSearchParams();
    formData.set("secret", secret);
    formData.set("response", token);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData
    });
    const payload = (await response.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!payload.success) {
      await this.auditLogs.create({
        entityType: "Auth",
        action: "auth.turnstile_failure",
        ipAddress: context.ipAddress ?? undefined,
        userAgent: context.userAgent ?? undefined,
        metadata: { flow, errorCodes: payload["error-codes"] ?? [] }
      });
      throw new UnauthorizedException("Security verification failed.");
    }
  }

  private resolveSecret(reference: string | null | undefined) {
    if (!reference) return null;
    if (reference.startsWith("env:")) {
      return this.config.get<string>(reference.slice(4)) ?? null;
    }
    return null;
  }

  private getSecretEncryptionKey() {
    return this.config.get<string>("SESSION_SECRET") ?? "";
  }

  private async sendPasswordResetEmail(organizationId: string, email: string, token: string) {
    const appUrl = this.config.get<string>("APP_URL") ?? "http://localhost:3000";
    const resetUrl = `${appUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
    const settings = await this.getSecuritySettings(organizationId);
    const bodyText = `A password reset was requested for your ${settings.applicationName} account.\n\nOpen this link within ${settings.passwordResetTokenTtlMinutes} minutes:\n${resetUrl}\n\nIf you did not request this, ignore this email.`;
    const escapedUrl = resetUrl.replace(/"/g, "%22");
    const bodyHtml = `<p>A password reset was requested for your ${this.escapeHtml(settings.applicationName)} account.</p><p><a href="${escapedUrl}">Reset your password</a></p><p>This link expires in ${settings.passwordResetTokenTtlMinutes} minutes.</p><p>If you did not request this, ignore this email.</p>`;
    const mailDelivery = this.moduleRef.get(MailDeliveryService, { strict: false });
    await mailDelivery.sendTicketReply({
      organizationId,
      to: [email],
      subject: `${settings.applicationName} password reset`,
      bodyText,
      bodyHtml
    });
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
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
