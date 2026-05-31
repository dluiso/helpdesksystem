import { Module } from "@nestjs/common";
import { SystemSettingsModule } from "../system-settings/system-settings.module";
import { FILE_STORAGE_PROVIDER } from "./file-storage.interfaces";
import { FileStorageService } from "./file-storage.service";
import { FileValidationService } from "./file-validation.service";
import { LocalFileStorageProvider } from "./providers/local-file-storage.provider";

@Module({
  imports: [SystemSettingsModule],
  providers: [
    FileStorageService,
    FileValidationService,
    LocalFileStorageProvider,
    {
      provide: FILE_STORAGE_PROVIDER,
      useExisting: LocalFileStorageProvider
    }
  ],
  exports: [FileStorageService, FileValidationService]
})
export class FileStorageModule {}
