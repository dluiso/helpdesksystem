import { ConflictException } from "@nestjs/common";
import { ContactsService } from "./contacts.service";

const user = {
  id: "user-1",
  organizationId: "org-1",
  email: "admin@example.com",
  firstName: "Admin",
  lastName: "User",
  forcePasswordChange: false,
  permissions: []
};

describe("ContactsService", () => {
  it("creates contacts with normalized email addresses", async () => {
    const prisma = {
      contact: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "contact-1", clientId: "client-1", email: "person@example.org" })
      }
    };
    const clientsService = { ensureClientExists: jest.fn().mockResolvedValue({ id: "client-1" }) };
    const clientDomainsService = { findClientMappingBySenderEmail: jest.fn() };
    const auditLogs = { create: jest.fn() };
    const service = new ContactsService(prisma as never, clientsService as never, clientDomainsService as never, auditLogs as never);

    await service.create(
      "client-1",
      {
        firstName: "Pat",
        lastName: "Smith",
        email: " Person@Example.ORG "
      },
      user
    );

    expect(prisma.contact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "person@example.org",
        isAuthorizedRequester: true
      })
    });
  });

  it("blocks duplicate active contact emails for the same client", async () => {
    const prisma = {
      contact: {
        findFirst: jest.fn().mockResolvedValue({ id: "contact-existing" })
      }
    };
    const clientsService = { ensureClientExists: jest.fn().mockResolvedValue({ id: "client-1" }) };
    const clientDomainsService = { findClientMappingBySenderEmail: jest.fn() };
    const auditLogs = { create: jest.fn() };
    const service = new ContactsService(prisma as never, clientsService as never, clientDomainsService as never, auditLogs as never);

    await expect(
      service.create(
        "client-1",
        {
          firstName: "Pat",
          lastName: "Smith",
          email: "person@example.org"
        },
        user
      )
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("resolves inbound requesters by sender domain and creates missing contacts", async () => {
    const client = { id: "client-1", name: "City of Harvey" };
    const prisma = {
      contact: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: "contact-1",
          clientId: "client-1",
          firstName: "Jane",
          lastName: "Mayor",
          email: "jane@cityofharveyil.gov"
        })
      }
    };
    const clientsService = { ensureClientExists: jest.fn() };
    const clientDomainsService = {
      findClientMappingBySenderEmail: jest.fn().mockResolvedValue({
        clientId: "client-1",
        domain: "cityofharveyil.gov",
        client
      })
    };
    const auditLogs = { create: jest.fn() };
    const service = new ContactsService(prisma as never, clientsService as never, clientDomainsService as never, auditLogs as never);

    await expect(
      service.resolveRequesterFromEmail({
        emailAddress: " Jane@CityOfHarveyIL.gov ",
        displayName: "Jane Mayor",
        organizationId: "org-1"
      })
    ).resolves.toEqual(
      expect.objectContaining({
        client,
        contact: expect.objectContaining({ id: "contact-1", email: "jane@cityofharveyil.gov" }),
        domain: "cityofharveyil.gov",
        created: true
      })
    );
    expect(clientDomainsService.findClientMappingBySenderEmail).toHaveBeenCalledWith("jane@cityofharveyil.gov", "org-1");
    expect(prisma.contact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: "client-1",
        firstName: "Jane",
        lastName: "Mayor",
        email: "jane@cityofharveyil.gov",
        isAuthorizedRequester: true
      })
    });
  });
});
