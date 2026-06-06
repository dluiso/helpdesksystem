import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Workbook } from "exceljs";
import PDFDocument from "pdfkit";
import { Prisma, TicketPriority, TicketSource, TicketStatus } from "@prisma/client";
import { AuthenticatedUser } from "../auth/auth.types";
import { MailDeliveryService } from "../mailboxes/mail-delivery.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateReportDefinitionDto, CreateReportScheduleDto, SendReportDto, UpdateReportDefinitionDto, UpdateReportScheduleDto } from "./dto/report-definition.dto";
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

type ReportFormat = "csv" | "xlsx" | "pdf";
type ReportFilters = Partial<TicketReportQueryDto> & { statuses?: string | string[] };
type GeneratedReport = {
  filename: string;
  contentType: string;
  body: string | Buffer;
  format: ReportFormat;
  result: Awaited<ReturnType<ReportsService["ticketSummary"]>>;
};

@Injectable()
export class ReportsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportsService.name);
  private scheduleTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailDelivery: MailDeliveryService
  ) {}

  onModuleInit() {
    this.scheduleTimer = setInterval(() => {
      void this.runDueSchedules();
    }, 60_000);
  }

  onModuleDestroy() {
    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer);
    }
  }

  async listDefinitions(user: AuthenticatedUser) {
    const definitions = await this.prisma.reportDefinition.findMany({
      where: { organizationId: user.organizationId, reportType: "ticket-report" },
      select: {
        id: true,
        name: true,
        description: true,
        reportType: true,
        filters: true,
        createdAt: true,
        updatedAt: true,
        createdBy: { select: { firstName: true, lastName: true } }
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }]
    });

    return definitions.map((definition) => ({
      ...definition,
      createdBy: definition.createdBy ? `${definition.createdBy.firstName} ${definition.createdBy.lastName}` : null
    }));
  }

  listTemplates() {
    return [
      {
        id: "executive-summary",
        name: "Executive Summary",
        description: "High-level operational summary for management.",
        filters: { groupBy: "week", estimateMode: "none" }
      },
      {
        id: "client-report",
        name: "Client Report",
        description: "Client-focused activity, status, workload, and estimate view.",
        filters: { groupBy: "month", estimateMode: "perTicket", valuePerTicket: "0" }
      },
      {
        id: "technician-productivity",
        name: "Technician Productivity",
        description: "Workload by assigned technician and operational team.",
        filters: { groupBy: "week", estimateMode: "none" }
      },
      {
        id: "aging-tickets",
        name: "Aging Tickets",
        description: "Active tickets and tickets without recent closure.",
        filters: {
          groupBy: "day",
          statuses: ACTIVE_STATUSES,
          estimateMode: "none"
        }
      },
      {
        id: "billing-estimate",
        name: "Closed Tickets Billing Estimate",
        description: "Closed/resolved tickets with optional per-ticket value.",
        filters: {
          groupBy: "month",
          statuses: [TicketStatus.CLOSED, TicketStatus.RESOLVED],
          estimateMode: "perTicket",
          valuePerTicket: "0"
        }
      }
    ];
  }

  async listExportHistory(user: AuthenticatedUser) {
    const exports = await this.prisma.reportExport.findMany({
      where: {
        OR: [
          { organizationId: user.organizationId },
          { requestedBy: { organizationId: user.organizationId } }
        ]
      },
      select: {
        id: true,
        reportType: true,
        format: true,
        recipientEmail: true,
        deliveryStatus: true,
        errorMessage: true,
        createdAt: true,
        definition: { select: { name: true } },
        requestedBy: { select: { firstName: true, lastName: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 50
    });

    return exports.map((item) => ({
      ...item,
      definitionName: item.definition?.name ?? null,
      requestedBy: item.requestedBy ? `${item.requestedBy.firstName} ${item.requestedBy.lastName}` : null,
      definition: undefined
    }));
  }

  async createDefinition(user: AuthenticatedUser, input: CreateReportDefinitionDto) {
    try {
      return await this.prisma.reportDefinition.create({
        data: {
          organizationId: user.organizationId,
          createdById: user.id,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          reportType: input.reportType?.trim() || "ticket-report",
          filters: input.filters as Prisma.InputJsonValue,
          isShared: input.isShared ?? true
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A report with this name already exists.");
      }
      throw error;
    }
  }

  async updateDefinition(user: AuthenticatedUser, definitionId: string, input: UpdateReportDefinitionDto) {
    await this.ensureDefinitionAccess(user, definitionId);
    try {
      return await this.prisma.reportDefinition.update({
        where: { id: definitionId },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined ? { description: input.description.trim() || null } : {}),
          ...(input.filters !== undefined ? { filters: input.filters as Prisma.InputJsonValue } : {}),
          ...(input.isShared !== undefined ? { isShared: input.isShared } : {})
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A report with this name already exists.");
      }
      throw error;
    }
  }

  async deleteDefinition(user: AuthenticatedUser, definitionId: string) {
    await this.ensureDefinitionAccess(user, definitionId);
    await this.prisma.reportDefinition.delete({ where: { id: definitionId } });
    return { deleted: true };
  }

  async listSchedules(user: AuthenticatedUser) {
    return this.prisma.reportSchedule.findMany({
      where: { organizationId: user.organizationId },
      include: {
        definition: { select: { name: true } },
        createdBy: { select: { firstName: true, lastName: true } }
      },
      orderBy: [{ isActive: "desc" }, { nextRunAt: "asc" }, { name: "asc" }]
    });
  }

  async createSchedule(user: AuthenticatedUser, input: CreateReportScheduleDto) {
    const definition = await this.ensureDefinitionAccess(user, input.definitionId);
    const frequency = input.frequency ?? "weekly";
    return this.prisma.reportSchedule.create({
      data: {
        organizationId: user.organizationId,
        definitionId: definition.id,
        createdById: user.id,
        name: input.name.trim(),
        frequency,
        format: input.format ?? "pdf",
        recipientEmails: this.normalizeEmails(input.recipientEmails),
        isActive: input.isActive ?? true,
        nextRunAt: input.isActive === false ? null : this.nextScheduleRun(frequency)
      }
    });
  }

  async updateSchedule(user: AuthenticatedUser, scheduleId: string, input: UpdateReportScheduleDto) {
    const schedule = await this.ensureScheduleAccess(user, scheduleId);
    const frequency = input.frequency ?? schedule.frequency;
    const isActive = input.isActive ?? schedule.isActive;
    return this.prisma.reportSchedule.update({
      where: { id: schedule.id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.frequency !== undefined ? { frequency } : {}),
        ...(input.format !== undefined ? { format: input.format } : {}),
        ...(input.recipientEmails !== undefined ? { recipientEmails: this.normalizeEmails(input.recipientEmails) } : {}),
        ...(input.isActive !== undefined ? { isActive } : {}),
        nextRunAt: isActive ? this.nextScheduleRun(frequency) : null
      }
    });
  }

  async deleteSchedule(user: AuthenticatedUser, scheduleId: string) {
    const schedule = await this.ensureScheduleAccess(user, scheduleId);
    await this.prisma.reportSchedule.delete({ where: { id: schedule.id } });
    return { deleted: true };
  }

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

  async exportTickets(user: AuthenticatedUser, query: TicketReportExportQueryDto) {
    const format = query.format ?? "csv";
    const report = await this.generateTicketsReport(user, query, format);
    await this.logReportExport(user, query, format, "downloaded");
    return report;
  }

  async sendTicketsReport(user: AuthenticatedUser, query: TicketReportExportQueryDto, input: SendReportDto) {
    const format = input.format ?? query.format ?? "pdf";
    const report = await this.generateTicketsReport(user, query, format);
    const subject = input.subject?.trim() || `Ticket report - ${new Date().toLocaleDateString()}`;
    const message = input.message?.trim() || "Attached is the requested ticket report.";
    const recipients = this.normalizeEmails(input.recipientEmails);
    if (!recipients.length) {
      throw new BadRequestException("At least one recipient email is required.");
    }

    await this.mailDelivery.sendTicketReply({
      organizationId: user.organizationId,
      to: recipients,
      subject,
      bodyText: message,
      bodyHtml: `<p>${this.escapeHtml(message).replace(/\n/g, "<br />")}</p>`,
      rawAttachments: [{
        originalFilename: report.filename,
        mimeType: report.contentType,
        sizeBytes: Buffer.byteLength(report.body),
        contentBytes: Buffer.isBuffer(report.body) ? report.body : Buffer.from(report.body),
        isInline: false
      }]
    });

    await Promise.all(recipients.map((recipient) => this.logReportExport(user, query, format, "emailed", recipient)));
    return { sent: true, recipients, filename: report.filename };
  }

  private async generateTicketsReport(user: AuthenticatedUser, query: TicketReportQueryDto, format: ReportFormat): Promise<GeneratedReport> {
    if (format === "xlsx") return this.exportTicketsXlsx(user, query);
    if (format === "pdf") return this.exportTicketsPdf(user, query);
    return this.exportTicketsCsv(user, query);
  }

  private async exportTicketsCsv(user: AuthenticatedUser, query: TicketReportQueryDto): Promise<GeneratedReport> {
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

    return {
      filename: `ticket-report-${new Date().toISOString().slice(0, 10)}.csv`,
      contentType: "text/csv; charset=utf-8",
      body: csv,
      format: "csv",
      result
    };
  }

  private async exportTicketsXlsx(user: AuthenticatedUser, query: TicketReportQueryDto): Promise<GeneratedReport> {
    const result = await this.ticketSummary(user, query);
    const workbook = new Workbook();
    workbook.creator = "Avidity IT Management Tool";
    workbook.created = new Date();

    const summary = workbook.addWorksheet("Summary");
    summary.columns = [
      { header: "Metric", key: "metric", width: 28 },
      { header: "Value", key: "value", width: 22 }
    ];
    summary.addRows([
      { metric: "Total tickets", value: result.summary.totalTickets },
      { metric: "Active tickets", value: result.summary.activeTickets },
      { metric: "Closed tickets", value: result.summary.closedTickets },
      { metric: "Resolved tickets", value: result.summary.resolvedTickets },
      { metric: "Unassigned tickets", value: result.summary.unassignedTickets },
      { metric: "High priority tickets", value: result.summary.highPriorityTickets },
      { metric: "Tickets with attachments", value: result.summary.withAttachments },
      { metric: "Estimated total", value: result.summary.estimatedTotal ?? "" }
    ]);

    const detail = workbook.addWorksheet("Tickets");
    detail.columns = [
      { header: "Ticket", key: "ticketNumber", width: 14 },
      { header: "Subject", key: "subject", width: 42 },
      { header: "Client", key: "clientName", width: 28 },
      { header: "Requester", key: "requester", width: 28 },
      { header: "Status", key: "status", width: 18 },
      { header: "Priority", key: "priority", width: 14 },
      { header: "Source", key: "source", width: 14 },
      { header: "Assigned To", key: "assignedTo", width: 26 },
      { header: "Team", key: "team", width: 24 },
      { header: "Created", key: "createdAt", width: 24 },
      { header: "Modified", key: "updatedAt", width: 24 },
      { header: "Closed", key: "closedAt", width: 24 },
      { header: "Attachments", key: "attachmentCount", width: 14 },
      { header: "Estimated Value", key: "estimatedValue", width: 18 }
    ];
    detail.addRows(result.detail.map((ticket) => ({ ...ticket, estimatedValue: ticket.estimatedValue ?? "" })));

    for (const sheet of [summary, detail]) {
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.autoFilter = { from: "A1", to: `${sheet.getColumn(sheet.columnCount).letter}1` };
    }

    const body = Buffer.from(await workbook.xlsx.writeBuffer());
    return {
      filename: `ticket-report-${new Date().toISOString().slice(0, 10)}.xlsx`,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body,
      format: "xlsx",
      result
    };
  }

  private async exportTicketsPdf(user: AuthenticatedUser, query: TicketReportQueryDto): Promise<GeneratedReport> {
    const result = await this.ticketSummary(user, query);
    const doc = new PDFDocument({ margin: 42, size: "LETTER", bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<void>((resolve) => doc.on("end", resolve));

    doc.fontSize(18).text("Ticket Report", { continued: false });
    doc.moveDown(0.2);
    doc.fontSize(9).fillColor("#64748b").text(`Generated ${new Date().toLocaleString()}`);
    doc.moveDown();

    const summaryRows = [
      ["Total tickets", result.summary.totalTickets],
      ["Active", result.summary.activeTickets],
      ["Closed", result.summary.closedTickets],
      ["Resolved", result.summary.resolvedTickets],
      ["Unassigned", result.summary.unassignedTickets],
      ["High priority", result.summary.highPriorityTickets],
      ["With attachments", result.summary.withAttachments],
      ["Estimated total", result.summary.estimatedTotal === null ? "-" : `$${result.summary.estimatedTotal.toFixed(2)}`]
    ];
    this.drawPdfSection(doc, "Summary");
    summaryRows.forEach(([key, value]) => this.drawPdfKeyValue(doc, String(key), String(value)));

    this.drawPdfSection(doc, "Tickets by Status");
    result.byStatus.slice(0, 10).forEach((item) => this.drawPdfKeyValue(doc, this.label(item.label), String(item.count)));

    this.drawPdfSection(doc, "Top Clients");
    result.byClient.slice(0, 10).forEach((item) => this.drawPdfKeyValue(doc, item.label, String(item.count)));

    this.drawPdfSection(doc, "Report Detail");
    result.detail.slice(0, 35).forEach((ticket) => {
      doc.fillColor("#0f172a").fontSize(9).font("Helvetica-Bold").text(`${ticket.ticketNumber}  ${ticket.subject}`, { width: 520 });
      doc.fillColor("#64748b").font("Helvetica").text(`${ticket.clientName} | ${this.label(ticket.status)} | ${ticket.assignedTo} | ${this.formatShortDate(ticket.createdAt)}`);
      doc.moveDown(0.35);
      if (doc.y > 710) doc.addPage();
    });

    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i += 1) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor("#94a3b8").text(`Page ${i + 1} of ${pages.count}`, 42, 748, { align: "right", width: 528 });
    }

    doc.end();
    await done;
    return {
      filename: `ticket-report-${new Date().toISOString().slice(0, 10)}.pdf`,
      contentType: "application/pdf",
      body: Buffer.concat(chunks),
      format: "pdf",
      result
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

  private async ensureDefinitionAccess(user: AuthenticatedUser, definitionId: string) {
    const definition = await this.prisma.reportDefinition.findFirst({
      where: { id: definitionId, organizationId: user.organizationId },
      select: { id: true, filters: true, name: true, organizationId: true }
    });
    if (!definition) {
      throw new NotFoundException("Saved report was not found.");
    }
    return definition;
  }

  private async ensureScheduleAccess(user: AuthenticatedUser, scheduleId: string) {
    const schedule = await this.prisma.reportSchedule.findFirst({
      where: { id: scheduleId, organizationId: user.organizationId }
    });
    if (!schedule) {
      throw new NotFoundException("Report schedule was not found.");
    }
    return schedule;
  }

  private async logReportExport(user: AuthenticatedUser, query: TicketReportQueryDto, format: ReportFormat, deliveryStatus: string, recipientEmail?: string, definitionId?: string | null, errorMessage?: string) {
    await this.prisma.reportExport.create({
      data: {
        organizationId: user.organizationId,
        requestedById: user.id,
        definitionId: definitionId ?? null,
        reportType: "ticket-report",
        filters: query as Prisma.InputJsonValue,
        format,
        recipientEmail,
        deliveryStatus,
        errorMessage
      }
    });
  }

  private async runDueSchedules() {
    const schedules = await this.prisma.reportSchedule.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: new Date() }
      },
      include: {
        definition: true,
        createdBy: true
      },
      take: 10,
      orderBy: { nextRunAt: "asc" }
    });

    for (const schedule of schedules) {
      const user = schedule.createdBy;
      if (!user) continue;
      const authUser: AuthenticatedUser = {
        id: user.id,
        organizationId: schedule.organizationId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        forcePasswordChange: user.forcePasswordChange,
        permissions: ["reports.view"]
      };
      const query = this.filtersToQuery(schedule.definition.filters as ReportFilters);
      try {
        await this.sendTicketsReport(authUser, { ...query, format: schedule.format as ReportFormat }, {
          recipientEmails: schedule.recipientEmails,
          format: schedule.format as ReportFormat,
          subject: `${schedule.name} - Ticket report`,
          message: `Attached is the scheduled report "${schedule.name}".`
        });
        await this.prisma.reportSchedule.update({
          where: { id: schedule.id },
          data: {
            lastRunAt: new Date(),
            lastStatus: "sent",
            lastError: null,
            nextRunAt: this.nextScheduleRun(schedule.frequency)
          }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown scheduled report error.";
        this.logger.warn(`Scheduled report ${schedule.id} failed: ${message}`);
        await this.prisma.reportSchedule.update({
          where: { id: schedule.id },
          data: {
            lastRunAt: new Date(),
            lastStatus: "failed",
            lastError: message.slice(0, 1000),
            nextRunAt: this.nextScheduleRun(schedule.frequency)
          }
        });
        await this.prisma.reportExport.create({
          data: {
            organizationId: schedule.organizationId,
            requestedById: user.id,
            definitionId: schedule.definitionId,
            reportType: "ticket-report",
            filters: query as Prisma.InputJsonValue,
            format: schedule.format,
            deliveryStatus: "failed",
            errorMessage: message.slice(0, 1000)
          }
        });
      }
    }
  }

  private normalizeEmails(emails: string[]) {
    return [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  }

  private filtersToQuery(filters: ReportFilters): TicketReportQueryDto {
    return {
      ...filters,
      statuses: Array.isArray(filters.statuses) ? filters.statuses.join(",") : filters.statuses
    } as TicketReportQueryDto;
  }

  private nextScheduleRun(frequency: string) {
    const next = new Date();
    next.setSeconds(0, 0);
    if (frequency === "daily") {
      next.setDate(next.getDate() + 1);
    } else if (frequency === "monthly") {
      next.setMonth(next.getMonth() + 1);
    } else {
      next.setDate(next.getDate() + 7);
    }
    return next;
  }

  private drawPdfSection(doc: PDFKit.PDFDocument, title: string) {
    doc.moveDown(0.8);
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(12).text(title);
    doc.moveDown(0.3);
  }

  private drawPdfKeyValue(doc: PDFKit.PDFDocument, key: string, value: string) {
    const y = doc.y;
    doc.fillColor("#475569").font("Helvetica").fontSize(9).text(key, 42, y, { width: 260 });
    doc.fillColor("#0f172a").font("Helvetica-Bold").text(value, 330, y, { width: 220, align: "right" });
    doc.moveDown(0.45);
  }

  private escapeHtml(value: string) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  private label(value: string) {
    return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  }

  private formatShortDate(value: string) {
    return new Date(value).toLocaleDateString();
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
