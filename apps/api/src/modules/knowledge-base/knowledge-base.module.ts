import { AuthModule } from "../auth/auth.module";
import { Module } from "@nestjs/common";
import { HtmlSanitizerService } from "../../common/html/html-sanitizer.service";
import { FileStorageModule } from "../file-storage/file-storage.module";
import { KnowledgeBaseController } from "./knowledge-base.controller";
import { KnowledgeBaseService } from "./knowledge-base.service";
import { KnowledgeOneNoteImportService } from "./knowledge-onenote-import.service";

@Module({
  imports: [AuthModule, FileStorageModule],
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService, KnowledgeOneNoteImportService, HtmlSanitizerService]
})
export class KnowledgeBaseModule {}
