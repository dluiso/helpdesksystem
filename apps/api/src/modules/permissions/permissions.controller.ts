import { Controller, Get, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "./decorators/require-permissions.decorator";
import { PermissionsGuard } from "./guards/permissions.guard";
import { PermissionsService } from "./permissions.service";

@Controller("permissions")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @RequirePermissions("permissions.view")
  list() {
    return this.permissionsService.list();
  }
}
