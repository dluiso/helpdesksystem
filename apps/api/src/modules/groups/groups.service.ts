import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { CreateGroupDto } from "./dto/create-group.dto";
import { UpdateGroupDto } from "./dto/update-group.dto";

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService
  ) {}

  list(user: AuthenticatedUser) {
    return this.prisma.group.findMany({
      where: { organizationId: user.organizationId },
      include: {
        users: { select: { userId: true } },
        roles: {
          select: {
            role: {
              select: {
                id: true,
                name: true,
                permissions: { select: { permission: { select: { id: true, name: true } } } }
              }
            }
          }
        }
      },
      orderBy: { name: "asc" }
    });
  }

  async create(user: AuthenticatedUser, input: CreateGroupDto) {
    await this.ensureRolesBelongToOrganization(input.roleIds ?? [], user.organizationId);
    try {
      const group = await this.prisma.group.create({
        data: {
          organizationId: user.organizationId,
          name: input.name.trim(),
          description: this.optionalTrim(input.description),
          roles: { create: (input.roleIds ?? []).map((roleId) => ({ roleId })) }
        },
        include: this.groupInclude()
      });

      await this.auditLogs.create({
        userId: user.id,
        entityType: "Group",
        entityId: group.id,
        action: "group.created",
        metadata: { name: group.name, roleIds: input.roleIds ?? [] }
      });

      return group;
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException("A group with this name already exists.");
      }
      throw error;
    }
  }

  async update(groupId: string, user: AuthenticatedUser, input: UpdateGroupDto) {
    const existing = await this.ensureGroup(groupId, user.organizationId);
    if (input.roleIds) {
      await this.ensureRolesBelongToOrganization(input.roleIds, user.organizationId);
    }

    try {
      const group = await this.prisma.$transaction(async (tx) => {
        if (input.roleIds) {
          await tx.groupRole.deleteMany({ where: { groupId } });
          if (input.roleIds.length > 0) {
            await tx.groupRole.createMany({
              data: input.roleIds.map((roleId) => ({ groupId, roleId })),
              skipDuplicates: true
            });
          }
        }

        return tx.group.update({
          where: { id: groupId },
          data: {
            name: input.name?.trim(),
            description: input.description === undefined ? undefined : this.optionalTrim(input.description)
          },
          include: this.groupInclude()
        });
      });

      await this.auditLogs.create({
        userId: user.id,
        entityType: "Group",
        entityId: group.id,
        action: "group.updated",
        metadata: { previousName: existing.name, name: group.name, roleIds: input.roleIds ?? undefined }
      });

      return group;
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException("A group with this name already exists.");
      }
      throw error;
    }
  }

  async delete(groupId: string, user: AuthenticatedUser) {
    const group = await this.ensureGroup(groupId, user.organizationId);
    if (group.isSystem) {
      throw new BadRequestException("System groups cannot be deleted.");
    }

    await this.prisma.group.delete({ where: { id: groupId } });
    await this.auditLogs.create({
      userId: user.id,
      entityType: "Group",
      entityId: groupId,
      action: "group.deleted",
      metadata: { name: group.name }
    });

    return { deleted: true };
  }

  private async ensureGroup(groupId: string, organizationId: string) {
    const group = await this.prisma.group.findFirst({ where: { id: groupId, organizationId } });
    if (!group) {
      throw new NotFoundException("Group was not found.");
    }
    return group;
  }

  private async ensureRolesBelongToOrganization(roleIds: string[], organizationId: string) {
    const uniqueIds = [...new Set(roleIds)];
    if (uniqueIds.length === 0) {
      return;
    }

    const count = await this.prisma.role.count({ where: { id: { in: uniqueIds }, organizationId } });
    if (count !== uniqueIds.length) {
      throw new BadRequestException("One or more roles do not belong to this organization.");
    }
  }

  private groupInclude() {
    return {
      users: { select: { userId: true } },
      roles: {
        select: {
          role: {
            select: {
              id: true,
              name: true,
              permissions: { select: { permission: { select: { id: true, name: true } } } }
            }
          }
        }
      }
    } as const;
  }

  private optionalTrim(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private isUniqueConstraint(error: unknown) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
  }
}
