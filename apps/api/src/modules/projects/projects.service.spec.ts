import { ProjectsService } from "./projects.service";

describe("ProjectsService", () => {
  it("links a ticket resolved within the current organization and audits the action", async () => {
    const prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: "project-1", name: "Migration project" }) },
      ticket: { findFirst: jest.fn().mockResolvedValue({ id: "ticket-1", ticketNumber: "AIT-100001" }) },
      projectWorkItem: { create: jest.fn().mockResolvedValue({ id: "work-1" }) }
    };
    const auditLogs = { create: jest.fn().mockResolvedValue(undefined) };
    const service = new ProjectsService(prisma as never, auditLogs as never, {} as never);
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
    const service = new ProjectsService(prisma as never, { create: jest.fn() } as never, {} as never);
    const user = { id: "user-1", organizationId: "org-1", email: "manager@example.com", firstName: "Project", lastName: "Manager", forcePasswordChange: false, permissions: ["projects.update"] };

    await expect(service.addDependency("project-1", { dependsOnProjectId: "project-2" }, user)).rejects.toThrow("dependency cycle");
    expect(prisma.projectDependency.create).not.toHaveBeenCalled();
  });

  it("resolves project responsibility only to an active user in the organization", async () => {
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ id: "user-2" }) } };
    const service = new ProjectsService(prisma as never, { create: jest.fn() } as never, {} as never);

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
    const service = new ProjectsService(prisma as never, auditLogs as never, {} as never);
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
    const service = new ProjectsService(prisma as never, { create: jest.fn() } as never, {} as never);
    const user = { id: "user-1", organizationId: "org-1", email: "manager@example.com", firstName: "Project", lastName: "Manager", forcePasswordChange: false, permissions: ["projects.update"] };

    await expect(service.updateDecision("project-1", "decision-1", { status: "RESOLVED" }, user)).rejects.toThrow("resolution note is required");
    expect(prisma.projectDecision.update).not.toHaveBeenCalled();
  });

  it("alerts the decision owner once per active escalation reason", async () => {
    const prisma = {
      projectDecision: {
        findMany: jest.fn().mockResolvedValue([{
          id: "decision-1",
          title: "Confirm maintenance window",
          dueAt: new Date("2026-07-19T12:00:00.000Z"),
          owner: { id: "user-2", firstName: "Alex", lastName: "Example" },
          project: { id: "project-1", organizationId: "org-1", name: "Network rollout", health: "AT_RISK", owner: { id: "user-1", firstName: "Project", lastName: "Manager" } }
        }])
      },
      projectDecisionAlert: { create: jest.fn().mockResolvedValue({ id: "alert-1" }) },
      systemSetting: { findUnique: jest.fn().mockResolvedValue({ operationsDecisionEscalationUserIds: [] }) },
      user: { findMany: jest.fn().mockResolvedValue([]) }
    };
    const notifications = { notifyUser: jest.fn().mockResolvedValue(undefined) };
    const service = new ProjectsService(prisma as never, { create: jest.fn() } as never, notifications as never);

    await expect(service.runDecisionAlertScan(new Date("2026-07-20T12:00:00.000Z"))).resolves.toEqual({ scanned: 1, sent: 2 });

    expect(prisma.projectDecisionAlert.create).toHaveBeenCalledTimes(2);
    expect(notifications.notifyUser).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-2", eventType: "projectDecisionAlert", metadata: expect.objectContaining({ projectId: "project-1", decisionId: "decision-1" }) }));
  });

  it("sends one configured daily digest after the organization delivery time", async () => {
    const prisma = {
      systemSetting: {
        findMany: jest.fn().mockResolvedValue([{ organizationId: "org-1", defaultTimezone: "America/Chicago", operationsDecisionDailyDigestTime: "08:00" }]),
        findUnique: jest.fn().mockResolvedValue({ operationsDecisionEscalationUserIds: ["user-2"] })
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: "user-2" }]) },
      projectDecision: { findMany: jest.fn().mockResolvedValue([{ id: "decision-1", title: "Confirm maintenance window", dueAt: new Date("2026-07-19T12:00:00.000Z"), owner: null, project: { id: "project-1", name: "Network rollout", health: "AT_RISK" } }]) },
      projectDecisionDigest: { create: jest.fn().mockResolvedValue({ id: "digest-1" }) }
    };
    const notifications = { notifyUser: jest.fn().mockResolvedValue(undefined) };
    const service = new ProjectsService(prisma as never, { create: jest.fn() } as never, notifications as never);

    await expect(service.runDecisionDigestScan(new Date("2026-07-20T14:00:00.000Z"))).resolves.toEqual({ organizations: 1, sent: 1 });

    expect(prisma.projectDecisionDigest.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: "org-1", recipientUserId: "user-2" }) }));
    expect(notifications.notifyUser).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-2", eventType: "projectDecisionDigest", metadata: expect.objectContaining({ entityType: "ProjectDecisionDigest", href: "/operations" }) }));
  });
});
