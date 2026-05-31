import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { RemoteAccessController } from "./remote-access.controller";
import { RemoteAccessService } from "./remote-access.service";

@Module({
  imports: [AuthModule, AuditLogsModule],
  controllers: [RemoteAccessController],
  providers: [RemoteAccessService]
})
export class RemoteAccessModule {}


