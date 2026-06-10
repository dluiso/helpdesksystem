import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { CreateEventServiceCommentDto } from "./dto/create-event-service-comment.dto";
import { CreateEventServiceMessageDto } from "./dto/create-event-service-message.dto";
import { CreateEventServiceTaskDto } from "./dto/create-event-service-task.dto";
import { CreatePublicEventServiceRequestDto } from "./dto/create-public-event-service-request.dto";
import { ListEventServiceRequestsDto } from "./dto/list-event-service-requests.dto";
import { SyncEventServiceTaskCalendarDto } from "./dto/sync-event-service-task-calendar.dto";
import { UpdateEventServiceCalendarSettingsDto } from "./dto/update-event-service-calendar-settings.dto";
import { UpdateEventServiceTurnstileDto } from "./dto/update-event-service-turnstile.dto";
import { UpdateEventServiceRequestDto } from "./dto/update-event-service-request.dto";
import { UpdateEventServiceTaskDto } from "./dto/update-event-service-task.dto";
import { UpdateMyEventServiceTaskDto } from "./dto/update-my-event-service-task.dto";
import { UpsertEventServiceFormFieldDto } from "./dto/upsert-event-service-form-field.dto";
import { UpsertEventServiceServiceDto } from "./dto/upsert-event-service-service.dto";
import { EventServicesService } from "./event-services.service";
import { BulkEventServiceRequestIdsDto } from "./dto/bulk-event-service-request-ids.dto";

@Controller()
export class EventServicesController {
  constructor(private readonly eventServices: EventServicesService) {}

  @Get("public/event-services/form")
  publicForm() {
    return this.eventServices.getPublicForm();
  }

  @Post("public/event-services/requests")
  createPublicRequest(@Body() body: CreatePublicEventServiceRequestDto, @Req() request: Request) {
    return this.eventServices.createPublicRequest(body, {
      ipAddress: request.ip,
      userAgent: request.get("user-agent") ?? undefined
    });
  }

  @Get("event-services")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.view")
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListEventServiceRequestsDto) {
    return this.eventServices.list(user, query);
  }

  @Get("event-services/recycle-bin")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.view")
  recycleBin(@CurrentUser() user: AuthenticatedUser) {
    return this.eventServices.listRecycleBin(user);
  }

  @Post("event-services/recycle-bin")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.update")
  moveToRecycleBin(@CurrentUser() user: AuthenticatedUser, @Body() body: BulkEventServiceRequestIdsDto) {
    return this.eventServices.moveToRecycleBin(user, body.requestIds);
  }

  @Post("event-services/recycle-bin/restore")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.update")
  restoreFromRecycleBin(@CurrentUser() user: AuthenticatedUser, @Body() body: BulkEventServiceRequestIdsDto) {
    return this.eventServices.restoreFromRecycleBin(user, body.requestIds);
  }

  @Get("event-services/my-tasks")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.view")
  myTasks(@CurrentUser() user: AuthenticatedUser) {
    return this.eventServices.listMyTasks(user);
  }

  @Patch("event-services/my-tasks/:taskId")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.view")
  updateMyTask(@Param("taskId") taskId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: UpdateMyEventServiceTaskDto) {
    return this.eventServices.updateMyTask(taskId, user, body);
  }

  @Get("event-services/services")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.view")
  listServices(@CurrentUser() user: AuthenticatedUser) {
    return this.eventServices.listServices(user);
  }

  @Get("event-services/config/turnstile")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.manage_forms")
  getTurnstileConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.eventServices.getTurnstileConfig(user);
  }

  @Patch("event-services/config/turnstile")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.manage_forms")
  updateTurnstileConfig(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateEventServiceTurnstileDto) {
    return this.eventServices.updateTurnstileConfig(user, body);
  }

  @Get("event-services/config/calendar")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.manage_forms")
  getCalendarConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.eventServices.getCalendarSettings(user);
  }

  @Patch("event-services/config/calendar")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.manage_forms")
  updateCalendarConfig(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateEventServiceCalendarSettingsDto) {
    return this.eventServices.updateCalendarSettings(user, body);
  }

  @Post("event-services/services")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.manage_forms")
  createService(@CurrentUser() user: AuthenticatedUser, @Body() body: UpsertEventServiceServiceDto) {
    return this.eventServices.createService(user, body);
  }

  @Patch("event-services/services/:serviceId")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.manage_forms")
  updateService(@Param("serviceId") serviceId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: UpsertEventServiceServiceDto) {
    return this.eventServices.updateService(serviceId, user, body);
  }

  @Get("event-services/form")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.manage_forms")
  form(@CurrentUser() user: AuthenticatedUser) {
    return this.eventServices.listFormFields(user);
  }

  @Post("event-services/form/fields")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.manage_forms")
  createFormField(@CurrentUser() user: AuthenticatedUser, @Body() body: UpsertEventServiceFormFieldDto) {
    return this.eventServices.createFormField(user, body);
  }

  @Patch("event-services/form/fields/:fieldId")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.manage_forms")
  updateFormField(@Param("fieldId") fieldId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: UpsertEventServiceFormFieldDto) {
    return this.eventServices.updateFormField(fieldId, user, body);
  }

  @Get("event-services/:requestId")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.view")
  get(@Param("requestId") requestId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.eventServices.get(requestId, user);
  }

  @Patch("event-services/:requestId")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.update")
  update(@Param("requestId") requestId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: UpdateEventServiceRequestDto) {
    return this.eventServices.update(requestId, user, body);
  }

  @Post("event-services/:requestId/tasks")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.update")
  createTask(@Param("requestId") requestId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: CreateEventServiceTaskDto) {
    return this.eventServices.createTask(requestId, user, body);
  }

  @Patch("event-services/:requestId/tasks/:taskId")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.update")
  updateTask(@Param("requestId") requestId: string, @Param("taskId") taskId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: UpdateEventServiceTaskDto) {
    return this.eventServices.updateTask(requestId, taskId, user, body);
  }

  @Post("event-services/:requestId/tasks/:taskId/calendar")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.update")
  syncTaskCalendar(@Param("requestId") requestId: string, @Param("taskId") taskId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: SyncEventServiceTaskCalendarDto) {
    return this.eventServices.syncTaskToCalendar(requestId, taskId, user, body);
  }

  @Post("event-services/:requestId/comments")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.update")
  addComment(@Param("requestId") requestId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: CreateEventServiceCommentDto) {
    return this.eventServices.addComment(requestId, user, body);
  }

  @Post("event-services/:requestId/messages")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.update")
  sendMessage(@Param("requestId") requestId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: CreateEventServiceMessageDto) {
    return this.eventServices.sendMessage(requestId, user, body);
  }
}
