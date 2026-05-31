import { Controller, Get, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";

@Controller("devices")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class DevicesController {
  @Get()
  @RequirePermissions("devices.view")
  listPlaceholder() {
    return { devices: [], status: "placeholder" };
  }
}
