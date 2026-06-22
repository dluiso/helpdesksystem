import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
  UseInterceptors,
  UploadedFile
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Request } from "express";
import { Response } from "express";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { CreateEventServiceCommentDto } from "./dto/create-event-service-comment.dto";
import { CreateEventServiceMessageDto } from "./dto/create-event-service-message.dto";
import { CreateEventServiceRequestDto } from "./dto/create-event-service-request.dto";
import { CreateEventServiceTaskDto } from "./dto/create-event-service-task.dto";
import { CreatePublicEventServiceRequestDto } from "./dto/create-public-event-service-request.dto";
import { ListEventServiceCalendarDto } from "./dto/list-event-service-calendar.dto";
import { ListEventServiceRequestsDto } from "./dto/list-event-service-requests.dto";
import { SyncEventServiceTaskCalendarDto } from "./dto/sync-event-service-task-calendar.dto";
import { UpdateEventServiceCalendarSettingsDto } from "./dto/update-event-service-calendar-settings.dto";
import { UpdateEventServicePortalSettingsDto } from "./dto/update-event-service-portal-settings.dto";
import { UpdateEventServiceTurnstileDto } from "./dto/update-event-service-turnstile.dto";
import { UpdateEventServiceRequestDto } from "./dto/update-event-service-request.dto";
import { UpdateEventServiceTaskDto } from "./dto/update-event-service-task.dto";
import { UpdateMyEventServiceTaskDto } from "./dto/update-my-event-service-task.dto";
import { UpsertEventServiceFormFieldDto } from "./dto/upsert-event-service-form-field.dto";
import { UpsertEventServiceServiceDto } from "./dto/upsert-event-service-service.dto";
import { EventServicesService } from "./event-services.service";
import { BulkEventServiceRequestIdsDto } from "./dto/bulk-event-service-request-ids.dto";
import { EventServicesAttachmentsService } from "./event-services-attachments.service";

const uploadLimitMb = Number(process.env.MAX_UPLOAD_SIZE_MB ?? 25);
const uploadLimitBytes = uploadLimitMb * 1024 * 1024;

@Controller()
export class EventServicesController {
  constructor(
    private readonly eventServices: EventServicesService,
    private readonly eventAttachments: EventServicesAttachmentsService
  ) {}

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

  @Post("event-services")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.update")
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateEventServiceRequestDto) {
    return this.eventServices.create(user, body);
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

  @Get("event-services/calendar")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.view")
  calendar(@CurrentUser() user: AuthenticatedUser, @Query() query: ListEventServiceCalendarDto) {
    return this.eventServices.listCalendar(user, query);
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

  @Get("event-services/config/portal")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.manage_forms")
  getPortalConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.eventServices.getPortalConfig(user);
  }

  @Patch("event-services/config/portal")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.manage_forms")
  updatePortalConfig(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateEventServicePortalSettingsDto) {
    return this.eventServices.updatePortalConfig(user, body);
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

  @Post("event-services/:requestId/attachments")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.update")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: uploadLimitBytes } }))
  uploadAttachment(
    @Param("requestId") requestId: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: { originalname: string; mimetype: string; size: number; buffer: Buffer }
  ) {
    if (!file) {
      throw new BadRequestException("Attachment file is required.");
    }
    return this.eventAttachments.uploadForRequest(requestId, user, file);
  }

  @Get("event-services/:requestId/attachments/:attachmentId/download")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.view")
  async downloadAttachment(
    @Param("requestId") requestId: string,
    @Param("attachmentId") attachmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.eventAttachments.getDownload(requestId, attachmentId, user, false);
    response.set({
      "Content-Type": result.attachment.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(result.attachment.originalFilename)}"`,
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Cache-Control": "private, no-store"
    });
    return new StreamableFile(result.stream);
  }

  @Get("event-services/:requestId/attachments/:attachmentId/preview")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.view")
  async previewAttachment(
    @Param("requestId") requestId: string,
    @Param("attachmentId") attachmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.eventAttachments.getDownload(requestId, attachmentId, user, true);
    response.set({
      "Content-Type": result.attachment.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(result.attachment.originalFilename)}"`,
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Cache-Control": "private, no-store"
    });
    return new StreamableFile(result.stream);
  }

  @Delete("event-services/:requestId/attachments/:attachmentId")
  @HttpCode(204)
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("event_services.update")
  async deleteAttachment(@Param("requestId") requestId: string, @Param("attachmentId") attachmentId: string, @CurrentUser() user: AuthenticatedUser) {
    await this.eventAttachments.softDelete(requestId, attachmentId, user);
  }
}
