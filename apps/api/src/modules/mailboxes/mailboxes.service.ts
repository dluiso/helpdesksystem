import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Mailbox, MessageDirection, MessageVisibility } from "@prisma/client";
import { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { SpamManagementService } from "../spam-management/spam-management.service";
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
  blockedSpamMessages: number;
  attachmentBackfilled?: number;
  attachmentBackfillFailures?: number;
  attachmentBackfillErrors?: string[];
  nextSyncCursor?: string | null;
}

interface SyncMailboxOptions {
  broadAttachmentBackfill?: boolean;
}

@Injectable()
export class MailboxesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailboxesService.name);
  private readonly runningAutoSyncs = new Set<string>();
  private readonly runningAttachmentBackfills = new Set<string>();
  private autoSyncTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ticketsService: TicketsService,
    private readonly ticketAttachmentsService: TicketAttachmentsService,
    private readonly spamManagement: SpamManagementService,
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
    const result = await this.syncMailbox(mailbox);
    this.scheduleBroadAttachmentBackfill(mailbox);
    return result;
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

  private async syncMailbox(mailbox: Mailbox, options: SyncMailboxOptions = {}): Promise<SyncMailboxResult> {
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
    let blockedSpamMessages = 0;
    let attachmentBackfilled = 0;
    let attachmentBackfillFailures = 0;
    const attachmentBackfillErrors: string[] = [];

    for (const message of syncResult.messages) {
      const eventMessageExists = await this.prisma.eventServiceMessage.findFirst({
        where: {
          OR: [
            { emailMessageId: message.providerMessageId },
            ...(message.internetMessageId ? [{ emailInternetMessageId: message.internetMessageId }] : [])
          ]
        },
        select: { id: true }
      });
      if (eventMessageExists) {
        skippedDuplicates += 1;
        continue;
      }

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
        if (this.shouldFetchInboundAttachments(providerName, message)) {
          const stored = await this.storeInboundAttachments(provider, mailbox, message.providerMessageId, exists.ticketId, exists.id);
          attachmentBackfilled += stored.stored;
          attachmentBackfillFailures += stored.failed;
          attachmentBackfillErrors.push(...stored.errors);
        }
        skippedDuplicates += 1;
        continue;
      }

      const eventRequest = await this.findEventRequestForMessage(mailbox.organizationId, message.subject, message.conversationId ?? null);
      if (eventRequest) {
        await this.prisma.eventServiceMessage.create({
          data: {
            requestId: eventRequest.id,
            direction: MessageDirection.INBOUND,
            visibility: MessageVisibility.PUBLIC,
            bodyText: message.bodyText ?? message.bodyHtml ?? "",
            bodyHtml: message.bodyHtml ?? null,
            sanitizedBodyHtml: message.bodyHtml ?? null,
            senderEmail: message.from.email,
            emailMessageId: message.providerMessageId,
            emailInternetMessageId: message.internetMessageId ?? null,
            emailConversationId: message.conversationId ?? null,
            inReplyTo: message.inReplyTo ?? null,
            emailReferences: message.references ?? null
          }
        });
        await this.prisma.eventServiceActivity.create({
          data: {
            requestId: eventRequest.id,
            action: "event_service_message.received",
            metadata: {
              senderEmail: message.from.email,
              subject: message.subject
            }
          }
        });
        skippedDuplicates += 1;
        continue;
      }

      const senderDomain = this.extractDomain(message.from.email);
      const spamBlock = await this.spamManagement.findBlockForSender(mailbox.organizationId, message.from.email, senderDomain);
      if (spamBlock) {
        await this.spamManagement.logBlockedInboundEmail({
          organizationId: mailbox.organizationId,
          mailboxId: mailbox.id,
          spamBlockEntryId: spamBlock.id,
          senderEmail: message.from.email,
          senderDomain,
          subject: message.subject,
          emailMessageId: message.providerMessageId,
          emailInternetMessageId: message.internetMessageId,
          emailConversationId: message.conversationId,
          reason: `Blocked by ${spamBlock.type.toLowerCase()} rule: ${spamBlock.normalizedValue}`
        });
        blockedSpamMessages += 1;
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
        hasAttachments: message.hasAttachments,
        internetMessageHeaders: message.internetMessageHeaders
      });

      if (this.shouldFetchInboundAttachments(providerName, message)) {
        const stored = await this.storeInboundAttachments(provider, mailbox, message.providerMessageId, result.ticket.id, result.message.id);
        attachmentBackfilled += stored.stored;
        attachmentBackfillFailures += stored.failed;
        attachmentBackfillErrors.push(...stored.errors);
      }
      createdTickets += 1;
    }

    const backfill = await this.backfillExistingMessageAttachments(provider, mailbox, {
      broad: providerName === "microsoft365" && options.broadAttachmentBackfill
    });
    attachmentBackfilled += backfill.stored;
    attachmentBackfillFailures += backfill.failed;
    attachmentBackfillErrors.push(...backfill.errors);

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
      blockedSpamMessages,
      attachmentBackfilled,
      attachmentBackfillFailures,
      attachmentBackfillErrors: attachmentBackfillErrors.slice(0, 10),
      nextSyncCursor: syncResult.nextSyncCursor
    };
  }

  private scheduleBroadAttachmentBackfill(mailbox: Mailbox) {
    const { providerName } = this.resolveProvider(mailbox);
    if (providerName !== "microsoft365" || this.runningAttachmentBackfills.has(mailbox.id)) {
      return;
    }

    this.runningAttachmentBackfills.add(mailbox.id);
    void this.runBroadAttachmentBackfill(mailbox).finally(() => {
      this.runningAttachmentBackfills.delete(mailbox.id);
    });
  }

  private async runBroadAttachmentBackfill(mailbox: Mailbox) {
    try {
      const { providerName, provider } = this.resolveProvider(mailbox);
      if (providerName !== "microsoft365") {
        return;
      }

      const result = await this.backfillExistingMessageAttachments(provider, mailbox, { broad: true });
      if (result.failed > 0) {
        this.logger.warn(
          `Mailbox attachment backfill completed for ${mailbox.emailAddress} with ${result.failed} failure${result.failed === 1 ? "" : "s"}.`
        );
      } else if (result.stored > 0) {
        this.logger.log(`Mailbox attachment backfill stored ${result.stored} attachment${result.stored === 1 ? "" : "s"} for ${mailbox.emailAddress}.`);
      }
    } catch (error) {
      this.logger.warn(`Mailbox attachment backfill failed for ${mailbox.emailAddress}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async findEventRequestForMessage(organizationId: string, subject: string, conversationId: string | null) {
    if (conversationId) {
      const existingMessage = await this.prisma.eventServiceMessage.findFirst({
        where: {
          emailConversationId: conversationId,
          request: { organizationId, deletedAt: null }
        },
        select: { requestId: true }
      });
      if (existingMessage) {
        return this.prisma.eventServiceRequest.findFirst({
          where: { id: existingMessage.requestId, organizationId, deletedAt: null },
          select: { id: true }
        });
      }
    }

    const trackingNumber = subject.match(/\bEVT-\d+\b/i)?.[0]?.toUpperCase();
    if (!trackingNumber) {
      return null;
    }

    return this.prisma.eventServiceRequest.findFirst({
      where: { organizationId, trackingNumber, deletedAt: null },
      select: { id: true }
    });
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

  private extractDomain(emailAddress: string) {
    const atIndex = emailAddress.lastIndexOf("@");
    if (atIndex === -1 || atIndex === emailAddress.length - 1) {
      return null;
    }
    return emailAddress.slice(atIndex + 1).trim().toLowerCase().replace(/\.$/, "") || null;
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
    } catch (error) {
      const message = `Unable to retrieve attachments for message ${providerMessageId}: ${this.errorMessage(error)}`;
      this.logger.warn(message);
      return { stored: 0, failed: 1, errors: [message] };
    }

    let stored = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const attachment of attachments) {
      if (!attachment.contentBytes) {
        continue;
      }

      try {
        const result = await this.ticketAttachmentsService.createInboundEmailAttachment({
          ticketId,
          ticketMessageId,
          originalFilename: attachment.originalFilename,
          mimeType: attachment.mimeType,
          buffer: attachment.contentBytes,
          isInline: attachment.isInline,
          contentId: attachment.contentId,
          emailAttachmentId: attachment.id
        });
        if (result.created) {
          stored += 1;
        }
      } catch (error) {
        failed += 1;
        const message = `Unable to store attachment ${attachment.originalFilename} from message ${providerMessageId}: ${this.errorMessage(error)}`;
        errors.push(message);
        this.logger.warn(message);
      }
    }

    if (stored > 0) {
      await this.prisma.ticketMessage.update({
        where: { id: ticketMessageId },
        data: { hasAttachments: true }
      });
    }

    return { stored, failed, errors };
  }

  private shouldFetchInboundAttachments(
    providerName: "mock" | "microsoft365",
    message: { hasAttachments?: boolean; bodyHtml?: string | null; bodyText?: string | null }
  ) {
    if (message.hasAttachments) {
      return true;
    }

    if (this.containsInlineAttachmentReference(message.bodyHtml) || this.containsInlineAttachmentReference(message.bodyText)) {
      return true;
    }

    return providerName === "microsoft365";
  }

  private containsInlineAttachmentReference(value: string | null | undefined) {
    return Boolean(value && /cid:/i.test(value));
  }

  private async backfillExistingMessageAttachments(provider: MailProvider, mailbox: Mailbox, options: { broad?: boolean } = {}) {
    const baseWhere = {
      direction: MessageDirection.INBOUND,
      emailMessageId: { not: null },
      ticket: {
        organizationId: mailbox.organizationId,
        mailboxId: mailbox.id,
        deletedAt: null
      }
    };
    const candidates = await this.prisma.ticketMessage.findMany({
      where: options.broad
        ? baseWhere
        : {
            ...baseWhere,
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
      take: options.broad ? 200 : 100
    });
    let storedCount = 0;
    let failures = 0;
    const errors: string[] = [];

    for (const message of candidates) {
      if (message.emailMessageId) {
        const stored = await this.storeInboundAttachments(provider, mailbox, message.emailMessageId, message.ticketId, message.id);
        storedCount += stored.stored;
        failures += stored.failed;
        errors.push(...stored.errors);
      }
    }

    return { stored: storedCount, failed: failures, errors };
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message.slice(0, 500) : "Unknown error";
  }
}
