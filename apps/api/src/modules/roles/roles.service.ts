import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRoleDto } from "./dto/create-role.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService
  ) {}

  list(user: AuthenticatedUser) {
    return this.prisma.role.findMany({
      where: { organizationId: user.organizationId },
      include: this.roleInclude(),
      orderBy: { name: "asc" }
    });
  }

  async create(user: AuthenticatedUser, input: CreateRoleDto) {
    await this.ensurePermissionsExist(input.permissionIds ?? []);
    try {
      const role = await this.prisma.role.create({
        data: {
          organizationId: user.organizationId,
          name: input.name.trim(),
          description: this.optionalTrim(input.description),
          permissions: { create: (input.permissionIds ?? []).map((permissionId) => ({ permissionId })) }
        },
        include: this.roleInclude()
      });

      await this.auditLogs.create({
        userId: user.id,
        entityType: "Role",
        entityId: role.id,
        action: "role.created",
        metadata: { name: role.name, permissionIds: input.permissionIds ?? [] }
      });

      return role;
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException("A role with this name already exists.");
      }
      throw error;
    }
  }

  async update(roleId: string, user: AuthenticatedUser, input: UpdateRoleDto) {
    const existing = await this.ensureRole(roleId, user.organizationId);
    if (input.permissionIds) {
      await this.ensurePermissionsExist(input.permissionIds);
    }

    try {
      const role = await this.prisma.$transaction(async (tx) => {
        if (input.permissionIds) {
          await tx.rolePermission.deleteMany({ where: { roleId } });
          if (input.permissionIds.length > 0) {
            await tx.rolePermission.createMany({
              data: input.permissionIds.map((permissionId) => ({ roleId, permissionId })),
              skipDuplicates: true
            });
          }
        }

        return tx.role.update({
          where: { id: roleId },
          data: {
            name: input.name?.trim(),
            description: input.description === undefined ? undefined : this.optionalTrim(input.description)
          },
          include: this.roleInclude()
        });
      });

      await this.auditLogs.create({
        userId: user.id,
        entityType: "Role",
        entityId: role.id,
        action: "role.updated",
        metadata: { previousName: existing.name, name: role.name, permissionIds: input.permissionIds ?? undefined }
      });

      return role;
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException("A role with this name already exists.");
      }
      throw error;
    }
  }

  async delete(roleId: string, user: AuthenticatedUser) {
    const role = await this.ensureRole(roleId, user.organizationId);
    if (role.isSystem) {
      throw new BadRequestException("System roles cannot be deleted.");
    }

    await this.prisma.role.delete({ where: { id: roleId } });
    await this.auditLogs.create({
      userId: user.id,
      entityType: "Role",
      entityId: roleId,
      action: "role.deleted",
      metadata: { name: role.name }
    });

    return { deleted: true };
  }

  private async ensureRole(roleId: string, organizationId: string) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, organizationId } });
    if (!role) {
      throw new NotFoundException("Role was not found.");
    }
    return role;
  }

  private async ensurePermissionsExist(permissionIds: string[]) {
    const uniqueIds = [...new Set(permissionIds)];
    if (uniqueIds.length === 0) {
      return;
    }

    const count = await this.prisma.permission.count({ where: { id: { in: uniqueIds } } });
    if (count !== uniqueIds.length) {
      throw new BadRequestException("One or more permissions do not exist.");
    }
  }

  private roleInclude() {
    return {
      permissions: {
        select: {
          permission: {
            select: {
              id: true,
              name: true,
              description: true
            }
          }
        }
      },
      groups: { select: { groupId: true } }
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
