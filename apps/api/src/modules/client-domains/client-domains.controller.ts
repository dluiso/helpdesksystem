import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { ClientDomainsService } from "./client-domains.service";
import { AssociateUnmappedDomainDto } from "./dto/associate-unmapped-domain.dto";
import { CreateClientDomainDto } from "./dto/create-client-domain.dto";
import { UpdateClientDomainDto } from "./dto/update-client-domain.dto";

@Controller()
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class ClientDomainsController {
  constructor(private readonly clientDomainsService: ClientDomainsService) {}

  @Get("clients/:clientId/domains")
  @RequirePermissions("client_domains.view")
  listForClient(@Param("clientId") clientId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.clientDomainsService.listForClient(clientId, user);
  }

  @Get("client-domains/unmapped")
  @RequirePermissions("client_domains.view")
  listUnmapped(@CurrentUser() user: AuthenticatedUser) {
    return this.clientDomainsService.listUnmapped(user);
  }

  @Post("client-domains/unmapped/:unmappedDomainId/associate")
  @RequirePermissions("client_domains.update")
  associateUnmapped(
    @Param("unmappedDomainId") unmappedDomainId: string,
    @Body() body: AssociateUnmappedDomainDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.clientDomainsService.associateUnmappedDomain(unmappedDomainId, body.clientId, user);
  }

  @Post("clients/:clientId/domains")
  @RequirePermissions("client_domains.create")
  create(
    @Param("clientId") clientId: string,
    @Body() body: CreateClientDomainDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.clientDomainsService.create(clientId, body, user);
  }

  @Patch("client-domains/:domainId")
  @RequirePermissions("client_domains.update")
  update(
    @Param("domainId") domainId: string,
    @Body() body: UpdateClientDomainDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.clientDomainsService.update(domainId, body, user);
  }

  @Delete("client-domains/:domainId")
  @HttpCode(204)
  @RequirePermissions("client_domains.delete")
  async delete(@Param("domainId") domainId: string, @CurrentUser() user: AuthenticatedUser) {
    await this.clientDomainsService.deactivate(domainId, user);
  }
}
