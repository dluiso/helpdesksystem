import { AuthModule } from "../auth/auth.module";
import { Module } from "@nestjs/common";
import { KnowledgeBaseController } from "./knowledge-base.controller";

@Module({
  imports: [AuthModule],
  controllers: [KnowledgeBaseController]
})
export class KnowledgeBaseModule {}