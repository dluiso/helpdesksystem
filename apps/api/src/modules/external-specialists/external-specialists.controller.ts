import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { UpsertExternalSpecialistDto } from "./dto/upsert-external-specialist.dto";
import { ExternalSpecialistsService } from "./external-specialists.service";

@Controller("external-specialists")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class ExternalSpecialistsController {
  constructor(private readonly externalSpecialists: ExternalSpecialistsService) {}

  @Get()
  @RequirePermissions("event_services.view")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.externalSpecialists.list(user);
  }

  @Post()
  @RequirePermissions("event_services.update")
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: UpsertExternalSpecialistDto) {
    return this.externalSpecialists.create(user, body);
  }

  @Patch(":specialistId")
  @RequirePermissions("event_services.update")
  update(@Param("specialistId") specialistId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: UpsertExternalSpecialistDto) {
    return this.externalSpecialists.update(specialistId, user, body);
  }

  @Delete(":specialistId")
  @RequirePermissions("event_services.update")
  archive(@Param("specialistId") specialistId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.externalSpecialists.archive(specialistId, user);
  }
}
