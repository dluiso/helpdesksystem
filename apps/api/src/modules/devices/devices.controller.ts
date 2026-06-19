import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { DeviceQueryDto } from "./dto/device-query.dto";
import { UpdateRmmSettingsDto } from "./dto/update-rmm-settings.dto";
import { DevicesService } from "./devices.service";

@Controller("devices")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @RequirePermissions("devices.view")
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: DeviceQueryDto) {
    return this.devicesService.list(user, query);
  }

  @Get("rmm-settings")
  @RequirePermissions("remote_access.configure")
  getRemoteAccessSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.getRemoteAccessSettings(user);
  }

  @Patch("rmm-settings")
  @RequirePermissions("remote_access.configure")
  updateRemoteAccessSettings(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateRmmSettingsDto) {
    return this.devicesService.updateRemoteAccessSettings(user, body);
  }

  @Post("rmm-sync")
  @RequirePermissions("remote_access.configure")
  syncFromRemoteAccessProvider(@CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.syncFromRemoteAccessProvider(user);
  }

  @Get(":deviceId")
  @RequirePermissions("devices.view")
  getById(@CurrentUser() user: AuthenticatedUser, @Param("deviceId") deviceId: string) {
    return this.devicesService.getById(user, deviceId);
  }
}
