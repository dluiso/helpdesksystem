import { Module } from "@nestjs/common";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { AuthModule } from "../auth/auth.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { GroupsController } from "./groups.controller";
import { GroupsService } from "./groups.service";

@Module({
  imports: [AuthModule, PermissionsModule, AuditLogsModule],
  controllers: [GroupsController],
  providers: [GroupsService]
})
export class GroupsModule {}
