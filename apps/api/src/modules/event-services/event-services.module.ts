import { Module } from "@nestjs/common";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { AuthModule } from "../auth/auth.module";
import { MailTransportModule } from "../mailboxes/mail-transport.module";
import { EventServicesController } from "./event-services.controller";
import { EventServicesService } from "./event-services.service";

@Module({
  imports: [AuthModule, AuditLogsModule, MailTransportModule],
  controllers: [EventServicesController],
  providers: [EventServicesService],
  exports: [EventServicesService]
})
export class EventServicesModule {}
