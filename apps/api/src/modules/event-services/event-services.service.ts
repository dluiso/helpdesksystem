import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventServiceFieldType, EventServiceRequestStatus, EventServiceTaskStatus, Prisma, TicketPriority } from "@prisma/client";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { MailDeliveryService } from "../mailboxes/mail-delivery.service";
import { NotificationsService, NotificationEventType } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateEventServiceCommentDto } from "./dto/create-event-service-comment.dto";
import { CreateEventServiceTaskDto } from "./dto/create-event-service-task.dto";
import { CreatePublicEventServiceRequestDto } from "./dto/create-public-event-service-request.dto";
import { ListEventServiceRequestsDto } from "./dto/list-event-service-requests.dto";
import { UpdateEventServiceTurnstileDto } from "./dto/update-event-service-turnstile.dto";
import { UpdateEventServiceRequestDto } from "./dto/update-event-service-request.dto";
import { UpdateEventServiceTaskDto } from "./dto/update-event-service-task.dto";
import { UpdateMyEventServiceTaskDto } from "./dto/update-my-event-service-task.dto";
import { UpsertEventServiceFormFieldDto } from "./dto/upsert-event-service-form-field.dto";
import { UpsertEventServiceServiceDto } from "./dto/upsert-event-service-service.dto";

const TIME_PATTERN = /^([01]\d|2[0-3]):(00|15|30|45)$/;
const DEFAULT_EVENT_TURNSTILE_SECRET_REFERENCE = "env:EVENT_TURNSTILE_SECRET_KEY";

@Injectable()
export class EventServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mailDelivery: MailDeliveryService,
    private readonly auditLogs: AuditLogsService,
    private readonly notifications: NotificationsService
  ) {}

  async getPublicForm() {
    const organization = await this.getPublicOrganization();
    await this.ensureDefaultCatalog(organization.id);
    const [settings, services, form] = await Promise.all([
      this.prisma.systemSetting.findUnique({
        where: { organizationId: organization.id },
        select: { companyName: true, supportEmail: true, eventTurnstileEnabled: true, eventTurnstileSiteKey: true }
      }),
      this.prisma.eventServiceService.findMany({
        where: { organizationId: organization.id, isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
      }),
      this.getActiveForm(organization.id)
    ]);

    return {
      organization: {
        name: settings?.companyName ?? organization.name,
        supportEmail: settings?.supportEmail ?? "support@aviditytechnologies.com"
      },
      turnstileSiteKey: settings?.eventTurnstileEnabled ? settings.eventTurnstileSiteKey : null,
      services,
      form
    };
  }

  async createPublicRequest(input: CreatePublicEventServiceRequestDto, context: { ipAddress?: string; userAgent?: string }) {
    const organization = await this.getPublicOrganization();
    await this.ensureDefaultCatalog(organization.id);
    await this.verifyPublicTurnstile(organization.id, input.captchaToken, context.ipAddress);
    this.validateTimeRange(input.startTime, input.endTime);
    const activeForm = await this.getActiveForm(organization.id);
    this.validatePublicFormData(activeForm.fields, input);

    const services = await this.prisma.eventServiceService.findMany({
      where: { id: { in: [...new Set(input.serviceIds)] }, organizationId: organization.id, isActive: true }
    });
    if (!services.length) {
      throw new BadRequestException("Select at least one active service.");
    }

    const assignedTeamId = services.find((service) => service.defaultTeamId)?.defaultTeamId ?? null;
    const defaultUserIds = [...new Set(services.flatMap((service) => service.defaultUserIds))];
    const validUserIds = await this.validUserIds(organization.id, defaultUserIds);
    const trackingNumber = await this.nextTrackingNumber(organization.id);
    const clientMapping = await this.findClientMapping(input.requesterEmail, organization.id);

    const request = await this.prisma.eventServiceRequest.create({
      data: {
        organizationId: organization.id,
        trackingNumber,
        clientId: clientMapping.clientId,
        contactId: clientMapping.contactId,
        assignedTeamId,
        eventName: input.eventName.trim(),
        organizer: this.optionalTrim(input.organizer),
        venue: this.optionalTrim(input.venue),
        eventDate: input.eventDate ? new Date(input.eventDate) : null,
        startTime: this.optionalTrim(input.startTime),
        endTime: this.optionalTrim(input.endTime),
        requesterFirstName: input.requesterFirstName.trim(),
        requesterLastName: input.requesterLastName.trim(),
        requesterEmail: input.requesterEmail.trim().toLowerCase(),
        requesterPhone: this.optionalTrim(input.requesterPhone),
        status: validUserIds.length || assignedTeamId ? EventServiceRequestStatus.ASSIGNED : EventServiceRequestStatus.NEW,
        additionalInfo: this.optionalTrim(input.additionalInfo),
        formData: input.formData ? (input.formData as Prisma.InputJsonValue) : undefined,
        submittedFromIp: context.ipAddress,
        submittedUserAgent: context.userAgent,
        services: { create: services.map((service) => ({ serviceId: service.id })) },
        assignees: { create: validUserIds.map((userId) => ({ userId, role: "Auto-assigned" })) },
        activity: {
          create: {
            action: "event_service_request.created_public",
            metadata: { serviceIds: services.map((service) => service.id) }
          }
        }
      },
      include: this.requestInclude()
    });

    await Promise.all([
      this.notifyAssignedUsers(request.id, "New event request assigned", `${request.trackingNumber}: ${request.eventName}`, "eventAssignedToMe"),
      this.sendRequesterConfirmation(request).catch((error) =>
        this.logActivity(request.id, null, "event_service_request.confirmation_email_failed", {
          message: error instanceof Error ? error.message : "Unknown email error"
        })
      )
    ]);

    return { trackingNumber: request.trackingNumber, request };
  }

  async list(user: AuthenticatedUser, query: ListEventServiceRequestsDto) {
    const where: Prisma.EventServiceRequestWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null
    };
    if (query.status) {
      where.status = query.status as EventServiceRequestStatus;
    }
    if (query.assignedTeamId) {
      where.assignedTeamId = query.assignedTeamId;
    }
    if (query.assignedUserId) {
      where.assignees = { some: { userId: query.assignedUserId } };
    }
    if (query.serviceId) {
      where.services = { some: { serviceId: query.serviceId } };
    }
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { trackingNumber: { contains: search, mode: "insensitive" } },
        { eventName: { contains: search, mode: "insensitive" } },
        { requesterEmail: { contains: search, mode: "insensitive" } },
        { requesterFirstName: { contains: search, mode: "insensitive" } },
        { requesterLastName: { contains: search, mode: "insensitive" } },
        { venue: { contains: search, mode: "insensitive" } }
      ];
    }

    const sortBy = query.sortBy ?? "updatedAt";
    return this.prisma.eventServiceRequest.findMany({
      where,
      include: this.requestInclude(),
      orderBy: { [sortBy]: "desc" },
      take: 150
    });
  }

  async get(requestId: string, user: AuthenticatedUser) {
    const request = await this.prisma.eventServiceRequest.findFirst({
      where: { id: requestId, organizationId: user.organizationId, deletedAt: null },
      include: this.requestInclude(true)
    });
    if (!request) {
      throw new NotFoundException("Event service request was not found.");
    }
    return request;
  }

  async listMyTasks(user: AuthenticatedUser) {
    return this.prisma.eventServiceTask.findMany({
      where: {
        assignedUserId: user.id,
        request: {
          organizationId: user.organizationId,
          deletedAt: null
        }
      },
      include: {
        assignedUser: { select: this.userSelect() },
        request: {
          include: this.requestInclude()
        }
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 150
    });
  }

  async update(requestId: string, user: AuthenticatedUser, input: UpdateEventServiceRequestDto) {
    await this.get(requestId, user);
    const assignedUserIds = input.assignedUserIds === undefined ? null : await this.validUserIds(user.organizationId, input.assignedUserIds);
    if (input.assignedTeamId) {
      await this.ensureTeam(input.assignedTeamId, user.organizationId);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (assignedUserIds) {
        await tx.eventServiceAssignee.deleteMany({ where: { requestId } });
        if (assignedUserIds.length) {
          await tx.eventServiceAssignee.createMany({
            data: assignedUserIds.map((userId) => ({ requestId, userId })),
            skipDuplicates: true
          });
        }
      }

      return tx.eventServiceRequest.update({
        where: { id: requestId },
        data: {
          status: input.status,
          priority: input.priority,
          progressPercent: input.progressPercent,
          assignedTeamId: input.assignedTeamId === undefined ? undefined : input.assignedTeamId,
          additionalInfo: input.additionalInfo === undefined ? undefined : this.optionalTrim(input.additionalInfo),
          completedAt: input.status === EventServiceRequestStatus.COMPLETED ? new Date() : undefined,
          cancelledAt: input.status === EventServiceRequestStatus.CANCELLED ? new Date() : undefined
        },
        include: this.requestInclude(true)
      });
    });

    await this.logActivity(requestId, user.id, "event_service_request.updated", {
      status: input.status,
      priority: input.priority,
      progressPercent: input.progressPercent,
      assignedUserIds: assignedUserIds ?? undefined,
      assignedTeamId: input.assignedTeamId
    });
    await this.notifyAssignedUsers(requestId, "Event request updated", `${updated.trackingNumber}: ${updated.eventName}`, "eventRequestUpdated", user.id);

    return updated;
  }

  async listRecycleBin(user: AuthenticatedUser) {
    return this.prisma.eventServiceRequest.findMany({
      where: { organizationId: user.organizationId, deletedAt: { not: null } },
      include: this.requestInclude(),
      orderBy: { deletedAt: "desc" },
      take: 150
    });
  }

  async moveToRecycleBin(user: AuthenticatedUser, requestIds: string[]) {
    const ids = [...new Set(requestIds)];
    if (ids.length === 0) {
      return { deleted: 0 };
    }

    const result = await this.prisma.eventServiceRequest.updateMany({
      where: { id: { in: ids }, organizationId: user.organizationId, deletedAt: null },
      data: { deletedAt: new Date() }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "EventServiceRequest",
      entityId: null,
      action: "event_service_request.bulk_deleted",
      metadata: { requestIds: ids, deleted: result.count }
    });

    return { deleted: result.count };
  }

  async restoreFromRecycleBin(user: AuthenticatedUser, requestIds: string[]) {
    const ids = [...new Set(requestIds)];
    if (ids.length === 0) {
      return { restored: 0 };
    }

    const result = await this.prisma.eventServiceRequest.updateMany({
      where: { id: { in: ids }, organizationId: user.organizationId, deletedAt: { not: null } },
      data: { deletedAt: null }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "EventServiceRequest",
      entityId: null,
      action: "event_service_request.bulk_restored",
      metadata: { requestIds: ids, restored: result.count }
    });

    return { restored: result.count };
  }

  async createTask(requestId: string, user: AuthenticatedUser, input: CreateEventServiceTaskDto) {
    await this.get(requestId, user);
    if (input.assignedUserId) {
      await this.ensureUser(input.assignedUserId, user.organizationId);
    }
    const task = await this.prisma.eventServiceTask.create({
      data: {
        requestId,
        title: input.title.trim(),
        description: this.optionalTrim(input.description),
        assignedUserId: input.assignedUserId ?? null,
        progressPercent: input.progressPercent ?? 0
      },
      include: { assignedUser: { select: this.userSelect() } }
    });
    await this.logActivity(requestId, user.id, "event_service_task.created", { taskId: task.id, title: task.title });
    if (task.assignedUserId) {
      await this.notifyTaskAssignee(task.assignedUserId, requestId, task.id, "Event task assigned", task.title, "eventTaskAssignedToMe");
    }
    return task;
  }

  async updateTask(requestId: string, taskId: string, user: AuthenticatedUser, input: UpdateEventServiceTaskDto) {
    await this.get(requestId, user);
    if (input.assignedUserId) {
      await this.ensureUser(input.assignedUserId, user.organizationId);
    }
    const task = await this.prisma.eventServiceTask.update({
      where: { id: taskId },
      data: {
        title: input.title?.trim(),
        description: input.description === undefined ? undefined : this.optionalTrim(input.description),
        status: input.status,
        assignedUserId: input.assignedUserId === undefined ? undefined : input.assignedUserId,
        progressPercent: input.progressPercent
      },
      include: { assignedUser: { select: this.userSelect() } }
    });
    await this.recalculateProgress(requestId);
    await this.logActivity(requestId, user.id, "event_service_task.updated", { taskId, status: task.status, progressPercent: task.progressPercent });
    await this.notifyAssignedUsers(requestId, "Event task updated", `${task.title} is ${this.statusLabel(task.status)}`, "eventTaskUpdated", user.id, taskId);
    return task;
  }

  async updateMyTask(taskId: string, user: AuthenticatedUser, input: UpdateMyEventServiceTaskDto) {
    const task = await this.prisma.eventServiceTask.findFirst({
      where: {
        id: taskId,
        assignedUserId: user.id,
        request: { organizationId: user.organizationId, deletedAt: null }
      },
      select: { id: true, requestId: true, title: true }
    });
    if (!task) {
      throw new NotFoundException("Assigned event task was not found.");
    }

    const updated = await this.prisma.eventServiceTask.update({
      where: { id: taskId },
      data: {
        status: input.status,
        progressPercent: input.progressPercent
      },
      include: {
        assignedUser: { select: this.userSelect() },
        request: { include: this.requestInclude() }
      }
    });
    if (input.comment?.trim()) {
      await this.prisma.eventServiceComment.create({
        data: { requestId: task.requestId, userId: user.id, body: input.comment.trim() }
      });
    }
    await this.recalculateProgress(task.requestId);
    await this.logActivity(task.requestId, user.id, "event_service_task.self_updated", {
      taskId,
      status: input.status,
      progressPercent: input.progressPercent,
      commentAdded: Boolean(input.comment?.trim())
    });
    await this.notifyAssignedUsers(task.requestId, "Event task progress updated", `${task.title} was updated by ${user.email}`, "eventTaskUpdated", user.id, taskId);
    return updated;
  }

  async addComment(requestId: string, user: AuthenticatedUser, input: CreateEventServiceCommentDto) {
    await this.get(requestId, user);
    const comment = await this.prisma.eventServiceComment.create({
      data: { requestId, userId: user.id, body: input.body.trim() },
      include: { user: { select: this.userSelect() } }
    });
    await this.logActivity(requestId, user.id, "event_service_comment.created", { commentId: comment.id });
    await this.notifyAssignedUsers(requestId, "Event comment added", input.body.trim().slice(0, 240), "eventCommentAdded", user.id);
    return comment;
  }

  async listServices(user: AuthenticatedUser) {
    await this.ensureDefaultCatalog(user.organizationId);
    return this.prisma.eventServiceService.findMany({
      where: { organizationId: user.organizationId },
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }]
    });
  }

  async getTurnstileConfig(user: AuthenticatedUser) {
    const settings = await this.prisma.systemSetting.findUnique({
      where: { organizationId: user.organizationId },
      select: {
        eventTurnstileEnabled: true,
        eventTurnstileSiteKey: true,
        eventTurnstileSecretReference: true
      }
    });

    return {
      eventTurnstileEnabled: settings?.eventTurnstileEnabled ?? false,
      eventTurnstileSiteKey: settings?.eventTurnstileSiteKey ?? null,
      eventTurnstileSecretReference: settings?.eventTurnstileSecretReference ?? DEFAULT_EVENT_TURNSTILE_SECRET_REFERENCE
    };
  }

  async updateTurnstileConfig(user: AuthenticatedUser, input: UpdateEventServiceTurnstileDto) {
    const eventTurnstileSecretReference = this.eventTurnstileSecretReference(input.eventTurnstileSecretReference);
    if (input.eventTurnstileEnabled && !eventTurnstileSecretReference.startsWith("env:")) {
      throw new BadRequestException("Event Turnstile secret reference must use an environment reference such as env:EVENT_TURNSTILE_SECRET_KEY.");
    }

    const settings = await this.prisma.systemSetting.upsert({
      where: { organizationId: user.organizationId },
      create: {
        organizationId: user.organizationId,
        applicationName: this.config.get<string>("APP_NAME") ?? "Avidity IT Management Tool",
        companyName: this.config.get<string>("DEFAULT_COMPANY_NAME") ?? "Avidity Technologies",
        supportEmail: this.config.get<string>("DEFAULT_SUPPORT_EMAIL") ?? "support@aviditytechnologies.com",
        eventTurnstileEnabled: input.eventTurnstileEnabled,
        eventTurnstileSiteKey: this.optionalTrim(input.eventTurnstileSiteKey),
        eventTurnstileSecretReference
      },
      update: {
        eventTurnstileEnabled: input.eventTurnstileEnabled,
        eventTurnstileSiteKey: this.optionalTrim(input.eventTurnstileSiteKey),
        eventTurnstileSecretReference
      },
      select: {
        eventTurnstileEnabled: true,
        eventTurnstileSiteKey: true,
        eventTurnstileSecretReference: true
      }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "EventServiceConfig",
      entityId: user.organizationId,
      action: "event_service.turnstile_updated",
      metadata: { eventTurnstileEnabled: settings.eventTurnstileEnabled }
    });

    return settings;
  }

  async createService(user: AuthenticatedUser, input: UpsertEventServiceServiceDto) {
    const service = await this.prisma.eventServiceService.create({
      data: this.serviceCreateData(user.organizationId, input)
    });
    await this.auditLogs.create({ userId: user.id, entityType: "EventServiceService", entityId: service.id, action: "event_service.service_created", metadata: { name: service.name } });
    return service;
  }

  async updateService(serviceId: string, user: AuthenticatedUser, input: UpsertEventServiceServiceDto) {
    await this.ensureService(serviceId, user.organizationId);
    const service = await this.prisma.eventServiceService.update({
      where: { id: serviceId },
      data: this.serviceUpdateData(input)
    });
    await this.auditLogs.create({ userId: user.id, entityType: "EventServiceService", entityId: service.id, action: "event_service.service_updated", metadata: { name: service.name } });
    return service;
  }

  async listFormFields(user: AuthenticatedUser) {
    await this.ensureDefaultCatalog(user.organizationId);
    const form = await this.prisma.eventServiceForm.findFirst({
      where: { organizationId: user.organizationId, slug: "default" },
      include: { fields: { orderBy: [{ sortOrder: "asc" }, { label: "asc" }] } }
    });
    if (!form) {
      throw new NotFoundException("Event services form is not configured.");
    }
    return form;
  }

  async createFormField(user: AuthenticatedUser, input: UpsertEventServiceFormFieldDto) {
    const form = await this.getActiveForm(user.organizationId);
    return this.prisma.eventServiceFormField.create({
      data: { formId: form.id, ...this.formFieldData(input) }
    });
  }

  async updateFormField(fieldId: string, user: AuthenticatedUser, input: UpsertEventServiceFormFieldDto) {
    const form = await this.getActiveForm(user.organizationId);
    const field = await this.prisma.eventServiceFormField.findFirst({ where: { id: fieldId, formId: form.id } });
    if (!field) {
      throw new NotFoundException("Form field was not found.");
    }
    return this.prisma.eventServiceFormField.update({
      where: { id: fieldId },
      data: this.formFieldData(input)
    });
  }

  private requestInclude(includeDetail = false) {
    return {
      client: { select: { id: true, name: true, shortName: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      linkedTicket: { select: { id: true, ticketNumber: true, subject: true } },
      assignedTeam: { select: { id: true, name: true } },
      services: { include: { service: true }, orderBy: { service: { name: "asc" } } },
      assignees: { include: { user: { select: this.userSelect() } }, orderBy: { createdAt: "asc" } },
      tasks: { include: { assignedUser: { select: this.userSelect() } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      ...(includeDetail
        ? {
            comments: { include: { user: { select: this.userSelect() } }, orderBy: { createdAt: "desc" } },
            activity: { include: { user: { select: this.userSelect() } }, orderBy: { createdAt: "desc" }, take: 50 }
          }
        : {})
    } satisfies Prisma.EventServiceRequestInclude;
  }

  private userSelect() {
    return { id: true, firstName: true, lastName: true, email: true };
  }

  private async ensureDefaultCatalog(organizationId: string) {
    const serviceCount = await this.prisma.eventServiceService.count({ where: { organizationId } });
    if (serviceCount === 0) {
      await this.prisma.eventServiceService.createMany({
        data: [
          { organizationId, name: "Audio (Speakers & Microphone)", icon: "mic", description: "Audio setup, speakers, and microphones.", sortOrder: 10 },
          { organizationId, name: "Photography", icon: "camera", description: "Photography coverage for events.", sortOrder: 20 },
          { organizationId, name: "Videography", icon: "video", description: "Video recording and production support.", sortOrder: 30 }
        ],
        skipDuplicates: true
      });
    }

    let form = await this.prisma.eventServiceForm.findFirst({ where: { organizationId, slug: "default" } });
    if (!form) {
      form = await this.prisma.eventServiceForm.create({
        data: {
          organizationId,
          name: "Default Event Scheduling Request",
          slug: "default",
          introText: "Please ensure all fields are completed accurately so we can plan and provide the appropriate level of support for your event."
        }
      });
    }
    const fieldCount = await this.prisma.eventServiceFormField.count({ where: { formId: form.id } });
    if (fieldCount === 0) {
      await this.prisma.eventServiceFormField.createMany({
        data: [
          { formId: form.id, type: "TEXT", label: "Event Name", fieldKey: "eventName", isRequired: true, sortOrder: 10 },
          { formId: form.id, type: "TEXT", label: "Event Address and Venue Name", fieldKey: "venue", isRequired: true, sortOrder: 20 },
          { formId: form.id, type: "TEXT", label: "Organizer", fieldKey: "organizer", isRequired: true, sortOrder: 30 },
          { formId: form.id, type: "DATE", label: "Date", fieldKey: "eventDate", isRequired: true, sortOrder: 40 },
          { formId: form.id, type: "TEXTAREA", label: "Additional information", fieldKey: "additionalInfo", sortOrder: 50 }
        ]
      });
    }
  }

  private async getActiveForm(organizationId: string) {
    const form = await this.prisma.eventServiceForm.findFirst({
      where: { organizationId, slug: "default" },
      include: { fields: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } }
    });
    if (!form) {
      throw new NotFoundException("Event services form is not configured.");
    }
    return form;
  }

  private async getPublicOrganization() {
    const organization = await this.prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
    if (!organization) {
      throw new NotFoundException("Organization is not configured.");
    }
    return organization;
  }

  private async nextTrackingNumber(organizationId: string) {
    const key = `event-service:${organizationId}`;
    const sequence = await this.prisma.eventServiceSequence.upsert({
      where: { key },
      update: { currentValue: { increment: 1 } },
      create: { key, organizationId, prefix: "EVT", currentValue: 100001 }
    });
    return `${sequence.prefix}-${sequence.currentValue}`;
  }

  private async findClientMapping(email: string, organizationId: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const domain = normalizedEmail.split("@")[1] ?? "";
    const client = domain
      ? await this.prisma.client.findFirst({
          where: { organizationId, deletedAt: null, domains: { some: { domain, isActive: true } } },
          select: { id: true }
        })
      : null;
    if (!client) {
      return { clientId: null, contactId: null };
    }
    const contact = await this.prisma.contact.findFirst({
      where: { clientId: client.id, email: normalizedEmail, deletedAt: null },
      select: { id: true }
    });
    return { clientId: client.id, contactId: contact?.id ?? null };
  }

  private async verifyPublicTurnstile(organizationId: string, token: string | undefined, remoteIp?: string) {
    const settings = await this.prisma.systemSetting.findUnique({
      where: { organizationId },
      select: { eventTurnstileEnabled: true, eventTurnstileSecretReference: true, eventTurnstileSiteKey: true }
    });
    if (!settings?.eventTurnstileEnabled || !settings.eventTurnstileSiteKey) {
      return;
    }
    if (!token) {
      throw new UnauthorizedException("Security verification is required.");
    }
    const secret = this.resolveSecret(settings.eventTurnstileSecretReference ?? DEFAULT_EVENT_TURNSTILE_SECRET_REFERENCE);
    if (!secret) {
      throw new UnauthorizedException("Security verification is not configured.");
    }
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, ...(remoteIp ? { remoteip: remoteIp } : {}) })
    });
    const payload = (await response.json()) as { success?: boolean };
    if (!payload.success) {
      throw new UnauthorizedException("Security verification failed.");
    }
  }

  private resolveSecret(reference?: string | null) {
    if (!reference) return null;
    if (reference.startsWith("env:")) {
      return this.config.get<string>(reference.slice(4)) ?? null;
    }
    return null;
  }

  private eventTurnstileSecretReference(reference?: string | null) {
    return this.optionalTrim(reference) ?? DEFAULT_EVENT_TURNSTILE_SECRET_REFERENCE;
  }

  private validateTimeRange(startTime?: string, endTime?: string) {
    if (startTime && !TIME_PATTERN.test(startTime)) {
      throw new BadRequestException("Start time must use 15-minute intervals.");
    }
    if (endTime && !TIME_PATTERN.test(endTime)) {
      throw new BadRequestException("End time must use 15-minute intervals.");
    }
    if (startTime && endTime && startTime >= endTime) {
      throw new BadRequestException("End time must be later than start time.");
    }
  }

  private async validUserIds(organizationId: string, userIds: string[]) {
    const uniqueIds = [...new Set(userIds)];
    if (!uniqueIds.length) return [];
    const users = await this.prisma.user.findMany({
      where: { organizationId, id: { in: uniqueIds }, isActive: true, deletedAt: null },
      select: { id: true }
    });
    return users.map((user) => user.id);
  }

  private async ensureUser(userId: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId, isActive: true, deletedAt: null } });
    if (!user) throw new BadRequestException("Selected user was not found.");
  }

  private async ensureTeam(teamId: string, organizationId: string) {
    const team = await this.prisma.ticketTeam.findFirst({ where: { id: teamId, organizationId, isActive: true } });
    if (!team) throw new BadRequestException("Selected team was not found.");
  }

  private async ensureService(serviceId: string, organizationId: string) {
    const service = await this.prisma.eventServiceService.findFirst({ where: { id: serviceId, organizationId } });
    if (!service) throw new NotFoundException("Event service was not found.");
  }

  private serviceCreateData(organizationId: string, input: UpsertEventServiceServiceDto): Prisma.EventServiceServiceUncheckedCreateInput {
    return {
      organizationId,
      name: input.name.trim(),
      description: this.optionalTrim(input.description),
      icon: this.optionalTrim(input.icon),
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      defaultTeamId: input.defaultTeamId ?? null,
      defaultUserIds: input.defaultUserIds ?? []
    };
  }

  private serviceUpdateData(input: UpsertEventServiceServiceDto): Prisma.EventServiceServiceUncheckedUpdateInput {
    return {
      name: input.name.trim(),
      description: this.optionalTrim(input.description),
      icon: this.optionalTrim(input.icon),
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      defaultTeamId: input.defaultTeamId ?? null,
      defaultUserIds: input.defaultUserIds ?? []
    };
  }

  private formFieldData(input: UpsertEventServiceFormFieldDto) {
    const fieldKey = input.fieldKey.trim();
    const optionTypes: EventServiceFieldType[] = ["SELECT", "MULTI_SELECT", "CHECKBOX", "RADIO"];
    const options = input.options?.map((option) => option.trim()).filter(Boolean) ?? [];
    if (!/^[a-z][a-zA-Z0-9_]*$/.test(fieldKey)) {
      throw new BadRequestException("Field key must start with a lowercase letter and use only letters, numbers, or underscores.");
    }
    if (optionTypes.includes(input.type) && options.length === 0) {
      throw new BadRequestException("Selection fields require at least one option.");
    }
    return {
      type: input.type,
      label: input.label.trim(),
      fieldKey,
      placeholder: this.optionalTrim(input.placeholder),
      helpText: this.optionalTrim(input.helpText),
      isRequired: input.isRequired ?? false,
      options,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true
    };
  }

  private validatePublicFormData(fields: Array<{ fieldKey: string; label: string; isRequired: boolean; isActive: boolean }>, input: CreatePublicEventServiceRequestDto) {
    const fixedValues: Record<string, unknown> = {
      eventName: input.eventName,
      venue: input.venue,
      organizer: input.organizer,
      eventDate: input.eventDate,
      additionalInfo: input.additionalInfo
    };
    const data = (input.formData ?? {}) as Record<string, unknown>;
    for (const field of fields) {
      if (!field.isActive || !field.isRequired) continue;
      const value = Object.prototype.hasOwnProperty.call(fixedValues, field.fieldKey) ? fixedValues[field.fieldKey] : data[field.fieldKey];
      const missing = Array.isArray(value) ? value.length === 0 : value === undefined || value === null || String(value).trim() === "";
      if (missing) {
        throw new BadRequestException(`${field.label} is required.`);
      }
    }
  }

  private async recalculateProgress(requestId: string) {
    const tasks = await this.prisma.eventServiceTask.findMany({ where: { requestId }, select: { progressPercent: true } });
    if (!tasks.length) return;
    const progressPercent = Math.round(tasks.reduce((sum, task) => sum + task.progressPercent, 0) / tasks.length);
    await this.prisma.eventServiceRequest.update({ where: { id: requestId }, data: { progressPercent } });
  }

  private async notifyAssignedUsers(requestId: string, title: string, body: string, eventType: NotificationEventType, excludeUserId?: string, taskId?: string) {
    const assignees = await this.prisma.eventServiceAssignee.findMany({ where: { requestId }, select: { userId: true } });
    await Promise.all(
      assignees
        .map((assignee) => assignee.userId)
        .filter((userId) => userId !== excludeUserId)
        .map((userId) => this.notifyTaskAssignee(userId, requestId, taskId ?? null, title, body, eventType))
    );
  }

  private notifyTaskAssignee(userId: string, requestId: string, taskId: string | null, title: string, body: string, eventType: NotificationEventType) {
    return this.notifications.notifyUser({
      userId,
      title,
      body,
      eventType,
      eventServiceRequestId: requestId,
      eventServiceTaskId: taskId,
      metadata: {
        entityType: "EventServiceRequest",
        requestId,
        ...(taskId ? { taskId } : {})
      }
    });
  }

  private async sendRequesterConfirmation(request: { organizationId: string; trackingNumber: string; eventName: string; requesterEmail: string; requesterFirstName: string; eventDate: Date | null; startTime: string | null; endTime: string | null }) {
    const settings = await this.prisma.systemSetting.findUnique({
      where: { organizationId: request.organizationId },
      select: { applicationName: true, companyName: true, supportEmail: true }
    });
    const subject = `Event request received: ${request.trackingNumber}`;
    const bodyText = `Hello ${request.requesterFirstName},\n\nWe received your event request.\n\nTracking number: ${request.trackingNumber}\nEvent: ${request.eventName}\nDate: ${request.eventDate ? request.eventDate.toDateString() : "Not provided"}\nTime: ${request.startTime ?? "Not provided"} - ${request.endTime ?? "Not provided"}\n\nKeep this tracking number for follow-up.\n\n${settings?.companyName ?? "Avidity Technologies"}`;
    const bodyHtml = `<p>Hello ${this.escapeHtml(request.requesterFirstName)},</p><p>We received your event request.</p><p><strong>Tracking number:</strong> ${this.escapeHtml(request.trackingNumber)}<br/><strong>Event:</strong> ${this.escapeHtml(request.eventName)}<br/><strong>Date:</strong> ${request.eventDate ? this.escapeHtml(request.eventDate.toDateString()) : "Not provided"}<br/><strong>Time:</strong> ${this.escapeHtml(request.startTime ?? "Not provided")} - ${this.escapeHtml(request.endTime ?? "Not provided")}</p><p>Keep this tracking number for follow-up.</p><p>${this.escapeHtml(settings?.companyName ?? "Avidity Technologies")}</p>`;
    await this.mailDelivery.sendTicketReply({
      organizationId: request.organizationId,
      to: [request.requesterEmail],
      subject,
      bodyText,
      bodyHtml
    });
  }

  private logActivity(requestId: string, userId: string | null, action: string, metadata?: Prisma.InputJsonValue) {
    return this.prisma.eventServiceActivity.create({
      data: { requestId, userId, action, metadata }
    });
  }

  private statusLabel(status: EventServiceTaskStatus) {
    return status.toLowerCase().replace(/_/g, " ");
  }

  private optionalTrim(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
  }
}
