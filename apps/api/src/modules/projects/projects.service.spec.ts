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
});
