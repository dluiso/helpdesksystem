import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { ContactsModule } from "../contacts/contacts.module";
import { MailTransportModule } from "../mailboxes/mail-transport.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { TicketRoutingModule } from "../ticket-routing/ticket-routing.module";
import { HtmlSanitizerService } from "../../common/html/html-sanitizer.service";
import { TicketsController } from "./tickets.controller";
import { TicketsService } from "./tickets.service";

@Module({
  imports: [AuthModule, AuditLogsModule, ContactsModule, TicketRoutingModule, MailTransportModule, NotificationsModule],
  controllers: [TicketsController],
  providers: [TicketsService, HtmlSanitizerService],
  exports: [TicketsService]
})
export class TicketsModule {}


