import { Module } from "@nestjs/common";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { ClientDomainsController } from "./client-domains.controller";
import { ClientDomainsService } from "./client-domains.service";

@Module({
  imports: [AuthModule, AuditLogsModule, ClientsModule, PermissionsModule],
  controllers: [ClientDomainsController],
  providers: [ClientDomainsService],
  exports: [ClientDomainsService]
})
export class ClientDomainsModule {}
