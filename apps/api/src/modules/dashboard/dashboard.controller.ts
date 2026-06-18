import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { AuthenticatedUser } from "../auth/auth.types";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { DashboardService } from "./dashboard.service";
import { UpdateDashboardPreferencesDto } from "./dto/update-dashboard-preferences.dto";

@Controller("dashboard")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("preferences")
  @RequirePermissions("tickets.view")
  preferences(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.preferences(user);
  }

  @Put("preferences")
  @RequirePermissions("tickets.view")
  updatePreferences(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateDashboardPreferencesDto) {
    return this.dashboardService.updatePreferences(user, body);
  }
}
