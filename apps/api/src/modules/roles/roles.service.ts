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
    const permissionIds = await this.resolvePermissionIds(input.permissionIds ?? []);
    try {
      const role = await this.prisma.role.create({
        data: {
          organizationId: user.organizationId,
          name: input.name.trim(),
          description: this.optionalTrim(input.description),
          permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) }
        },
        include: this.roleInclude()
      });

      await this.auditLogs.create({
        userId: user.id,
        entityType: "Role",
        entityId: role.id,
        action: "role.created",
        metadata: { name: role.name, permissionIds }
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
    const permissionIds = input.permissionIds ? await this.resolvePermissionIds(input.permissionIds) : undefined;

    try {
      const role = await this.prisma.$transaction(async (tx) => {
        if (permissionIds) {
          await tx.rolePermission.deleteMany({ where: { roleId } });
          if (permissionIds.length > 0) {
            await tx.rolePermission.createMany({
              data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
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
        metadata: { previousName: existing.name, name: role.name, permissionIds }
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

  private async resolvePermissionIds(permissionValues: string[]) {
    const uniqueValues = [...new Set(permissionValues.map((value) => value.trim()).filter(Boolean))];
    if (uniqueValues.length === 0) {
      return [];
    }

    const uuidValues = uniqueValues.filter((value) => this.isUuid(value));
    const nameValues = uniqueValues.filter((value) => !this.isUuid(value));
    const permissions = await this.prisma.permission.findMany({
      where: {
        OR: [
          ...(uuidValues.length > 0 ? [{ id: { in: uuidValues } }] : []),
          ...(nameValues.length > 0 ? [{ name: { in: nameValues } }] : [])
        ]
      },
      select: { id: true, name: true }
    });
    const permissionById = new Map(permissions.map((permission) => [permission.id, permission.id]));
    const permissionByName = new Map(permissions.map((permission) => [permission.name, permission.id]));
    const resolvedIds = uniqueValues.map((value) => permissionById.get(value) ?? permissionByName.get(value)).filter((value): value is string => Boolean(value));

    if (resolvedIds.length !== uniqueValues.length) {
      throw new BadRequestException("One or more selected permissions do not exist. Refresh permissions and try again.");
    }
    return [...new Set(resolvedIds)];
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

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
}
