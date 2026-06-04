import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { SpamManagementController } from "./spam-management.controller";
import { SpamManagementService } from "./spam-management.service";

@Module({
  imports: [AuthModule, AuditLogsModule],
  controllers: [SpamManagementController],
  providers: [SpamManagementService],
  exports: [SpamManagementService]
})
export class SpamManagementModule {}
