import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { CreateTicketRoutingRuleDto } from "./dto/create-ticket-routing-rule.dto";
import { TicketRoutingRulesService } from "./ticket-routing-rules.service";

@Controller("ticket-routing-rules")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class TicketRoutingController {
  constructor(private readonly rulesService: TicketRoutingRulesService) {}

  @Get()
  @RequirePermissions("tickets.view")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.rulesService.list(user);
  }

  @Post()
  @RequirePermissions("tickets.assign")
  create(@Body() body: CreateTicketRoutingRuleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.rulesService.create(body, user);
  }

  @Post("apply-existing")
  @RequirePermissions("tickets.assign")
  applyToExistingTickets(@CurrentUser() user: AuthenticatedUser) {
    return this.rulesService.applyToExistingTickets(user);
  }

  @Patch(":ruleId")
  @RequirePermissions("tickets.assign")
  update(@Param("ruleId") ruleId: string, @Body() body: Partial<CreateTicketRoutingRuleDto>, @CurrentUser() user: AuthenticatedUser) {
    return this.rulesService.update(ruleId, body, user);
  }

  @Delete(":ruleId")
  @RequirePermissions("tickets.assign")
  delete(@Param("ruleId") ruleId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.rulesService.delete(ruleId, user);
  }
}
