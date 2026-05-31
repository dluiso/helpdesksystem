import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { CreateGroupDto } from "./dto/create-group.dto";
import { UpdateGroupDto } from "./dto/update-group.dto";
import { GroupsService } from "./groups.service";

@Controller("groups")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  @RequirePermissions("groups.view")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.groupsService.list(user);
  }

  @Post()
  @RequirePermissions("groups.create")
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateGroupDto) {
    return this.groupsService.create(user, input);
  }

  @Patch(":groupId")
  @RequirePermissions("groups.update")
  update(@Param("groupId") groupId: string, @CurrentUser() user: AuthenticatedUser, @Body() input: UpdateGroupDto) {
    return this.groupsService.update(groupId, user, input);
  }

  @Delete(":groupId")
  @RequirePermissions("groups.delete")
  delete(@Param("groupId") groupId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.groupsService.delete(groupId, user);
  }
}
