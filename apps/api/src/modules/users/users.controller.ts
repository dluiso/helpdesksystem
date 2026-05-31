import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UsersService } from "./users.service";

@Controller("users")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions("users.view")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.list(user);
  }

  @Post()
  @RequirePermissions("users.create")
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateUserDto) {
    return this.usersService.create(user, input);
  }

  @Patch(":userId")
  @RequirePermissions("users.update")
  update(@Param("userId") userId: string, @CurrentUser() user: AuthenticatedUser, @Body() input: UpdateUserDto) {
    return this.usersService.update(userId, user, input);
  }

  @Delete(":userId")
  @RequirePermissions("users.delete")
  delete(@Param("userId") userId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.softDelete(userId, user);
  }
}
