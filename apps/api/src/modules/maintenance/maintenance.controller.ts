import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { CleanupRecycleBinDto } from "./dto/cleanup-recycle-bin.dto";
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
}
