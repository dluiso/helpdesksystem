import { ClientsService } from "./clients.service";

const user = {
  id: "user-1",
  organizationId: "org-1",
  email: "admin@example.com",
  firstName: "Admin",
  lastName: "User",
  forcePasswordChange: false,
  permissions: []
};

describe("ClientsService", () => {
  it("creates clients inside the current user's organization", async () => {
    const tx = {
      clientDomain: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: "domain-1", domain: "example.org" })
      },
      client: {
        create: jest.fn().mockResolvedValue({ id: "client-1", name: "Example Co" })
      }
    };
    const prisma = {
      $transaction: jest.fn((callback: (txClient: typeof tx) => unknown) => callback(tx))
    };
    const auditLogs = { create: jest.fn() };
    const service = new ClientsService(prisma as never, auditLogs as never);

    await service.create({ name: " Example Co ", domains: [" Example.ORG "] }, user);

    expect(tx.client.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-1",
        name: "Example Co",
        status: "ACTIVE"
      })
    });
    expect(tx.clientDomain.upsert).toHaveBeenCalledWith({
      where: { domain: "example.org" },
      update: expect.objectContaining({ clientId: "client-1", isActive: true }),
      create: expect.objectContaining({ clientId: "client-1", domain: "example.org", isActive: true })
    });
    expect(auditLogs.create).toHaveBeenCalledWith(expect.objectContaining({ action: "client.created" }));
  });

  it("soft deletes clients and deactivates active domains", async () => {
    const prisma = {
      client: {
        findFirst: jest.fn().mockResolvedValue({ id: "client-1", organizationId: "org-1" }),
        update: jest.fn().mockResolvedValue({ id: "client-1", name: "Example Co" })
      }
    };
    const auditLogs = { create: jest.fn() };
    const service = new ClientsService(prisma as never, auditLogs as never);

    await service.softDelete("client-1", user);

    expect(prisma.client.update).toHaveBeenCalledWith({
      where: { id: "client-1" },
      data: expect.objectContaining({
        status: "INACTIVE",
        domains: {
          updateMany: {
            where: { isActive: true },
            data: { isActive: false }
          }
        }
      })
    });
  });
});
