import { ProjectsService } from "./projects.service";

describe("ProjectsService", () => {
  it("links a ticket resolved within the current organization and audits the action", async () => {
    const prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: "project-1", name: "Migration project" }) },
      ticket: { findFirst: jest.fn().mockResolvedValue({ id: "ticket-1", ticketNumber: "AIT-100001" }) },
      projectWorkItem: { create: jest.fn().mockResolvedValue({ id: "work-1" }) }
    };
    const auditLogs = { create: jest.fn().mockResolvedValue(undefined) };
    const service = new ProjectsService(prisma as never, auditLogs as never);
    const user = { id: "user-1", organizationId: "org-1", email: "manager@example.com", firstName: "Project", lastName: "Manager", forcePasswordChange: false, permissions: ["projects.update"] };

    await expect(service.addWorkItem("project-1", { sourceType: "TICKET", reference: "AIT-100001" }, user)).resolves.toEqual({ id: "work-1" });

    expect(prisma.ticket.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: "org-1", deletedAt: null, OR: [{ ticketNumber: "AIT-100001" }] })
    }));
    expect(prisma.projectWorkItem.create).toHaveBeenCalledWith(expect.objectContaining({ data: { projectId: "project-1", ticketId: "ticket-1" } }));
    expect(auditLogs.create).toHaveBeenCalledWith(expect.objectContaining({ action: "project.work_item_added", entityId: "work-1" }));
  });

  it("rejects a dependency that would close a transitive cycle", async () => {
    const prisma = {
      project: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ id: "project-1", name: "Current project" })
          .mockResolvedValueOnce({ id: "project-2", name: "Prerequisite" })
      },
      projectDependency: {
        findMany: jest.fn().mockResolvedValue([{ dependsOnProjectId: "project-1" }]),
        create: jest.fn()
      }
    };
    const service = new ProjectsService(prisma as never, { create: jest.fn() } as never);
    const user = { id: "user-1", organizationId: "org-1", email: "manager@example.com", firstName: "Project", lastName: "Manager", forcePasswordChange: false, permissions: ["projects.update"] };

    await expect(service.addDependency("project-1", { dependsOnProjectId: "project-2" }, user)).rejects.toThrow("dependency cycle");
    expect(prisma.projectDependency.create).not.toHaveBeenCalled();
  });

  it("resolves project responsibility only to an active user in the organization", async () => {
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ id: "user-2" }) } };
    const service = new ProjectsService(prisma as never, { create: jest.fn() } as never);

    await expect((service as unknown as { resolveAssignableUserId(userId: string, organizationId: string): Promise<string | null | undefined> }).resolveAssignableUserId("user-2", "org-1")).resolves.toBe("user-2");

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: "user-2", organizationId: "org-1", isActive: true, deletedAt: null },
      select: { id: true }
    });
  });

  it("records a project decision with an assigned owner and audit trail", async () => {
    const prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: "project-1", name: "Migration project" }) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: "user-2" }) },
      projectDecision: { create: jest.fn().mockResolvedValue({ id: "decision-1", title: "Confirm rollout owner", status: "OPEN", ownerId: "user-2" }) }
    };
    const auditLogs = { create: jest.fn().mockResolvedValue(undefined) };
    const service = new ProjectsService(prisma as never, auditLogs as never);
    const user = { id: "user-1", organizationId: "org-1", email: "manager@example.com", firstName: "Project", lastName: "Manager", forcePasswordChange: false, permissions: ["projects.update"] };

    await expect(service.createDecision("project-1", { title: "Confirm rollout owner", ownerId: "user-2" }, user)).resolves.toEqual(expect.objectContaining({ id: "decision-1" }));

    expect(prisma.projectDecision.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ projectId: "project-1", ownerId: "user-2", title: "Confirm rollout owner" }) }));
    expect(auditLogs.create).toHaveBeenCalledWith(expect.objectContaining({ action: "project.decision_created", entityId: "decision-1" }));
  });

  it("requires a closure note before resolving a project decision", async () => {
    const prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: "project-1", name: "Migration project" }) },
      projectDecision: { findFirst: jest.fn().mockResolvedValue({ id: "decision-1", resolution: null }), update: jest.fn() }
    };
    const service = new ProjectsService(prisma as never, { create: jest.fn() } as never);
    const user = { id: "user-1", organizationId: "org-1", email: "manager@example.com", firstName: "Project", lastName: "Manager", forcePasswordChange: false, permissions: ["projects.update"] };

    await expect(service.updateDecision("project-1", "decision-1", { status: "RESOLVED" }, user)).rejects.toThrow("resolution note is required");
    expect(prisma.projectDecision.update).not.toHaveBeenCalled();
  });
});
