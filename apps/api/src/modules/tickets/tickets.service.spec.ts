import { TicketsService } from "./tickets.service";

describe("TicketsService", () => {
  it("creates a ticket with the next human-readable ticket number", async () => {
    const ticket = {
      id: "ticket-1",
      ticketNumber: "AIT-100001",
      subject: "Printer issue"
    };
    const tx = {
      ticketSequence: {
        upsert: jest.fn().mockResolvedValue({ prefix: "AIT", currentValue: 100001 })
      },
      ticket: {
        create: jest.fn().mockResolvedValue(ticket)
      }
    };
    const prisma = {
      ticket: {
        findFirst: jest.fn().mockResolvedValue(null)
      },
      $transaction: jest.fn((callback: (txClient: typeof tx) => unknown) => callback(tx))
    };
    const auditLogs = { create: jest.fn() };
    const sanitizer = { sanitize: jest.fn((value: string) => value) };
    const contactsService = { resolveRequesterFromEmail: jest.fn() };
    const routing = { applyInboundRules: jest.fn() };
    const mailDelivery = { sendTicketReply: jest.fn() };
    const notifications = { notifyUser: jest.fn(), notifyNewTicketCreated: jest.fn() };
    const autoReplies = { sendForNewInboundTicket: jest.fn() };
    const service = new TicketsService(
      prisma as never,
      auditLogs as never,
      sanitizer as never,
      contactsService as never,
      routing as never,
      mailDelivery as never,
      notifications as never,
      autoReplies as never
    );

    await expect(
      service.create(
        {
          subject: "Printer issue"
        },
        {
          id: "user-1",
          organizationId: "org-1",
          email: "tech@example.com",
          firstName: "Tech",
          lastName: "User",
          forcePasswordChange: false,
          permissions: []
        }
      )
    ).resolves.toEqual(ticket);
    expect(tx.ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketNumber: "AIT-100001",
          subject: "Printer issue"
        })
      })
    );
    expect(auditLogs.create).toHaveBeenCalledWith(expect.objectContaining({ action: "ticket.created" }));
  });

  it("creates inbound email tickets linked to the requester and client resolved from sender domain", async () => {
    const ticket = {
      id: "ticket-1",
      ticketNumber: "AIT-100001",
      clientId: "client-1",
      contactId: "contact-1"
    };
    const message = {
      id: "message-1",
      ticketId: "ticket-1"
    };
    const tx = {
      ticketSequence: {
        upsert: jest.fn().mockResolvedValue({ prefix: "AIT", currentValue: 100001 })
      },
      ticket: {
        create: jest.fn().mockResolvedValue(ticket)
      },
      ticketMessage: {
        create: jest.fn().mockResolvedValue(message)
      }
    };
    const prisma = {
      $transaction: jest.fn((callback: (txClient: typeof tx) => unknown) => callback(tx))
    };
    const auditLogs = { create: jest.fn() };
    const sanitizer = { sanitize: jest.fn((value: string) => value.replace("<script>", "").replace("</script>", "")) };
    const contactsService = {
      resolveRequesterFromEmail: jest.fn().mockResolvedValue({
        client: { id: "client-1", name: "City of Harvey" },
        contact: { id: "contact-1", email: "jane@cityofharveyil.gov" },
        domain: "cityofharveyil.gov",
        created: false
      })
    };
    const routing = { applyInboundRules: jest.fn().mockResolvedValue(null) };
    const mailDelivery = { sendTicketReply: jest.fn() };
    const notifications = { notifyUser: jest.fn(), notifyNewTicketCreated: jest.fn() };
    const autoReplies = { sendForNewInboundTicket: jest.fn().mockResolvedValue({ sent: false, reason: "no_template" }) };
    const service = new TicketsService(
      prisma as never,
      auditLogs as never,
      sanitizer as never,
      contactsService as never,
      routing as never,
      mailDelivery as never,
      notifications as never,
      autoReplies as never
    );

    await expect(
      service.createFromInboundEmail({
        organizationId: "org-1",
        senderEmail: "jane@cityofharveyil.gov",
        senderName: "Jane Mayor",
        subject: "Need workstation help",
        bodyText: "Please help",
        bodyHtml: "<p>Please help</p><script>bad()</script>",
        emailInternetMessageId: "<message@example.org>"
      })
    ).resolves.toEqual({ ticket, message });

    expect(contactsService.resolveRequesterFromEmail).toHaveBeenCalledWith({
      emailAddress: "jane@cityofharveyil.gov",
      displayName: "Jane Mayor",
      organizationId: "org-1"
    });
    expect(tx.ticket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticketNumber: "AIT-100001",
        clientId: "client-1",
        contactId: "contact-1",
        source: "EMAIL"
      })
    });
    expect(tx.ticketMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticketId: "ticket-1",
        authorContactId: "contact-1",
        direction: "INBOUND",
        visibility: "PUBLIC",
        sanitizedBodyHtml: "<p>Please help</p>bad()",
        emailInternetMessageId: "<message@example.org>"
      })
    });
    expect(auditLogs.create).toHaveBeenCalledWith(expect.objectContaining({ action: "ticket.created_from_inbound_email" }));
    expect(autoReplies.sendForNewInboundTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        ticketId: "ticket-1",
        messageId: "message-1",
        senderEmail: "jane@cityofharveyil.gov"
      })
    );
  });

  it("adds inbound customer replies to the existing thread and reopens closed tickets", async () => {
    const existingTicket = {
      id: "ticket-1",
      ticketNumber: "AIT-100001",
      status: "CLOSED",
      clientId: null,
      contactId: null
    };
    const updatedTicket = {
      ...existingTicket,
      status: "REOPENED",
      clientId: "client-1",
      contactId: "contact-1"
    };
    const message = {
      id: "message-2",
      ticketId: "ticket-1"
    };
    const tx = {
      ticket: {
        update: jest.fn().mockResolvedValue(updatedTicket)
      },
      ticketMessage: {
        create: jest.fn().mockResolvedValue(message)
      }
    };
    const prisma = {
      ticket: {
        findFirst: jest.fn().mockResolvedValue(existingTicket)
      },
      ticketMessage: {
        count: jest.fn().mockResolvedValue(0)
      },
      $transaction: jest.fn((callback: (txClient: typeof tx) => unknown) => callback(tx))
    };
    const auditLogs = { create: jest.fn() };
    const sanitizer = { sanitize: jest.fn((value: string) => value) };
    const contactsService = {
      resolveRequesterFromEmail: jest.fn().mockResolvedValue({
        client: { id: "client-1", name: "City of Harvey" },
        contact: { id: "contact-1", email: "jane@cityofharveyil.gov" },
        domain: "cityofharveyil.gov",
        created: false
      })
    };
    const routing = { applyInboundRules: jest.fn() };
    const mailDelivery = { sendTicketReply: jest.fn() };
    const notifications = { notifyUser: jest.fn(), notifyNewTicketCreated: jest.fn() };
    const autoReplies = { sendForNewInboundTicket: jest.fn() };
    const service = new TicketsService(
      prisma as never,
      auditLogs as never,
      sanitizer as never,
      contactsService as never,
      routing as never,
      mailDelivery as never,
      notifications as never,
      autoReplies as never
    );

    await expect(
      service.createFromInboundEmail({
        organizationId: "org-1",
        senderEmail: "jane@cityofharveyil.gov",
        senderName: "Jane Mayor",
        subject: "Re: Need workstation help",
        bodyText: "This is still happening",
        emailMessageId: "graph-message-2",
        emailInternetMessageId: "<message-2@example.org>",
        emailConversationId: "conversation-1",
        inReplyTo: "<message-1@example.org>"
      })
    ).resolves.toEqual({ ticket: updatedTicket, message });

    expect(prisma.ticket.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
          deletedAt: null,
          OR: expect.any(Array)
        })
      })
    );
    expect(tx.ticket.update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: expect.objectContaining({
        clientId: "client-1",
        contactId: "contact-1",
        status: "REOPENED",
        closedAt: null,
        resolvedAt: null
      })
    });
    expect(tx.ticketMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticketId: "ticket-1",
        direction: "INBOUND",
        inReplyTo: "<message-1@example.org>"
      })
    });
    expect(routing.applyInboundRules).not.toHaveBeenCalled();
    expect(auditLogs.create).toHaveBeenCalledWith(expect.objectContaining({ action: "ticket.reopened_from_customer_reply" }));
  });

  it("marks existing tickets as waiting on technician when a customer replies after a public technician response", async () => {
    const existingTicket = {
      id: "ticket-1",
      ticketNumber: "AIT-100001",
      status: "WAITING_ON_CUSTOMER",
      clientId: "client-1",
      contactId: "contact-1"
    };
    const updatedTicket = {
      ...existingTicket,
      status: "WAITING_ON_TECHNICIAN"
    };
    const message = {
      id: "message-2",
      ticketId: "ticket-1"
    };
    const tx = {
      ticket: {
        update: jest.fn().mockResolvedValue(updatedTicket)
      },
      ticketMessage: {
        create: jest.fn().mockResolvedValue(message)
      }
    };
    const prisma = {
      ticket: {
        findFirst: jest.fn().mockResolvedValue(existingTicket)
      },
      ticketMessage: {
        count: jest.fn().mockResolvedValue(1)
      },
      $transaction: jest.fn((callback: (txClient: typeof tx) => unknown) => callback(tx))
    };
    const auditLogs = { create: jest.fn() };
    const sanitizer = { sanitize: jest.fn((value: string) => value) };
    const contactsService = {
      resolveRequesterFromEmail: jest.fn().mockResolvedValue({
        client: { id: "client-1", name: "City of Harvey" },
        contact: { id: "contact-1", email: "jane@cityofharveyil.gov" },
        domain: "cityofharveyil.gov",
        created: false
      })
    };
    const routing = { applyInboundRules: jest.fn() };
    const mailDelivery = { sendTicketReply: jest.fn() };
    const notifications = { notifyUser: jest.fn(), notifyNewTicketCreated: jest.fn() };
    const autoReplies = { sendForNewInboundTicket: jest.fn() };
    const service = new TicketsService(
      prisma as never,
      auditLogs as never,
      sanitizer as never,
      contactsService as never,
      routing as never,
      mailDelivery as never,
      notifications as never,
      autoReplies as never
    );

    await expect(
      service.createFromInboundEmail({
        organizationId: "org-1",
        senderEmail: "jane@cityofharveyil.gov",
        senderName: "Jane Mayor",
        subject: "Re: Need workstation help",
        bodyText: "I tried that and still need help",
        emailConversationId: "conversation-1",
        inReplyTo: "<message-1@example.org>"
      })
    ).resolves.toEqual({ ticket: updatedTicket, message });

    expect(prisma.ticketMessage.count).toHaveBeenCalledWith({
      where: {
        ticketId: "ticket-1",
        direction: "OUTBOUND",
        visibility: "PUBLIC"
      }
    });
    expect(tx.ticket.update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: expect.objectContaining({
        lastCustomerResponseAt: expect.any(Date),
        status: "WAITING_ON_TECHNICIAN"
      })
    });
  });

  it("marks public technician replies as waiting on customer when the ticket is not closed", async () => {
    const ticket = {
      id: "ticket-1",
      ticketNumber: "AIT-100001",
      status: "OPEN",
      subject: "Printer issue",
      mailboxId: null,
      firstResponseAt: null,
      assignedUserId: null,
      assignedTeamId: null,
      assignedGroupId: null
    };
    const message = { id: "message-1", ticketId: "ticket-1" };
    const prisma = {
      ticket: {
        findFirst: jest.fn().mockResolvedValue(ticket),
        update: jest.fn().mockResolvedValue({ ...ticket, status: "WAITING_ON_CUSTOMER" })
      },
      ticketMessage: {
        findFirst: jest.fn().mockResolvedValue({
          senderEmail: "customer@example.com",
          emailInternetMessageId: "<customer-message@example.com>",
          emailMessageId: "provider-message-1",
          emailReferences: null,
          emailConversationId: "conversation-1"
        }),
        create: jest.fn().mockResolvedValue(message)
      },
      ticketAttachment: {
        updateMany: jest.fn()
      },
      ticketAssignee: {
        findMany: jest.fn().mockResolvedValue([])
      }
    };
    const auditLogs = { create: jest.fn() };
    const sanitizer = { sanitize: jest.fn((value: string) => value) };
    const contactsService = { resolveRequesterFromEmail: jest.fn() };
    const routing = { applyInboundRules: jest.fn() };
    const mailDelivery = {
      sendTicketReply: jest.fn().mockResolvedValue({
        providerMessageId: "sent-message-1",
        internetMessageId: "<sent-message@example.com>",
        conversationId: "conversation-1"
      })
    };
    const notifications = { notifyUser: jest.fn(), notifyNewTicketCreated: jest.fn() };
    const autoReplies = { sendForNewInboundTicket: jest.fn() };
    const service = new TicketsService(
      prisma as never,
      auditLogs as never,
      sanitizer as never,
      contactsService as never,
      routing as never,
      mailDelivery as never,
      notifications as never,
      autoReplies as never
    );

    await expect(
      service.createMessage(
        "AIT-100001",
        {
          bodyText: "Please try restarting the printer.",
          bodyHtml: "<p>Please try restarting the printer.</p>",
          visibility: "public",
          action: "send"
        },
        {
          id: "user-1",
          organizationId: "org-1",
          email: "tech@example.com",
          firstName: "Tech",
          lastName: "User",
          forcePasswordChange: false,
          permissions: []
        }
      )
    ).resolves.toEqual(message);

    expect(prisma.ticket.update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: expect.objectContaining({
        status: "WAITING_ON_CUSTOMER",
        closedAt: null,
        resolvedAt: null,
        lastTechnicianResponseAt: expect.any(Date),
        firstResponseAt: expect.any(Date)
      })
    });
  });

  it("merges selected source tickets into a primary ticket", async () => {
    const user = {
      id: "user-1",
      organizationId: "org-1",
      email: "tech@example.com",
      firstName: "Tech",
      lastName: "User",
      forcePasswordChange: false,
      permissions: ["tickets.merge"]
    };
    const primaryTicket = {
      id: "primary-ticket",
      ticketNumber: "AIT-100001",
      subject: "Network issue",
      clientId: "client-1",
      status: "OPEN"
    };
    const sourceTickets = [
      {
        id: "source-ticket",
        ticketNumber: "AIT-100002",
        subject: "Related outage",
        clientId: "client-1",
        status: "NEW",
        mergedIntoTicketId: null
      }
    ];
    const tx = {
      ticketMerge: {
        create: jest.fn()
      },
      ticketWatcher: {
        findMany: jest.fn().mockResolvedValue([{ userId: "watcher-1", reason: "Assigned" }]),
        upsert: jest.fn()
      },
      ticketMessage: {
        updateMany: jest.fn(),
        create: jest.fn()
      },
      ticketAttachment: {
        updateMany: jest.fn()
      },
      ticket: {
        update: jest.fn()
      }
    };
    const prisma = {
      ticket: {
        findFirst: jest.fn().mockResolvedValue(primaryTicket),
        findMany: jest.fn().mockResolvedValue(sourceTickets)
      },
      $transaction: jest.fn((callback: (txClient: typeof tx) => unknown) => callback(tx))
    };
    const auditLogs = { create: jest.fn() };
    const sanitizer = { sanitize: jest.fn((value: string) => value) };
    const contactsService = { resolveRequesterFromEmail: jest.fn() };
    const routing = { applyInboundRules: jest.fn() };
    const mailDelivery = { sendTicketReply: jest.fn() };
    const notifications = { notifyUser: jest.fn(), notifyNewTicketCreated: jest.fn() };
    const autoReplies = { sendForNewInboundTicket: jest.fn() };
    const service = new TicketsService(
      prisma as never,
      auditLogs as never,
      sanitizer as never,
      contactsService as never,
      routing as never,
      mailDelivery as never,
      notifications as never,
      autoReplies as never
    );
    jest.spyOn(service, "getById").mockResolvedValue({ id: "primary-ticket" } as never);

    await expect(service.mergeTickets("primary-ticket", { sourceTicketIds: ["source-ticket"], reason: "Same outage" }, user)).resolves.toEqual({ id: "primary-ticket" });

    expect(tx.ticketMerge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-1",
        primaryTicketId: "primary-ticket",
        mergedTicketIds: ["source-ticket"],
        performedByUserId: "user-1",
        reason: "Same outage"
      })
    });
    expect(tx.ticketMessage.updateMany).toHaveBeenCalledWith({
      where: { ticketId: "source-ticket" },
      data: expect.objectContaining({
        ticketId: "primary-ticket",
        mergedFromTicketId: "source-ticket",
        mergedFromTicketNumber: "AIT-100002"
      })
    });
    expect(tx.ticketAttachment.updateMany).toHaveBeenCalledWith({
      where: { ticketId: "source-ticket" },
      data: { ticketId: "primary-ticket" }
    });
    expect(tx.ticket.update).toHaveBeenCalledWith({
      where: { id: "source-ticket" },
      data: expect.objectContaining({
        status: "MERGED",
        mergedIntoTicketId: "primary-ticket",
        mergedByUserId: "user-1",
        mergeReason: "Same outage"
      })
    });
    expect(auditLogs.create).toHaveBeenCalledWith(expect.objectContaining({ action: "ticket.merged" }));
  });

  it("rejects replies on tickets that were merged into another ticket", async () => {
    const prisma = {
      ticket: {
        findFirst: jest.fn().mockResolvedValue({
          id: "source-ticket",
          status: "MERGED"
        })
      }
    };
    const auditLogs = { create: jest.fn() };
    const sanitizer = { sanitize: jest.fn((value: string) => value) };
    const contactsService = { resolveRequesterFromEmail: jest.fn() };
    const routing = { applyInboundRules: jest.fn() };
    const mailDelivery = { sendTicketReply: jest.fn() };
    const notifications = { notifyUser: jest.fn(), notifyNewTicketCreated: jest.fn() };
    const autoReplies = { sendForNewInboundTicket: jest.fn() };
    const service = new TicketsService(
      prisma as never,
      auditLogs as never,
      sanitizer as never,
      contactsService as never,
      routing as never,
      mailDelivery as never,
      notifications as never,
      autoReplies as never
    );

    await expect(
      service.createMessage(
        "source-ticket",
        {
          bodyText: "Reply",
          visibility: "public"
        },
        {
          id: "user-1",
          organizationId: "org-1",
          email: "tech@example.com",
          firstName: "Tech",
          lastName: "User",
          forcePasswordChange: false,
          permissions: []
        }
      )
    ).rejects.toThrow("Reply from the primary ticket");
  });
});
