import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { CreatePublicSupportTicketDto } from "./dto/create-public-support-ticket.dto";
import { UpdateSupportPortalSettingsDto } from "./dto/update-support-portal-settings.dto";
import { UpsertSupportPortalFormFieldDto } from "./dto/upsert-support-portal-form-field.dto";
import { SupportPortalService } from "./support-portal.service";

@Controller()
export class SupportPortalController {
  constructor(private readonly supportPortal: SupportPortalService) {}

  @Get("public/support/form")
  publicForm() {
    return this.supportPortal.getPublicForm();
  }

  @Post("public/support/tickets")
  createPublicTicket(@Body() body: CreatePublicSupportTicketDto, @Req() request: Request) {
    return this.supportPortal.createPublicTicket(body, {
      ipAddress: request.ip,
      userAgent: request.get("user-agent") ?? undefined
    });
  }

  @Get("support-portal/config")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("system_settings.view")
  getConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.supportPortal.getConfig(user);
  }

  @Patch("support-portal/config")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("system_settings.update")
  updateConfig(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateSupportPortalSettingsDto) {
    return this.supportPortal.updateConfig(user, body);
  }

  @Post("support-portal/form/fields")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("system_settings.update")
  createField(@CurrentUser() user: AuthenticatedUser, @Body() body: UpsertSupportPortalFormFieldDto) {
    return this.supportPortal.createField(user, body);
  }

  @Patch("support-portal/form/fields/:fieldId")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("system_settings.update")
  updateField(@CurrentUser() user: AuthenticatedUser, @Param("fieldId") fieldId: string, @Body() body: UpsertSupportPortalFormFieldDto) {
    return this.supportPortal.updateField(user, fieldId, body);
  }

  @Delete("support-portal/form/fields/:fieldId")
  @UseGuards(SessionAuthGuard, PermissionsGuard)
  @RequirePermissions("system_settings.update")
  deleteField(@CurrentUser() user: AuthenticatedUser, @Param("fieldId") fieldId: string) {
    return this.supportPortal.deleteField(user, fieldId);
  }
}
