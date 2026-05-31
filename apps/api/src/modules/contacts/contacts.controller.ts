import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { ContactsService } from "./contacts.service";
import { CreateContactDto } from "./dto/create-contact.dto";
import { UpdateContactDto } from "./dto/update-contact.dto";

@Controller()
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get("clients/:clientId/contacts")
  @RequirePermissions("contacts.view")
  listForClient(@Param("clientId") clientId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.contactsService.listForClient(clientId, user);
  }

  @Post("clients/:clientId/contacts")
  @RequirePermissions("contacts.create")
  create(@Param("clientId") clientId: string, @Body() body: CreateContactDto, @CurrentUser() user: AuthenticatedUser) {
    return this.contactsService.create(clientId, body, user);
  }

  @Get("contacts/:contactId")
  @RequirePermissions("contacts.view")
  getById(@Param("contactId") contactId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.contactsService.getById(contactId, user);
  }

  @Patch("contacts/:contactId")
  @RequirePermissions("contacts.update")
  update(@Param("contactId") contactId: string, @Body() body: UpdateContactDto, @CurrentUser() user: AuthenticatedUser) {
    return this.contactsService.update(contactId, body, user);
  }

  @Delete("contacts/:contactId")
  @HttpCode(204)
  @RequirePermissions("contacts.delete")
  async delete(@Param("contactId") contactId: string, @CurrentUser() user: AuthenticatedUser) {
    await this.contactsService.softDelete(contactId, user);
  }
}
