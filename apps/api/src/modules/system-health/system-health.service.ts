import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";
import { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

export type SystemHealthStatus = "ok" | "warning" | "error";
export type SystemHealthRange = "daily" | "weekly" | "monthly" | "yearly";

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

function componentStatus(status: SystemHealthStatus) {
  if (status === "error") return "red" as const;
  if (status === "warning") return "orange" as const;
  return "green" as const;
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
export class SystemHealthService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(user: AuthenticatedUser, record = false) {
    const database = await this.checkDatabase();
    if (database.status === "error") {
      return this.aggregate(user, [database], null, record);
    }

    const settings = await this.prisma.systemSetting.findUnique({
      where: { organizationId: user.organizationId }
    });

    const components = await Promise.all([
      this.checkStorage(),
      this.checkMail(user.organizationId),
      this.checkSupportPortal(user.organizationId, settings?.supportPortalEnabled ?? false),
      this.checkEventServices(user.organizationId),
      this.checkAi(user.organizationId, settings?.aiAssistantEnabled ?? false),
      this.checkAuditLogs()
    ]);

    return this.aggregate(user, [database, ...components], settings, record);
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

  private async aggregate(user: AuthenticatedUser, components: SystemHealthComponent[], settings: { defaultTimezone: string; dateFormat: string; timeFormat: string } | null, record: boolean) {
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
      organizationId: user.organizationId
    };
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

  private async checkAuditLogs() {
    const recent = await this.prisma.auditLog.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
    });
    return buildComponent("audit_logs", "Audit logs", "ok", `${recent} audit event${recent === 1 ? "" : "s"} recorded in the last 24 hours.`);
  }
}
