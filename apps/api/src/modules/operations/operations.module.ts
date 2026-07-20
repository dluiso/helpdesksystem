import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { SystemSettingsModule } from "../system-settings/system-settings.module";
import { OperationsController } from "./operations.controller";
import { OperationsService } from "./operations.service";

@Module({
  imports: [AuthModule, PermissionsModule, SystemSettingsModule],
  controllers: [OperationsController],
  providers: [OperationsService]
})
export class OperationsModule {}
