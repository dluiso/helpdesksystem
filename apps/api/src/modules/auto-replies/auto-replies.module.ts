import { Module } from "@nestjs/common";
import { AutoRepliesService } from "./auto-replies.service";

@Module({
  providers: [AutoRepliesService],
  exports: [AutoRepliesService]
})
export class AutoRepliesModule {}
