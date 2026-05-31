import { Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTicketRoutingRuleDto } from "./dto/create-ticket-routing-rule.dto";
import { TicketRoutingService } from "./ticket-routing.service";

@Injectable()
export class TicketRoutingRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketRouting: TicketRoutingService
  ) {}

  list(user: AuthenticatedUser) {
    return this.prisma.ticketRoutingRule.findMany({
      where: { organizationId: user.organizationId },
      include: {
        assignUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignGroup: true,
        assignTeam: true,
        client: true
      },
      orderBy: [{ priority: "asc" }, { name: "asc" }]
    });
  }

  create(input: CreateTicketRoutingRuleDto, user: AuthenticatedUser) {
    return this.prisma.ticketRoutingRule.create({
      data: {
        organizationId: user.organizationId,
        name: input.name.trim(),
        description: this.optionalTrim(input.description),
        isActive: input.isActive ?? true,
        priority: input.priority ?? 100,
        conditionMatch: input.conditionMatch ?? "ANY",
        subjectContains: this.optionalTrim(input.subjectContains),
        bodyContains: this.optionalTrim(input.bodyContains),
        senderEmailContains: this.optionalTrim(input.senderEmailContains),
        senderDomain: this.optionalTrim(input.senderDomain)?.toLowerCase(),
        clientId: input.clientId,
        assignUserId: input.assignUserId,
        assignGroupId: input.assignGroupId,
        assignTeamId: input.assignTeamId,
        notifyUserIds: input.notifyUserIds ?? [],
        setPriority: input.setPriority
      }
    });
  }

  async update(ruleId: string, input: Partial<CreateTicketRoutingRuleDto>, user: AuthenticatedUser) {
    const existing = await this.prisma.ticketRoutingRule.findFirst({
      where: { id: ruleId, organizationId: user.organizationId }
    });

    if (!existing) {
      throw new NotFoundException("Ticket routing rule was not found.");
    }

    return this.prisma.ticketRoutingRule.update({
      where: { id: ruleId },
      data: {
        name: input.name?.trim(),
        description: input.description === undefined ? undefined : this.optionalTrim(input.description),
        isActive: input.isActive,
        priority: input.priority,
        conditionMatch: input.conditionMatch,
        subjectContains: input.subjectContains === undefined ? undefined : this.optionalTrim(input.subjectContains),
        bodyContains: input.bodyContains === undefined ? undefined : this.optionalTrim(input.bodyContains),
        senderEmailContains: input.senderEmailContains === undefined ? undefined : this.optionalTrim(input.senderEmailContains),
        senderDomain: input.senderDomain === undefined ? undefined : this.optionalTrim(input.senderDomain)?.toLowerCase(),
        clientId: input.clientId,
        assignUserId: input.assignUserId,
        assignGroupId: input.assignGroupId,
        assignTeamId: input.assignTeamId,
        notifyUserIds: input.notifyUserIds,
        setPriority: input.setPriority
      }
    });
  }

  applyToExistingTickets(user: AuthenticatedUser) {
    return this.ticketRouting.applyRulesToExistingTickets(user);
  }

  private optionalTrim(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }
}
