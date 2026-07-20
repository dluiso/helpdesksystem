import { Injectable } from "@nestjs/common";
import { EventServiceRequestStatus, EventServiceTaskStatus, TicketPriority, TicketStatus } from "@prisma/client";
import { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { SystemSettingsService } from "../system-settings/system-settings.service";

const CLOSED_TICKET_STATUSES = [TicketStatus.RESOLVED, TicketStatus.CLOSED, TicketStatus.CANCELLED, TicketStatus.MERGED];
const CLOSED_EVENT_STATUSES = [EventServiceRequestStatus.COMPLETED, EventServiceRequestStatus.CANCELLED, EventServiceRequestStatus.CONVERTED_TO_TICKET];
const CLOSED_TASK_STATUSES = [EventServiceTaskStatus.DONE, EventServiceTaskStatus.CANCELLED];
type WorkKind = "TICKET" | "EVENT" | "EVENT_TASK";
type CapacityStatus = "AVAILABLE" | "NEAR_CAPACITY" | "OVER_CAPACITY";

export interface OperationsWorkItem {
  id: string;
  kind: WorkKind;
  reference: string;
  title: string;
  clientName: string | null;
  status: string;
  priority: TicketPriority | null;
  owner: string | null;
  teamName: string | null;
  dueAt: Date | null;
  updatedAt: Date;
  href: string;
  attention: boolean;
  requestId?: string;
  internalOwners: string[];
}

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemSettings: SystemSettingsService
  ) {}

  async overview(user: AuthenticatedUser) {
    const now = new Date();
    const settings = await this.systemSettings.getOperationsSettings(user);
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + settings.dueSoonDays);

    const [tickets, requests, tasks] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { organizationId: user.organizationId, deletedAt: null, status: { notIn: CLOSED_TICKET_STATUSES } },
        select: {
          id: true,
          ticketNumber: true,
          subject: true,
          status: true,
          priority: true,
          updatedAt: true,
          client: { select: { name: true } },
          assignedUser: { select: { firstName: true, lastName: true } },
          assignedTeam: { select: { name: true } },
          assignees: { select: { user: { select: { firstName: true, lastName: true } } }, take: 3 }
        },
        orderBy: { updatedAt: "desc" },
        take: 80
      }),
      this.prisma.eventServiceRequest.findMany({
        where: { organizationId: user.organizationId, deletedAt: null, status: { notIn: CLOSED_EVENT_STATUSES } },
        select: {
          id: true,
          trackingNumber: true,
          eventName: true,
          eventDate: true,
          status: true,
          priority: true,
          updatedAt: true,
          client: { select: { name: true } },
          assignedTeam: { select: { name: true } },
          assignees: { select: { user: { select: { firstName: true, lastName: true } } }, take: 3 }
        },
        orderBy: [{ eventDate: "asc" }, { updatedAt: "desc" }],
        take: 80
      }),
      this.prisma.eventServiceTask.findMany({
        where: {
          status: { notIn: CLOSED_TASK_STATUSES },
          request: { organizationId: user.organizationId, deletedAt: null, status: { notIn: CLOSED_EVENT_STATUSES } }
        },
        select: {
          id: true,
          title: true,
          status: true,
          dueAt: true,
          updatedAt: true,
          assignedUser: { select: { firstName: true, lastName: true } },
          externalSpecialist: { select: { name: true } },
          request: { select: { id: true, trackingNumber: true, eventName: true, priority: true, client: { select: { name: true } }, assignedTeam: { select: { name: true } } } }
        },
        orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
        take: 80
      })
    ]);

    const ticketItems: OperationsWorkItem[] = tickets.map((ticket) => {
      const owners = [ticket.assignedUser, ...ticket.assignees.map((assignment) => assignment.user)]
        .filter((assignee): assignee is { firstName: string; lastName: string } => Boolean(assignee))
        .map((assignee) => this.userName(assignee));
      const attention = (!owners.length && !ticket.assignedTeam) || ticket.priority === TicketPriority.CRITICAL || ticket.priority === TicketPriority.URGENT;
      return {
        id: ticket.id,
        kind: "TICKET",
        reference: ticket.ticketNumber,
        title: ticket.subject,
        clientName: ticket.client?.name ?? null,
        status: ticket.status,
        priority: ticket.priority,
        owner: this.uniqueNames(owners),
        teamName: ticket.assignedTeam?.name ?? null,
        dueAt: null,
        updatedAt: ticket.updatedAt,
        href: `/tickets/${ticket.ticketNumber}`,
        attention,
        internalOwners: [...new Set(owners)]
      };
    });

    const requestItems: OperationsWorkItem[] = requests.map((request) => {
      const owners = request.assignees.map((assignment) => this.userName(assignment.user));
      const dueSoon = request.eventDate !== null && request.eventDate <= nextWeek;
      const overdue = request.eventDate !== null && request.eventDate < now;
      return {
        id: request.id,
        kind: "EVENT",
        reference: request.trackingNumber,
        title: request.eventName,
        clientName: request.client?.name ?? null,
        status: request.status,
        priority: request.priority,
        owner: this.uniqueNames(owners),
        teamName: request.assignedTeam?.name ?? null,
        dueAt: request.eventDate,
        updatedAt: request.updatedAt,
        href: `/event-services/${request.trackingNumber}`,
        attention: (!owners.length && !request.assignedTeam) || overdue || dueSoon,
        internalOwners: [...new Set(owners)]
      };
    });

    const taskItems: OperationsWorkItem[] = tasks.map((task) => {
      const owner = task.assignedUser ? this.userName(task.assignedUser) : task.externalSpecialist?.name ?? null;
      const overdue = task.dueAt !== null && task.dueAt < now;
      return {
        id: task.id,
        kind: "EVENT_TASK",
        reference: task.request.trackingNumber,
        title: task.title,
        clientName: task.request.client?.name ?? null,
        status: task.status,
        priority: task.request.priority,
        owner,
        teamName: task.request.assignedTeam?.name ?? null,
        dueAt: task.dueAt,
        updatedAt: task.updatedAt,
        href: `/event-services/${task.request.trackingNumber}`,
        attention: task.status === EventServiceTaskStatus.BLOCKED || overdue || !owner,
        requestId: task.request.id,
        internalOwners: task.assignedUser ? [this.userName(task.assignedUser)] : []
      };
    });

    const allItems = [...ticketItems, ...requestItems, ...taskItems];
    const items = allItems
      .sort((left, right) => Number(right.attention) - Number(left.attention) || this.priorityRank(right.priority) - this.priorityRank(left.priority) || this.dateRank(left.dueAt, left.updatedAt) - this.dateRank(right.dueAt, right.updatedAt))
      .slice(0, 160);
    const workload = this.workload(allItems, settings.capacityBaseline, settings.capacityWarningPercent);

    return {
      generatedAt: now,
      summary: {
        activeTickets: ticketItems.length,
        unassignedTickets: ticketItems.filter((item) => !item.owner && !item.teamName).length,
        activeEvents: requestItems.length,
        upcomingEvents: requestItems.filter((item) => item.dueAt && item.dueAt >= now && item.dueAt <= nextWeek).length,
        blockedTasks: taskItems.filter((item) => item.status === EventServiceTaskStatus.BLOCKED).length,
        attentionItems: allItems.filter((item) => item.attention).length,
        overdueItems: allItems.filter((item) => item.dueAt && item.dueAt < now).length,
        overCapacity: workload.filter((entry) => entry.capacityStatus === "OVER_CAPACITY").length,
        nearCapacity: workload.filter((entry) => entry.capacityStatus === "NEAR_CAPACITY").length,
        capacityBaseline: settings.capacityBaseline,
        capacityWarningPercent: settings.capacityWarningPercent,
        dueSoonDays: settings.dueSoonDays
      },
      capabilities: {
        updateTicketStatus: user.permissions.includes("tickets.assign"),
        updateEventStatus: user.permissions.includes("event_services.update")
      },
      items,
      workload
    };
  }

  private userName(user: { firstName: string; lastName: string }) {
    return `${user.firstName} ${user.lastName}`.trim();
  }

  private uniqueNames(names: string[]) {
    const value = [...new Set(names.filter(Boolean))].join(", ");
    return value || null;
  }

  private priorityRank(priority: TicketPriority | null) {
    return priority === TicketPriority.CRITICAL ? 5 : priority === TicketPriority.URGENT ? 4 : priority === TicketPriority.HIGH ? 3 : priority === TicketPriority.NORMAL ? 2 : priority === TicketPriority.LOW ? 1 : 0;
  }

  private dateRank(dueAt: Date | null, updatedAt: Date) {
    return (dueAt ?? updatedAt).getTime();
  }

  private workload(items: OperationsWorkItem[], capacityBaseline: number, capacityWarningPercent: number) {
    const work = new Map<string, { owner: string; total: number; attention: number }>();
    for (const item of items) {
      for (const owner of item.internalOwners) {
        const current = work.get(owner) ?? { owner, total: 0, attention: 0 };
        current.total += 1;
        if (item.attention) current.attention += 1;
        work.set(owner, current);
      }
    }
    return [...work.values()]
      .map((entry) => {
        const warningThreshold = Math.ceil(capacityBaseline * (capacityWarningPercent / 100));
        const capacityStatus: CapacityStatus = entry.total >= capacityBaseline ? "OVER_CAPACITY" : entry.total >= warningThreshold ? "NEAR_CAPACITY" : "AVAILABLE";
        return { ...entry, capacityPercent: Math.min(100, Math.round((entry.total / capacityBaseline) * 100)), capacityStatus };
      })
      .sort((left, right) => this.capacityRank(right.capacityStatus) - this.capacityRank(left.capacityStatus) || right.attention - left.attention || right.total - left.total || left.owner.localeCompare(right.owner))
      .slice(0, 12);
  }

  private capacityRank(status: CapacityStatus) {
    return status === "OVER_CAPACITY" ? 3 : status === "NEAR_CAPACITY" ? 2 : 1;
  }
}
