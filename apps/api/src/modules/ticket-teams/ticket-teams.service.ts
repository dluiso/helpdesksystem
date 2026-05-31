import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTicketTeamDto } from "./dto/create-ticket-team.dto";
import { UpdateTicketTeamDto } from "./dto/update-ticket-team.dto";

@Injectable()
export class TicketTeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService
  ) {}

  list(user: AuthenticatedUser) {
    return this.prisma.ticketTeam.findMany({
      where: { organizationId: user.organizationId },
      include: {
        members: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } }
          },
          orderBy: { createdAt: "asc" }
        },
        _count: { select: { assignedTickets: true } }
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }]
    });
  }

  async create(user: AuthenticatedUser, input: CreateTicketTeamDto) {
    const memberIds = await this.validMemberIds(user.organizationId, input.memberIds ?? []);
    const team = await this.prisma.ticketTeam.create({
      data: {
        organizationId: user.organizationId,
        name: input.name.trim(),
        description: this.optionalTrim(input.description),
        isActive: input.isActive ?? true,
        members: { create: memberIds.map((userId) => ({ userId })) }
      },
      include: {
        members: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
        _count: { select: { assignedTickets: true } }
      }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "TicketTeam",
      entityId: team.id,
      action: "ticket_team.created",
      metadata: { name: team.name, memberIds }
    });

    return team;
  }

  async update(teamId: string, user: AuthenticatedUser, input: UpdateTicketTeamDto) {
    await this.ensureTeam(teamId, user);
    const memberIds = input.memberIds === undefined ? null : await this.validMemberIds(user.organizationId, input.memberIds);

    const team = await this.prisma.$transaction(async (tx) => {
      if (memberIds) {
        await tx.ticketTeamMember.deleteMany({ where: { ticketTeamId: teamId } });
        if (memberIds.length) {
          await tx.ticketTeamMember.createMany({
            data: memberIds.map((userId) => ({ ticketTeamId: teamId, userId })),
            skipDuplicates: true
          });
        }
      }

      return tx.ticketTeam.update({
        where: { id: teamId },
        data: {
          name: input.name?.trim(),
          description: input.description === undefined ? undefined : this.optionalTrim(input.description),
          isActive: input.isActive
        },
        include: {
          members: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
          _count: { select: { assignedTickets: true } }
        }
      });
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "TicketTeam",
      entityId: team.id,
      action: "ticket_team.updated",
      metadata: { name: team.name, memberIds: memberIds ?? undefined }
    });

    return team;
  }

  async deactivate(teamId: string, user: AuthenticatedUser) {
    await this.ensureTeam(teamId, user);
    const team = await this.prisma.ticketTeam.update({
      where: { id: teamId },
      data: { isActive: false }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "TicketTeam",
      entityId: team.id,
      action: "ticket_team.deactivated",
      metadata: { name: team.name }
    });

    return team;
  }

  private async ensureTeam(teamId: string, user: AuthenticatedUser) {
    const team = await this.prisma.ticketTeam.findFirst({ where: { id: teamId, organizationId: user.organizationId } });
    if (!team) {
      throw new NotFoundException("Ticket team was not found.");
    }
    return team;
  }

  private async validMemberIds(organizationId: string, memberIds: string[]) {
    const uniqueIds = [...new Set(memberIds)];
    if (uniqueIds.length === 0) {
      return [];
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds }, organizationId, deletedAt: null, isActive: true },
      select: { id: true }
    });
    return users.map((user) => user.id);
  }

  private optionalTrim(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }
}
