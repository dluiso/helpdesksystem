import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ProjectDecisionStatus, ProjectMilestoneStatus, ProjectStatus } from "@prisma/client";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { AddProjectDependencyDto, AddProjectWorkItemDto, CreateProjectDecisionDto, CreateProjectDto, CreateProjectMilestoneDto, UpdateProjectDecisionDto, UpdateProjectDto, UpdateProjectMilestoneDto } from "./dto/project.dto";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService
  ) {}

  async list(user: AuthenticatedUser) {
    const [items, clients, assignableUsers] = await Promise.all([
      this.prisma.project.findMany({
        where: { organizationId: user.organizationId, deletedAt: null },
        include: this.projectInclude(),
        orderBy: [{ status: "asc" }, { targetDate: "asc" }, { updatedAt: "desc" }],
        take: 100
      }),
      user.permissions.includes("clients.view")
        ? this.prisma.client.findMany({ where: { organizationId: user.organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 250 })
        : Promise.resolve([]),
      user.permissions.includes("projects.update")
        ? this.prisma.user.findMany({ where: { organizationId: user.organizationId, isActive: true, deletedAt: null }, select: { id: true, firstName: true, lastName: true }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }], take: 250 })
        : Promise.resolve([])
    ]);

    return {
      items,
      clients,
      assignableUsers,
      capabilities: {
        create: user.permissions.includes("projects.create"),
        update: user.permissions.includes("projects.update"),
        delete: user.permissions.includes("projects.delete")
      }
    };
  }

  async get(projectId: string, user: AuthenticatedUser) {
    return this.ensureProject(projectId, user);
  }

  async create(input: CreateProjectDto, user: AuthenticatedUser) {
    const clientId = await this.resolveClientId(input.clientId, user.organizationId);
    const ownerId = input.ownerId === undefined ? user.id : await this.resolveAssignableUserId(input.ownerId, user.organizationId);
    const project = await this.prisma.project.create({
      data: {
        organizationId: user.organizationId,
        clientId,
        ownerId,
        name: input.name.trim(),
        description: this.optionalTrim(input.description),
        status: input.status,
        health: input.health,
        startAt: this.parseDate(input.startAt),
        targetDate: this.parseDate(input.targetDate)
      },
      include: this.projectInclude()
    });
    await this.auditLogs.create({
      organizationId: user.organizationId,
      userId: user.id,
      entityType: "Project",
      entityId: project.id,
      action: "project.created",
      metadata: { name: project.name, clientId: project.clientId, ownerId: project.ownerId, status: project.status }
    });
    return project;
  }

  async update(projectId: string, input: UpdateProjectDto, user: AuthenticatedUser) {
    const existing = await this.ensureProject(projectId, user);
    const clientId = input.clientId === undefined ? undefined : await this.resolveClientId(input.clientId, user.organizationId);
    const ownerId = input.ownerId === undefined ? undefined : await this.resolveAssignableUserId(input.ownerId, user.organizationId);
    const project = await this.prisma.project.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: this.optionalTrim(input.description) } : {}),
        ...(clientId !== undefined ? { clientId } : {}),
        ...(ownerId !== undefined ? { ownerId } : {}),
        ...(input.status !== undefined ? { status: input.status, completedAt: input.status === ProjectStatus.COMPLETED ? new Date() : null } : {}),
        ...(input.health !== undefined ? { health: input.health } : {}),
        ...(input.startAt !== undefined ? { startAt: this.parseDate(input.startAt) } : {}),
        ...(input.targetDate !== undefined ? { targetDate: this.parseDate(input.targetDate) } : {})
      },
      include: this.projectInclude()
    });
    await this.auditLogs.create({
      organizationId: user.organizationId,
      userId: user.id,
      entityType: "Project",
      entityId: project.id,
      action: "project.updated",
      metadata: { status: input.status, health: input.health, targetDate: input.targetDate, clientId: project.clientId, ownerId: project.ownerId }
    });
    return project;
  }

  async remove(projectId: string, user: AuthenticatedUser) {
    const project = await this.ensureProject(projectId, user);
    await this.prisma.project.update({ where: { id: project.id }, data: { deletedAt: new Date() } });
    await this.auditLogs.create({ organizationId: user.organizationId, userId: user.id, entityType: "Project", entityId: project.id, action: "project.deleted", metadata: { name: project.name } });
    return { deleted: true };
  }

  async createMilestone(projectId: string, input: CreateProjectMilestoneDto, user: AuthenticatedUser) {
    await this.ensureProject(projectId, user);
    const assignedUserId = await this.resolveAssignableUserId(input.assignedUserId, user.organizationId);
    const milestone = await this.prisma.projectMilestone.create({
      data: {
        projectId,
        title: input.title.trim(),
        description: this.optionalTrim(input.description),
        status: input.status,
        dueAt: this.parseDate(input.dueAt),
        assignedUserId,
        completedAt: input.status === ProjectMilestoneStatus.COMPLETED ? new Date() : null
      }
    });
    await this.auditLogs.create({ organizationId: user.organizationId, userId: user.id, entityType: "ProjectMilestone", entityId: milestone.id, action: "project.milestone_created", metadata: { projectId, title: milestone.title, assignedUserId: milestone.assignedUserId } });
    return milestone;
  }

  async updateMilestone(projectId: string, milestoneId: string, input: UpdateProjectMilestoneDto, user: AuthenticatedUser) {
    await this.ensureProject(projectId, user);
    const milestone = await this.prisma.projectMilestone.findFirst({ where: { id: milestoneId, projectId } });
    if (!milestone) throw new NotFoundException("Project milestone was not found.");
    const assignedUserId = input.assignedUserId === undefined ? undefined : await this.resolveAssignableUserId(input.assignedUserId, user.organizationId);
    const updated = await this.prisma.projectMilestone.update({
      where: { id: milestone.id },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined ? { description: this.optionalTrim(input.description) } : {}),
        ...(input.status !== undefined ? { status: input.status, completedAt: input.status === ProjectMilestoneStatus.COMPLETED ? new Date() : null } : {}),
        ...(input.dueAt !== undefined ? { dueAt: this.parseDate(input.dueAt) } : {}),
        ...(assignedUserId !== undefined ? { assignedUserId } : {})
      }
    });
    await this.auditLogs.create({ organizationId: user.organizationId, userId: user.id, entityType: "ProjectMilestone", entityId: updated.id, action: "project.milestone_updated", metadata: { projectId, status: input.status, assignedUserId: updated.assignedUserId } });
    return updated;
  }

  async removeMilestone(projectId: string, milestoneId: string, user: AuthenticatedUser) {
    await this.ensureProject(projectId, user);
    const milestone = await this.prisma.projectMilestone.findFirst({ where: { id: milestoneId, projectId } });
    if (!milestone) throw new NotFoundException("Project milestone was not found.");
    await this.prisma.projectMilestone.delete({ where: { id: milestone.id } });
    await this.auditLogs.create({ organizationId: user.organizationId, userId: user.id, entityType: "ProjectMilestone", entityId: milestone.id, action: "project.milestone_deleted", metadata: { projectId, title: milestone.title } });
    return { deleted: true };
  }

  async createDecision(projectId: string, input: CreateProjectDecisionDto, user: AuthenticatedUser) {
    await this.ensureProject(projectId, user);
    if (this.isClosedDecision(input.status)) throw new BadRequestException("A project decision cannot be created in a closed state.");
    const ownerId = await this.resolveAssignableUserId(input.ownerId, user.organizationId);
    const decision = await this.prisma.projectDecision.create({
      data: {
        projectId,
        ownerId,
        title: input.title.trim(),
        description: this.optionalTrim(input.description),
        status: input.status,
        dueAt: this.parseDate(input.dueAt),
        resolvedAt: this.isClosedDecision(input.status) ? new Date() : null
      }
    });
    await this.auditLogs.create({ organizationId: user.organizationId, userId: user.id, entityType: "ProjectDecision", entityId: decision.id, action: "project.decision_created", metadata: { projectId, title: decision.title, status: decision.status, ownerId: decision.ownerId } });
    return decision;
  }

  async updateDecision(projectId: string, decisionId: string, input: UpdateProjectDecisionDto, user: AuthenticatedUser) {
    await this.ensureProject(projectId, user);
    const decision = await this.prisma.projectDecision.findFirst({ where: { id: decisionId, projectId } });
    if (!decision) throw new NotFoundException("Project decision was not found.");
    if (input.status !== undefined && this.isClosedDecision(input.status) && !this.optionalTrim(input.resolution ?? decision.resolution)) {
      throw new BadRequestException("A resolution note is required before closing a project decision.");
    }
    const ownerId = input.ownerId === undefined ? undefined : await this.resolveAssignableUserId(input.ownerId, user.organizationId);
    const updated = await this.prisma.projectDecision.update({
      where: { id: decision.id },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined ? { description: this.optionalTrim(input.description) } : {}),
        ...(input.resolution !== undefined ? { resolution: this.optionalTrim(input.resolution) } : {}),
        ...(input.dueAt !== undefined ? { dueAt: this.parseDate(input.dueAt) } : {}),
        ...(ownerId !== undefined ? { ownerId } : {}),
        ...(input.status !== undefined ? { status: input.status, resolvedAt: this.isClosedDecision(input.status) ? new Date() : null } : {})
      }
    });
    await this.auditLogs.create({ organizationId: user.organizationId, userId: user.id, entityType: "ProjectDecision", entityId: updated.id, action: "project.decision_updated", metadata: { projectId, status: input.status, ownerId: updated.ownerId, resolved: this.isClosedDecision(updated.status) } });
    return updated;
  }

  async addWorkItem(projectId: string, input: AddProjectWorkItemDto, user: AuthenticatedUser) {
    await this.ensureProject(projectId, user);
    const reference = input.reference.trim();
    const isUuid = uuidPattern.test(reference);
    let data: Prisma.ProjectWorkItemUncheckedCreateInput;
    let metadata: Record<string, string>;

    if (input.sourceType === "TICKET") {
      const ticket = await this.prisma.ticket.findFirst({
        where: { organizationId: user.organizationId, deletedAt: null, OR: [{ ticketNumber: reference }, ...(isUuid ? [{ id: reference }] : [])] },
        select: { id: true, ticketNumber: true }
      });
      if (!ticket) throw new NotFoundException("Ticket was not found.");
      data = { projectId, ticketId: ticket.id };
      metadata = { sourceType: input.sourceType, reference: ticket.ticketNumber };
    } else {
      const request = await this.prisma.eventServiceRequest.findFirst({
        where: { organizationId: user.organizationId, deletedAt: null, OR: [{ trackingNumber: reference }, ...(isUuid ? [{ id: reference }] : [])] },
        select: { id: true, trackingNumber: true }
      });
      if (!request) throw new NotFoundException("Event service request was not found.");
      data = { projectId, eventServiceRequestId: request.id };
      metadata = { sourceType: input.sourceType, reference: request.trackingNumber };
    }

    try {
      const workItem = await this.prisma.projectWorkItem.create({ data, include: this.workItemInclude() });
      await this.auditLogs.create({ organizationId: user.organizationId, userId: user.id, entityType: "ProjectWorkItem", entityId: workItem.id, action: "project.work_item_added", metadata: { projectId, ...metadata } });
      return workItem;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("This work item is already linked to the project.");
      throw error;
    }
  }

  async removeWorkItem(projectId: string, workItemId: string, user: AuthenticatedUser) {
    await this.ensureProject(projectId, user);
    const workItem = await this.prisma.projectWorkItem.findFirst({ where: { id: workItemId, projectId } });
    if (!workItem) throw new NotFoundException("Project work item was not found.");
    await this.prisma.projectWorkItem.delete({ where: { id: workItem.id } });
    await this.auditLogs.create({ organizationId: user.organizationId, userId: user.id, entityType: "ProjectWorkItem", entityId: workItem.id, action: "project.work_item_removed", metadata: { projectId } });
    return { deleted: true };
  }

  async addDependency(projectId: string, input: AddProjectDependencyDto, user: AuthenticatedUser) {
    await this.ensureProject(projectId, user);
    if (projectId === input.dependsOnProjectId) throw new BadRequestException("A project cannot depend on itself.");
    const prerequisite = await this.ensureProject(input.dependsOnProjectId, user);
    if (await this.hasDependencyPath(prerequisite.id, projectId)) {
      throw new BadRequestException("This dependency would create a project dependency cycle.");
    }

    try {
      const dependency = await this.prisma.projectDependency.create({
        data: { projectId, dependsOnProjectId: prerequisite.id },
        include: { dependsOnProject: { select: { id: true, name: true, status: true, health: true, targetDate: true, owner: { select: { id: true, firstName: true, lastName: true } } } } }
      });
      await this.auditLogs.create({ organizationId: user.organizationId, userId: user.id, entityType: "ProjectDependency", entityId: dependency.id, action: "project.dependency_added", metadata: { projectId, dependsOnProjectId: prerequisite.id } });
      return dependency;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("This project dependency already exists.");
      throw error;
    }
  }

  async removeDependency(projectId: string, dependencyId: string, user: AuthenticatedUser) {
    await this.ensureProject(projectId, user);
    const dependency = await this.prisma.projectDependency.findFirst({ where: { id: dependencyId, projectId } });
    if (!dependency) throw new NotFoundException("Project dependency was not found.");
    await this.prisma.projectDependency.delete({ where: { id: dependency.id } });
    await this.auditLogs.create({ organizationId: user.organizationId, userId: user.id, entityType: "ProjectDependency", entityId: dependency.id, action: "project.dependency_removed", metadata: { projectId, dependsOnProjectId: dependency.dependsOnProjectId } });
    return { deleted: true };
  }

  private async ensureProject(projectId: string, user: AuthenticatedUser) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, organizationId: user.organizationId, deletedAt: null }, include: this.projectInclude() });
    if (!project) throw new NotFoundException("Project was not found.");
    return project;
  }

  private async resolveClientId(clientId: string | null | undefined, organizationId: string) {
    if (clientId === undefined) return undefined;
    if (clientId === null || clientId === "") return null;
    const client = await this.prisma.client.findFirst({ where: { id: clientId, organizationId, deletedAt: null }, select: { id: true } });
    if (!client) throw new BadRequestException("Client was not found.");
    return client.id;
  }

  private async resolveAssignableUserId(userId: string | null | undefined, organizationId: string) {
    if (userId === undefined) return undefined;
    if (userId === null || userId === "") return null;
    const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId, isActive: true, deletedAt: null }, select: { id: true } });
    if (!user) throw new BadRequestException("Assigned user was not found or is inactive.");
    return user.id;
  }

  private async hasDependencyPath(startProjectId: string, targetProjectId: string) {
    const visited = new Set<string>();
    let frontier = [startProjectId];
    while (frontier.length) {
      const current = frontier.filter((id) => !visited.has(id));
      if (!current.length) return false;
      current.forEach((id) => visited.add(id));
      const dependencies = await this.prisma.projectDependency.findMany({ where: { projectId: { in: current } }, select: { dependsOnProjectId: true } });
      const next = dependencies.map((dependency) => dependency.dependsOnProjectId);
      if (next.includes(targetProjectId)) return true;
      frontier = next;
    }
    return false;
  }

  private optionalTrim(value: string | null | undefined) {
    if (value === undefined) return undefined;
    return value?.trim() || null;
  }

  private parseDate(value: string | null | undefined) {
    if (value === undefined) return undefined;
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException("Invalid date.");
    return parsed;
  }

  private isClosedDecision(status: ProjectDecisionStatus | undefined) {
    return status === ProjectDecisionStatus.RESOLVED || status === ProjectDecisionStatus.CANCELLED;
  }

  private projectInclude(): Prisma.ProjectInclude {
    return {
      client: { select: { id: true, name: true } },
      owner: { select: { id: true, firstName: true, lastName: true } },
      milestones: { include: { assignedUser: { select: { id: true, firstName: true, lastName: true } } }, orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }] },
      decisions: { include: { owner: { select: { id: true, firstName: true, lastName: true } } }, orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }] },
      workItems: { include: this.workItemInclude(), orderBy: { createdAt: "desc" } },
      dependencies: { include: { dependsOnProject: { select: { id: true, name: true, status: true, health: true, targetDate: true, owner: { select: { id: true, firstName: true, lastName: true } } } } }, orderBy: { createdAt: "asc" } }
    };
  }

  private workItemInclude(): Prisma.ProjectWorkItemInclude {
    return {
      ticket: { select: { id: true, ticketNumber: true, subject: true, status: true, priority: true } },
      eventServiceRequest: { select: { id: true, trackingNumber: true, eventName: true, status: true, priority: true, eventDate: true } }
    };
  }
}
