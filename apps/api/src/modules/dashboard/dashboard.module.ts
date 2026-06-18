import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [AuthModule, PermissionsModule],
  controllers: [DashboardController],
  providers: [DashboardService]
})
export class DashboardModule {}
