import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { MessageDirection, MessageVisibility, Prisma, TicketPriority, TicketSource, TicketStatus } from "@prisma/client";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { ContactsService } from "../contacts/contacts.service";
import { MailDeliveryService } from "../mailboxes/mail-delivery.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { AutoRepliesService } from "../auto-replies/auto-replies.service";
import { TicketRoutingService } from "../ticket-routing/ticket-routing.service";
import { HtmlSanitizerService } from "../../common/html/html-sanitizer.service";
import { BulkUpdateTicketsDto } from "./dto/bulk-update-tickets.dto";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { CreateTicketMessageDto } from "./dto/create-ticket-message.dto";
import { ListTicketsQueryDto } from "./dto/list-tickets-query.dto";
import { UpdateTicketAssignmentDto } from "./dto/update-ticket-assignment.dto";

export interface CreateInboundEmailTicketInput {
  organizationId: string;
  mailboxId?: string | null;
  senderEmail: string;
  senderName?: string | null;
  subject: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  emailMessageId?: string | null;
  emailInternetMessageId?: string | null;
  emailConversationId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  hasAttachments?: boolean;
  internetMessageHeaders?: Record<string, string>;
}

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly htmlSanitizer: HtmlSanitizerService,
    private readonly contactsService: ContactsService,
    private readonly ticketRouting: TicketRoutingService,
    private readonly mailDelivery: MailDeliveryService,
    private readonly notifications: NotificationsService,
    private readonly autoReplies: AutoRepliesService
  ) {}

  async list(user: AuthenticatedUser, query: ListTicketsQueryDto = {}) {
    const where = this.buildTicketListWhere(user, query);
    const sortBy = query.sortBy ?? "updatedAt";
    const sortDirection = query.sortDirection ?? "desc";
    const page = this.parsePage(query.page);
    const pageSize = query.pageSize ?? "20";
    const take = pageSize === "all" ? undefined : Number(pageSize);
    const skip = take ? (page - 1) * take : undefined;
    const [items, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: {
          client: true,
          contact: true,
          assignedUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          assignees: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            },
            orderBy: { createdAt: "asc" }
          },
          firstReadBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          assignedGroup: true,
          assignedTeam: true,
          _count: {
            select: {
              messages: true,
              attachments: true
            }
          }
        },
        orderBy: { [sortBy]: sortDirection },
        ...(take ? { take, skip } : {})
      }),
      this.prisma.ticket.count({ where })
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: take ? Math.max(1, Math.ceil(total / take)) : 1
    };
  }

  async getById(ticketId: string, user: AuthenticatedUser) {
    let ticket = await this.prisma.ticket.findFirst({
      where: {
        id: ticketId,
        organizationId: user.organizationId,
        deletedAt: null
      },
      include: {
        client: true,
        contact: true,
        assignedUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        assignedGroup: true,
        assignedTeam: true,
        assignees: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } }
          },
          orderBy: { createdAt: "asc" }
        },
        firstReadBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        watchers: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } }
          }
        },
        messages: {
          include: {
            attachments: true,
            authorUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            },
            authorContact: true
          },
          orderBy: { createdAt: "asc" }
        },
        attachments: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!ticket) {
      throw new NotFoundException("Ticket was not found.");
    }

    if (!ticket.firstReadAt) {
      ticket = await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          firstReadAt: new Date(),
          firstReadByUserId: user.id,
          updatedAt: ticket.updatedAt
        },
        include: {
          client: true,
          contact: true,
          assignedUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          assignedGroup: true,
          assignedTeam: true,
          assignees: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true, email: true } }
            },
            orderBy: { createdAt: "asc" }
          },
          firstReadBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          watchers: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true, email: true } }
            }
          },
          messages: {
            include: {
              attachments: true,
              authorUser: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              },
              authorContact: true
            },
            orderBy: { createdAt: "asc" }
          },
          attachments: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" }
          }
        }
      });
    }

    return ticket;
  }

  async create(input: CreateTicketDto, user: AuthenticatedUser) {
    const ticket = await this.prisma.$transaction(async (tx) => {
      const ticketNumber = await this.nextTicketNumber(tx);

      return tx.ticket.create({
        data: {
          ticketNumber,
          organizationId: user.organizationId,
          clientId: input.clientId ?? null,
          contactId: input.contactId ?? null,
          subject: input.subject,
          description: input.description ?? null,
          priority: input.priority ?? TicketPriority.NORMAL,
          source: input.source ?? TicketSource.MANUAL,
          status: "NEW"
        }
      });
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "Ticket",
      entityId: ticket.id,
      action: "ticket.created",
      metadata: { ticketNumber: ticket.ticketNumber }
    });

    return ticket;
  }

  async createFromInboundEmail(input: CreateInboundEmailTicketInput) {
    const senderEmail = input.senderEmail.trim().toLowerCase();
    const senderDomain = this.extractDomain(senderEmail);
    const requester = await this.contactsService.resolveRequesterFromEmail({
      emailAddress: input.senderEmail,
      displayName: input.senderName,
      organizationId: input.organizationId
    });
    const bodyText = input.bodyText?.trim() || "Inbound email did not include a plain text body.";
    const sanitizedBodyHtml = input.bodyHtml ? this.htmlSanitizer.sanitize(input.bodyHtml) : null;
    const existingTicket = await this.findExistingTicketForInbound(input);

    if (existingTicket) {
      const shouldReopen = this.shouldReopenFromInbound(existingTicket.status);
      const shouldMarkOpen = !shouldReopen && (await this.shouldMarkExistingTicketOpenFromInbound(existingTicket.id, existingTicket.status));
      const result = await this.prisma.$transaction(async (tx) => {
        const ticket = await tx.ticket.update({
          where: { id: existingTicket.id },
          data: {
            ...(existingTicket.clientId ? {} : { clientId: requester?.client.id ?? null }),
            ...(existingTicket.contactId ? {} : { contactId: requester?.contact?.id ?? null }),
            lastCustomerResponseAt: new Date(),
            ...(shouldReopen
              ? {
                  status: TicketStatus.REOPENED,
                  reopenedAt: new Date(),
                  resolvedAt: null,
                  closedAt: null
                }
              : {}),
            ...(shouldMarkOpen ? { status: TicketStatus.OPEN } : {})
          }
        });

        const message = await tx.ticketMessage.create({
          data: {
            ticketId: ticket.id,
            authorContactId: requester?.contact?.id ?? null,
            direction: MessageDirection.INBOUND,
            visibility: MessageVisibility.PUBLIC,
            bodyText,
            bodyHtml: input.bodyHtml ?? null,
            sanitizedBodyHtml,
            senderEmail,
            senderDomain,
            emailMessageId: input.emailMessageId ?? null,
            emailInternetMessageId: input.emailInternetMessageId ?? null,
            emailConversationId: input.emailConversationId ?? null,
            inReplyTo: input.inReplyTo ?? null,
            emailReferences: input.references ?? null,
            hasAttachments: input.hasAttachments ?? false
          }
        });

        return { ticket, message };
      });

      await this.recordUnknownSenderDomain(input.organizationId, senderDomain, senderEmail, requester);
      await this.auditLogs.create({
        userId: null,
        entityType: "Ticket",
        entityId: result.ticket.id,
        action: shouldReopen ? "ticket.reopened_from_customer_reply" : "ticket.customer_reply_received",
        metadata: {
          ticketNumber: result.ticket.ticketNumber,
          senderEmail: input.senderEmail,
          emailMessageId: input.emailMessageId ?? null,
          emailInternetMessageId: input.emailInternetMessageId ?? null,
          emailConversationId: input.emailConversationId ?? null
        }
      });

      return result;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const ticketNumber = await this.nextTicketNumber(tx);
      const ticket = await tx.ticket.create({
        data: {
          ticketNumber,
          organizationId: input.organizationId,
          mailboxId: input.mailboxId ?? null,
          clientId: requester?.client.id ?? null,
          contactId: requester?.contact?.id ?? null,
          senderEmail,
          senderDomain,
          subject: input.subject.trim(),
          description: bodyText,
          priority: TicketPriority.NORMAL,
          source: TicketSource.EMAIL,
          status: "NEW",
          lastCustomerResponseAt: new Date()
        }
      });

      const message = await tx.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          authorContactId: requester?.contact?.id ?? null,
          direction: MessageDirection.INBOUND,
          visibility: MessageVisibility.PUBLIC,
          bodyText,
          bodyHtml: input.bodyHtml ?? null,
          sanitizedBodyHtml,
          senderEmail,
          senderDomain,
          emailMessageId: input.emailMessageId ?? null,
          emailInternetMessageId: input.emailInternetMessageId ?? null,
          emailConversationId: input.emailConversationId ?? null,
          inReplyTo: input.inReplyTo ?? null,
          emailReferences: input.references ?? null,
          hasAttachments: input.hasAttachments ?? false
        }
      });

      return { ticket, message };
    });

    const matchedRule = await this.ticketRouting.applyInboundRules({
      ticketId: result.ticket.id,
      organizationId: input.organizationId,
      mailboxId: input.mailboxId ?? null,
      clientId: requester?.client.id ?? null,
      senderEmail,
      senderDomain,
      subject: result.ticket.subject,
      bodyText
    });

    await this.recordUnknownSenderDomain(input.organizationId, senderDomain, senderEmail, requester);

    await this.auditLogs.create({
      userId: null,
      entityType: "Ticket",
      entityId: result.ticket.id,
      action: "ticket.created_from_inbound_email",
      metadata: {
        ticketNumber: result.ticket.ticketNumber,
        senderEmail: input.senderEmail,
        clientId: result.ticket.clientId,
        contactId: result.ticket.contactId,
        routingRuleId: matchedRule?.id ?? null
      }
    });

    await this.autoReplies.sendForNewInboundTicket({
      organizationId: input.organizationId,
      ticketId: result.ticket.id,
      messageId: result.message.id,
      senderEmail,
      mailboxId: input.mailboxId ?? null,
      autoSubmittedHeader: input.internetMessageHeaders?.["auto-submitted"] ?? null,
      threadKey: input.emailConversationId ?? input.emailInternetMessageId ?? input.emailMessageId ?? result.ticket.ticketNumber,
      inReplyTo: input.emailInternetMessageId ?? input.emailMessageId ?? null,
      references: input.references ?? input.emailInternetMessageId ?? null,
      replyToProviderMessageId: input.emailMessageId ?? null
    });

    return result;
  }

  async updateAssignment(ticketId: string, input: UpdateTicketAssignmentDto, user: AuthenticatedUser) {
    await this.ensureTicketExists(ticketId, user);
    const assignedUserIds = this.normalizeAssignedUserIds(input.assignedUserIds ?? (input.assignedUserId ? [input.assignedUserId] : []));
    const primaryAssignedUserId = assignedUserIds[0] ?? input.assignedUserId ?? null;
    await this.validateAssignmentTargets(assignedUserIds, input.assignedTeamId, user.organizationId);
    const ticket = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        assignedUserId: primaryAssignedUserId,
        assignedGroupId: input.assignedTeamId ? null : input.assignedGroupId,
        assignedTeamId: input.assignedTeamId,
        priority: input.priority,
        status: input.status
      }
    });
    await this.syncTicketAssignees(ticketId, assignedUserIds, user.id);

    await Promise.all(
      assignedUserIds.map((assignedUserId) =>
        this.addWatcherAndNotify(ticketId, assignedUserId, user.id, "Manual assignment", `Ticket assigned: ${ticket.ticketNumber}`, "ticketAssignedToMe")
      )
    );
    if (input.assignedGroupId) {
      await this.notifyGroupMembers(ticketId, input.assignedGroupId, user.id, "Manual group assignment", `Ticket assigned to your group: ${ticket.ticketNumber}`);
    }
    if (input.assignedTeamId) {
      await this.notifyTeamMembers(ticketId, input.assignedTeamId, user.id, "Manual team assignment", `Ticket assigned to your team: ${ticket.ticketNumber}`);
    }

    await this.auditLogs.create({
      userId: user.id,
      entityType: "Ticket",
      entityId: ticketId,
      action: "ticket.assignment_updated",
      metadata: {
        assignedUserId: primaryAssignedUserId,
        assignedUserIds,
        assignedGroupId: input.assignedGroupId ?? null,
        assignedTeamId: input.assignedTeamId ?? null,
        priority: input.priority ?? null,
        status: input.status ?? null
      }
    });

    return ticket;
  }

  async bulkUpdate(input: BulkUpdateTicketsDto, user: AuthenticatedUser) {
    const ticketIds = [...new Set(input.ticketIds)];
    if (ticketIds.length === 0) {
      return { updated: 0 };
    }

    const existingTickets = await this.prisma.ticket.findMany({
      where: { id: { in: ticketIds }, organizationId: user.organizationId, deletedAt: null },
      select: { id: true, ticketNumber: true }
    });
    const existingIds = existingTickets.map((ticket) => ticket.id);
    const assignedUserIds = this.normalizeAssignedUserIds(input.assignedUserIds ?? (input.assignedUserId ? [input.assignedUserId] : []));
    const primaryAssignedUserId = assignedUserIds[0] ?? input.assignedUserId ?? undefined;
    await this.validateAssignmentTargets(assignedUserIds, input.assignedTeamId, user.organizationId);

    await this.prisma.ticket.updateMany({
      where: { id: { in: existingIds }, organizationId: user.organizationId, deletedAt: null },
      data: {
        priority: input.priority,
        status: input.status,
        assignedUserId: primaryAssignedUserId,
        assignedGroupId: input.assignedTeamId ? null : input.assignedGroupId,
        assignedTeamId: input.assignedTeamId,
        ...(input.status === "CLOSED" ? { closedAt: new Date() } : {}),
        ...(input.status === "REOPENED" || input.status === "OPEN" ? { reopenedAt: new Date(), closedAt: null } : {})
      }
    });

    await Promise.all(
      existingTickets.map(async (ticket) => {
        if (input.assignedUserIds !== undefined || input.assignedUserId !== undefined) {
          await this.syncTicketAssignees(ticket.id, assignedUserIds, user.id);
        }
        await Promise.all(
          assignedUserIds.map((assignedUserId) =>
            this.addWatcherAndNotify(ticket.id, assignedUserId, user.id, "Bulk assignment", `Ticket assigned: ${ticket.ticketNumber}`, "ticketAssignedToMe")
          )
        );
        if (input.assignedGroupId) {
          await this.notifyGroupMembers(ticket.id, input.assignedGroupId, user.id, "Bulk group assignment", `Ticket assigned to your group: ${ticket.ticketNumber}`);
        }
        if (input.assignedTeamId) {
          await this.notifyTeamMembers(ticket.id, input.assignedTeamId, user.id, "Bulk team assignment", `Ticket assigned to your team: ${ticket.ticketNumber}`);
        }
      })
    );

    await this.auditLogs.create({
      userId: user.id,
      entityType: "Ticket",
      entityId: null,
      action: "ticket.bulk_updated",
      metadata: {
        ticketIds: existingIds,
        status: input.status ?? null,
        priority: input.priority ?? null,
        assignedUserId: primaryAssignedUserId ?? null,
        assignedUserIds,
        assignedGroupId: input.assignedGroupId ?? null,
        assignedTeamId: input.assignedTeamId ?? null
      }
    });

    return { updated: existingIds.length };
  }

  async bulkSoftDelete(ticketIds: string[], user: AuthenticatedUser) {
    const ids = [...new Set(ticketIds)];
    if (ids.length === 0) {
      return { deleted: 0 };
    }

    const result = await this.prisma.ticket.updateMany({
      where: { id: { in: ids }, organizationId: user.organizationId, deletedAt: null },
      data: { deletedAt: new Date() }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "Ticket",
      entityId: null,
      action: "ticket.bulk_deleted",
      metadata: { ticketIds: ids, deleted: result.count }
    });

    return { deleted: result.count };
  }

  async bulkRestore(ticketIds: string[], user: AuthenticatedUser) {
    const ids = [...new Set(ticketIds)];
    if (ids.length === 0) {
      return { restored: 0 };
    }

    const result = await this.prisma.ticket.updateMany({
      where: { id: { in: ids }, organizationId: user.organizationId, deletedAt: { not: null } },
      data: { deletedAt: null }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "Ticket",
      entityId: null,
      action: "ticket.bulk_restored",
      metadata: { ticketIds: ids, restored: result.count }
    });

    return { restored: result.count };
  }

  async updateWatchers(ticketId: string, userIds: string[], user: AuthenticatedUser) {
    await this.ensureTicketExists(ticketId, user);
    const existing = await this.prisma.ticketWatcher.findMany({
      where: { ticketId },
      select: { userId: true }
    });
    const existingIds = new Set(existing.map((watcher) => watcher.userId));
    const requestedIds = new Set(userIds);

    await Promise.all(
      [...requestedIds]
        .filter((userId) => !existingIds.has(userId))
        .map((userId) => this.addWatcherAndNotify(ticketId, userId, user.id, "Manual watcher", "You were added as a ticket watcher.", "internalNoteMention"))
    );
    await this.prisma.ticketWatcher.deleteMany({
      where: {
        ticketId,
        userId: { in: [...existingIds].filter((userId) => !requestedIds.has(userId)) }
      }
    });

    return this.getById(ticketId, user);
  }

  async closeTicket(ticketId: string, user: AuthenticatedUser) {
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        id: ticketId,
        organizationId: user.organizationId,
        deletedAt: null
      },
      select: {
        id: true,
        status: true
      }
    });

    if (!ticket) {
      throw new NotFoundException("Ticket was not found.");
    }

    if (ticket.status !== TicketStatus.CLOSED) {
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: {
          status: TicketStatus.CLOSED,
          closedAt: new Date(),
          updatedAt: new Date()
        }
      });

      await this.auditLogs.create({
        userId: user.id,
        entityType: "Ticket",
        entityId: ticketId,
        action: "ticket.closed",
        metadata: { source: "reply_composer_action" }
      });
    }

    return this.getById(ticketId, user);
  }

  async createMessage(ticketId: string, input: CreateTicketMessageDto, user: AuthenticatedUser) {
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        id: ticketId,
        organizationId: user.organizationId,
        deletedAt: null
      }
    });

    if (!ticket) {
      throw new NotFoundException("Ticket was not found.");
    }

    const isInternal = input.visibility === "internal";
    const action = input.action ?? (isInternal ? "save_note" : "send");
    const sanitizedBodyHtml = input.bodyHtml ? this.htmlSanitizer.sanitize(input.bodyHtml) : null;
    const ccEmails = isInternal ? [] : await this.resolveCcEmails(input.ccEmails ?? [], input.ccUserIds ?? [], user.organizationId);
    const notifiedUserIds = [...new Set(input.notifyUserIds ?? [])];
    const latestInboundMessage = isInternal
      ? null
      : await this.prisma.ticketMessage.findFirst({
          where: {
            ticketId,
            direction: MessageDirection.INBOUND,
            visibility: MessageVisibility.PUBLIC,
            senderEmail: { not: null }
          },
          orderBy: { createdAt: "desc" }
        });
    let sendResult = null;
    if (!isInternal && latestInboundMessage?.senderEmail && (action === "send" || action === "send_and_close")) {
      sendResult = await this.mailDelivery.sendTicketReply({
        organizationId: user.organizationId,
        mailboxId: ticket.mailboxId,
        to: [latestInboundMessage.senderEmail],
        cc: ccEmails,
        subject: ticket.subject.startsWith("Re:") ? ticket.subject : `Re: ${ticket.subject}`,
        bodyHtml: sanitizedBodyHtml ?? `<p>${this.escapeHtml(input.bodyText).replace(/\n/g, "<br>")}</p>`,
        bodyText: input.bodyText,
        inReplyTo: latestInboundMessage.emailInternetMessageId ?? latestInboundMessage.emailMessageId,
        references: latestInboundMessage.emailReferences ?? latestInboundMessage.emailInternetMessageId ?? null,
        replyToProviderMessageId: latestInboundMessage.emailMessageId,
        attachmentIds: input.attachmentIds
      });
    }

    const message = await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        authorUserId: user.id,
        direction: isInternal ? MessageDirection.INTERNAL : MessageDirection.OUTBOUND,
        visibility: isInternal ? MessageVisibility.INTERNAL : MessageVisibility.PUBLIC,
        bodyText: input.bodyText,
        bodyHtml: input.bodyHtml ?? null,
        sanitizedBodyHtml,
        emailMessageId: sendResult?.providerMessageId ?? null,
        emailInternetMessageId: sendResult?.internetMessageId ?? null,
        emailConversationId: sendResult?.conversationId ?? latestInboundMessage?.emailConversationId ?? null,
        ccEmails,
        notifiedUserIds,
        hasAttachments: Boolean(input.attachmentIds?.length)
      }
    });

    if (input.attachmentIds?.length) {
      await this.prisma.ticketAttachment.updateMany({
        where: {
          id: { in: input.attachmentIds },
          ticketId,
          ticketMessageId: null,
          deletedAt: null
        },
        data: {
          ticketMessageId: message.id
        }
      });
    }

    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        ...(isInternal
          ? { updatedAt: new Date() }
          : {
              lastTechnicianResponseAt: new Date(),
              firstResponseAt: ticket.firstResponseAt ?? new Date(),
              updatedAt: new Date()
            }),
        ...(action === "send_and_close" || action === "send_note_and_close" ? { status: "CLOSED", closedAt: new Date() } : {})
      }
    });

    const shouldNotifyStaff = !isInternal || action === "send_note" || action === "send_note_and_close";
    if (shouldNotifyStaff && notifiedUserIds.length) {
      await Promise.all(
        notifiedUserIds.map((userId) =>
          this.addWatcherAndNotify(
            ticketId,
            userId,
            user.id,
            isInternal ? "Mentioned on internal note" : "Mentioned on ticket reply",
            isInternal ? "Internal note added" : "Ticket reply added",
            "internalNoteMention"
          )
        )
      );
    }
    if (shouldNotifyStaff && ticket.assignedUserId) {
      await this.addWatcherAndNotify(
        ticketId,
        ticket.assignedUserId,
        user.id,
        isInternal ? "Internal note added to an assigned ticket" : "Customer reply sent on an assigned ticket",
        isInternal ? "Internal note added" : "Ticket reply sent",
        isInternal ? "internalNoteOnAssignedTicket" : "ticketReplyOnAssignedTicket"
      );
    }
    if (shouldNotifyStaff) {
      const assignedUsers = await this.prisma.ticketAssignee.findMany({
        where: { ticketId },
        select: { userId: true }
      });
      await Promise.all(
        assignedUsers
          .filter((assignment) => assignment.userId !== ticket.assignedUserId)
          .map((assignment) =>
            this.addWatcherAndNotify(
              ticketId,
              assignment.userId,
              user.id,
              isInternal ? "Internal note added to an assigned ticket" : "Customer reply sent on an assigned ticket",
              isInternal ? "Internal note added" : "Ticket reply sent",
              isInternal ? "internalNoteOnAssignedTicket" : "ticketReplyOnAssignedTicket"
            )
          )
      );
    }
    if (shouldNotifyStaff && ticket.assignedTeamId) {
      await this.notifyTeamMembers(
        ticketId,
        ticket.assignedTeamId,
        user.id,
        isInternal ? "Internal note added to a team ticket" : "Customer reply sent on a team ticket",
        isInternal ? "Internal note added for your team" : "Ticket reply sent for your team"
      );
    }
    if (shouldNotifyStaff && !ticket.assignedTeamId && ticket.assignedGroupId) {
      await this.notifyGroupMembers(
        ticketId,
        ticket.assignedGroupId,
        user.id,
        isInternal ? "Internal note added to a legacy group ticket" : "Customer reply sent on a legacy group ticket",
        isInternal ? "Internal note added for your group" : "Ticket reply sent for your group"
      );
    }

    await this.auditLogs.create({
      userId: user.id,
      entityType: "TicketMessage",
      entityId: message.id,
      action: isInternal ? "ticket.internal_note_created" : "ticket.reply_created",
      metadata: { ticketId, attachmentCount: input.attachmentIds?.length ?? 0 }
    });

    return message;
  }

  private async findExistingTicketForInbound(input: CreateInboundEmailTicketInput) {
    const messageReferences = this.extractMessageReferences(input.references);
    if (input.inReplyTo?.trim()) {
      messageReferences.push(input.inReplyTo.trim());
    }

    const uniqueMessageReferences = [...new Set(messageReferences)];
    const ticketNumber = this.extractTicketNumber(`${input.subject}\n${input.bodyText ?? ""}`);
    const matchers: Prisma.TicketWhereInput[] = [];

    if (input.emailConversationId?.trim()) {
      matchers.push({
        messages: {
          some: {
            emailConversationId: input.emailConversationId.trim()
          }
        }
      });
    }

    if (uniqueMessageReferences.length > 0) {
      matchers.push({
        messages: {
          some: {
            emailInternetMessageId: { in: uniqueMessageReferences }
          }
        }
      });
    }

    if (ticketNumber) {
      matchers.push({ ticketNumber });
    }

    if (matchers.length === 0) {
      return null;
    }

    return this.prisma.ticket.findFirst({
      where: {
        organizationId: input.organizationId,
        deletedAt: null,
        OR: matchers
      },
      orderBy: { updatedAt: "desc" }
    });
  }

  private shouldReopenFromInbound(status: TicketStatus) {
    return status === TicketStatus.CLOSED || status === TicketStatus.RESOLVED || status === TicketStatus.CANCELLED;
  }

  private extractMessageReferences(value: string | null | undefined) {
    if (!value) {
      return [];
    }

    const references = new Set<string>();
    for (const match of value.match(/<[^>]+>/g) ?? []) {
      references.add(match.trim());
    }

    for (const token of value.split(/\s+/)) {
      const normalized = token.trim();
      if (normalized.includes("@")) {
        references.add(normalized);
      }
    }

    return [...references];
  }

  private extractTicketNumber(value: string) {
    return value.match(/\b[A-Z]{2,10}-\d{3,}\b/i)?.[0]?.toUpperCase() ?? null;
  }

  private async recordUnknownSenderDomain(
    organizationId: string,
    senderDomain: string | null,
    senderEmail: string,
    requester: Awaited<ReturnType<ContactsService["resolveRequesterFromEmail"]>>
  ) {
    if (requester || !senderDomain) {
      return;
    }

    await this.prisma.unmappedEmailDomain.upsert({
      where: {
        organizationId_domain: {
          organizationId,
          domain: senderDomain
        }
      },
      update: {
        lastSenderEmail: senderEmail,
        messageCount: { increment: 1 },
        lastSeenAt: new Date()
      },
      create: {
        organizationId,
        domain: senderDomain,
        firstSenderEmail: senderEmail,
        lastSenderEmail: senderEmail,
        messageCount: 1
      }
    });
  }

  private async ensureTicketExists(ticketId: string, user: AuthenticatedUser) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, organizationId: user.organizationId, deletedAt: null }
    });

    if (!ticket) {
      throw new NotFoundException("Ticket was not found.");
    }

    return ticket;
  }

  private async validateAssignmentTargets(assignedUserIds: string[], assignedTeamId: string | null | undefined, organizationId: string) {
    if (assignedUserIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: assignedUserIds }, organizationId, deletedAt: null, isActive: true },
        select: { id: true }
      });
      if (users.length !== assignedUserIds.length) {
        throw new BadRequestException("One or more assigned technicians are not available.");
      }
    }

    if (assignedTeamId) {
      const team = await this.prisma.ticketTeam.findFirst({
        where: { id: assignedTeamId, organizationId, isActive: true },
        select: { id: true }
      });
      if (!team) {
        throw new BadRequestException("Assigned ticket team is not available.");
      }
    }
  }

  private normalizeAssignedUserIds(userIds: Array<string | null | undefined>) {
    return [...new Set(userIds.filter((userId): userId is string => Boolean(userId)))];
  }

  private async syncTicketAssignees(ticketId: string, assignedUserIds: string[], assignedById: string | null) {
    const current = await this.prisma.ticketAssignee.findMany({
      where: { ticketId },
      select: { userId: true }
    });
    const currentIds = new Set(current.map((assignment) => assignment.userId));
    const nextIds = new Set(assignedUserIds);

    await this.prisma.ticketAssignee.deleteMany({
      where: {
        ticketId,
        userId: { in: [...currentIds].filter((userId) => !nextIds.has(userId)) }
      }
    });

    await Promise.all(
      [...nextIds]
        .filter((userId) => !currentIds.has(userId))
        .map((userId) =>
          this.prisma.ticketAssignee.create({
            data: {
              ticketId,
              userId,
              assignedById
            }
          })
        )
    );
  }

  private async resolveCcEmails(ccEmails: string[], ccUserIds: string[], organizationId: string) {
    const manualEmails = ccEmails.map((email) => email.trim().toLowerCase()).filter(Boolean);
    if (ccUserIds.length === 0) {
      return [...new Set(manualEmails)];
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(ccUserIds)] }, organizationId, deletedAt: null, isActive: true },
      select: { email: true }
    });

    return [...new Set([...manualEmails, ...users.map((user) => user.email.toLowerCase())])];
  }

  private async shouldMarkExistingTicketOpenFromInbound(ticketId: string, status: TicketStatus) {
    if (status !== TicketStatus.NEW && status !== TicketStatus.WAITING_ON_CUSTOMER) {
      return false;
    }

    const staffMessageCount = await this.prisma.ticketMessage.count({
      where: {
        ticketId,
        direction: { in: [MessageDirection.OUTBOUND, MessageDirection.INTERNAL] }
      }
    });

    return staffMessageCount > 0;
  }

  private parsePage(value: string | undefined) {
    const parsed = Number(value ?? "1");
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
  }

  private async addWatcherAndNotify(
    ticketId: string,
    userId: string,
    createdById: string | null,
    reason: string,
    title: string,
    eventType: "ticketAssignedToMe" | "ticketReplyOnAssignedTicket" | "internalNoteOnAssignedTicket" | "internalNoteMention" = "ticketAssignedToMe"
  ) {
    await this.prisma.ticketWatcher.upsert({
      where: {
        ticketId_userId: {
          ticketId,
          userId
        }
      },
      update: {},
      create: {
        ticketId,
        userId,
        createdById,
        reason
      }
    });
    await this.notifications.notifyUser({
      userId,
      ticketId,
      title,
      body: reason,
      eventType
    });
  }

  private async notifyGroupMembers(ticketId: string, groupId: string, createdById: string | null, reason: string, title: string) {
    const members = await this.prisma.userGroup.findMany({
      where: { groupId },
      select: { userId: true }
    });

    await Promise.all(members.map((member) => this.addWatcherAndNotify(ticketId, member.userId, createdById, reason, title)));
  }

  private async notifyTeamMembers(ticketId: string, teamId: string, createdById: string | null, reason: string, title: string) {
    const members = await this.prisma.ticketTeamMember.findMany({
      where: { ticketTeamId: teamId },
      select: { userId: true }
    });

    await Promise.all(
      members.map(async (member) => {
        await this.prisma.ticketWatcher.upsert({
          where: {
            ticketId_userId: {
              ticketId,
              userId: member.userId
            }
          },
          update: {},
          create: {
            ticketId,
            userId: member.userId,
            createdById,
            reason
          }
        });
        await this.notifications.notifyUser({
          userId: member.userId,
          ticketId,
          title,
          body: reason,
          eventType: reason.toLowerCase().includes("assignment") ? "ticketAssignedToMyTeam" : "ticketReplyOnAssignedTicket"
        });
      })
    );
  }

  private async nextTicketNumber(tx: Prisma.TransactionClient) {
    const sequence = await tx.ticketSequence.upsert({
      where: { key: "ticket" },
      update: { currentValue: { increment: 1 } },
      create: { key: "ticket", prefix: "AIT", currentValue: 100001 }
    });

    return `${sequence.prefix}-${sequence.currentValue}`;
  }

  private extractDomain(emailAddress: string): string | null {
    const atIndex = emailAddress.lastIndexOf("@");
    if (atIndex === -1 || atIndex === emailAddress.length - 1) {
      return null;
    }

    return emailAddress.slice(atIndex + 1).trim().toLowerCase().replace(/\.$/, "") || null;
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  private buildTicketListWhere(user: AuthenticatedUser, query: ListTicketsQueryDto): Prisma.TicketWhereInput {
    const filters: Prisma.TicketWhereInput[] = [];
    const search = query.search?.trim();
    const requester = query.requester?.trim();

    if (search) {
      filters.push({
        OR: [
          { ticketNumber: { contains: search, mode: "insensitive" } },
          { subject: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          { senderEmail: { contains: search, mode: "insensitive" } },
          { senderDomain: { contains: search, mode: "insensitive" } },
          { client: { name: { contains: search, mode: "insensitive" } } },
          { contact: { email: { contains: search, mode: "insensitive" } } },
          { contact: { firstName: { contains: search, mode: "insensitive" } } },
          { contact: { lastName: { contains: search, mode: "insensitive" } } },
          { messages: { some: { bodyText: { contains: search, mode: "insensitive" } } } }
        ]
      });
    }

    if (query.clientId) {
      filters.push({ clientId: query.clientId });
    }

    if (query.scope === "assigned_to_me") {
      filters.push({
        OR: [{ assignedUserId: user.id }, { assignees: { some: { userId: user.id } } }]
      });
    }

    if (query.scope === "my_teams") {
      filters.push({ assignedTeam: { members: { some: { userId: user.id } } } });
    }

    if (query.scope === "unassigned") {
      filters.push({ assignedUserId: null, assignedTeamId: null, assignedGroupId: null });
    }

    if (query.assignedUserId) {
      filters.push({
        OR: [{ assignedUserId: query.assignedUserId }, { assignees: { some: { userId: query.assignedUserId } } }]
      });
    }

    if (query.assignedTeamId) {
      filters.push({ assignedTeamId: query.assignedTeamId });
    }

    if (requester) {
      filters.push({
        OR: [
          { senderEmail: { contains: requester, mode: "insensitive" } },
          { contact: { email: { contains: requester, mode: "insensitive" } } },
          { contact: { firstName: { contains: requester, mode: "insensitive" } } },
          { contact: { lastName: { contains: requester, mode: "insensitive" } } }
        ]
      });
    }

    if (query.status) {
      filters.push({ status: query.status });
    }

    if (query.priority) {
      filters.push({ priority: query.priority });
    }

    return {
      organizationId: user.organizationId,
      deletedAt: query.deletedScope === "deleted" ? { not: null } : null,
      ...(filters.length ? { AND: filters } : {})
    };
  }
}
