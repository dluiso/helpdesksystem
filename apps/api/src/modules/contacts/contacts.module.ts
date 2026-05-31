import { Module } from "@nestjs/common";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { AuthModule } from "../auth/auth.module";
import { ClientDomainsModule } from "../client-domains/client-domains.module";
import { ClientsModule } from "../clients/clients.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { ContactsController } from "./contacts.controller";
import { ContactsService } from "./contacts.service";

@Module({
  imports: [AuthModule, AuditLogsModule, ClientDomainsModule, ClientsModule, PermissionsModule],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService]
})
export class ContactsModule {}
