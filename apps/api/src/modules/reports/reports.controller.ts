import { Controller, Get, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";

@Controller("reports")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class ReportsController {
  @Get("summary")
  @RequirePermissions("reports.view")
  summaryPlaceholder() {
    return {
      ticketsCreated: 0,
      ticketsClosed: 0,
      averageFirstResponseMinutes: null,
      averageResolutionMinutes: null
    };
  }
}
