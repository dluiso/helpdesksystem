import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { CreateReportDefinitionDto, UpdateReportDefinitionDto } from "./dto/report-definition.dto";
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

  @Get("definitions")
  @RequirePermissions("reports.view")
  listDefinitions(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.listDefinitions(user);
  }

  @Post("definitions")
  @RequirePermissions("reports.view")
  createDefinition(@Body() body: CreateReportDefinitionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.createDefinition(user, body);
  }

  @Patch("definitions/:definitionId")
  @RequirePermissions("reports.view")
  updateDefinition(@Param("definitionId") definitionId: string, @Body() body: UpdateReportDefinitionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.updateDefinition(user, definitionId, body);
  }

  @Delete("definitions/:definitionId")
  @RequirePermissions("reports.view")
  deleteDefinition(@Param("definitionId") definitionId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.deleteDefinition(user, definitionId);
  }

  @Get("tickets/export")
  @RequirePermissions("reports.view")
  async exportTickets(@Query() query: TicketReportExportQueryDto, @CurrentUser() user: AuthenticatedUser, @Res() response: Response) {
    const exportResult = await this.reportsService.exportTickets(user, query);
    response.setHeader("Content-Type", exportResult.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${exportResult.filename}"`);
    response.send(exportResult.body);
  }
}
