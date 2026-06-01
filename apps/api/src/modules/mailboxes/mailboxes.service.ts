import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Mailbox } from "@prisma/client";
import { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { TicketAttachmentsService } from "../ticket-attachments/ticket-attachments.service";
import { TicketsService } from "../tickets/tickets.service";
import { UpdateMailboxDto } from "./dto/update-mailbox.dto";
import { MailProvider } from "./providers/mail-provider.interface";
import { MicrosoftGraphMailProvider } from "./providers/microsoft-graph-mail.provider";
import { MockMailProvider } from "./providers/mock-mail.provider";

export interface SyncMailboxResult {
  mailboxId: string;
  provider: "mock" | "microsoft365";
  receivedMessages: number;
  createdTickets: number;
  skippedDuplicates: number;
  attachmentBackfillFailures?: number;
  nextSyncCursor?: string | null;
}

@Injectable()
export class MailboxesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailboxesService.name);
  private readonly runningAutoSyncs = new Set<string>();
  private autoSyncTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ticketsService: TicketsService,
    private readonly ticketAttachmentsService: TicketAttachmentsService,
    private readonly mockMailProvider: MockMailProvider,
    private readonly microsoftGraphMailProvider: MicrosoftGraphMailProvider
  ) {}

  onModuleInit() {
    this.autoSyncTimer = setInterval(() => {
      void this.runDueAutoSyncs();
    }, 15_000);
  }

  onModuleDestroy() {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
    }
  }

  list(user: AuthenticatedUser) {
    return this.prisma.mailbox.findMany({
      where: {
        organizationId: user.organizationId
      },
      orderBy: { emailAddress: "asc" }
    });
  }

  async update(mailboxId: string, input: UpdateMailboxDto, user: AuthenticatedUser) {
    await this.getMailboxForUser(mailboxId, user);

    return this.prisma.mailbox.update({
      where: { id: mailboxId },
      data: {
        name: input.name?.trim(),
        emailAddress: input.emailAddress?.trim().toLowerCase(),
        provider: input.provider,
        connectionMode: input.connectionMode,
        publicEmailAddress: input.publicEmailAddress === undefined ? undefined : this.optionalEmail(input.publicEmailAddress),
        ingestionEmailAddress: input.ingestionEmailAddress === undefined ? undefined : this.optionalEmail(input.ingestionEmailAddress),
        outboundMode: input.outboundMode,
        outboundFromAddress: input.outboundFromAddress === undefined ? undefined : this.optionalEmail(input.outboundFromAddress),
        outboundReplyToAddress: input.outboundReplyToAddress === undefined ? undefined : this.optionalEmail(input.outboundReplyToAddress),
        preserveOriginalSenderHeaders: input.preserveOriginalSenderHeaders,
        tenantId: input.tenantId === undefined ? undefined : this.optionalTrim(input.tenantId),
        microsoftClientId: input.microsoftClientId === undefined ? undefined : this.optionalTrim(input.microsoftClientId),
        encryptedClientSecretReference:
          input.encryptedClientSecretReference === undefined ? undefined : this.optionalTrim(input.encryptedClientSecretReference),
        isActive: input.isActive,
        autoSyncEnabled: input.autoSyncEnabled,
        autoSyncIntervalSeconds: input.autoSyncIntervalSeconds === undefined ? undefined : input.autoSyncIntervalSeconds,
        nextAutoSyncAt:
          input.autoSyncEnabled === false
            ? null
            : input.autoSyncIntervalSeconds
              ? new Date(Date.now() + input.autoSyncIntervalSeconds * 1000)
              : undefined,
        initialSyncFrom: input.initialSyncFrom === undefined ? undefined : input.initialSyncFrom ? new Date(input.initialSyncFrom) : null,
        lastSyncCursor: input.initialSyncFrom === undefined ? undefined : null,
        lastSyncError: null
      }
    });
  }

  async syncInbound(mailboxId: string, user: AuthenticatedUser): Promise<SyncMailboxResult> {
    const mailbox = await this.getMailboxForUser(mailboxId, user);
    return this.syncMailbox(mailbox);
  }

  private async runDueAutoSyncs() {
    try {
      const now = new Date();
      const mailboxes = await this.prisma.mailbox.findMany({
        where: {
          isActive: true,
          autoSyncEnabled: true,
          autoSyncIntervalSeconds: { not: null },
          OR: [{ nextAutoSyncAt: null }, { nextAutoSyncAt: { lte: now } }]
        },
        take: 10,
        orderBy: { nextAutoSyncAt: "asc" }
      });

      await Promise.all(
        mailboxes.map(async (mailbox) => {
          if (this.runningAutoSyncs.has(mailbox.id)) {
            return;
          }

          this.runningAutoSyncs.add(mailbox.id);
          try {
            await this.prisma.mailbox.update({
              where: { id: mailbox.id },
              data: { autoSyncLockedAt: new Date() }
            });
            await this.syncMailbox(mailbox);
          } catch (error) {
            this.logger.warn(`Mailbox auto sync failed for ${mailbox.emailAddress}: ${error instanceof Error ? error.message : "Unknown error"}`);
            await this.prisma.mailbox.update({
              where: { id: mailbox.id },
              data: {
                lastSyncError: error instanceof Error ? error.message.slice(0, 1000) : "Mailbox auto sync failed.",
                nextAutoSyncAt: new Date(Date.now() + (mailbox.autoSyncIntervalSeconds ?? 300) * 1000),
                autoSyncLockedAt: null
              }
            });
          } finally {
            this.runningAutoSyncs.delete(mailbox.id);
          }
        })
      );
    } catch (error) {
      this.logger.warn(`Mailbox auto sync scan failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async syncMailbox(mailbox: Mailbox): Promise<SyncMailboxResult> {
    const { providerName, provider } = this.resolveProvider(mailbox);
    const syncResult = await provider.syncInboundMessages({
      mailboxId: mailbox.id,
      mailboxEmailAddress: this.getMailboxReadAddress(mailbox),
      publicEmailAddress: mailbox.publicEmailAddress ?? mailbox.emailAddress,
      connectionMode: mailbox.connectionMode,
      preserveOriginalSenderHeaders: mailbox.preserveOriginalSenderHeaders,
      lastSyncCursor: mailbox.lastSyncCursor,
      initialSyncFrom: mailbox.initialSyncFrom,
      tenantId: mailbox.tenantId,
      microsoftClientId: mailbox.microsoftClientId,
      encryptedClientSecretReference: mailbox.encryptedClientSecretReference
    });
    let createdTickets = 0;
    let skippedDuplicates = 0;
    let attachmentBackfillFailures = 0;

    for (const message of syncResult.messages) {
      const exists = await this.prisma.ticketMessage.findFirst({
        where: {
          OR: [
            { emailMessageId: message.providerMessageId },
            ...(message.internetMessageId ? [{ emailInternetMessageId: message.internetMessageId }] : [])
          ]
        },
        select: { id: true, ticketId: true }
      });

      if (exists) {
        if (message.hasAttachments) {
          const storedAttachmentCount = await this.prisma.ticketAttachment.count({
            where: { ticketMessageId: exists.id, deletedAt: null }
          });
          if (storedAttachmentCount === 0) {
            const stored = await this.storeInboundAttachments(provider, mailbox, message.providerMessageId, exists.ticketId, exists.id);
            attachmentBackfillFailures += stored.failed;
          }
        }
        skippedDuplicates += 1;
        continue;
      }

      const result = await this.ticketsService.createFromInboundEmail({
        organizationId: mailbox.organizationId,
        mailboxId: mailbox.id,
        senderEmail: message.from.email,
        senderName: message.from.name,
        subject: message.subject,
        bodyText: message.bodyText,
        bodyHtml: message.bodyHtml,
        emailMessageId: message.providerMessageId,
        emailInternetMessageId: message.internetMessageId,
        emailConversationId: message.conversationId,
        inReplyTo: message.inReplyTo,
        references: message.references,
        hasAttachments: message.hasAttachments
      });

      if (message.hasAttachments) {
        const stored = await this.storeInboundAttachments(provider, mailbox, message.providerMessageId, result.ticket.id, result.message.id);
        attachmentBackfillFailures += stored.failed;
      }
      createdTickets += 1;
    }

    attachmentBackfillFailures += await this.backfillExistingMessageAttachments(provider, mailbox);

    await this.prisma.mailbox.update({
      where: { id: mailbox.id },
      data: {
        ...(syncResult.nextSyncCursor !== undefined ? { lastSyncCursor: syncResult.nextSyncCursor } : {}),
        lastSyncedAt: new Date(),
        lastSyncError: null,
        nextAutoSyncAt: mailbox.autoSyncEnabled && mailbox.autoSyncIntervalSeconds ? new Date(Date.now() + mailbox.autoSyncIntervalSeconds * 1000) : mailbox.nextAutoSyncAt,
        autoSyncLockedAt: null
      }
    });

    return {
      mailboxId: mailbox.id,
      provider: providerName,
      receivedMessages: syncResult.messages.length,
      createdTickets,
      skippedDuplicates,
      attachmentBackfillFailures,
      nextSyncCursor: syncResult.nextSyncCursor
    };
  }

  private async getMailboxForUser(mailboxId: string, user: AuthenticatedUser) {
    const mailbox = await this.prisma.mailbox.findFirst({
      where: {
        id: mailboxId,
        organizationId: user.organizationId
      }
    });

    if (!mailbox) {
      throw new NotFoundException("Mailbox was not found.");
    }

    return mailbox;
  }

  private resolveProvider(mailbox: Mailbox): { providerName: "mock" | "microsoft365"; provider: MailProvider } {
    const configuredProvider = this.config.get<string>("MAIL_PROVIDER")?.trim().toLowerCase();

    if (configuredProvider === "mock") {
      return { providerName: "mock", provider: this.mockMailProvider };
    }

    if (configuredProvider === "microsoft365") {
      return { providerName: "microsoft365", provider: this.microsoftGraphMailProvider };
    }

    if (mailbox.connectionMode === "MOCK" || mailbox.provider === "MOCK") {
      return { providerName: "mock", provider: this.mockMailProvider };
    }

    if (mailbox.provider === "MICROSOFT365") {
      return { providerName: "microsoft365", provider: this.microsoftGraphMailProvider };
    }

    const hasGraphConfiguration = Boolean(mailbox.tenantId && mailbox.microsoftClientId && mailbox.encryptedClientSecretReference);
    return hasGraphConfiguration
      ? { providerName: "microsoft365", provider: this.microsoftGraphMailProvider }
      : { providerName: "mock", provider: this.mockMailProvider };
  }

  private optionalTrim(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private optionalEmail(value: string | null | undefined) {
    return this.optionalTrim(value)?.toLowerCase() ?? null;
  }

  private getMailboxReadAddress(mailbox: Mailbox) {
    if (mailbox.connectionMode === "GRAPH_FORWARDED_MAILBOX" && mailbox.ingestionEmailAddress) {
      return mailbox.ingestionEmailAddress;
    }

    return mailbox.emailAddress;
  }

  private async storeInboundAttachments(
    provider: MailProvider,
    mailbox: Mailbox,
    providerMessageId: string,
    ticketId: string,
    ticketMessageId: string
  ) {
    let attachments;
    try {
      attachments = await provider.getMessageAttachments({
        mailboxId: mailbox.id,
        mailboxEmailAddress: this.getMailboxReadAddress(mailbox),
        providerMessageId,
        tenantId: mailbox.tenantId,
        microsoftClientId: mailbox.microsoftClientId,
        encryptedClientSecretReference: mailbox.encryptedClientSecretReference
      });
    } catch {
      return { stored: 0, failed: 1 };
    }

    let stored = 0;
    let failed = 0;

    for (const attachment of attachments) {
      if (!attachment.contentBytes) {
        continue;
      }

      try {
        await this.ticketAttachmentsService.createInboundEmailAttachment({
          ticketId,
          ticketMessageId,
          originalFilename: attachment.originalFilename,
          mimeType: attachment.mimeType,
          buffer: attachment.contentBytes,
          isInline: attachment.isInline,
          contentId: attachment.contentId,
          emailAttachmentId: attachment.id
        });
        stored += 1;
      } catch {
        failed += 1;
      }
    }

    return { stored, failed };
  }

  private async backfillExistingMessageAttachments(provider: MailProvider, mailbox: Mailbox) {
    const candidates = await this.prisma.ticketMessage.findMany({
      where: {
        emailMessageId: { not: null },
        ticket: {
          organizationId: mailbox.organizationId,
          mailboxId: mailbox.id,
          deletedAt: null
        },
        OR: [
          { hasAttachments: true },
          { bodyHtml: { contains: "cid:", mode: "insensitive" } },
          { sanitizedBodyHtml: { contains: "cid:", mode: "insensitive" } }
        ]
      },
      select: {
        id: true,
        ticketId: true,
        emailMessageId: true
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    let failures = 0;

    for (const message of candidates) {
      if (message.emailMessageId) {
        const stored = await this.storeInboundAttachments(provider, mailbox, message.emailMessageId, message.ticketId, message.id);
        failures += stored.failed;
      }
    }

    return failures;
  }
}
