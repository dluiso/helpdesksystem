import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { FileStorageService } from "../file-storage/file-storage.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class MaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceService.name);
  private cleanupTimer?: NodeJS.Timeout;
  private cleanupRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
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
    const [deletedTickets, eligibleTickets, deletedAttachments, eligibleAttachments] = await Promise.all([
      this.prisma.ticket.count({ where: { organizationId: user.organizationId, deletedAt: { not: null } } }),
      this.prisma.ticket.count({ where: { organizationId: user.organizationId, deletedAt: { lt: cutoff } } }),
      this.prisma.ticketAttachment.count({ where: { ticket: { organizationId: user.organizationId }, deletedAt: { not: null } } }),
      this.prisma.ticketAttachment.count({ where: { ticket: { organizationId: user.organizationId }, deletedAt: { lt: cutoff } } })
    ]);

    return {
      recycleBinRetentionDays: settings.recycleBinRetentionDays,
      lastRecycleBinCleanupAt: settings.lastRecycleBinCleanupAt,
      deletedTickets,
      eligibleTickets,
      deletedAttachments,
      eligibleAttachments,
      cutoff
    };
  }

  async updateSettings(user: AuthenticatedUser, recycleBinRetentionDays: number) {
    const settings = await this.prisma.systemSetting.update({
      where: { organizationId: user.organizationId },
      data: { recycleBinRetentionDays }
    });

    await this.auditLogs.create({
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
      userId: user.id,
      entityType: "Maintenance",
      action: "maintenance.recycle_bin_cleanup",
      metadata: { ...result, retentionDays, manual: true }
    });

    return result;
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
