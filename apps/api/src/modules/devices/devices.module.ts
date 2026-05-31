import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DevicesController } from "./devices.controller";

@Module({
  imports: [AuthModule],
  controllers: [DevicesController]
})
export class DevicesModule {}


