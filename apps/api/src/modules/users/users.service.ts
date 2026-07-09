import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import argon2 from "argon2";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService
  ) {}

  async list(user: AuthenticatedUser) {
    return this.prisma.user.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        forcePasswordChange: true,
        mfaEnabled: true,
        createdAt: true,
        updatedAt: true,
        groups: {
          select: {
            group: {
              select: {
                id: true,
                name: true,
                roles: {
                  select: {
                    role: {
                      select: {
                        id: true,
                        name: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 250
    });
  }

  async listAssignable(user: AuthenticatedUser) {
    return this.prisma.user.findMany({
      where: { organizationId: user.organizationId, deletedAt: null, isActive: true },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { email: "asc" }],
      take: 250
    });
  }

  async create(user: AuthenticatedUser, input: CreateUserDto) {
    const email = input.email.trim().toLowerCase();
    await this.ensureEmailAvailable(email);
    await this.ensureGroupsBelongToOrganization(input.groupIds ?? [], user.organizationId);

    const created = await this.prisma.user.create({
      data: {
        organizationId: user.organizationId,
        email,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        passwordHash: await this.hashPassword(input.password),
        isActive: input.isActive ?? true,
        forcePasswordChange: input.forcePasswordChange ?? true,
        groups: {
          create: (input.groupIds ?? []).map((groupId) => ({ groupId }))
        }
      },
      select: this.userSelect()
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "User",
      entityId: created.id,
      action: "user.created",
      metadata: { email: created.email, groupIds: input.groupIds ?? [] }
    });

    return created;
  }

  async update(userId: string, user: AuthenticatedUser, input: UpdateUserDto) {
    const existing = await this.ensureUser(userId, user.organizationId);
    if (input.email) {
      await this.ensureEmailAvailable(input.email.trim().toLowerCase(), userId);
    }
    if (input.groupIds) {
      await this.ensureGroupsBelongToOrganization(input.groupIds, user.organizationId);
    }
    if (userId === user.id && input.isActive === false) {
      throw new BadRequestException("You cannot deactivate your own user account.");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.groupIds) {
        await tx.userGroup.deleteMany({ where: { userId } });
        if (input.groupIds.length > 0) {
          await tx.userGroup.createMany({
            data: input.groupIds.map((groupId) => ({ userId, groupId })),
            skipDuplicates: true
          });
        }
      }

      return tx.user.update({
        where: { id: userId },
        data: {
          email: input.email ? input.email.trim().toLowerCase() : undefined,
          firstName: input.firstName?.trim(),
          lastName: input.lastName?.trim(),
          passwordHash: input.password ? await this.hashPassword(input.password) : undefined,
          isActive: input.isActive,
          forcePasswordChange: input.forcePasswordChange
        },
        select: this.userSelect()
      });
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "User",
      entityId: updated.id,
      action: "user.updated",
      metadata: {
        previousEmail: existing.email,
        email: updated.email,
        groupIds: input.groupIds ?? undefined,
        passwordChanged: Boolean(input.password)
      }
    });

    return updated;
  }

  async softDelete(userId: string, user: AuthenticatedUser) {
    if (userId === user.id) {
      throw new BadRequestException("You cannot delete your own user account.");
    }
    await this.ensureUser(userId, user.organizationId);

    const deleted = await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date(), isActive: false },
      select: { id: true, email: true }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "User",
      entityId: deleted.id,
      action: "user.deleted",
      metadata: { email: deleted.email }
    });

    return { deleted: true };
  }

  async resetMfa(userId: string, user: AuthenticatedUser) {
    const existing = await this.ensureUser(userId, user.organizationId);
    const updated = await this.prisma.user.update({
      where: { id: existing.id },
      data: {
        mfaEnabled: false,
        totpSecretEncrypted: null,
        recoveryCodesHash: { set: [] }
      },
      select: { id: true, email: true, firstName: true, lastName: true, mfaEnabled: true }
    });
    await this.prisma.mfaTrustedDevice.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "User",
      entityId: updated.id,
      action: "user.mfa_reset",
      metadata: { email: updated.email }
    });

    return { reset: true, user: updated };
  }

  private async ensureEmailAvailable(email: string, excludeUserId?: string) {
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (user && user.id !== excludeUserId) {
      throw new ConflictException("A user with this email already exists.");
    }
  }

  private async ensureGroupsBelongToOrganization(groupIds: string[], organizationId: string) {
    const uniqueIds = [...new Set(groupIds)];
    if (uniqueIds.length === 0) {
      return;
    }

    const count = await this.prisma.group.count({ where: { id: { in: uniqueIds }, organizationId } });
    if (count !== uniqueIds.length) {
      throw new BadRequestException("One or more groups do not belong to this organization.");
    }
  }

  private async ensureUser(userId: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId, deletedAt: null } });
    if (!user) {
      throw new NotFoundException("User was not found.");
    }

    return user;
  }

  private hashPassword(password: string) {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  private userSelect() {
    return {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      isActive: true,
      forcePasswordChange: true,
      mfaEnabled: true,
      createdAt: true,
      updatedAt: true,
      groups: {
        select: {
          group: {
            select: {
              id: true,
              name: true,
              roles: {
                select: {
                  role: {
                    select: {
                      id: true,
                      name: true
                    }
                  }
                }
              }
            }
          }
        }
      }
    } as const;
  }
}
