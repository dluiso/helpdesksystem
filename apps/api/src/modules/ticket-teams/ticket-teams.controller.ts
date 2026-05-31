import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { CreateTicketTeamDto } from "./dto/create-ticket-team.dto";
import { UpdateTicketTeamDto } from "./dto/update-ticket-team.dto";
import { TicketTeamsService } from "./ticket-teams.service";

@Controller("ticket-teams")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class TicketTeamsController {
  constructor(private readonly ticketTeamsService: TicketTeamsService) {}

  @Get()
  @RequirePermissions("tickets.assign")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.ticketTeamsService.list(user);
  }

  @Post()
  @RequirePermissions("groups.create")
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateTicketTeamDto) {
    return this.ticketTeamsService.create(user, input);
  }

  @Patch(":teamId")
  @RequirePermissions("groups.update")
  update(@Param("teamId") teamId: string, @CurrentUser() user: AuthenticatedUser, @Body() input: UpdateTicketTeamDto) {
    return this.ticketTeamsService.update(teamId, user, input);
  }

  @Delete(":teamId")
  @RequirePermissions("groups.delete")
  deactivate(@Param("teamId") teamId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ticketTeamsService.deactivate(teamId, user);
  }
}
