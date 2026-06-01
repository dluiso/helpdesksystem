import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { AutoRepliesService } from "./auto-replies.service";
import { CreateAutoReplyTemplateDto } from "./dto/create-auto-reply-template.dto";
import { UpdateAutoReplyTemplateDto } from "./dto/update-auto-reply-template.dto";

@Controller("auto-replies")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class AutoRepliesController {
  constructor(private readonly autoRepliesService: AutoRepliesService) {}

  @Get()
  @RequirePermissions("auto_replies.view")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.autoRepliesService.list(user);
  }

  @Post()
  @RequirePermissions("auto_replies.create")
  create(@Body() input: CreateAutoReplyTemplateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.autoRepliesService.create(user, input);
  }

  @Patch(":templateId")
  @RequirePermissions("auto_replies.update")
  update(@Param("templateId") templateId: string, @Body() input: UpdateAutoReplyTemplateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.autoRepliesService.update(templateId, user, input);
  }

  @Delete(":templateId")
  @RequirePermissions("auto_replies.delete")
  remove(@Param("templateId") templateId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.autoRepliesService.remove(templateId, user);
  }
}
