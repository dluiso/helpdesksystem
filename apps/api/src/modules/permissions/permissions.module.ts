import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PermissionsController } from "./permissions.controller";
import { PermissionsGuard } from "./guards/permissions.guard";
import { PermissionsService } from "./permissions.service";

@Module({
  imports: [AuthModule],
  controllers: [PermissionsController],
  providers: [PermissionsGuard, PermissionsService],
  exports: [PermissionsGuard, PermissionsService]
})
export class PermissionsModule {}
