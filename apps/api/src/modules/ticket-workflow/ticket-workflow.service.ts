import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  MessageDirection,
  MessageVisibility,
  Prisma,
  TicketStatus,
  TicketStatusCategory,
  TicketStatusDefinition,
  TicketWorkflowTrigger
} from "@prisma/client";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTicketStatusDto } from "./dto/create-ticket-status.dto";
import { CreateTicketWorkflowRuleDto } from "./dto/create-ticket-workflow-rule.dto";
import { UpdateTicketStatusDto } from "./dto/update-ticket-status.dto";
import { UpdateTicketWorkflowRuleDto } from "./dto/update-ticket-workflow-rule.dto";

const STATUS_DEFAULTS: Array<{
  key: string;
  name: string;
  systemStatus: TicketStatus;
  category: TicketStatusCategory;
  color: string;
  sortOrder: number;
  isDefault?: boolean;
  isProtected?: boolean;
}> = [
  { key: "new", name: "New", systemStatus: TicketStatus.NEW, category: TicketStatusCategory.NEW, color: "#2563EB", sortOrder: 10, isDefault: true, isProtected: true },
  { key: "open", name: "Open", systemStatus: TicketStatus.OPEN, category: TicketStatusCategory.ACTIVE, color: "#0284C7", sortOrder: 20 },
  { key: "in_progress", name: "In Progress", systemStatus: TicketStatus.IN_PROGRESS, category: TicketStatusCategory.ACTIVE, color: "#7C3AED", sortOrder: 30 },
  { key: "waiting_on_customer", name: "Waiting on Customer", systemStatus: TicketStatus.WAITING_ON_CUSTOMER, category: TicketStatusCategory.WAITING_CUSTOMER, color: "#D97706", sortOrder: 40 },
  { key: "waiting_on_technician", name: "Waiting on Technician", systemStatus: TicketStatus.WAITING_ON_TECHNICIAN, category: TicketStatusCategory.WAITING_STAFF, color: "#DC2626", sortOrder: 50 },
  { key: "waiting_on_third_party", name: "Waiting on Third Party", systemStatus: TicketStatus.WAITING_ON_THIRD_PARTY, category: TicketStatusCategory.WAITING_THIRD_PARTY, color: "#B45309", sortOrder: 60 },
  { key: "resolved", name: "Resolved", systemStatus: TicketStatus.RESOLVED, category: TicketStatusCategory.RESOLVED, color: "#059669", sortOrder: 70 },
  { key: "closed", name: "Closed", systemStatus: TicketStatus.CLOSED, category: TicketStatusCategory.CLOSED, color: "#475569", sortOrder: 80, isProtected: true },
  { key: "reopened", name: "Reopened", systemStatus: TicketStatus.REOPENED, category: TicketStatusCategory.ACTIVE, color: "#E11D48", sortOrder: 90 },
  { key: "cancelled", name: "Cancelled", systemStatus: TicketStatus.CANCELLED, category: TicketStatusCategory.CANCELLED, color: "#64748B", sortOrder: 100 },
  { key: "merged", name: "Merged", systemStatus: TicketStatus.MERGED, category: TicketStatusCategory.MERGED, color: "#6366F1", sortOrder: 110, isProtected: true }
];

const CATEGORY_BY_SYSTEM_STATUS = new Map(STATUS_DEFAULTS.map((status) => [status.systemStatus, status.category]));
const ACTIVE_CATEGORIES = new Set<TicketStatusCategory>([
  TicketStatusCategory.NEW,
  TicketStatusCategory.ACTIVE,
  TicketStatusCategory.WAITING_CUSTOMER,
  TicketStatusCategory.WAITING_STAFF,
  TicketStatusCategory.WAITING_THIRD_PARTY
]);

@Injectable()
export class TicketWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService
  ) {}

  async listStatuses(organizationId: string, includeInactive = false) {
    await this.ensureDefaults(organizationId);
    return this.prisma.ticketStatusDefinition.findMany({
      where: { organizationId, ...(includeInactive ? {} : { isActive: true }) },
      include: { _count: { select: { tickets: true, rulesAsTarget: true } } },
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }]
    });
  }

  async createStatus(user: AuthenticatedUser, input: CreateTicketStatusDto) {
    await this.ensureDefaults(user.organizationId);
    if (input.systemStatus === TicketStatus.MERGED) {
      throw new BadRequestException("Merged is reserved for the ticket merge workflow.");
    }
    const name = input.name.trim();
    const key = await this.availableKey(user.organizationId, this.slug(name));
    const category = this.categoryFor(input.systemStatus);
    if (input.isDefault) this.assertDefaultEligible(category);
    const status = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.ticketStatusDefinition.updateMany({
          where: { organizationId: user.organizationId, isDefault: true },
          data: { isDefault: false }
        });
      }
      return tx.ticketStatusDefinition.create({
        data: {
          organizationId: user.organizationId,
          key,
          name,
          description: this.optionalTrim(input.description),
          systemStatus: input.systemStatus,
          category,
          color: input.color.toUpperCase(),
          sortOrder: input.sortOrder ?? 100,
          isDefault: input.isDefault ?? false
        },
        include: { _count: { select: { tickets: true, rulesAsTarget: true } } }
      });
    });
    await this.audit(user, status.id, "ticket_status.created", { key, name, systemStatus: input.systemStatus });
    return status;
  }

  async updateStatus(statusId: string, user: AuthenticatedUser, input: UpdateTicketStatusDto) {
    const existing = await this.ensureStatus(statusId, user.organizationId);
    if (existing.isDefault && input.isDefault === false) {
      throw new BadRequestException("Choose another default ticket status before removing this default.");
    }
    if (input.isDefault) this.assertDefaultEligible(existing.category);
    if (input.isActive === false) {
      return this.removeStatus(statusId, user);
    }
    const status = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.ticketStatusDefinition.updateMany({
          where: { organizationId: user.organizationId, isDefault: true, id: { not: statusId } },
          data: { isDefault: false }
        });
      }
      return tx.ticketStatusDefinition.update({
        where: { id: statusId },
        data: {
          name: input.name?.trim(),
          description: input.description === undefined ? undefined : this.optionalTrim(input.description),
          color: input.color?.toUpperCase(),
          sortOrder: input.sortOrder,
          isDefault: input.isDefault,
          ...(input.isActive === true ? { isActive: true, archivedAt: null } : {})
        },
        include: { _count: { select: { tickets: true, rulesAsTarget: true } } }
      });
    });
    await this.audit(user, status.id, "ticket_status.updated", { previousName: existing.name, name: status.name });
    return status;
  }

  async removeStatus(statusId: string, user: AuthenticatedUser) {
    const existing = await this.ensureStatus(statusId, user.organizationId);
    if (existing.isProtected) {
      throw new BadRequestException("Protected ticket statuses cannot be removed.");
    }
    if (existing.isDefault) {
      throw new BadRequestException("Choose another default ticket status before removing this one.");
    }
    const [ticketCount, targetRuleCount, sourceRuleCount] = await Promise.all([
      this.prisma.ticket.count({ where: { organizationId: user.organizationId, statusDefinitionId: statusId } }),
      this.prisma.ticketWorkflowRule.count({ where: { organizationId: user.organizationId, targetStatusId: statusId } }),
      this.prisma.ticketWorkflowRule.count({ where: { organizationId: user.organizationId, fromStatusIds: { has: statusId } } })
    ]);
    if (ticketCount === 0 && targetRuleCount === 0 && sourceRuleCount === 0) {
      await this.prisma.ticketStatusDefinition.delete({ where: { id: statusId } });
      await this.audit(user, statusId, "ticket_status.deleted", { name: existing.name });
      return { deleted: true, archived: false };
    }
    const status = await this.prisma.ticketStatusDefinition.update({
      where: { id: statusId },
      data: { isActive: false, archivedAt: new Date() },
      include: { _count: { select: { tickets: true, rulesAsTarget: true } } }
    });
    await this.prisma.ticketWorkflowRule.updateMany({
      where: {
        organizationId: user.organizationId,
        isActive: true,
        OR: [{ targetStatusId: statusId }, { fromStatusIds: { has: statusId } }]
      },
      data: { isActive: false }
    });
    await this.audit(user, statusId, "ticket_status.archived", { name: existing.name, ticketCount, targetRuleCount, sourceRuleCount });
    return { ...status, deleted: false, archived: true };
  }

  async restoreStatus(statusId: string, user: AuthenticatedUser) {
    await this.ensureStatus(statusId, user.organizationId);
    const status = await this.prisma.ticketStatusDefinition.update({
      where: { id: statusId },
      data: { isActive: true, archivedAt: null },
      include: { _count: { select: { tickets: true, rulesAsTarget: true } } }
    });
    await this.audit(user, statusId, "ticket_status.restored", { name: status.name });
    return status;
  }

  async listRules(organizationId: string) {
    await this.ensureDefaults(organizationId);
    const [rules, statuses] = await Promise.all([
      this.prisma.ticketWorkflowRule.findMany({
        where: { organizationId },
        include: { targetStatus: true },
        orderBy: [{ priority: "asc" }, { name: "asc" }]
      }),
      this.prisma.ticketStatusDefinition.findMany({ where: { organizationId }, select: { id: true, name: true, color: true, isActive: true } })
    ]);
    const statusesById = new Map(statuses.map((status) => [status.id, status]));
    return rules.map((rule) => ({
      ...rule,
      fromStatuses: rule.fromStatusIds.map((statusId) => statusesById.get(statusId)).filter(Boolean)
    }));
  }

  async createRule(user: AuthenticatedUser, input: CreateTicketWorkflowRuleDto) {
    await this.ensureDefaults(user.organizationId);
    await this.validateRuleStatuses(user.organizationId, input.fromStatusIds ?? [], input.targetStatusId);
    const rule = await this.prisma.ticketWorkflowRule.create({
      data: {
        organizationId: user.organizationId,
        name: input.name.trim(),
        trigger: input.trigger,
        fromStatusIds: [...new Set(input.fromStatusIds ?? [])],
        targetStatusId: input.targetStatusId,
        requirePriorPublicReply: input.requirePriorPublicReply,
        reopenWindowDays: input.reopenWindowDays,
        priority: input.priority ?? 100,
        stopProcessing: input.stopProcessing ?? true,
        isActive: input.isActive ?? true
      },
      include: { targetStatus: true }
    });
    await this.audit(user, rule.id, "ticket_workflow_rule.created", { name: rule.name, trigger: rule.trigger });
    return rule;
  }

  async updateRule(ruleId: string, user: AuthenticatedUser, input: UpdateTicketWorkflowRuleDto) {
    await this.ensureRule(ruleId, user.organizationId);
    if (input.fromStatusIds !== undefined || input.targetStatusId !== undefined) {
      const existing = await this.prisma.ticketWorkflowRule.findUniqueOrThrow({ where: { id: ruleId } });
      await this.validateRuleStatuses(
        user.organizationId,
        input.fromStatusIds ?? existing.fromStatusIds,
        input.targetStatusId ?? existing.targetStatusId
      );
    }
    const rule = await this.prisma.ticketWorkflowRule.update({
      where: { id: ruleId },
      data: {
        name: input.name?.trim(),
        trigger: input.trigger,
        fromStatusIds: input.fromStatusIds ? [...new Set(input.fromStatusIds)] : undefined,
        targetStatusId: input.targetStatusId,
        requirePriorPublicReply: input.requirePriorPublicReply,
        reopenWindowDays: input.reopenWindowDays,
        priority: input.priority,
        stopProcessing: input.stopProcessing,
        isActive: input.isActive
      },
      include: { targetStatus: true }
    });
    await this.audit(user, rule.id, "ticket_workflow_rule.updated", { name: rule.name, trigger: rule.trigger, isActive: rule.isActive });
    return rule;
  }

  async deleteRule(ruleId: string, user: AuthenticatedUser) {
    const rule = await this.ensureRule(ruleId, user.organizationId);
    await this.prisma.ticketWorkflowRule.delete({ where: { id: ruleId } });
    await this.audit(user, ruleId, "ticket_workflow_rule.deleted", { name: rule.name });
    return { deleted: true };
  }

  history(organizationId: string) {
    return this.prisma.auditLog.findMany({
      where: {
        organizationId,
        OR: [
          { action: { startsWith: "ticket_status." } },
          { action: { startsWith: "ticket_workflow_rule." } },
          { action: "ticket.status_automated" }
        ]
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  async getDefaultStatus(organizationId: string) {
    await this.ensureDefaults(organizationId);
    return this.prisma.ticketStatusDefinition.findFirstOrThrow({
      where: { organizationId, isDefault: true, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });
  }

  async resolveTarget(organizationId: string, input: { statusDefinitionId?: string | null; systemStatus?: TicketStatus | null }) {
    await this.ensureDefaults(organizationId);
    let target: TicketStatusDefinition | null = null;
    if (input.statusDefinitionId) {
      target = await this.prisma.ticketStatusDefinition.findFirst({
        where: { id: input.statusDefinitionId, organizationId, isActive: true }
      });
    } else if (input.systemStatus) {
      const matches = await this.prisma.ticketStatusDefinition.findMany({
        where: { organizationId, systemStatus: input.systemStatus, isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
      });
      target = matches.find((status) => status.key === input.systemStatus?.toLowerCase()) ?? matches[0] ?? null;
    }
    if (!target) {
      throw new BadRequestException("The selected ticket status is not available.");
    }
    return target;
  }

  async transitionTicket(input: {
    ticketId: string;
    organizationId: string;
    statusDefinitionId?: string | null;
    systemStatus?: TicketStatus | null;
    userId?: string | null;
    reason: string;
  }) {
    const target = await this.resolveTarget(input.organizationId, input);
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: input.ticketId, organizationId: input.organizationId },
      select: { id: true, status: true, statusDefinitionId: true }
    });
    if (!ticket) {
      throw new NotFoundException("Ticket was not found.");
    }
    if (ticket.statusDefinitionId === target.id && ticket.status === target.systemStatus) {
      return { ticket, target, changed: false };
    }
    const updated = await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: this.transitionData(target),
      include: { statusDefinition: true }
    });
    await this.auditLogs.create({
      organizationId: input.organizationId,
      userId: input.userId ?? null,
      entityType: "Ticket",
      entityId: ticket.id,
      action: "ticket.status_transitioned",
      metadata: {
        reason: input.reason,
        previousStatus: ticket.status,
        previousStatusDefinitionId: ticket.statusDefinitionId,
        status: target.systemStatus,
        statusDefinitionId: target.id,
        statusName: target.name
      }
    });
    return { ticket: updated, target, changed: true };
  }

  async applyRules(input: {
    ticketId: string;
    organizationId: string;
    trigger: TicketWorkflowTrigger;
    userId?: string | null;
    occurredAt?: Date;
    priorClosedAt?: Date | null;
  }) {
    await this.ensureDefaults(input.organizationId);
    let ticket = await this.prisma.ticket.findFirst({
      where: { id: input.ticketId, organizationId: input.organizationId },
      select: { id: true, status: true, statusDefinitionId: true, closedAt: true }
    });
    if (!ticket) {
      throw new NotFoundException("Ticket was not found.");
    }
    if (!ticket.statusDefinitionId) {
      const fallback = await this.resolveTarget(input.organizationId, { systemStatus: ticket.status });
      ticket = await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: { statusDefinitionId: fallback.id },
        select: { id: true, status: true, statusDefinitionId: true, closedAt: true }
      });
    }
    const priorPublicReply = await this.prisma.ticketMessage.count({
      where: { ticketId: ticket.id, direction: MessageDirection.OUTBOUND, visibility: MessageVisibility.PUBLIC }
    });
    const rules = await this.prisma.ticketWorkflowRule.findMany({
      where: { organizationId: input.organizationId, trigger: input.trigger, isActive: true },
      include: { targetStatus: true },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
    });
    const applied: string[] = [];
    for (const rule of rules) {
      if (rule.fromStatusIds.length > 0 && (!ticket.statusDefinitionId || !rule.fromStatusIds.includes(ticket.statusDefinitionId))) continue;
      if (rule.requirePriorPublicReply !== null && rule.requirePriorPublicReply !== (priorPublicReply > 0)) continue;
      if (rule.reopenWindowDays !== null) {
        const closedAt = input.priorClosedAt === undefined ? ticket.closedAt : input.priorClosedAt;
        if (!closedAt) continue;
        const occurredAt = input.occurredAt ?? new Date();
        const ageMs = occurredAt.getTime() - closedAt.getTime();
        if (ageMs > rule.reopenWindowDays * 24 * 60 * 60 * 1000) continue;
      }
      const result = await this.transitionTicket({
        ticketId: ticket.id,
        organizationId: input.organizationId,
        statusDefinitionId: rule.targetStatusId,
        userId: input.userId,
        reason: `Automation: ${rule.name}`
      });
      if (result.changed) {
        applied.push(rule.id);
        await this.auditLogs.create({
          organizationId: input.organizationId,
          userId: input.userId ?? null,
          entityType: "Ticket",
          entityId: ticket.id,
          action: "ticket.status_automated",
          metadata: { ruleId: rule.id, ruleName: rule.name, trigger: rule.trigger, targetStatusId: rule.targetStatusId }
        });
        ticket = { ...ticket, status: result.target.systemStatus, statusDefinitionId: result.target.id };
      }
      if (rule.stopProcessing) break;
    }
    return { appliedRuleIds: applied };
  }

  private transitionData(target: TicketStatusDefinition): Prisma.TicketUncheckedUpdateInput {
    const now = new Date();
    return {
      status: target.systemStatus,
      statusDefinitionId: target.id,
      ...(target.category === TicketStatusCategory.CLOSED ? { closedAt: now } : {}),
      ...(target.category === TicketStatusCategory.RESOLVED ? { resolvedAt: now, closedAt: null } : {}),
      ...(ACTIVE_CATEGORIES.has(target.category) ? { closedAt: null, resolvedAt: null } : {}),
      ...(target.systemStatus === TicketStatus.REOPENED ? { reopenedAt: now } : {})
    };
  }

  private async ensureDefaults(organizationId: string) {
    const existingCount = await this.prisma.ticketStatusDefinition.count({ where: { organizationId } });
    if (existingCount === 0) {
      await this.prisma.$transaction(
        STATUS_DEFAULTS.map((status) =>
          this.prisma.ticketStatusDefinition.create({
            data: { organizationId, ...status, isDefault: status.isDefault ?? false, isProtected: status.isProtected ?? false }
          })
        )
      );
    }
    const ruleCount = await this.prisma.ticketWorkflowRule.count({ where: { organizationId } });
    if (ruleCount > 0) return;
    const statuses = await this.prisma.ticketStatusDefinition.findMany({ where: { organizationId } });
    const byKey = new Map(statuses.map((status) => [status.key, status]));
    const waitingTechnician = byKey.get("waiting_on_technician");
    const reopened = byKey.get("reopened");
    const waitingCustomer = byKey.get("waiting_on_customer");
    if (!waitingTechnician || !reopened || !waitingCustomer) return;
    const completedSystemStatuses = new Set<TicketStatus>([TicketStatus.CLOSED, TicketStatus.RESOLVED, TicketStatus.CANCELLED]);
    const completedStatusIds = statuses
      .filter((status) => completedSystemStatuses.has(status.systemStatus))
      .map((status) => status.id);
    await this.prisma.ticketWorkflowRule.createMany({
      data: [
        {
          organizationId,
          name: "Customer reply requires technician attention",
          trigger: TicketWorkflowTrigger.CUSTOMER_REPLIED,
          targetStatusId: waitingTechnician.id,
          requirePriorPublicReply: true,
          priority: 20
        },
        {
          organizationId,
          name: "Reopen completed ticket after customer reply",
          trigger: TicketWorkflowTrigger.CUSTOMER_REPLIED,
          fromStatusIds: completedStatusIds,
          targetStatusId: reopened.id,
          priority: 10
        },
        {
          organizationId,
          name: "Public technician reply waits on customer",
          trigger: TicketWorkflowTrigger.TECHNICIAN_REPLIED,
          targetStatusId: waitingCustomer.id,
          priority: 10
        }
      ]
    });
  }

  private async validateRuleStatuses(organizationId: string, fromStatusIds: string[], targetStatusId: string) {
    const uniqueIds = [...new Set([...fromStatusIds, targetStatusId])];
    const statuses = await this.prisma.ticketStatusDefinition.findMany({
      where: { organizationId, id: { in: uniqueIds }, isActive: true },
      select: { id: true, systemStatus: true }
    });
    if (statuses.length !== uniqueIds.length) {
      throw new BadRequestException("One or more selected ticket statuses are unavailable.");
    }
    if (statuses.find((status) => status.id === targetStatusId)?.systemStatus === TicketStatus.MERGED) {
      throw new BadRequestException("Merged can only be assigned by the ticket merge workflow.");
    }
  }

  private async ensureStatus(statusId: string, organizationId: string) {
    const status = await this.prisma.ticketStatusDefinition.findFirst({ where: { id: statusId, organizationId } });
    if (!status) throw new NotFoundException("Ticket status was not found.");
    return status;
  }

  private async ensureRule(ruleId: string, organizationId: string) {
    const rule = await this.prisma.ticketWorkflowRule.findFirst({ where: { id: ruleId, organizationId } });
    if (!rule) throw new NotFoundException("Ticket workflow rule was not found.");
    return rule;
  }

  private categoryFor(status: TicketStatus) {
    const category = CATEGORY_BY_SYSTEM_STATUS.get(status);
    if (!category) throw new BadRequestException("Unsupported ticket status behavior.");
    return category;
  }

  private assertDefaultEligible(category: TicketStatusCategory) {
    if (category !== TicketStatusCategory.NEW && category !== TicketStatusCategory.ACTIVE) {
      throw new BadRequestException("The default ticket status must use New or Active behavior.");
    }
  }

  private async availableKey(organizationId: string, base: string) {
    const root = base || "status";
    for (let index = 0; index < 1000; index += 1) {
      const key = index === 0 ? root : `${root}_${index + 1}`;
      const existing = await this.prisma.ticketStatusDefinition.findUnique({
        where: { organizationId_key: { organizationId, key } },
        select: { id: true }
      });
      if (!existing) return key;
    }
    throw new ConflictException("Unable to generate a unique ticket status key.");
  }

  private slug(value: string) {
    return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 70);
  }

  private optionalTrim(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private audit(user: AuthenticatedUser, entityId: string, action: string, metadata: Prisma.InputJsonValue) {
    return this.auditLogs.create({
      organizationId: user.organizationId,
      userId: user.id,
      entityType: action.startsWith("ticket_status.") ? "TicketStatusDefinition" : "TicketWorkflowRule",
      entityId,
      action,
      metadata
    });
  }
}
