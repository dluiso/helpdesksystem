import { Module } from "@nestjs/common";
import { HtmlSanitizerService } from "../../common/html/html-sanitizer.service";
import { SignaturesService } from "./signatures.service";

@Module({
  providers: [SignaturesService, HtmlSanitizerService],
  exports: [SignaturesService]
})
export class SignaturesModule {}
