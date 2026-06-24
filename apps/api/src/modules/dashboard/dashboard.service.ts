import { Injectable } from "@nestjs/common";
import { DeviceStatus, DeviceType, Prisma } from "@prisma/client";
import { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateDashboardPreferencesDto } from "./dto/update-dashboard-preferences.dto";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async preferences(user: AuthenticatedUser) {
    const preference = await this.prisma.userDashboardPreference.findUnique({
      where: { userId: user.id }
    });

    return {
      layout: this.normalizeLayout(preference?.layout ?? []),
      hiddenWidgets: preference?.hiddenWidgets ?? []
    };
  }

  async updatePreferences(user: AuthenticatedUser, input: UpdateDashboardPreferencesDto) {
    const preference = await this.prisma.userDashboardPreference.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        layout: input.layout,
        hiddenWidgets: input.hiddenWidgets ?? []
      },
      update: {
        layout: input.layout,
        hiddenWidgets: input.hiddenWidgets ?? []
      }
    });

    return {
      layout: this.normalizeLayout(preference.layout),
      hiddenWidgets: preference.hiddenWidgets
    };
  }

  async deviceStatistics(user: AuthenticatedUser) {
    const devices = await this.prisma.device.findMany({
      where: {
        deletedAt: null,
        client: { organizationId: user.organizationId }
      },
      select: {
        clientId: true,
        operatingSystem: true,
        status: true,
        type: true,
        client: { select: { id: true, name: true } }
      }
    });

    const byClient = new Map<
      string,
      {
        clientId: string;
        name: string;
        total: number;
        active: number;
        inactive: number;
        servers: number;
        workstations: number;
      }
    >();
    const byOperatingSystem = new Map<string, number>();
    const byType = new Map<DeviceType, { type: DeviceType; total: number; active: number; inactive: number }>();

    let active = 0;
    let inactive = 0;
    let retired = 0;
    let servers = 0;
    let workstations = 0;

    for (const device of devices) {
      if (device.status === DeviceStatus.ACTIVE) active += 1;
      if (device.status === DeviceStatus.INACTIVE) inactive += 1;
      if (device.status === DeviceStatus.RETIRED) retired += 1;
      if (device.type === DeviceType.SERVER) servers += 1;
      if (device.type === DeviceType.DESKTOP || device.type === DeviceType.LAPTOP) workstations += 1;

      const client = byClient.get(device.clientId) ?? {
        clientId: device.client.id,
        name: device.client.name,
        total: 0,
        active: 0,
        inactive: 0,
        servers: 0,
        workstations: 0
      };
      client.total += 1;
      if (device.status === DeviceStatus.ACTIVE) client.active += 1;
      if (device.status === DeviceStatus.INACTIVE) client.inactive += 1;
      if (device.type === DeviceType.SERVER) client.servers += 1;
      if (device.type === DeviceType.DESKTOP || device.type === DeviceType.LAPTOP) client.workstations += 1;
      byClient.set(device.clientId, client);

      const osName = this.normalizeOperatingSystem(device.operatingSystem);
      byOperatingSystem.set(osName, (byOperatingSystem.get(osName) ?? 0) + 1);

      const typeSummary = byType.get(device.type) ?? { type: device.type, total: 0, active: 0, inactive: 0 };
      typeSummary.total += 1;
      if (device.status === DeviceStatus.ACTIVE) typeSummary.active += 1;
      if (device.status === DeviceStatus.INACTIVE) typeSummary.inactive += 1;
      byType.set(device.type, typeSummary);
    }

    return {
      summary: {
        total: devices.length,
        active,
        inactive,
        retired,
        servers,
        workstations,
        otherTypes: Math.max(0, devices.length - servers - workstations)
      },
      byClient: Array.from(byClient.values())
        .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name))
        .slice(0, 8),
      byOperatingSystem: Array.from(byOperatingSystem.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
        .slice(0, 8),
      byType: Array.from(byType.values()).sort((left, right) => right.total - left.total || left.type.localeCompare(right.type))
    };
  }

  private normalizeLayout(value: Prisma.JsonValue): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  }

  private normalizeOperatingSystem(value: string | null) {
    const source = value?.trim();
    if (!source) return "Unknown OS";

    const lower = source.toLowerCase();
    if (lower.includes("windows server")) return "Windows Server";
    if (lower.includes("windows")) return "Windows Workstation";
    if (lower.includes("macos") || lower.includes("mac os") || lower.includes("darwin")) return "macOS";
    if (lower.includes("ubuntu")) return "Ubuntu";
    if (lower.includes("debian")) return "Debian";
    if (lower.includes("centos") || lower.includes("red hat") || lower.includes("rhel")) return "Red Hat / CentOS";
    if (lower.includes("linux")) return "Linux";
    if (lower.includes("ios")) return "iOS";
    if (lower.includes("android")) return "Android";

    return source.length > 48 ? `${source.slice(0, 45)}...` : source;
  }
}
