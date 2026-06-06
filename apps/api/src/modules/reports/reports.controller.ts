import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { TicketReportExportQueryDto, TicketReportQueryDto } from "./dto/ticket-report-query.dto";
import { ReportsService } from "./reports.service";

@Controller("reports")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("tickets/summary")
  @RequirePermissions("reports.view")
  ticketSummary(@Query() query: TicketReportQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.ticketSummary(user, query);
  }

  @Get("tickets/export")
  @RequirePermissions("reports.view")
  async exportTickets(@Query() query: TicketReportExportQueryDto, @CurrentUser() user: AuthenticatedUser, @Res() response: Response) {
    const exportResult = await this.reportsService.exportTicketsCsv(user, query);
    response.setHeader("Content-Type", exportResult.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${exportResult.filename}"`);
    response.send(exportResult.body);
  }
}
