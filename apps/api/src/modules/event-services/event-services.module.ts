import { Module } from "@nestjs/common";
import { HtmlSanitizerService } from "../../common/html/html-sanitizer.service";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { AuthModule } from "../auth/auth.module";
import { AutoRepliesModule } from "../auto-replies/auto-replies.module";
import { MailTransportModule } from "../mailboxes/mail-transport.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { EventServicesController } from "./event-services.controller";
import { EventServicesCalendarService } from "./event-services-calendar.service";
import { EventServicesService } from "./event-services.service";

@Module({
  imports: [AuthModule, AuditLogsModule, AutoRepliesModule, MailTransportModule, NotificationsModule],
  controllers: [EventServicesController],
  providers: [EventServicesService, EventServicesCalendarService, HtmlSanitizerService],
  exports: [EventServicesService]
})
export class EventServicesModule {}
