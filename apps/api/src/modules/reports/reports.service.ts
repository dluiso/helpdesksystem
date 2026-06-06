import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma, TicketPriority, TicketSource, TicketStatus } from "@prisma/client";
import { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { TicketReportExportQueryDto, TicketReportQueryDto } from "./dto/ticket-report-query.dto";

const ACTIVE_STATUSES: TicketStatus[] = [
  TicketStatus.NEW,
  TicketStatus.OPEN,
  TicketStatus.IN_PROGRESS,
  TicketStatus.WAITING_ON_CUSTOMER,
  TicketStatus.WAITING_ON_TECHNICIAN,
  TicketStatus.WAITING_ON_THIRD_PARTY,
  TicketStatus.REOPENED
];

type ReportTicket = Prisma.TicketGetPayload<{
  select: ReturnType<ReportsService["ticketSelect"]>;
}>;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async ticketSummary(user: AuthenticatedUser, query: TicketReportQueryDto) {
    const range = this.resolveDateRange(query);
    const where = this.buildTicketWhere(user, query, range);
    const valuePerTicket = this.resolveValuePerTicket(query);

    const [tickets, clients, users, teams] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        select: this.ticketSelect(),
        orderBy: { createdAt: "desc" },
        take: 2000
      }),
      this.prisma.client.findMany({
        where: { organizationId: user.organizationId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.user.findMany({
        where: { organizationId: user.organizationId, deletedAt: null, isActive: true },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }]
      }),
      this.prisma.ticketTeam.findMany({
        where: { organizationId: user.organizationId, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      })
    ]);

    const activeCount = tickets.filter((ticket) => ACTIVE_STATUSES.includes(ticket.status)).length;
    const closedCount = tickets.filter((ticket) => ticket.status === TicketStatus.CLOSED).length;
    const resolvedCount = tickets.filter((ticket) => ticket.status === TicketStatus.RESOLVED).length;
    const unassignedCount = tickets.filter((ticket) => !ticket.assignedUserId && !ticket.assignedTeamId && ticket.assignees.length === 0).length;
    const withAttachments = tickets.filter((ticket) => ticket._count.attachments > 0).length;
    const estimatedTotal = valuePerTicket ? tickets.length * valuePerTicket : null;

    return {
      filters: {
        startDate: range.start.toISOString(),
        endDate: range.end.toISOString(),
        groupBy: query.groupBy ?? "day",
        estimateMode: query.estimateMode ?? "none",
        valuePerTicket
      },
      options: {
        clients,
        users: users.map((item) => ({ id: item.id, name: `${item.firstName} ${item.lastName}` })),
        teams,
        statuses: Object.values(TicketStatus),
        priorities: Object.values(TicketPriority),
        sources: Object.values(TicketSource)
      },
      summary: {
        totalTickets: tickets.length,
        activeTickets: activeCount,
        closedTickets: closedCount,
        resolvedTickets: resolvedCount,
        unassignedTickets: unassignedCount,
        highPriorityTickets: tickets.filter((ticket) => ([TicketPriority.HIGH, TicketPriority.URGENT, TicketPriority.CRITICAL] as TicketPriority[]).includes(ticket.priority)).length,
        withAttachments,
        withoutAttachments: tickets.length - withAttachments,
        estimatedTotal
      },
      activity: this.buildActivity(tickets, range, query.groupBy ?? "day"),
      byStatus: this.groupBy(tickets, (ticket) => ticket.status),
      byPriority: this.groupBy(tickets, (ticket) => ticket.priority),
      bySource: this.groupBy(tickets, (ticket) => ticket.source),
      byClient: this.groupBy(tickets, (ticket) => ticket.client?.name ?? "Unmapped / no client").slice(0, 12),
      byTechnician: this.groupBy(tickets, (ticket) => ticket.assignedUser ? `${ticket.assignedUser.firstName} ${ticket.assignedUser.lastName}` : "Unassigned").slice(0, 12),
      byTeam: this.groupBy(tickets, (ticket) => ticket.assignedTeam?.name ?? "No team").slice(0, 12),
      detail: tickets.slice(0, 250).map((ticket) => this.toDetailRow(ticket, valuePerTicket)),
      detailLimit: 250,
      totalMatched: tickets.length
    };
  }

  async exportTicketsCsv(user: AuthenticatedUser, query: TicketReportExportQueryDto) {
    const result = await this.ticketSummary(user, query);
    const rows = result.detail.map((ticket) => [
      ticket.ticketNumber,
      ticket.subject,
      ticket.clientName,
      ticket.requester,
      ticket.status,
      ticket.priority,
      ticket.source,
      ticket.assignedTo,
      ticket.team,
      ticket.createdAt,
      ticket.updatedAt,
      ticket.closedAt ?? "",
      String(ticket.attachmentCount),
      ticket.estimatedValue === null ? "" : ticket.estimatedValue.toFixed(2)
    ]);
    const csv = this.toCsv([
      ["Ticket", "Subject", "Client", "Requester", "Status", "Priority", "Source", "Assigned To", "Team", "Created", "Modified", "Closed", "Attachments", "Estimated Value"],
      ...rows
    ]);

    await this.prisma.reportExport.create({
      data: {
        requestedById: user.id,
        reportType: "ticket-report",
        filters: query as Prisma.InputJsonValue,
        format: "csv"
      }
    });

    return {
      filename: `ticket-report-${new Date().toISOString().slice(0, 10)}.csv`,
      contentType: "text/csv; charset=utf-8",
      body: csv
    };
  }

  private ticketSelect() {
    return {
      id: true,
      ticketNumber: true,
      subject: true,
      status: true,
      priority: true,
      source: true,
      senderEmail: true,
      assignedUserId: true,
      assignedTeamId: true,
      createdAt: true,
      updatedAt: true,
      closedAt: true,
      resolvedAt: true,
      client: { select: { id: true, name: true } },
      contact: { select: { firstName: true, lastName: true, email: true } },
      assignedUser: { select: { firstName: true, lastName: true } },
      assignedTeam: { select: { name: true } },
      assignees: { select: { userId: true } },
      _count: { select: { attachments: true } }
    } satisfies Prisma.TicketSelect;
  }

  private buildTicketWhere(user: AuthenticatedUser, query: TicketReportQueryDto, range: { start: Date; end: Date }) {
    const where: Prisma.TicketWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      status: { not: TicketStatus.MERGED },
      createdAt: { gte: range.start, lte: range.end }
    };
    if (query.clientId) where.clientId = query.clientId;
    if (query.assignedUserId) {
      where.OR = [{ assignedUserId: query.assignedUserId }, { assignees: { some: { userId: query.assignedUserId } } }];
    }
    if (query.assignedTeamId) where.assignedTeamId = query.assignedTeamId;
    const statuses = this.parseStatuses(query.statuses);
    if (statuses.length) where.status = { in: statuses };
    if (query.priority) where.priority = query.priority;
    if (query.source) where.source = query.source;
    if (query.attachments === "with") where.attachments = { some: { deletedAt: null } };
    if (query.attachments === "without") where.attachments = { none: { deletedAt: null } };
    return where;
  }

  private resolveDateRange(query: TicketReportQueryDto) {
    const end = query.endDate ? new Date(query.endDate) : new Date();
    const start = query.startDate ? new Date(query.startDate) : new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException("Invalid report date range.");
    }
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    if (start > end) {
      throw new BadRequestException("Report start date must be before end date.");
    }
    return { start, end };
  }

  private parseStatuses(value?: string) {
    if (!value) return [];
    const allowed = new Set(Object.values(TicketStatus));
    return value.split(",").map((item) => item.trim().toUpperCase()).filter((item): item is TicketStatus => allowed.has(item as TicketStatus));
  }

  private resolveValuePerTicket(query: TicketReportQueryDto) {
    if (query.estimateMode !== "perTicket") return null;
    const value = Number(query.valuePerTicket ?? "0");
    if (!Number.isFinite(value) || value < 0) {
      throw new BadRequestException("Estimated value per ticket must be a positive number.");
    }
    return value;
  }

  private buildActivity(tickets: ReportTicket[], range: { start: Date; end: Date }, groupBy: "day" | "week" | "month" | "year") {
    const buckets = new Map<string, { label: string; created: number; closed: number; resolved: number }>();
    for (const ticket of tickets) {
      this.incrementBucket(buckets, ticket.createdAt, groupBy, "created");
      if (ticket.closedAt) this.incrementBucket(buckets, ticket.closedAt, groupBy, "closed");
      if (ticket.resolvedAt) this.incrementBucket(buckets, ticket.resolvedAt, groupBy, "resolved");
    }
    if (buckets.size === 0) {
      const key = this.bucketKey(range.start, groupBy);
      buckets.set(key, { label: key, created: 0, closed: 0, resolved: 0 });
    }
    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, value]) => ({ period, ...value }));
  }

  private incrementBucket(buckets: Map<string, { label: string; created: number; closed: number; resolved: number }>, date: Date, groupBy: "day" | "week" | "month" | "year", field: "created" | "closed" | "resolved") {
    const key = this.bucketKey(date, groupBy);
    const bucket = buckets.get(key) ?? { label: key, created: 0, closed: 0, resolved: 0 };
    bucket[field] += 1;
    buckets.set(key, bucket);
  }

  private bucketKey(date: Date, groupBy: "day" | "week" | "month" | "year") {
    const year = date.getFullYear();
    if (groupBy === "year") return String(year);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    if (groupBy === "month") return `${year}-${month}`;
    if (groupBy === "week") {
      const firstDay = new Date(year, 0, 1);
      const week = Math.ceil((((date.getTime() - firstDay.getTime()) / 86400000) + firstDay.getDay() + 1) / 7);
      return `${year}-W${String(week).padStart(2, "0")}`;
    }
    return `${year}-${month}-${String(date.getDate()).padStart(2, "0")}`;
  }

  private groupBy(tickets: ReportTicket[], getKey: (ticket: ReportTicket) => string) {
    const counts = new Map<string, number>();
    for (const ticket of tickets) {
      const key = getKey(ticket);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  private toDetailRow(ticket: ReportTicket, valuePerTicket: number | null) {
    const requester = ticket.contact ? `${ticket.contact.firstName} ${ticket.contact.lastName}` : ticket.senderEmail ?? "Unknown";
    return {
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      clientName: ticket.client?.name ?? "Unmapped / no client",
      requester,
      status: ticket.status,
      priority: ticket.priority,
      source: ticket.source,
      assignedTo: ticket.assignedUser ? `${ticket.assignedUser.firstName} ${ticket.assignedUser.lastName}` : "Unassigned",
      team: ticket.assignedTeam?.name ?? "No team",
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      closedAt: ticket.closedAt?.toISOString() ?? null,
      attachmentCount: ticket._count.attachments,
      estimatedValue: valuePerTicket
    };
  }

  private toCsv(rows: string[][]) {
    return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, "\"\"")}"`).join(",")).join("\r\n");
  }
}
