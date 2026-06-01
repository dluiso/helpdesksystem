import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthenticatedUser } from "../auth/auth.types";
import { MailDeliveryService } from "../mailboxes/mail-delivery.service";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateNotificationPreferencesDto } from "./dto/update-notification-preferences.dto";

export type NotificationEventType =
  | "ticketAssignedToMe"
  | "ticketAssignedToMyTeam"
  | "ticketReplyOnAssignedTicket"
  | "internalNoteOnAssignedTicket"
  | "internalNoteMention"
  | "routingRuleMatched"
  | "ticketReopened";

interface NotifyUserInput {
  userId: string;
  ticketId?: string | null;
  title: string;
  body?: string | null;
  eventType: NotificationEventType;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailDelivery: MailDeliveryService
  ) {}

  async list(user: AuthenticatedUser) {
    return this.prisma.notification.findMany({
      where: { userId: user.id },
      include: {
        ticket: { select: { id: true, ticketNumber: true, subject: true, status: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 50
    });
  }

  async notifyUser(input: NotifyUserInput) {
    const [preferences, targetUser] = await Promise.all([
      this.getOrCreatePreference(input.userId),
      this.prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true, organizationId: true, email: true, firstName: true, lastName: true, isActive: true, deletedAt: true }
      })
    ]);
    if (!targetUser || !targetUser.isActive || targetUser.deletedAt || !preferences[input.eventType]) {
      return null;
    }

    const notification = preferences.inAppEnabled
      ? await this.prisma.notification.create({
          data: {
            userId: input.userId,
            ticketId: input.ticketId ?? null,
            title: input.title,
            body: input.body ?? null,
            metadata: input.metadata ?? undefined
          }
        })
      : null;

    if (preferences.emailEnabled) {
      await this.sendEmailNotification({
        organizationId: targetUser.organizationId,
        email: targetUser.email,
        title: input.title,
        body: input.body
      });
    }

    return notification;
  }

  async markRead(notificationId: string, user: AuthenticatedUser) {
    const notification = await this.prisma.notification.findFirst({ where: { id: notificationId, userId: user.id } });
    if (!notification) {
      throw new NotFoundException("Notification was not found.");
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: "READ", readAt: new Date() }
    });
  }

  async markAllRead(user: AuthenticatedUser) {
    const result = await this.prisma.notification.updateMany({
      where: { userId: user.id, status: "UNREAD" },
      data: { status: "READ", readAt: new Date() }
    });
    return { updated: result.count };
  }

  preferences(user: AuthenticatedUser) {
    return this.getOrCreatePreference(user.id);
  }

  updatePreferences(user: AuthenticatedUser, input: UpdateNotificationPreferencesDto) {
    return this.prisma.userNotificationPreference.upsert({
      where: { userId: user.id },
      update: input,
      create: {
        userId: user.id,
        ...input
      }
    });
  }

  async listUserPreferences(user: AuthenticatedUser) {
    const users = await this.prisma.user.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        notificationPreference: true
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }]
    });

    return users.map((targetUser) => ({
      ...targetUser,
      notificationPreference: targetUser.notificationPreference ?? this.defaultPreference(targetUser.id)
    }));
  }

  async updateUserPreferences(targetUserId: string, user: AuthenticatedUser, input: UpdateNotificationPreferencesDto) {
    const targetUser = await this.prisma.user.findFirst({
      where: { id: targetUserId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true }
    });
    if (!targetUser) {
      throw new NotFoundException("User was not found.");
    }

    return this.prisma.userNotificationPreference.upsert({
      where: { userId: targetUserId },
      update: input,
      create: {
        userId: targetUserId,
        ...input
      }
    });
  }

  private getOrCreatePreference(userId: string) {
    return this.prisma.userNotificationPreference.upsert({
      where: { userId },
      update: {},
      create: { userId }
    });
  }

  private defaultPreference(userId: string) {
    return {
      id: "",
      userId,
      inAppEnabled: true,
      emailEnabled: false,
      ticketAssignedToMe: true,
      ticketAssignedToMyTeam: true,
      ticketReplyOnAssignedTicket: true,
      internalNoteOnAssignedTicket: true,
      internalNoteMention: true,
      routingRuleMatched: true,
      ticketReopened: true,
      dailyDigestEnabled: false,
      createdAt: null,
      updatedAt: null
    };
  }

  private async sendEmailNotification(input: { organizationId: string; email: string; title: string; body?: string | null }) {
    try {
      await this.mailDelivery.sendTicketReply({
        organizationId: input.organizationId,
        to: [input.email],
        subject: input.title,
        bodyText: input.body ?? input.title,
        bodyHtml: `<p>${this.escapeHtml(input.body ?? input.title).replace(/\n/g, "<br>")}</p>`
      });
    } catch {
      // Email notification failures must not block ticket workflows.
    }
  }

  private escapeHtml(value: string) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
}
