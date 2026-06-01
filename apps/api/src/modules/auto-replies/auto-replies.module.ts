import { Module } from "@nestjs/common";
import { HtmlSanitizerService } from "../../common/html/html-sanitizer.service";
import { AuthModule } from "../auth/auth.module";
import { MailTransportModule } from "../mailboxes/mail-transport.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { AutoRepliesController } from "./auto-replies.controller";
import { AutoRepliesService } from "./auto-replies.service";

@Module({
  imports: [AuthModule, MailTransportModule, PermissionsModule],
  controllers: [AutoRepliesController],
  providers: [AutoRepliesService, HtmlSanitizerService],
  exports: [AutoRepliesService]
})
export class AutoRepliesModule {}
