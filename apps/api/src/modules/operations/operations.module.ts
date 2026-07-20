import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { OperationsController } from "./operations.controller";
import { OperationsService } from "./operations.service";

@Module({
  imports: [AuthModule, PermissionsModule],
  controllers: [OperationsController],
  providers: [OperationsService]
})
export class OperationsModule {}
