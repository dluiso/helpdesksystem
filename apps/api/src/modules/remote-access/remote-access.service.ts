import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class RemoteAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService
  ) {}

  async auditConnectionAttempt(deviceId: string, user: AuthenticatedUser) {
    const profile = await this.prisma.remoteAccessProfile.findUnique({
      where: { deviceId },
      include: { device: { include: { client: true } } }
    });

    if (!profile) {
      throw new NotFoundException("Remote access profile was not found.");
    }
    if (profile.device.client.organizationId !== user.organizationId) {
      throw new NotFoundException("Remote access profile was not found.");
    }

    const settings = await this.prisma.systemSetting.findUnique({ where: { organizationId: user.organizationId } });
    const attemptedAt = new Date();
    const connectionUrl =
      this.buildConnectionUrl(settings?.remoteAccessControlUrlTemplate, {
        agentId: profile.remoteIdentifier,
        deviceId: profile.remoteIdentifier,
        hostname: profile.device.hostname ?? profile.device.name,
        clientName: profile.device.client.name,
        siteName: profile.device.deviceGroupId ?? "",
        meshNodeId: profile.remoteIdentifier
      }) ?? profile.connectionUrl;

    await this.prisma.remoteAccessProfile.update({
      where: { id: profile.id },
      data: { lastConnectionAttemptAt: attemptedAt }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "RemoteAccessProfile",
      entityId: profile.id,
      action: "remote_access.connection_attempted",
      metadata: {
        deviceId,
        provider: profile.provider,
        remoteIdentifier: profile.remoteIdentifier
      }
    });

    return {
      id: profile.id,
      provider: profile.provider,
      remoteIdentifier: profile.remoteIdentifier,
      connectionUrl,
      lastConnectionAttemptAt: attemptedAt,
      deviceId
    };
  }

  private buildConnectionUrl(template: string | null | undefined, tokens: Record<string, string>) {
    const source = template?.trim();
    if (!source) return null;
    return Object.entries(tokens).reduce((url, [key, value]) => url.replaceAll(`{${key}}`, encodeURIComponent(value)), source);
  }
}
