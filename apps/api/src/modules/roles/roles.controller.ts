import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { CreateRoleDto } from "./dto/create-role.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { RolesService } from "./roles.service";

@Controller("roles")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions("roles.view")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.rolesService.list(user);
  }

  @Post()
  @RequirePermissions("roles.create")
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateRoleDto) {
    return this.rolesService.create(user, input);
  }

  @Patch(":roleId")
  @RequirePermissions("roles.update")
  update(@Param("roleId") roleId: string, @CurrentUser() user: AuthenticatedUser, @Body() input: UpdateRoleDto) {
    return this.rolesService.update(roleId, user, input);
  }

  @Delete(":roleId")
  @RequirePermissions("roles.delete")
  delete(@Param("roleId") roleId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.rolesService.delete(roleId, user);
  }
}
