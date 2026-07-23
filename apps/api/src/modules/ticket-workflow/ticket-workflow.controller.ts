import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { CreateTicketStatusDto } from "./dto/create-ticket-status.dto";
import { CreateTicketWorkflowRuleDto } from "./dto/create-ticket-workflow-rule.dto";
import { UpdateTicketStatusDto } from "./dto/update-ticket-status.dto";
import { UpdateTicketWorkflowRuleDto } from "./dto/update-ticket-workflow-rule.dto";
import { TicketWorkflowService } from "./ticket-workflow.service";

@Controller("ticket-workflow")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class TicketWorkflowController {
  constructor(private readonly ticketWorkflow: TicketWorkflowService) {}

  @Get("statuses")
  @RequirePermissions("ticket_statuses.view")
  listStatuses(@CurrentUser() user: AuthenticatedUser, @Query("includeInactive") includeInactive?: string) {
    return this.ticketWorkflow.listStatuses(user.organizationId, includeInactive === "true");
  }

  @Post("statuses")
  @RequirePermissions("ticket_statuses.manage")
  createStatus(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateTicketStatusDto) {
    return this.ticketWorkflow.createStatus(user, input);
  }

  @Patch("statuses/:statusId")
  @RequirePermissions("ticket_statuses.manage")
  updateStatus(@Param("statusId") statusId: string, @CurrentUser() user: AuthenticatedUser, @Body() input: UpdateTicketStatusDto) {
    return this.ticketWorkflow.updateStatus(statusId, user, input);
  }

  @Delete("statuses/:statusId")
  @RequirePermissions("ticket_statuses.manage")
  removeStatus(@Param("statusId") statusId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ticketWorkflow.removeStatus(statusId, user);
  }

  @Post("statuses/:statusId/restore")
  @RequirePermissions("ticket_statuses.manage")
  restoreStatus(@Param("statusId") statusId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ticketWorkflow.restoreStatus(statusId, user);
  }

  @Get("rules")
  @RequirePermissions("ticket_workflows.manage")
  listRules(@CurrentUser() user: AuthenticatedUser) {
    return this.ticketWorkflow.listRules(user.organizationId);
  }

  @Post("rules")
  @RequirePermissions("ticket_workflows.manage")
  createRule(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateTicketWorkflowRuleDto) {
    return this.ticketWorkflow.createRule(user, input);
  }

  @Patch("rules/:ruleId")
  @RequirePermissions("ticket_workflows.manage")
  updateRule(@Param("ruleId") ruleId: string, @CurrentUser() user: AuthenticatedUser, @Body() input: UpdateTicketWorkflowRuleDto) {
    return this.ticketWorkflow.updateRule(ruleId, user, input);
  }

  @Delete("rules/:ruleId")
  @RequirePermissions("ticket_workflows.manage")
  deleteRule(@Param("ruleId") ruleId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ticketWorkflow.deleteRule(ruleId, user);
  }

  @Get("history")
  @RequirePermissions("ticket_workflows.manage")
  history(@CurrentUser() user: AuthenticatedUser) {
    return this.ticketWorkflow.history(user.organizationId);
  }
}
