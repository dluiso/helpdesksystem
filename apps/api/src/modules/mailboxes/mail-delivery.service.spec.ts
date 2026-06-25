import { BadRequestException } from "@nestjs/common";
import { MailDeliveryService } from "./mail-delivery.service";

describe("MailDeliveryService", () => {
  it("rejects outbound replies when requested ticket attachments cannot be loaded", async () => {
    const prisma = {
      mailbox: {
        findFirst: jest.fn().mockResolvedValue({
          id: "mailbox-1",
          organizationId: "org-1",
          emailAddress: "support@example.com",
          publicEmailAddress: "support@example.com",
          outboundMode: "GRAPH_DIRECT",
          provider: "MICROSOFT365",
          connectionMode: "GRAPH_DIRECT"
        })
      },
      ticketAttachment: {
        findMany: jest.fn().mockResolvedValue([])
      }
    };
    const microsoftGraphMailProvider = { sendMessage: jest.fn() };
    const service = new MailDeliveryService(
      prisma as never,
      {} as never,
      { get: jest.fn() } as never,
      { sendMessage: jest.fn() } as never,
      microsoftGraphMailProvider as never
    );

    await expect(
      service.sendTicketReply({
        organizationId: "org-1",
        ticketId: "ticket-1",
        to: ["customer@example.com"],
        subject: "Re: Printer issue",
        bodyHtml: "<p>Attached.</p>",
        bodyText: "Attached.",
        attachmentIds: ["11111111-1111-4111-8111-111111111111"]
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.ticketAttachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ticketId: "ticket-1",
          ticketMessageId: null
        })
      })
    );
    expect(microsoftGraphMailProvider.sendMessage).not.toHaveBeenCalled();
  });
});
