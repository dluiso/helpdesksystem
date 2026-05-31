import { Module } from "@nestjs/common";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { AuthModule } from "../auth/auth.module";
import { TicketTeamsController } from "./ticket-teams.controller";
import { TicketTeamsService } from "./ticket-teams.service";

@Module({
  imports: [AuthModule, AuditLogsModule],
  controllers: [TicketTeamsController],
  providers: [TicketTeamsService],
  exports: [TicketTeamsService]
})
export class TicketTeamsModule {}
