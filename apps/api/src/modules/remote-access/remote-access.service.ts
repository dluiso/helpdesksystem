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
      include: { device: true }
    });

    if (!profile) {
      throw new NotFoundException("Remote access profile was not found.");
    }

    await this.prisma.remoteAccessProfile.update({
      where: { id: profile.id },
      data: { lastConnectionAttemptAt: new Date() }
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
      connectionUrl: profile.connectionUrl,
      lastConnectionAttemptAt: profile.lastConnectionAttemptAt,
      deviceId
    };
  }
}
