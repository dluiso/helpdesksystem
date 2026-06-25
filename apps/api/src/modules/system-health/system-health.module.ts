import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FileStorageModule } from "../file-storage/file-storage.module";
import { SystemHealthController } from "./system-health.controller";
import { SystemHealthService } from "./system-health.service";

@Module({
  imports: [AuthModule, FileStorageModule],
  controllers: [SystemHealthController],
  providers: [SystemHealthService]
})
export class SystemHealthModule {}
