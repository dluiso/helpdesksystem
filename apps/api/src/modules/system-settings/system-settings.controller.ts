import { Controller, Get, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { SystemSettingsService } from "./system-settings.service";

@Controller("system-settings")
export class SystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  @Get("public-branding")
  getPublicBranding() {
    return this.systemSettingsService.getPublicBranding();
  }

  @Get("attachment-policy")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("system_settings.view")
  getAttachmentPolicy() {
    return this.systemSettingsService.getAttachmentPolicy();
  }
}
