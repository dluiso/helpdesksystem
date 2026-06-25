import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogQueryDto } from "./dto/audit-log-query.dto";

export interface CreateAuditLogInput {
  organizationId?: string | null;
  userId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateAuditLogInput) {
    const organizationId = input.organizationId ?? (input.userId ? await this.resolveUserOrganizationId(input.userId) : null);
    return this.prisma.auditLog.create({
      data: {
        organizationId,
        userId: input.userId ?? null,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        action: input.action,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        metadata: input.metadata ?? undefined
      }
    });
  }

  async list(user: AuthenticatedUser, query: AuditLogQueryDto) {
    const page = this.toPositiveInt(query.page, 1, 500);
    const pageSize = this.toPositiveInt(query.pageSize, 50, 100);
    const where = this.buildWhere(user, query);
    const [items, total, users, actions, entityTypes] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.auditLog.count({ where }),
      this.prisma.user.findMany({
        where: { organizationId: user.organizationId, deletedAt: null },
        select: { id: true, firstName: true, lastName: true, email: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }]
      }),
      this.prisma.auditLog.findMany({
        where: this.organizationWhere(user.organizationId),
        distinct: ["action"],
        select: { action: true },
        orderBy: { action: "asc" },
        take: 200
      }),
      this.prisma.auditLog.findMany({
        where: this.organizationWhere(user.organizationId),
        distinct: ["entityType"],
        select: { entityType: true },
        orderBy: { entityType: "asc" },
        take: 100
      })
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      users: users.map((item) => ({ id: item.id, name: `${item.firstName} ${item.lastName}`, email: item.email })),
      actions: actions.map((item) => item.action),
      entityTypes: entityTypes.map((item) => item.entityType)
    };
  }

  async exportCsv(user: AuthenticatedUser, query: AuditLogQueryDto) {
    const items = await this.prisma.auditLog.findMany({
      where: this.buildWhere(user, query),
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 1000
    });
    await this.create({
      userId: user.id,
      entityType: "audit_logs",
      action: "audit_logs.exported",
      metadata: { count: items.length }
    });

    return this.toCsv([
      ["Date", "User", "Email", "Action", "Entity Type", "Entity ID", "IP Address", "Metadata"],
      ...items.map((item) => [
        item.createdAt.toISOString(),
        item.user ? `${item.user.firstName} ${item.user.lastName}` : "System",
        item.user?.email ?? "",
        item.action,
        item.entityType,
        item.entityId ?? "",
        item.ipAddress ?? "",
        item.metadata ? JSON.stringify(item.metadata) : ""
      ])
    ]);
  }

  private buildWhere(user: AuthenticatedUser, query: AuditLogQueryDto): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = this.organizationWhere(user.organizationId);
    if (query.userId) where.userId = query.userId;
    if (query.action) where.action = query.action;
    if (query.entityType) where.entityType = query.entityType;
    const createdAt: Prisma.DateTimeFilter = {};
    if (query.startDate) createdAt.gte = new Date(query.startDate);
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setHours(23, 59, 59, 999);
      createdAt.lte = end;
    }
    if (createdAt.gte || createdAt.lte) where.createdAt = createdAt;
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { action: { contains: search, mode: "insensitive" } },
            { entityType: { contains: search, mode: "insensitive" } },
            { entityId: { contains: search, mode: "insensitive" } },
            { ipAddress: { contains: search, mode: "insensitive" } },
            { userAgent: { contains: search, mode: "insensitive" } },
            { user: { email: { contains: search, mode: "insensitive" } } }
          ]
        }
      ];
    }
    return where;
  }

  private organizationWhere(organizationId: string): Prisma.AuditLogWhereInput {
    return {
      OR: [
        { organizationId },
        { organizationId: null, user: { organizationId } }
      ]
    };
  }

  private async resolveUserOrganizationId(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true }
    });
    return user?.organizationId ?? null;
  }

  private toPositiveInt(value: string | undefined, fallback: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.min(max, Math.floor(parsed));
  }

  private toCsv(rows: string[][]) {
    return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, "\"\"")}"`).join(",")).join("\r\n");
  }
}
