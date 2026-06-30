import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { AttachmentScanResult, AttachmentScanStatus, Prisma } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";
import { AuthenticatedUser } from "../auth/auth.types";
import { FileScanService } from "../file-storage/file-scan.service";
import { PrismaService } from "../prisma/prisma.service";

export type SystemHealthStatus = "ok" | "warning" | "error";
export type SystemHealthRange = "daily" | "weekly" | "monthly" | "yearly";
export type SystemHealthTimelineStatus = SystemHealthStatus | "unknown";

export interface SystemHealthComponent {
  key: string;
  name: string;
  status: SystemHealthStatus;
  severity: "green" | "orange" | "red";
  message: string;
  checkedAt: string;
  metadata?: Record<string, unknown>;
}

const rangeHours: Record<SystemHealthRange, number> = {
  daily: 24,
  weekly: 24 * 7,
  monthly: 24 * 30,
  yearly: 24 * 365
};

const timelineRanges: Record<SystemHealthRange, { bucketCount: number; bucketHours: number }> = {
  daily: { bucketCount: 24, bucketHours: 1 },
  weekly: { bucketCount: 7, bucketHours: 24 },
  monthly: { bucketCount: 30, bucketHours: 24 },
  yearly: { bucketCount: 52, bucketHours: 24 * 7 }
};

const componentNames: Record<string, string> = {
  database: "Database",
  storage: "Local storage",
  mail: "Mail flow",
  support_portal: "Support portal",
  event_services: "Event services",
  ai: "AI providers",
  antivirus: "Antivirus scanner",
  audit_logs: "Audit logs"
};

function componentStatus(status: SystemHealthStatus) {
  if (status === "error") return "red" as const;
  if (status === "warning") return "orange" as const;
  return "green" as const;
}

function timelineSeverity(status: SystemHealthTimelineStatus) {
  if (status === "error") return "red" as const;
  if (status === "warning") return "orange" as const;
  if (status === "unknown") return "gray" as const;
  return "green" as const;
}

function normalizeStatus(status: string): SystemHealthStatus {
  if (status === "error" || status === "warning") return status;
  return "ok";
}

function buildComponent(
  key: string,
  name: string,
  status: SystemHealthStatus,
  message: string,
  metadata?: Record<string, unknown>
): SystemHealthComponent {
  return {
    key,
    name,
    status,
    severity: componentStatus(status),
    message,
    checkedAt: new Date().toISOString(),
    metadata
  };
}

@Injectable()
export class SystemHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SystemHealthService.name);
  private automaticCheckTimer?: NodeJS.Timeout;
  private automaticCheckRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileScan: FileScanService
  ) {}

  onModuleInit() {
    const intervalMs = this.automaticCheckIntervalMs();
    this.automaticCheckTimer = setInterval(() => {
      void this.runAutomaticCheck();
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.automaticCheckTimer) {
      clearInterval(this.automaticCheckTimer);
    }
  }

  async getSummary(user: AuthenticatedUser, record = false) {
    return this.getSummaryForOrganization(user.organizationId, record);
  }

  private async getSummaryForOrganization(organizationId: string, record = false) {
    const database = await this.checkDatabase();
    if (database.status === "error") {
      return this.aggregate(organizationId, [database], null, record);
    }

    const settings = await this.prisma.systemSetting.findUnique({
      where: { organizationId },
      select: {
        supportPortalEnabled: true,
        aiAssistantEnabled: true,
        defaultTimezone: true,
        dateFormat: true,
        timeFormat: true
      }
    });

    const components = await Promise.all([
      this.checkStorage(),
      this.checkMail(organizationId),
      this.checkSupportPortal(organizationId, settings?.supportPortalEnabled ?? false),
      this.checkEventServices(organizationId),
      this.checkAi(organizationId, settings?.aiAssistantEnabled ?? false),
      this.checkAntivirus(organizationId),
      this.checkAuditLogs()
    ]);

    return this.aggregate(organizationId, [database, ...components], settings, record);
  }

  async getHistory(range: SystemHealthRange = "daily") {
    const selectedRange = range in rangeHours ? range : "daily";
    const to = new Date();
    const from = new Date(to.getTime() - rangeHours[selectedRange] * 60 * 60 * 1000);
    const snapshots = await this.prisma.systemHealthSnapshot.findMany({
      where: { checkedAt: { gte: from } },
      orderBy: { checkedAt: "desc" },
      take: 300
    });

    const totals = snapshots.reduce(
      (current, item) => ({
        ok: current.ok + (item.status === "ok" ? 1 : 0),
        warning: current.warning + (item.status === "warning" ? 1 : 0),
        error: current.error + (item.status === "error" ? 1 : 0)
      }),
      { ok: 0, warning: 0, error: 0 }
    );

    return {
      range: selectedRange,
      from: from.toISOString(),
      to: to.toISOString(),
      totals,
      snapshots: snapshots.map((item) => ({
        id: item.id,
        component: item.component,
        status: item.status,
        severity: item.severity,
        message: item.message,
        metadata: item.metadata,
        checkedAt: item.checkedAt.toISOString()
      }))
    };
  }

  async getTimeline(range: SystemHealthRange = "daily") {
    const selectedRange = range in timelineRanges ? range : "daily";
    const { bucketCount, bucketHours } = timelineRanges[selectedRange];
    const to = new Date();
    const bucketMs = bucketHours * 60 * 60 * 1000;
    const from = new Date(to.getTime() - bucketCount * bucketMs);
    const snapshots = await this.prisma.systemHealthSnapshot.findMany({
      where: { checkedAt: { gte: from } },
      orderBy: { checkedAt: "asc" }
    });

    const componentKeys = Array.from(new Set([...Object.keys(componentNames), ...snapshots.map((snapshot) => snapshot.component)]));

    return {
      range: selectedRange,
      from: from.toISOString(),
      to: to.toISOString(),
      bucketHours,
      components: componentKeys.map((componentKey) => {
        const componentSnapshots = snapshots.filter((snapshot) => snapshot.component === componentKey);
        const buckets = Array.from({ length: bucketCount }, (_, index) => {
          const start = new Date(from.getTime() + index * bucketMs);
          const end = new Date(start.getTime() + bucketMs);
          const bucketSnapshots = componentSnapshots.filter((snapshot) => snapshot.checkedAt >= start && snapshot.checkedAt < end);

          if (bucketSnapshots.length === 0) {
            return {
              id: `${componentKey}-${index}`,
              start: start.toISOString(),
              end: end.toISOString(),
              status: "unknown" as const,
              severity: "gray" as const,
              message: "No snapshot recorded.",
              snapshotCount: 0
            };
          }

          const status: SystemHealthTimelineStatus = bucketSnapshots.some((snapshot) => snapshot.status === "error")
            ? "error"
            : bucketSnapshots.some((snapshot) => snapshot.status === "warning")
              ? "warning"
              : "ok";
          const message = [...bucketSnapshots].reverse().find((snapshot) => normalizeStatus(snapshot.status) === status)?.message ?? bucketSnapshots[bucketSnapshots.length - 1]?.message ?? "Snapshot recorded.";

          return {
            id: `${componentKey}-${index}`,
            start: start.toISOString(),
            end: end.toISOString(),
            status,
            severity: timelineSeverity(status),
            message,
            snapshotCount: bucketSnapshots.length
          };
        });

        const knownBuckets = buckets.filter((bucket) => bucket.status !== "unknown").length;
        const okBuckets = buckets.filter((bucket) => bucket.status === "ok").length;

        return {
          key: componentKey,
          name: componentNames[componentKey] ?? componentKey,
          healthyPercent: knownBuckets === 0 ? 0 : Math.round((okBuckets / knownBuckets) * 1000) / 10,
          warningCount: buckets.filter((bucket) => bucket.status === "warning").length,
          errorCount: buckets.filter((bucket) => bucket.status === "error").length,
          unknownCount: buckets.filter((bucket) => bucket.status === "unknown").length,
          buckets
        };
      })
    };
  }

  private async aggregate(organizationId: string, components: SystemHealthComponent[], settings: { defaultTimezone: string; dateFormat: string; timeFormat: string } | null, record: boolean) {
    const aggregateStatus: SystemHealthStatus = components.some((component) => component.status === "error")
      ? "error"
      : components.some((component) => component.status === "warning")
        ? "warning"
        : "ok";

    if (record) {
      await this.prisma.systemHealthSnapshot.createMany({
        data: components.map((component) => ({
          component: component.key,
          status: component.status,
          severity: component.severity,
          message: component.message,
          metadata: component.metadata ? (component.metadata as Prisma.InputJsonValue) : Prisma.JsonNull
        }))
      });
    }

    return {
      status: aggregateStatus,
      severity: componentStatus(aggregateStatus),
      checkedAt: new Date().toISOString(),
      serverTime: new Date().toISOString(),
      timezone: settings?.defaultTimezone ?? process.env.DEFAULT_TIMEZONE ?? process.env.TZ ?? "UTC",
      dateFormat: settings?.dateFormat ?? "MMM dd, yyyy",
      timeFormat: settings?.timeFormat ?? "12h",
      components,
      recorded: record,
      organizationId
    };
  }

  private automaticCheckIntervalMs() {
    const configured = Number(process.env.SYSTEM_HEALTH_AUTO_CHECK_INTERVAL_MS);
    if (Number.isFinite(configured) && configured >= 60_000) {
      return configured;
    }
    return 15 * 60 * 1000;
  }

  private async runAutomaticCheck() {
    if (this.automaticCheckRunning) {
      return;
    }
    this.automaticCheckRunning = true;
    try {
      const organization = await this.prisma.organization.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true }
      });
      if (!organization) {
        return;
      }
      await this.getSummaryForOrganization(organization.id, true);
    } catch (error) {
      this.logger.warn(`Automatic system health check failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      this.automaticCheckRunning = false;
    }
  }

  private async checkDatabase() {
    try {
      await this.prisma.$queryRawUnsafe("SELECT 1");
      return buildComponent("database", "Database", "ok", "PostgreSQL connection is healthy.");
    } catch {
      return buildComponent("database", "Database", "error", "PostgreSQL connection failed.");
    }
  }

  private async checkStorage() {
    const storagePath = path.resolve(process.cwd(), process.env.LOCAL_STORAGE_PATH ?? "storage/local");
    try {
      await fs.access(storagePath);
      return buildComponent("storage", "Local storage", "ok", "Local storage path is reachable.", { path: storagePath });
    } catch {
      return buildComponent("storage", "Local storage", "warning", "Local storage path is not reachable.", { path: storagePath });
    }
  }

  private async checkMail(organizationId: string) {
    const mailboxes = await this.prisma.mailbox.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, emailAddress: true, autoSyncEnabled: true, nextAutoSyncAt: true, lastSyncError: true }
    });
    if (mailboxes.length === 0) {
      return buildComponent("mail", "Mail flow", "warning", "No active mailbox is configured.");
    }

    const syncErrors = mailboxes.filter((mailbox) => mailbox.lastSyncError);
    const overdue = mailboxes.filter((mailbox) => mailbox.autoSyncEnabled && mailbox.nextAutoSyncAt && mailbox.nextAutoSyncAt.getTime() < Date.now() - 15 * 60 * 1000);
    if (syncErrors.length > 0) {
      return buildComponent("mail", "Mail flow", "warning", `${syncErrors.length} active mailbox${syncErrors.length === 1 ? "" : "es"} report sync errors.`, {
        affectedMailboxes: syncErrors.map((mailbox) => mailbox.emailAddress)
      });
    }
    if (overdue.length > 0) {
      return buildComponent("mail", "Mail flow", "warning", `${overdue.length} mailbox sync schedule${overdue.length === 1 ? " is" : "s are"} overdue.`);
    }
    return buildComponent("mail", "Mail flow", "ok", `${mailboxes.length} active mailbox${mailboxes.length === 1 ? "" : "es"} configured.`);
  }

  private async checkSupportPortal(organizationId: string, enabled: boolean) {
    if (!enabled) {
      return buildComponent("support_portal", "Support portal", "warning", "Support portal is disabled in Settings.");
    }
    const activeForms = await this.prisma.supportPortalForm.count({ where: { organizationId, isActive: true } });
    return buildComponent("support_portal", "Support portal", activeForms > 0 ? "ok" : "warning", activeForms > 0 ? `${activeForms} active support form${activeForms === 1 ? "" : "s"} available.` : "No active support portal form is available.");
  }

  private async checkEventServices(organizationId: string) {
    const activeServices = await this.prisma.eventServiceService.count({ where: { organizationId, isActive: true } });
    return buildComponent("event_services", "Event services", activeServices > 0 ? "ok" : "warning", activeServices > 0 ? `${activeServices} active event service${activeServices === 1 ? "" : "s"} available.` : "No active event service is configured.");
  }

  private async checkAi(organizationId: string, enabled: boolean) {
    if (!enabled) {
      return buildComponent("ai", "AI providers", "warning", "AI assistant is disabled in Settings.");
    }
    const enabledProviders = await this.prisma.aiProviderConfig.count({ where: { organizationId, isEnabled: true } });
    return buildComponent("ai", "AI providers", enabledProviders > 0 ? "ok" : "warning", enabledProviders > 0 ? `${enabledProviders} enabled AI provider${enabledProviders === 1 ? "" : "s"} configured.` : "No enabled AI provider is configured.");
  }

  private async checkAntivirus(organizationId: string) {
    const [scanner, ticketCounts, eventCounts] = await Promise.all([
      this.fileScan.getScannerHealth(),
      this.scanCountsForTickets(organizationId),
      this.scanCountsForEventServices(organizationId)
    ]);
    const totals = {
      total: ticketCounts.total + eventCounts.total,
      clean: ticketCounts.clean + eventCounts.clean,
      quarantined: ticketCounts.quarantined + eventCounts.quarantined,
      pending: ticketCounts.pending + eventCounts.pending,
      skipped: ticketCounts.skipped + eventCounts.skipped,
      restored: ticketCounts.restored + eventCounts.restored
    };

    const metadata = {
      endpoint: scanner.endpoint,
      enabled: scanner.enabled,
      failClosed: scanner.failClosed,
      reachable: scanner.reachable,
      version: scanner.version,
      counts: totals
    };

    if (!scanner.enabled) {
      return buildComponent("antivirus", "Antivirus scanner", "warning", "ClamAV is not enabled for attachment scanning.", metadata);
    }
    if (!scanner.reachable) {
      return buildComponent("antivirus", "Antivirus scanner", scanner.failClosed ? "error" : "warning", scanner.error ?? "ClamAV is not reachable.", metadata);
    }
    if (totals.quarantined > 0) {
      return buildComponent("antivirus", "Antivirus scanner", "warning", `${totals.quarantined} quarantined attachment${totals.quarantined === 1 ? "" : "s"} need review.`, metadata);
    }
    if (totals.pending > 0 || totals.skipped > 0) {
      return buildComponent("antivirus", "Antivirus scanner", "warning", `${totals.pending + totals.skipped} attachment${totals.pending + totals.skipped === 1 ? "" : "s"} are not fully scanned.`, metadata);
    }
    return buildComponent("antivirus", "Antivirus scanner", "ok", `${totals.clean} attachment${totals.clean === 1 ? "" : "s"} scanned clean.`, metadata);
  }

  private async scanCountsForTickets(organizationId: string) {
    const [total, clean, quarantined, pending, skipped, restored] = await Promise.all([
      this.prisma.ticketAttachment.count({ where: { ticket: { organizationId }, deletedAt: null } }),
      this.prisma.ticketAttachment.count({ where: { ticket: { organizationId }, deletedAt: null, scanStatus: AttachmentScanStatus.CLEAN, scanResult: AttachmentScanResult.PASSED } }),
      this.prisma.ticketAttachment.count({ where: { ticket: { organizationId }, deletedAt: null, scanStatus: { in: [AttachmentScanStatus.SUSPICIOUS, AttachmentScanStatus.BLOCKED] } } }),
      this.prisma.ticketAttachment.count({ where: { ticket: { organizationId }, deletedAt: null, scanStatus: AttachmentScanStatus.PENDING } }),
      this.prisma.ticketAttachment.count({ where: { ticket: { organizationId }, deletedAt: null, scanResult: AttachmentScanResult.SKIPPED } }),
      this.prisma.ticketAttachment.count({ where: { ticket: { organizationId }, deletedAt: null, scanOverriddenAt: { not: null } } })
    ]);
    return { total, clean, quarantined, pending, skipped, restored };
  }

  private async scanCountsForEventServices(organizationId: string) {
    const [total, clean, quarantined, pending, skipped, restored] = await Promise.all([
      this.prisma.eventServiceAttachment.count({ where: { request: { organizationId }, deletedAt: null } }),
      this.prisma.eventServiceAttachment.count({ where: { request: { organizationId }, deletedAt: null, scanStatus: AttachmentScanStatus.CLEAN, scanResult: AttachmentScanResult.PASSED } }),
      this.prisma.eventServiceAttachment.count({ where: { request: { organizationId }, deletedAt: null, scanStatus: { in: [AttachmentScanStatus.SUSPICIOUS, AttachmentScanStatus.BLOCKED] } } }),
      this.prisma.eventServiceAttachment.count({ where: { request: { organizationId }, deletedAt: null, scanStatus: AttachmentScanStatus.PENDING } }),
      this.prisma.eventServiceAttachment.count({ where: { request: { organizationId }, deletedAt: null, scanResult: AttachmentScanResult.SKIPPED } }),
      this.prisma.eventServiceAttachment.count({ where: { request: { organizationId }, deletedAt: null, scanOverriddenAt: { not: null } } })
    ]);
    return { total, clean, quarantined, pending, skipped, restored };
  }

  private async checkAuditLogs() {
    const recent = await this.prisma.auditLog.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
    });
    return buildComponent("audit_logs", "Audit logs", "ok", `${recent} audit event${recent === 1 ? "" : "s"} recorded in the last 24 hours.`);
  }
}
