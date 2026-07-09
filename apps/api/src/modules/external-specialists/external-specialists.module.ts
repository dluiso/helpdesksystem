import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ExternalSpecialistsController } from "./external-specialists.controller";
import { ExternalSpecialistsService } from "./external-specialists.service";

@Module({
  imports: [AuthModule],
  controllers: [ExternalSpecialistsController],
  providers: [ExternalSpecialistsService],
  exports: [ExternalSpecialistsService]
})
export class ExternalSpecialistsModule {}
