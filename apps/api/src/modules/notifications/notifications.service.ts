import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthenticatedUser } from "../auth/auth.types";
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
  constructor(private readonly prisma: PrismaService) {}

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
    const preferences = await this.getOrCreatePreference(input.userId);
    if (!preferences.inAppEnabled || !preferences[input.eventType]) {
      return null;
    }

    return this.prisma.notification.create({
      data: {
        userId: input.userId,
        ticketId: input.ticketId ?? null,
        title: input.title,
        body: input.body ?? null,
        metadata: input.metadata ?? undefined
      }
    });
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

  private getOrCreatePreference(userId: string) {
    return this.prisma.userNotificationPreference.upsert({
      where: { userId },
      update: {},
      create: { userId }
    });
  }
}
