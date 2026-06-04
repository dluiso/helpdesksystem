import { Module } from "@nestjs/common";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { AuthModule } from "../auth/auth.module";
import { FileStorageModule } from "../file-storage/file-storage.module";
import { MaintenanceController } from "./maintenance.controller";
import { MaintenanceService } from "./maintenance.service";

@Module({
  imports: [AuthModule, AuditLogsModule, FileStorageModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceService]
})
export class MaintenanceModule {}
