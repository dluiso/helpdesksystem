import { MailboxesService } from "./mailboxes.service";

const user = {
  id: "user-1",
  organizationId: "org-1",
  email: "admin@example.com",
  firstName: "Admin",
  lastName: "User",
  forcePasswordChange: false,
  permissions: []
};

describe("MailboxesService", () => {
  it("lists mailboxes only for the current organization", async () => {
    const prisma = {
      mailbox: {
        findMany: jest.fn().mockResolvedValue([])
      }
    };
    const service = new MailboxesService(
      prisma as never,
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    await service.list(user);

    expect(prisma.mailbox.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      orderBy: { emailAddress: "asc" }
    });
  });

  it("syncs inbound mock messages into tickets and stores the next cursor", async () => {
    const prisma = {
      mailbox: {
        findFirst: jest.fn().mockResolvedValue({
          id: "mailbox-1",
          organizationId: "org-1",
          emailAddress: "support@example.org",
          lastSyncCursor: null,
          tenantId: null,
          microsoftClientId: null,
          encryptedClientSecretReference: null
        }),
        update: jest.fn()
      },
      ticketMessage: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([])
      }
    };
    const ticketsService = {
      createFromInboundEmail: jest.fn().mockResolvedValue({ ticket: { id: "ticket-1" } })
    };
    const mockMailProvider = {
      syncInboundMessages: jest.fn().mockResolvedValue({
        messages: [
          {
            providerMessageId: "mock-message-1",
            internetMessageId: "<mock-message-1@example.org>",
            conversationId: "conversation-1",
            from: { email: "requester@example.org", name: "Requester One" },
            subject: "Need help",
            bodyText: "Please help"
          }
        ],
        nextSyncCursor: "cursor-1"
      })
    };
    const service = new MailboxesService(
      prisma as never,
      { get: jest.fn().mockReturnValue("mock") } as never,
      ticketsService as never,
      { createInboundEmailAttachment: jest.fn() } as never,
      { findBlockForSender: jest.fn().mockResolvedValue(null), logBlockedInboundEmail: jest.fn() } as never,
      mockMailProvider as never,
      {} as never
    );

    await expect(service.syncInbound("mailbox-1", user)).resolves.toEqual({
      mailboxId: "mailbox-1",
      provider: "mock",
      receivedMessages: 1,
      createdTickets: 1,
      skippedDuplicates: 0,
      blockedSpamMessages: 0,
      attachmentBackfillFailures: 0,
      attachmentBackfillErrors: [],
      nextSyncCursor: "cursor-1"
    });
    expect(ticketsService.createFromInboundEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        senderEmail: "requester@example.org",
        senderName: "Requester One",
        subject: "Need help",
        emailMessageId: "mock-message-1"
      })
    );
    expect(prisma.mailbox.update).toHaveBeenCalledWith({
      where: { id: "mailbox-1" },
      data: expect.objectContaining({ lastSyncCursor: "cursor-1", lastSyncError: null })
    });
  });

  it("skips already imported provider messages", async () => {
    const prisma = {
      mailbox: {
        findFirst: jest.fn().mockResolvedValue({
          id: "mailbox-1",
          organizationId: "org-1",
          emailAddress: "support@example.org",
          lastSyncCursor: null,
          tenantId: null,
          microsoftClientId: null,
          encryptedClientSecretReference: null
        }),
        update: jest.fn()
      },
      ticketMessage: {
        findFirst: jest.fn().mockResolvedValue({ id: "message-existing", ticketId: "ticket-1" }),
        findMany: jest.fn().mockResolvedValue([])
      }
    };
    const ticketsService = {
      createFromInboundEmail: jest.fn()
    };
    const mockMailProvider = {
      syncInboundMessages: jest.fn().mockResolvedValue({
        messages: [
          {
            providerMessageId: "mock-message-1",
            from: { email: "requester@example.org" },
            subject: "Need help"
          }
        ],
        nextSyncCursor: null
      })
    };
    const service = new MailboxesService(
      prisma as never,
      { get: jest.fn().mockReturnValue("mock") } as never,
      ticketsService as never,
      { createInboundEmailAttachment: jest.fn() } as never,
      { findBlockForSender: jest.fn().mockResolvedValue(null), logBlockedInboundEmail: jest.fn() } as never,
      mockMailProvider as never,
      {} as never
    );

    await expect(service.syncInbound("mailbox-1", user)).resolves.toEqual({
      mailboxId: "mailbox-1",
      provider: "mock",
      receivedMessages: 1,
      createdTickets: 0,
      skippedDuplicates: 1,
      blockedSpamMessages: 0,
      attachmentBackfillFailures: 0,
      attachmentBackfillErrors: [],
      nextSyncCursor: null
    });
    expect(ticketsService.createFromInboundEmail).not.toHaveBeenCalled();
  });

  it("checks Microsoft 365 attachments even when Graph does not flag hasAttachments", async () => {
    const prisma = {
      mailbox: {
        findFirst: jest.fn().mockResolvedValue({
          id: "mailbox-1",
          organizationId: "org-1",
          emailAddress: "support@example.org",
          provider: "MICROSOFT365",
          connectionMode: "GRAPH_DIRECT",
          lastSyncCursor: null,
          tenantId: "tenant-1",
          microsoftClientId: "client-1",
          encryptedClientSecretReference: "env:MICROSOFT_CLIENT_SECRET",
          autoSyncEnabled: false,
          autoSyncIntervalSeconds: null,
          nextAutoSyncAt: null
        }),
        update: jest.fn()
      },
      ticketMessage: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn()
      }
    };
    const ticketsService = {
      createFromInboundEmail: jest.fn().mockResolvedValue({ ticket: { id: "ticket-1" }, message: { id: "message-1" } })
    };
    const ticketAttachmentsService = {
      createInboundEmailAttachment: jest.fn().mockResolvedValue({ id: "attachment-record-1" })
    };
    const microsoftGraphProvider = {
      syncInboundMessages: jest.fn().mockResolvedValue({
        messages: [
          {
            providerMessageId: "graph-message-1",
            internetMessageId: "<graph-message-1@example.org>",
            conversationId: "conversation-1",
            from: { email: "requester@example.org", name: "Requester One" },
            subject: "Need help",
            bodyText: "Please see attached",
            hasAttachments: false
          }
        ],
        nextSyncCursor: "cursor-1"
      }),
      getMessageAttachments: jest.fn().mockResolvedValue([
        {
          id: "graph-attachment-1",
          originalFilename: "details.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          sizeBytes: 12,
          contentBytes: Buffer.from("attachment"),
          isInline: false,
          contentId: null
        }
      ])
    };
    const service = new MailboxesService(
      prisma as never,
      { get: jest.fn() } as never,
      ticketsService as never,
      ticketAttachmentsService as never,
      { findBlockForSender: jest.fn().mockResolvedValue(null), logBlockedInboundEmail: jest.fn() } as never,
      {} as never,
      microsoftGraphProvider as never
    );

    await expect(service.syncInbound("mailbox-1", user)).resolves.toEqual(
      expect.objectContaining({
        receivedMessages: 1,
        createdTickets: 1,
        attachmentBackfillFailures: 0
      })
    );

    expect(microsoftGraphProvider.getMessageAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        mailboxId: "mailbox-1",
        providerMessageId: "graph-message-1"
      })
    );
    expect(ticketAttachmentsService.createInboundEmailAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: "ticket-1",
        ticketMessageId: "message-1",
        originalFilename: "details.docx",
        emailAttachmentId: "graph-attachment-1"
      })
    );
    expect(prisma.ticketMessage.update).toHaveBeenCalledWith({
      where: { id: "message-1" },
      data: { hasAttachments: true }
    });
  });
});
