import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { UpdateMailboxDto } from "./dto/update-mailbox.dto";
import { MailboxesService } from "./mailboxes.service";

@Controller("mailboxes")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class MailboxesController {
  constructor(private readonly mailboxesService: MailboxesService) {}

  @Get()
  @RequirePermissions("mailboxes.view")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.mailboxesService.list(user);
  }

  @Patch(":mailboxId")
  @RequirePermissions("mailboxes.update")
  update(@Param("mailboxId") mailboxId: string, @Body() body: UpdateMailboxDto, @CurrentUser() user: AuthenticatedUser) {
    return this.mailboxesService.update(mailboxId, body, user);
  }

  @Post(":mailboxId/sync")
  @RequirePermissions("mailboxes.update")
  syncInbound(@Param("mailboxId") mailboxId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.mailboxesService.syncInbound(mailboxId, user);
  }
}
