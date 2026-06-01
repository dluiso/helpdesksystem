import { Module } from "@nestjs/common";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { SignaturesModule } from "../signatures/signatures.module";
import { ProfileController } from "./profile.controller";
import { ProfileService } from "./profile.service";

@Module({
  imports: [AuditLogsModule, AuthModule, NotificationsModule, SignaturesModule],
  controllers: [ProfileController],
  providers: [ProfileService]
})
export class ProfileModule {}
