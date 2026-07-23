import { TicketStatus, TicketWorkflowTrigger } from "@prisma/client";
import { TicketWorkflowService } from "./ticket-workflow.service";

describe("TicketWorkflowService", () => {
  function createService() {
    const prisma = {
      ticketStatusDefinition: {
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn()
      },
      ticketWorkflowRule: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn(),
        updateMany: jest.fn()
      },
      ticket: {
        count: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn()
      },
      ticketMessage: {
        count: jest.fn()
      }
    };
    const auditLogs = { create: jest.fn().mockResolvedValue(undefined) };
    return {
      prisma,
      auditLogs,
      service: new TicketWorkflowService(prisma as never, auditLogs as never)
    };
  }

  it("applies a matching customer-reply rule to a completed ticket", async () => {
    const { prisma, auditLogs, service } = createService();
    const target = {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Reopened",
      systemStatus: TicketStatus.REOPENED
    };
    prisma.ticket.findFirst.mockResolvedValue({
      id: "ticket-1",
      status: TicketStatus.CLOSED,
      statusDefinitionId: "11111111-1111-4111-8111-111111111111",
      closedAt: new Date("2026-07-20T12:00:00.000Z")
    });
    prisma.ticketMessage.count.mockResolvedValue(2);
    prisma.ticketWorkflowRule.findMany.mockResolvedValue([
      {
        id: "rule-1",
        name: "Reopen completed ticket",
        trigger: TicketWorkflowTrigger.CUSTOMER_REPLIED,
        fromStatusIds: ["11111111-1111-4111-8111-111111111111"],
        targetStatusId: target.id,
        targetStatus: target,
        requirePriorPublicReply: null,
        reopenWindowDays: 30,
        stopProcessing: true
      }
    ]);
    jest.spyOn(service, "transitionTicket").mockResolvedValue({
      ticket: { id: "ticket-1" } as never,
      target: target as never,
      changed: true
    });

    const result = await service.applyRules({
      ticketId: "ticket-1",
      organizationId: "organization-1",
      trigger: TicketWorkflowTrigger.CUSTOMER_REPLIED,
      occurredAt: new Date("2026-07-23T12:00:00.000Z")
    });

    expect(result.appliedRuleIds).toEqual(["rule-1"]);
    expect(service.transitionTicket).toHaveBeenCalledWith(expect.objectContaining({
      ticketId: "ticket-1",
      statusDefinitionId: target.id
    }));
    expect(auditLogs.create).toHaveBeenCalledWith(expect.objectContaining({ action: "ticket.status_automated" }));
  });

  it("archives a status that is already referenced instead of deleting it", async () => {
    const { prisma, service } = createService();
    const existing = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Pending Vendor",
      isProtected: false,
      isDefault: false
    };
    prisma.ticketStatusDefinition.findFirst.mockResolvedValue(existing);
    prisma.ticket.count.mockResolvedValue(4);
    prisma.ticketWorkflowRule.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    prisma.ticketStatusDefinition.update.mockResolvedValue({
      ...existing,
      isActive: false,
      archivedAt: new Date(),
      _count: { tickets: 4, rulesAsTarget: 1 }
    });

    const result = await service.removeStatus(existing.id, {
      id: "user-1",
      organizationId: "organization-1"
    } as never);

    expect(result).toEqual(expect.objectContaining({ archived: true, deleted: false, isActive: false }));
    expect(prisma.ticketWorkflowRule.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { isActive: false }
    }));
  });
});
