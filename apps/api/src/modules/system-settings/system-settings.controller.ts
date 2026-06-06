import { BadRequestException, Body, Controller, Get, Patch, Post, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { AuditLogQueryDto } from "../audit-logs/dto/audit-log-query.dto";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { UpdateGeneralSettingsDto } from "./dto/update-general-settings.dto";
import { UpdateSecuritySettingsDto } from "./dto/update-security-settings.dto";
import { SystemSettingsService } from "./system-settings.service";

const brandingUploadLimitBytes = 2 * 1024 * 1024;

@Controller("system-settings")
export class SystemSettingsController {
  constructor(
    private readonly systemSettingsService: SystemSettingsService,
    private readonly auditLogsService: AuditLogsService
  ) {}

  @Get("public-branding")
  getPublicBranding() {
    return this.systemSettingsService.getPublicBranding();
  }

  @Get("public-auth")
  getPublicAuthSettings() {
    return this.systemSettingsService.getPublicAuthSettings();
  }

  @Get("assets")
  async getBrandingAsset(@Query("key") key: string, @Res({ passthrough: true }) response: Response) {
    const stream = await this.systemSettingsService.getBrandingAsset(key);
    response.set({
      "Cache-Control": "public, max-age=3600",
      "Cross-Origin-Resource-Policy": "cross-origin"
    });
    return new StreamableFile(stream);
  }

  @Get("general")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("system_settings.view")
  getGeneralSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.systemSettingsService.getGeneralSettings(user);
  }

  @Patch("general")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("system_settings.update")
  updateGeneralSettings(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateGeneralSettingsDto) {
    return this.systemSettingsService.updateGeneralSettings(user, body);
  }

  @Get("security")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("system_settings.view")
  getSecuritySettings(@CurrentUser() user: AuthenticatedUser) {
    return this.systemSettingsService.getSecuritySettings(user);
  }

  @Patch("security")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("system_settings.update")
  updateSecuritySettings(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateSecuritySettingsDto) {
    return this.systemSettingsService.updateSecuritySettings(user, body);
  }

  @Post("branding-assets")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("system_settings.update")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: brandingUploadLimitBytes } }))
  uploadBrandingAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Query("type") type: "logo" | "loginLogo" | "loginFormLogo" | "mobileLogo" | "mobileLoginLogo" | "appIcon",
    @UploadedFile() file?: { originalname: string; mimetype: string; size: number; buffer: Buffer }
  ) {
    if (!file) {
      throw new BadRequestException("Branding asset file is required.");
    }
    if (!["logo", "loginLogo", "loginFormLogo", "mobileLogo", "mobileLoginLogo", "appIcon"].includes(type)) {
      throw new BadRequestException("Invalid branding asset type.");
    }
    return this.systemSettingsService.uploadBrandingAsset(user, type, file);
  }

  @Get("attachment-policy")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("system_settings.view")
  getAttachmentPolicy() {
    return this.systemSettingsService.getAttachmentPolicy();
  }

  @Get("audit-logs")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("audit_logs.view")
  listAuditLogs(@CurrentUser() user: AuthenticatedUser, @Query() query: AuditLogQueryDto) {
    return this.auditLogsService.list(user, query);
  }

  @Get("audit-logs/export")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("audit_logs.export")
  async exportAuditLogs(@CurrentUser() user: AuthenticatedUser, @Query() query: AuditLogQueryDto, @Res() response: Response) {
    const csv = await this.auditLogsService.exportCsv(user, query);
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`);
    response.send(csv);
  }
}
