import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { AttachmentScanResult, AttachmentScanStatus, Prisma } from "@prisma/client";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { FileScanService } from "../file-storage/file-scan.service";
import { FileStorageService } from "../file-storage/file-storage.service";
import { PrismaService } from "../prisma/prisma.service";
import { AttachmentQuarantineQueryDto } from "./dto/attachment-quarantine-query.dto";

@Injectable()
export class MaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceService.name);
  private cleanupTimer?: NodeJS.Timeout;
  private cleanupRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
    private readonly fileScan: FileScanService,
    private readonly auditLogs: AuditLogsService
  ) {}

  onModuleInit() {
    this.cleanupTimer = setInterval(() => {
      void this.runAutomaticCleanup();
    }, 60 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  async getSummary(user: AuthenticatedUser) {
    const settings = await this.getOrCreateSettings(user.organizationId);
    const cutoff = this.cutoffDate(settings.recycleBinRetentionDays);
    const [deletedTickets, eligibleTickets, deletedAttachments, eligibleAttachments, quarantine] = await Promise.all([
      this.prisma.ticket.count({ where: { organizationId: user.organizationId, deletedAt: { not: null } } }),
      this.prisma.ticket.count({ where: { organizationId: user.organizationId, deletedAt: { lt: cutoff } } }),
      this.prisma.ticketAttachment.count({ where: { ticket: { organizationId: user.organizationId }, deletedAt: { not: null } } }),
      this.prisma.ticketAttachment.count({ where: { ticket: { organizationId: user.organizationId }, deletedAt: { lt: cutoff } } }),
      this.getQuarantineCounts(user.organizationId)
    ]);

    return {
      recycleBinRetentionDays: settings.recycleBinRetentionDays,
      lastRecycleBinCleanupAt: settings.lastRecycleBinCleanupAt,
      deletedTickets,
      eligibleTickets,
      deletedAttachments,
      eligibleAttachments,
      quarantine,
      cutoff
    };
  }

  async updateSettings(user: AuthenticatedUser, recycleBinRetentionDays: number) {
    const settings = await this.prisma.systemSetting.update({
      where: { organizationId: user.organizationId },
      data: { recycleBinRetentionDays }
    });

    await this.auditLogs.create({
      organizationId: user.organizationId,
      userId: user.id,
      entityType: "SystemSetting",
      entityId: settings.id,
      action: "maintenance.settings_updated",
      metadata: { recycleBinRetentionDays }
    });

    return { recycleBinRetentionDays: settings.recycleBinRetentionDays, lastRecycleBinCleanupAt: settings.lastRecycleBinCleanupAt };
  }

  async cleanupRecycleBin(user: AuthenticatedUser, input: { confirm: boolean; olderThanDays?: number }) {
    if (!input.confirm) {
      throw new BadRequestException("Cleanup confirmation is required.");
    }

    const settings = await this.getOrCreateSettings(user.organizationId);
    const retentionDays = input.olderThanDays ?? settings.recycleBinRetentionDays;
    const result = await this.cleanupOrganization(user.organizationId, retentionDays);

    await this.auditLogs.create({
      organizationId: user.organizationId,
      userId: user.id,
      entityType: "Maintenance",
      action: "maintenance.recycle_bin_cleanup",
      metadata: { ...result, retentionDays, manual: true }
    });

    return result;
  }

  async listAttachmentQuarantine(user: AuthenticatedUser, query: AttachmentQuarantineQueryDto) {
    const page = this.toPositiveInt(query.page, 1, 500);
    const pageSize = this.toPositiveInt(query.pageSize, 25, 100);
    const type = query.type ?? "all";
    const status = query.status ?? "quarantined";
    const search = query.search?.trim();
    const ticketWhere = this.ticketQuarantineWhere(user.organizationId, status, search);
    const eventWhere = this.eventQuarantineWhere(user.organizationId, status, search);

    const [ticketCount, eventCount, ticketItems, eventItems, counts] = await Promise.all([
      type === "event" ? Promise.resolve(0) : this.prisma.ticketAttachment.count({ where: ticketWhere }),
      type === "ticket" ? Promise.resolve(0) : this.prisma.eventServiceAttachment.count({ where: eventWhere }),
      type === "event"
        ? Promise.resolve([])
        : this.prisma.ticketAttachment.findMany({
            where: ticketWhere,
            include: {
              ticket: { select: { id: true, ticketNumber: true, subject: true, client: { select: { name: true } } } },
              uploadedByUser: { select: { firstName: true, lastName: true, email: true } },
              scanOverriddenBy: { select: { firstName: true, lastName: true, email: true } }
            },
            orderBy: { createdAt: "desc" },
            take: 500
          }),
      type === "ticket"
        ? Promise.resolve([])
        : this.prisma.eventServiceAttachment.findMany({
            where: eventWhere,
            include: {
              request: { select: { id: true, trackingNumber: true, eventName: true, requesterFirstName: true, requesterLastName: true } },
              uploadedByUser: { select: { firstName: true, lastName: true, email: true } },
              scanOverriddenBy: { select: { firstName: true, lastName: true, email: true } }
            },
            orderBy: { createdAt: "desc" },
            take: 500
          }),
      this.getQuarantineCounts(user.organizationId)
    ]);

    const items = [
      ...ticketItems.map((attachment) => this.toTicketQuarantineItem(attachment)),
      ...eventItems.map((attachment) => this.toEventQuarantineItem(attachment))
    ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    return {
      items: items.slice((page - 1) * pageSize, page * pageSize),
      total: ticketCount + eventCount,
      page,
      pageSize,
      counts
    };
  }

  async rescanAttachment(user: AuthenticatedUser, type: "ticket" | "event", attachmentId: string) {
    const attachment = await this.findScopedAttachment(user.organizationId, type, attachmentId);
    const buffer = await this.streamToBuffer(await this.fileStorage.getFileStream(attachment.storageKey));
    const scan = await this.fileScan.scanBuffer(buffer);
    const data = {
      scanStatus: scan.scanStatus,
      scanResult: scan.scanResult,
      scanOverriddenAt: null,
      scanOverrideReason: null,
      scanOverriddenById: null
    };
    const updated = type === "ticket"
      ? await this.prisma.ticketAttachment.update({ where: { id: attachmentId }, data })
      : await this.prisma.eventServiceAttachment.update({ where: { id: attachmentId }, data });

    await this.auditLogs.create({
      organizationId: user.organizationId,
      userId: user.id,
      entityType: type === "ticket" ? "TicketAttachment" : "EventServiceAttachment",
      entityId: attachmentId,
      action: "attachment.antivirus_rescanned",
      metadata: {
        attachmentType: type,
        originalFilename: attachment.originalFilename,
        scanStatus: updated.scanStatus,
        scanResult: updated.scanResult
      }
    });

    return { id: updated.id, scanStatus: updated.scanStatus, scanResult: updated.scanResult };
  }

  async restoreQuarantinedAttachment(user: AuthenticatedUser, type: "ticket" | "event", attachmentId: string, reason: string) {
    const attachment = await this.findScopedAttachment(user.organizationId, type, attachmentId);
    if (attachment.scanStatus !== AttachmentScanStatus.BLOCKED && attachment.scanStatus !== AttachmentScanStatus.SUSPICIOUS) {
      throw new BadRequestException("Only blocked or suspicious attachments can be restored.");
    }

    const data = {
      scanStatus: AttachmentScanStatus.CLEAN,
      scanResult: AttachmentScanResult.PASSED,
      scanOverriddenAt: new Date(),
      scanOverrideReason: reason.trim(),
      scanOverriddenById: user.id
    };
    const updated = type === "ticket"
      ? await this.prisma.ticketAttachment.update({ where: { id: attachmentId }, data })
      : await this.prisma.eventServiceAttachment.update({ where: { id: attachmentId }, data });

    await this.auditLogs.create({
      organizationId: user.organizationId,
      userId: user.id,
      entityType: type === "ticket" ? "TicketAttachment" : "EventServiceAttachment",
      entityId: attachmentId,
      action: "attachment.antivirus_false_positive_restored",
      metadata: {
        attachmentType: type,
        originalFilename: attachment.originalFilename,
        reason: reason.trim()
      }
    });

    return { id: updated.id, scanStatus: updated.scanStatus, scanResult: updated.scanResult, scanOverriddenAt: updated.scanOverriddenAt };
  }

  private async runAutomaticCleanup() {
    if (this.cleanupRunning) {
      return;
    }

    this.cleanupRunning = true;
    try {
      const settingsRows = await this.prisma.systemSetting.findMany({ select: { organizationId: true, recycleBinRetentionDays: true } });
      for (const settings of settingsRows) {
        const result = await this.cleanupOrganization(settings.organizationId, settings.recycleBinRetentionDays);
        if (result.deletedTickets > 0 || result.deletedAttachments > 0) {
          await this.auditLogs.create({
            organizationId: settings.organizationId,
            entityType: "Maintenance",
            action: "maintenance.recycle_bin_cleanup",
            metadata: { ...result, retentionDays: settings.recycleBinRetentionDays, manual: false }
          });
        }
      }
    } catch (error) {
      this.logger.warn(`Automatic recycle bin cleanup failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      this.cleanupRunning = false;
    }
  }

  private async cleanupOrganization(organizationId: string, retentionDays: number) {
    const cutoff = this.cutoffDate(retentionDays);
    const tickets = await this.prisma.ticket.findMany({
      where: { organizationId, deletedAt: { lt: cutoff } },
      select: { id: true },
      take: 200
    });
    const ticketIds = tickets.map((ticket) => ticket.id);

    const softDeletedAttachments = await this.prisma.ticketAttachment.findMany({
      where: {
        ticket: { organizationId },
        OR: [{ deletedAt: { lt: cutoff } }, ...(ticketIds.length ? [{ ticketId: { in: ticketIds } }] : [])]
      },
      include: { storedFile: true }
    });

    for (const attachment of softDeletedAttachments) {
      await this.fileStorage.deleteFile(attachment.storageKey);
    }

    const attachmentIds = softDeletedAttachments.map((attachment) => attachment.id);
    const storedFileIds = softDeletedAttachments.map((attachment) => attachment.storedFileId);

    const [deletedAttachments, deletedStoredFiles, deletedTickets] = await this.prisma.$transaction(async (tx) => {
      const attachmentResult = attachmentIds.length ? await tx.ticketAttachment.deleteMany({ where: { id: { in: attachmentIds } } }) : { count: 0 };
      const storedFileResult = storedFileIds.length ? await tx.storedFile.deleteMany({ where: { id: { in: storedFileIds } } }) : { count: 0 };
      const ticketResult = ticketIds.length ? await tx.ticket.deleteMany({ where: { id: { in: ticketIds } } }) : { count: 0 };
      await tx.systemSetting.updateMany({
        where: { organizationId },
        data: { lastRecycleBinCleanupAt: new Date() }
      });
      return [attachmentResult.count, storedFileResult.count, ticketResult.count];
    });

    return {
      cutoff,
      deletedTickets,
      deletedAttachments,
      deletedStoredFiles
    };
  }

  private async getQuarantineCounts(organizationId: string) {
    const [ticketQuarantined, eventQuarantined, ticketPending, eventPending, ticketRestored, eventRestored] = await Promise.all([
      this.prisma.ticketAttachment.count({ where: { ticket: { organizationId }, deletedAt: null, scanStatus: { in: [AttachmentScanStatus.BLOCKED, AttachmentScanStatus.SUSPICIOUS] } } }),
      this.prisma.eventServiceAttachment.count({ where: { request: { organizationId }, deletedAt: null, scanStatus: { in: [AttachmentScanStatus.BLOCKED, AttachmentScanStatus.SUSPICIOUS] } } }),
      this.prisma.ticketAttachment.count({ where: { ticket: { organizationId }, deletedAt: null, OR: [{ scanStatus: AttachmentScanStatus.PENDING }, { scanResult: AttachmentScanResult.SKIPPED }] } }),
      this.prisma.eventServiceAttachment.count({ where: { request: { organizationId }, deletedAt: null, OR: [{ scanStatus: AttachmentScanStatus.PENDING }, { scanResult: AttachmentScanResult.SKIPPED }] } }),
      this.prisma.ticketAttachment.count({ where: { ticket: { organizationId }, deletedAt: null, scanOverriddenAt: { not: null } } }),
      this.prisma.eventServiceAttachment.count({ where: { request: { organizationId }, deletedAt: null, scanOverriddenAt: { not: null } } })
    ]);
    return {
      quarantined: ticketQuarantined + eventQuarantined,
      pending: ticketPending + eventPending,
      restored: ticketRestored + eventRestored
    };
  }

  private ticketQuarantineWhere(organizationId: string, status: string, search?: string): Prisma.TicketAttachmentWhereInput {
    const where: Prisma.TicketAttachmentWhereInput = { ticket: { organizationId }, deletedAt: null };
    where.AND = [...(Array.isArray(where.AND) ? where.AND : []), this.ticketQuarantineStatusFilter(status)];
    if (search) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { originalFilename: { contains: search, mode: "insensitive" } },
            { mimeType: { contains: search, mode: "insensitive" } },
            { ticket: { ticketNumber: { contains: search, mode: "insensitive" } } },
            { ticket: { subject: { contains: search, mode: "insensitive" } } }
          ]
        }
      ];
    }
    return where;
  }

  private eventQuarantineWhere(organizationId: string, status: string, search?: string): Prisma.EventServiceAttachmentWhereInput {
    const where: Prisma.EventServiceAttachmentWhereInput = { request: { organizationId }, deletedAt: null };
    where.AND = [...(Array.isArray(where.AND) ? where.AND : []), this.eventQuarantineStatusFilter(status)];
    if (search) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { originalFilename: { contains: search, mode: "insensitive" } },
            { mimeType: { contains: search, mode: "insensitive" } },
            { request: { trackingNumber: { contains: search, mode: "insensitive" } } },
            { request: { eventName: { contains: search, mode: "insensitive" } } }
          ]
        }
      ];
    }
    return where;
  }

  private ticketQuarantineStatusFilter(status: string): Prisma.TicketAttachmentWhereInput {
    if (status === "restored") return { scanOverriddenAt: { not: null } };
    if (status === "pending") return { OR: [{ scanStatus: AttachmentScanStatus.PENDING }, { scanResult: AttachmentScanResult.SKIPPED }] };
    if (status === "all") {
      return {
        OR: [
          { scanStatus: { in: [AttachmentScanStatus.BLOCKED, AttachmentScanStatus.SUSPICIOUS] } },
          { scanOverriddenAt: { not: null } },
          { scanStatus: AttachmentScanStatus.PENDING },
          { scanResult: AttachmentScanResult.SKIPPED }
        ]
      };
    }
    return { scanStatus: { in: [AttachmentScanStatus.BLOCKED, AttachmentScanStatus.SUSPICIOUS] } };
  }

  private eventQuarantineStatusFilter(status: string): Prisma.EventServiceAttachmentWhereInput {
    if (status === "restored") return { scanOverriddenAt: { not: null } };
    if (status === "pending") return { OR: [{ scanStatus: AttachmentScanStatus.PENDING }, { scanResult: AttachmentScanResult.SKIPPED }] };
    if (status === "all") {
      return {
        OR: [
          { scanStatus: { in: [AttachmentScanStatus.BLOCKED, AttachmentScanStatus.SUSPICIOUS] } },
          { scanOverriddenAt: { not: null } },
          { scanStatus: AttachmentScanStatus.PENDING },
          { scanResult: AttachmentScanResult.SKIPPED }
        ]
      };
    }
    return { scanStatus: { in: [AttachmentScanStatus.BLOCKED, AttachmentScanStatus.SUSPICIOUS] } };
  }

  private async findScopedAttachment(organizationId: string, type: "ticket" | "event", attachmentId: string) {
    const attachment = type === "ticket"
      ? await this.prisma.ticketAttachment.findFirst({ where: { id: attachmentId, ticket: { organizationId }, deletedAt: null } })
      : await this.prisma.eventServiceAttachment.findFirst({ where: { id: attachmentId, request: { organizationId }, deletedAt: null } });
    if (!attachment) {
      throw new BadRequestException("Attachment was not found in this organization.");
    }
    return attachment;
  }

  private toTicketQuarantineItem(
    attachment: Prisma.TicketAttachmentGetPayload<{
      include: {
        ticket: { select: { id: true; ticketNumber: true; subject: true; client: { select: { name: true } } } };
        uploadedByUser: { select: { firstName: true; lastName: true; email: true } };
        scanOverriddenBy: { select: { firstName: true; lastName: true; email: true } };
      };
    }>
  ) {
    return {
      id: attachment.id,
      type: "ticket" as const,
      originalFilename: attachment.originalFilename,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      source: attachment.source,
      scanStatus: attachment.scanStatus,
      scanResult: attachment.scanResult,
      scanOverriddenAt: attachment.scanOverriddenAt?.toISOString() ?? null,
      scanOverrideReason: attachment.scanOverrideReason,
      createdAt: attachment.createdAt.toISOString(),
      parent: {
        id: attachment.ticket.id,
        number: attachment.ticket.ticketNumber,
        title: attachment.ticket.subject,
        client: attachment.ticket.client?.name ?? "Unmapped / no client"
      },
      uploadedBy: this.userLabel(attachment.uploadedByUser),
      restoredBy: this.userLabel(attachment.scanOverriddenBy)
    };
  }

  private toEventQuarantineItem(
    attachment: Prisma.EventServiceAttachmentGetPayload<{
      include: {
        request: { select: { id: true; trackingNumber: true; eventName: true; requesterFirstName: true; requesterLastName: true } };
        uploadedByUser: { select: { firstName: true; lastName: true; email: true } };
        scanOverriddenBy: { select: { firstName: true; lastName: true; email: true } };
      };
    }>
  ) {
    return {
      id: attachment.id,
      type: "event" as const,
      originalFilename: attachment.originalFilename,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      source: attachment.source,
      scanStatus: attachment.scanStatus,
      scanResult: attachment.scanResult,
      scanOverriddenAt: attachment.scanOverriddenAt?.toISOString() ?? null,
      scanOverrideReason: attachment.scanOverrideReason,
      createdAt: attachment.createdAt.toISOString(),
      parent: {
        id: attachment.request.id,
        number: attachment.request.trackingNumber,
        title: attachment.request.eventName,
        client: `${attachment.request.requesterFirstName} ${attachment.request.requesterLastName}`.trim()
      },
      uploadedBy: this.userLabel(attachment.uploadedByUser),
      restoredBy: this.userLabel(attachment.scanOverriddenBy)
    };
  }

  private userLabel(user: { firstName: string; lastName: string; email: string } | null) {
    if (!user) return null;
    const name = `${user.firstName} ${user.lastName}`.trim();
    return name ? `${name} (${user.email})` : user.email;
  }

  private async streamToBuffer(stream: NodeJS.ReadableStream) {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private toPositiveInt(value: string | undefined, fallback: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.min(max, Math.floor(parsed));
  }

  private cutoffDate(retentionDays: number) {
    return new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  }

  private async getOrCreateSettings(organizationId: string) {
    const existing = await this.prisma.systemSetting.findUnique({ where: { organizationId } });
    if (existing) {
      return existing;
    }

    return this.prisma.systemSetting.create({
      data: {
        organizationId,
        applicationName: "Avidity IT Management Tool",
        companyName: "Avidity Technologies",
        supportEmail: "support@aviditytechnologies.com"
      }
    });
  }
}
