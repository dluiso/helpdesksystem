import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { CreateClientDto } from "./dto/create-client.dto";
import { UpdateClientDto } from "./dto/update-client.dto";
import { ClientsService } from "./clients.service";

@Controller("clients")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @RequirePermissions("clients.view")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.list(user);
  }

  @Post()
  @RequirePermissions("clients.create")
  create(@Body() body: CreateClientDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.create(body, user);
  }

  @Get(":clientId")
  @RequirePermissions("clients.view")
  getById(@Param("clientId") clientId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.getById(clientId, user);
  }

  @Patch(":clientId")
  @RequirePermissions("clients.update")
  update(@Param("clientId") clientId: string, @Body() body: UpdateClientDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.update(clientId, body, user);
  }

  @Delete(":clientId")
  @HttpCode(204)
  @RequirePermissions("clients.delete")
  async delete(@Param("clientId") clientId: string, @CurrentUser() user: AuthenticatedUser) {
    await this.clientsService.softDelete(clientId, user);
  }
}
