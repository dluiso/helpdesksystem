import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DeviceStatus, DeviceType, Prisma, RemoteAccessProvider } from "@prisma/client";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { DeviceQueryDto } from "./dto/device-query.dto";
import { UpdateRmmSettingsDto } from "./dto/update-rmm-settings.dto";

type RmmAgentRecord = Record<string, unknown>;

interface NormalizedRmmAgent {
  remoteIdentifier: string;
  name: string;
  hostname: string | null;
  clientName: string;
  siteName: string | null;
  operatingSystem: string | null;
  osVersion: string | null;
  serialNumber: string | null;
  assetTag: string | null;
  primaryUser: string | null;
  status: DeviceStatus;
  type: DeviceType;
  lastSeenAt: Date | null;
  connectionUrl: string | null;
}

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auditLogs: AuditLogsService
  ) {}

  async list(user: AuthenticatedUser, query: DeviceQueryDto) {
    const where: Prisma.DeviceWhereInput = {
      deletedAt: null,
      client: { organizationId: user.organizationId }
    };
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { hostname: { contains: search, mode: "insensitive" } },
        { operatingSystem: { contains: search, mode: "insensitive" } },
        { primaryUser: { contains: search, mode: "insensitive" } },
        { remoteAccessId: { contains: search, mode: "insensitive" } },
        { client: { name: { contains: search, mode: "insensitive" } } }
      ];
    }
    if (query.clientId) {
      where.clientId = query.clientId;
    }
    if (this.isDeviceStatus(query.status)) {
      where.status = query.status;
    }

    const [devices, clients, settings] = await Promise.all([
      this.prisma.device.findMany({
        where,
        include: {
          client: { select: { id: true, name: true, shortName: true } },
          remoteAccessProfile: true
        },
        orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
        take: 500
      }),
      this.prisma.client.findMany({
        where: { organizationId: user.organizationId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      }),
      this.getSettingsRecord(user.organizationId)
    ]);

    return {
      devices,
      clients,
      remoteAccess: this.toRmmSettingsResponse(settings)
    };
  }

  async getRemoteAccessSettings(user: AuthenticatedUser) {
    const settings = await this.getSettingsRecord(user.organizationId);
    return this.toRmmSettingsResponse(settings);
  }

  async updateRemoteAccessSettings(user: AuthenticatedUser, input: UpdateRmmSettingsDto) {
    if (input.enabled && input.apiKeyReference && !input.apiKeyReference.trim().startsWith("env:")) {
      throw new BadRequestException("Use an environment variable reference such as env:TACTICAL_RMM_API_KEY.");
    }

    const settings = await this.prisma.systemSetting.update({
      where: { organizationId: user.organizationId },
      data: {
        remoteAccessProviderEnabled: input.enabled,
        remoteAccessProviderName: this.optionalTrim(input.providerName) ?? "Tactical RMM",
        remoteAccessApiBaseUrl: this.optionalTrim(input.apiBaseUrl),
        remoteAccessApiKeyReference: this.optionalTrim(input.apiKeyReference),
        remoteAccessAgentsPath: this.normalizePath(input.agentsPath) ?? "/agents/",
        remoteAccessDashboardUrl: this.optionalTrim(input.dashboardUrl),
        remoteAccessDeviceUrlTemplate: this.optionalTrim(input.deviceUrlTemplate)
      }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "SystemSetting",
      entityId: settings.id,
      action: "remote_access.settings_updated",
      metadata: {
        enabled: settings.remoteAccessProviderEnabled,
        providerName: settings.remoteAccessProviderName,
        apiBaseUrl: settings.remoteAccessApiBaseUrl,
        agentsPath: settings.remoteAccessAgentsPath,
        hasApiKeyReference: Boolean(settings.remoteAccessApiKeyReference)
      }
    });

    return this.toRmmSettingsResponse(settings);
  }

  async syncFromRemoteAccessProvider(user: AuthenticatedUser) {
    const settings = await this.getSettingsRecord(user.organizationId);
    if (!settings.remoteAccessProviderEnabled) {
      throw new BadRequestException("RMM integration is disabled.");
    }

    const apiBaseUrl = settings.remoteAccessApiBaseUrl?.trim();
    const apiKey = this.resolveSecret(settings.remoteAccessApiKeyReference);
    if (!apiBaseUrl || !apiKey) {
      throw new BadRequestException("RMM API base URL and env API key reference are required before syncing.");
    }

    try {
      const records = await this.fetchAgents(apiBaseUrl, settings.remoteAccessAgentsPath, apiKey);
      const agents = records
        .map((record) => this.normalizeAgent(record, settings.remoteAccessDeviceUrlTemplate, settings.remoteAccessDashboardUrl))
        .filter((agent): agent is NormalizedRmmAgent => Boolean(agent));

      let created = 0;
      let updated = 0;

      for (const agent of agents) {
        const client = await this.findOrCreateClient(user, agent.clientName);
        const existingDevice = await this.prisma.device.findFirst({
          where: {
            client: { organizationId: user.organizationId },
            remoteAccessProvider: RemoteAccessProvider.TACTICAL_RMM,
            remoteAccessId: agent.remoteIdentifier,
            deletedAt: null
          }
        });

        const data = {
          clientId: client.id,
          deviceGroupId: agent.siteName,
          name: agent.name,
          hostname: agent.hostname,
          type: agent.type,
          operatingSystem: agent.operatingSystem,
          osVersion: agent.osVersion,
          serialNumber: agent.serialNumber,
          assetTag: agent.assetTag,
          primaryUser: agent.primaryUser,
          remoteAccessProvider: RemoteAccessProvider.TACTICAL_RMM,
          remoteAccessId: agent.remoteIdentifier,
          lastSeenAt: agent.lastSeenAt,
          status: agent.status
        };

        const device = existingDevice
          ? await this.prisma.device.update({ where: { id: existingDevice.id }, data })
          : await this.prisma.device.create({ data });

        await this.prisma.remoteAccessProfile.upsert({
          where: { deviceId: device.id },
          update: {
            provider: RemoteAccessProvider.TACTICAL_RMM,
            remoteIdentifier: agent.remoteIdentifier,
            connectionUrl: agent.connectionUrl,
            notes: agent.siteName ? `Site: ${agent.siteName}` : null
          },
          create: {
            deviceId: device.id,
            provider: RemoteAccessProvider.TACTICAL_RMM,
            remoteIdentifier: agent.remoteIdentifier,
            connectionUrl: agent.connectionUrl,
            notes: agent.siteName ? `Site: ${agent.siteName}` : null
          }
        });

        if (existingDevice) updated += 1;
        else created += 1;
      }

      const message = `Synced ${agents.length} RMM device${agents.length === 1 ? "" : "s"} (${created} created, ${updated} updated).`;
      const updatedSettings = await this.prisma.systemSetting.update({
        where: { organizationId: user.organizationId },
        data: {
          remoteAccessLastSyncAt: new Date(),
          remoteAccessLastSyncStatus: "success",
          remoteAccessLastSyncMessage: message
        }
      });

      await this.auditLogs.create({
        userId: user.id,
        entityType: "Device",
        action: "remote_access.devices_synced",
        metadata: { provider: "TACTICAL_RMM", total: agents.length, created, updated }
      });

      return { created, updated, total: agents.length, settings: this.toRmmSettingsResponse(updatedSettings) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown RMM sync failure.";
      await this.prisma.systemSetting.update({
        where: { organizationId: user.organizationId },
        data: {
          remoteAccessLastSyncAt: new Date(),
          remoteAccessLastSyncStatus: "error",
          remoteAccessLastSyncMessage: message.slice(0, 500)
        }
      });
      throw new BadRequestException(`RMM sync failed: ${message}`);
    }
  }

  private async fetchAgents(apiBaseUrl: string, agentsPath: string, apiKey: string) {
    const url = this.joinUrl(apiBaseUrl, agentsPath);
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-API-KEY": apiKey,
        Authorization: `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tactical RMM returned ${response.status}: ${text.slice(0, 300)}`);
    }

    const payload = (await response.json()) as unknown;
    return this.extractAgentRecords(payload);
  }

  private extractAgentRecords(payload: unknown): RmmAgentRecord[] {
    if (Array.isArray(payload)) return payload.filter(this.isRecord);
    if (!this.isRecord(payload)) return [];
    for (const key of ["results", "data", "agents", "devices"]) {
      const value = payload[key];
      if (Array.isArray(value)) return value.filter(this.isRecord);
    }
    return [];
  }

  private normalizeAgent(record: RmmAgentRecord, urlTemplate?: string | null, dashboardUrl?: string | null): NormalizedRmmAgent | null {
    const remoteIdentifier = this.pickString(record, ["id", "agent_id", "agentId", "pk", "guid", "mesh_node_id", "meshNodeId"]);
    const hostname = this.pickString(record, ["hostname", "computer_name", "computerName", "host", "description"]);
    const name = this.pickString(record, ["name", "hostname", "computer_name", "computerName", "description"]) ?? remoteIdentifier;
    if (!remoteIdentifier || !name) return null;

    const siteRecord = this.pickRecord(record, ["site"]);
    const clientRecord = this.pickRecord(record, ["client"]);
    const clientName =
      this.pickString(record, ["client_name", "clientName", "customer_name", "customerName"]) ??
      this.pickString(clientRecord ?? {}, ["name", "client_name"]) ??
      this.pickString(siteRecord ?? {}, ["client_name", "customer_name"]) ??
      "Unmapped RMM Devices";
    const siteName =
      this.pickString(record, ["site_name", "siteName", "location"]) ??
      this.pickString(siteRecord ?? {}, ["name", "site_name"]);
    const operatingSystem = this.pickString(record, ["operating_system", "operatingSystem", "os", "platform", "plat"]);
    const osVersion = this.pickString(record, ["os_version", "osVersion", "version", "build"]);
    const statusSource = this.pickString(record, ["status", "agent_status", "monitoring_status"]) ?? "";
    const online = this.pickBoolean(record, ["online", "is_online", "isOnline"]);
    const status = online === true || /online|active|ok/i.test(statusSource) ? DeviceStatus.ACTIVE : DeviceStatus.INACTIVE;
    const lastSeenAt = this.pickDate(record, ["last_seen", "lastSeen", "last_checkin", "lastCheckin", "updated_at", "updatedAt"]);
    const serialNumber = this.pickString(record, ["serial_number", "serialNumber", "serial"]);
    const assetTag = this.pickString(record, ["asset_tag", "assetTag", "asset"]);
    const primaryUser = this.pickString(record, ["logged_in_user", "loggedInUser", "primary_user", "primaryUser", "last_user"]);
    const connectionUrl = this.buildConnectionUrl(urlTemplate, dashboardUrl, {
      agentId: remoteIdentifier,
      deviceId: remoteIdentifier,
      hostname: hostname ?? name,
      clientName,
      siteName: siteName ?? "",
      meshNodeId: this.pickString(record, ["mesh_node_id", "meshNodeId"]) ?? remoteIdentifier
    });

    return {
      remoteIdentifier,
      name,
      hostname,
      clientName,
      siteName,
      operatingSystem,
      osVersion,
      serialNumber,
      assetTag,
      primaryUser,
      status,
      type: this.inferDeviceType(name, operatingSystem),
      lastSeenAt,
      connectionUrl
    };
  }

  private async findOrCreateClient(user: AuthenticatedUser, clientName: string) {
    const normalizedName = clientName.trim() || "Unmapped RMM Devices";
    const existing = await this.prisma.client.findFirst({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        name: { equals: normalizedName, mode: "insensitive" }
      }
    });
    if (existing) return existing;

    const created = await this.prisma.client.create({
      data: {
        organizationId: user.organizationId,
        name: normalizedName,
        shortName: normalizedName.slice(0, 24),
        notes: "Created from Tactical RMM sync."
      }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "Client",
      entityId: created.id,
      action: "remote_access.client_created_from_sync",
      metadata: { source: "TACTICAL_RMM", name: normalizedName }
    });

    return created;
  }

  private async getSettingsRecord(organizationId: string) {
    const settings = await this.prisma.systemSetting.findUnique({ where: { organizationId } });
    if (!settings) {
      throw new BadRequestException("System settings are not configured.");
    }
    return settings;
  }

  private toRmmSettingsResponse(settings: {
    remoteAccessProviderEnabled: boolean;
    remoteAccessProviderName: string;
    remoteAccessApiBaseUrl: string | null;
    remoteAccessApiKeyReference: string | null;
    remoteAccessAgentsPath: string;
    remoteAccessDashboardUrl: string | null;
    remoteAccessDeviceUrlTemplate: string | null;
    remoteAccessLastSyncAt: Date | null;
    remoteAccessLastSyncStatus: string | null;
    remoteAccessLastSyncMessage: string | null;
  }) {
    return {
      enabled: settings.remoteAccessProviderEnabled,
      providerName: settings.remoteAccessProviderName,
      apiBaseUrl: settings.remoteAccessApiBaseUrl,
      apiKeyReference: settings.remoteAccessApiKeyReference,
      hasResolvedApiKey: Boolean(this.resolveSecret(settings.remoteAccessApiKeyReference)),
      agentsPath: settings.remoteAccessAgentsPath,
      dashboardUrl: settings.remoteAccessDashboardUrl,
      deviceUrlTemplate: settings.remoteAccessDeviceUrlTemplate,
      lastSyncAt: settings.remoteAccessLastSyncAt,
      lastSyncStatus: settings.remoteAccessLastSyncStatus,
      lastSyncMessage: settings.remoteAccessLastSyncMessage
    };
  }

  private resolveSecret(reference?: string | null) {
    const trimmed = reference?.trim();
    if (!trimmed) return "";
    if (!trimmed.startsWith("env:")) return "";
    return this.config.get<string>(trimmed.slice(4)) ?? "";
  }

  private buildConnectionUrl(template: string | null | undefined, dashboardUrl: string | null | undefined, tokens: Record<string, string>) {
    const source = template?.trim() || dashboardUrl?.trim();
    if (!source) return null;
    return Object.entries(tokens).reduce((url, [key, value]) => url.replaceAll(`{${key}}`, encodeURIComponent(value)), source);
  }

  private joinUrl(baseUrl: string, path: string) {
    return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  }

  private normalizePath(value?: string | null) {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }

  private optionalTrim(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private pickString(record: RmmAgentRecord, keys: string[]) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }
    return null;
  }

  private pickBoolean(record: RmmAgentRecord, keys: string[]) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "boolean") return value;
    }
    return null;
  }

  private pickDate(record: RmmAgentRecord, keys: string[]) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" || typeof value === "number") {
        const date = new Date(value);
        if (!Number.isNaN(date.valueOf())) return date;
      }
    }
    return null;
  }

  private pickRecord(record: RmmAgentRecord, keys: string[]) {
    for (const key of keys) {
      const value = record[key];
      if (this.isRecord(value)) return value;
    }
    return null;
  }

  private inferDeviceType(name: string, operatingSystem: string | null) {
    const source = `${name} ${operatingSystem ?? ""}`.toLowerCase();
    if (source.includes("server")) return DeviceType.SERVER;
    if (source.includes("laptop") || source.includes("notebook")) return DeviceType.LAPTOP;
    if (source.includes("windows") || source.includes("mac") || source.includes("linux")) return DeviceType.DESKTOP;
    return DeviceType.OTHER;
  }

  private isDeviceStatus(value?: string): value is DeviceStatus {
    return Boolean(value && Object.values(DeviceStatus).includes(value as DeviceStatus));
  }

  private isRecord(value: unknown): value is RmmAgentRecord {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }
}
