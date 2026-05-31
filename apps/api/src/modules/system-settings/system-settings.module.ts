import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SystemSettingsController } from "./system-settings.controller";
import { SystemSettingsService } from "./system-settings.service";

@Module({
  imports: [AuthModule],
  controllers: [SystemSettingsController],
  providers: [SystemSettingsService],
  exports: [SystemSettingsService]
})
export class SystemSettingsModule {}


