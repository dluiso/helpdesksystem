import { Module } from "@nestjs/common";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { AuthModule } from "../auth/auth.module";
import { LocalFileStorageProvider } from "../file-storage/providers/local-file-storage.provider";
import { SystemSettingsController } from "./system-settings.controller";
import { SystemSettingsService } from "./system-settings.service";

@Module({
  imports: [AuditLogsModule, AuthModule],
  controllers: [SystemSettingsController],
  providers: [SystemSettingsService, LocalFileStorageProvider],
  exports: [SystemSettingsService]
})
export class SystemSettingsModule {}


