import { Module } from "@nestjs/common";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { AuthModule } from "../auth/auth.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { TicketWorkflowController } from "./ticket-workflow.controller";
import { TicketWorkflowService } from "./ticket-workflow.service";

@Module({
  imports: [AuditLogsModule, AuthModule, PermissionsModule],
  controllers: [TicketWorkflowController],
  providers: [TicketWorkflowService],
  exports: [TicketWorkflowService]
})
export class TicketWorkflowModule {}
