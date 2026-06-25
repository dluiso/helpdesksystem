import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { AttachmentQuarantineQueryDto } from "./dto/attachment-quarantine-query.dto";
import { BulkRescanPendingAttachmentsDto } from "./dto/bulk-rescan-pending-attachments.dto";
import { CleanupRecycleBinDto } from "./dto/cleanup-recycle-bin.dto";
import { RestoreQuarantinedAttachmentDto } from "./dto/restore-quarantined-attachment.dto";
import { UpdateMaintenanceSettingsDto } from "./dto/update-maintenance-settings.dto";
import { MaintenanceService } from "./maintenance.service";

@Controller("maintenance")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get("recycle-bin/summary")
  @RequirePermissions("maintenance.view")
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.maintenance.getSummary(user);
  }

  @Patch("recycle-bin/settings")
  @RequirePermissions("maintenance.manage")
  updateSettings(@Body() body: UpdateMaintenanceSettingsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.maintenance.updateSettings(user, body.recycleBinRetentionDays);
  }

  @Post("recycle-bin/cleanup")
  @RequirePermissions("maintenance.manage")
  cleanup(@Body() body: CleanupRecycleBinDto, @CurrentUser() user: AuthenticatedUser) {
    return this.maintenance.cleanupRecycleBin(user, body);
  }

  @Get("attachment-quarantine")
  @RequirePermissions("maintenance.view")
  attachmentQuarantine(@CurrentUser() user: AuthenticatedUser, @Query() query: AttachmentQuarantineQueryDto) {
    return this.maintenance.listAttachmentQuarantine(user, query);
  }

  @Post("attachment-quarantine/rescan-pending")
  @RequirePermissions("maintenance.manage")
  rescanPendingAttachments(@CurrentUser() user: AuthenticatedUser, @Body() body: BulkRescanPendingAttachmentsDto) {
    return this.maintenance.bulkRescanPendingAttachments(user, body);
  }

  @Post("attachment-quarantine/:type/:attachmentId/rescan")
  @RequirePermissions("maintenance.manage")
  rescanAttachment(@CurrentUser() user: AuthenticatedUser, @Param("type") type: string, @Param("attachmentId") attachmentId: string) {
    return this.maintenance.rescanAttachment(user, this.parseAttachmentType(type), attachmentId);
  }

  @Post("attachment-quarantine/:type/:attachmentId/restore")
  @RequirePermissions("maintenance.manage")
  restoreAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("type") type: string,
    @Param("attachmentId") attachmentId: string,
    @Body() body: RestoreQuarantinedAttachmentDto
  ) {
    return this.maintenance.restoreQuarantinedAttachment(user, this.parseAttachmentType(type), attachmentId, body.reason);
  }

  private parseAttachmentType(type: string): "ticket" | "event" {
    if (type === "ticket" || type === "event") {
      return type;
    }
    throw new BadRequestException("Attachment type must be ticket or event.");
  }
}
