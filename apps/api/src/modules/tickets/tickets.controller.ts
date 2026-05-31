import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { BulkTicketIdsDto } from "./dto/bulk-ticket-ids.dto";
import { BulkUpdateTicketsDto } from "./dto/bulk-update-tickets.dto";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { CreateTicketMessageDto } from "./dto/create-ticket-message.dto";
import { ListTicketsQueryDto } from "./dto/list-tickets-query.dto";
import { UpdateTicketAssignmentDto } from "./dto/update-ticket-assignment.dto";
import { UpdateTicketWatchersDto } from "./dto/update-ticket-watchers.dto";
import { TicketsService } from "./tickets.service";

@Controller("tickets")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  @RequirePermissions("tickets.view")
  list(@Query() query: ListTicketsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ticketsService.list(user, query);
  }

  @Post()
  @RequirePermissions("tickets.create")
  create(@Body() body: CreateTicketDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ticketsService.create(body, user);
  }

  @Patch("bulk")
  @RequirePermissions("tickets.assign")
  bulkUpdate(@Body() body: BulkUpdateTicketsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ticketsService.bulkUpdate(body, user);
  }

  @Post("bulk/delete")
  @RequirePermissions("tickets.delete")
  bulkDelete(@Body() body: BulkTicketIdsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ticketsService.bulkSoftDelete(body.ticketIds, user);
  }

  @Post("bulk/restore")
  @RequirePermissions("tickets.update")
  bulkRestore(@Body() body: BulkTicketIdsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ticketsService.bulkRestore(body.ticketIds, user);
  }

  @Get(":ticketId")
  @RequirePermissions("tickets.view")
  getById(@Param("ticketId") ticketId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ticketsService.getById(ticketId, user);
  }

  @Patch(":ticketId/assignment")
  @RequirePermissions("tickets.assign")
  updateAssignment(
    @Param("ticketId") ticketId: string,
    @Body() body: UpdateTicketAssignmentDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.ticketsService.updateAssignment(ticketId, body, user);
  }

  @Patch(":ticketId/watchers")
  @RequirePermissions("tickets.update")
  updateWatchers(@Param("ticketId") ticketId: string, @Body() body: UpdateTicketWatchersDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ticketsService.updateWatchers(ticketId, body.userIds ?? [], user);
  }

  @Post(":ticketId/messages")
  @RequirePermissions("tickets.reply")
  createMessage(
    @Param("ticketId") ticketId: string,
    @Body() body: CreateTicketMessageDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.ticketsService.createMessage(ticketId, body, user);
  }
}
