import { ClientDomainsService } from "./client-domains.service";
import { ConflictException } from "@nestjs/common";

describe("ClientDomainsService", () => {
  const clientsService = { ensureClientExists: jest.fn() };
  const auditLogs = { create: jest.fn() };

  it("extracts sender domains safely", () => {
    const service = new ClientDomainsService({} as never, clientsService as never, auditLogs as never);
    expect(service.extractDomain("Person@Example.ORG")).toBe("example.org");
    expect(service.extractDomain("invalid-address")).toBeNull();
  });

  it("does not map generic mailbox domains automatically", async () => {
    const prisma = {
      clientDomain: {
        findFirst: jest.fn()
      }
    };
    const service = new ClientDomainsService(prisma as never, clientsService as never, auditLogs as never);

    await expect(service.findClientBySenderEmail("person@gmail.com")).resolves.toBeNull();
    expect(prisma.clientDomain.findFirst).not.toHaveBeenCalled();
  });

  it("normalizes valid domains and rejects invalid values", () => {
    const service = new ClientDomainsService({} as never, clientsService as never, auditLogs as never);

    expect(service.normalizeDomain(" Example.ORG. ")).toBe("example.org");
    expect(() => service.normalizeDomain("https://example.org")).toThrow();
  });

  it("blocks domains already active for a client", async () => {
    const prisma = {
      clientDomain: {
        findUnique: jest.fn().mockResolvedValue({
          id: "domain-1",
          domain: "example.org",
          isActive: true,
          clientId: "client-2",
          client: { id: "client-2" }
        })
      }
    };
    const service = new ClientDomainsService(prisma as never, clientsService as never, auditLogs as never);

    await expect(service.create("client-1", { domain: "example.org" }, { organizationId: "org-1" } as never)).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it("associates unmapped domains and reassigns matching tickets", async () => {
    const prisma = {
      unmappedEmailDomain: {
        findFirst: jest.fn().mockResolvedValue({
          id: "unmapped-1",
          organizationId: "org-1",
          domain: "example.org"
        }),
        update: jest.fn().mockResolvedValue({ id: "unmapped-1", domain: "example.org", resolvedClientId: "client-1" })
      },
      clientDomain: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "domain-1", domain: "example.org", clientId: "client-1" })
      },
      ticket: {
        findMany: jest.fn().mockResolvedValue([{ id: "ticket-1", senderEmail: "person@example.org" }]),
        update: jest.fn()
      },
      contact: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "contact-1" })
      },
      ticketMessage: {
        updateMany: jest.fn()
      }
    };
    clientsService.ensureClientExists.mockResolvedValue({ id: "client-1" });
    const service = new ClientDomainsService(prisma as never, clientsService as never, auditLogs as never);

    await expect(service.associateUnmappedDomain("unmapped-1", "client-1", { id: "user-1", organizationId: "org-1" } as never)).resolves.toEqual(
      expect.objectContaining({ reassociatedTicketCount: 1 })
    );
    expect(prisma.clientDomain.create).toHaveBeenCalledWith({
      data: { clientId: "client-1", domain: "example.org", isActive: true, isVerified: false }
    });
    expect(prisma.ticket.update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: { clientId: "client-1", contactId: "contact-1" }
    });
  });
});
