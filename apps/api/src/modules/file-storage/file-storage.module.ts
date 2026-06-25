import { Module } from "@nestjs/common";
import { SystemSettingsModule } from "../system-settings/system-settings.module";
import { FILE_STORAGE_PROVIDER } from "./file-storage.interfaces";
import { FileScanService } from "./file-scan.service";
import { FileStorageService } from "./file-storage.service";
import { FileValidationService } from "./file-validation.service";
import { LocalFileStorageProvider } from "./providers/local-file-storage.provider";

@Module({
  imports: [SystemSettingsModule],
  providers: [
    FileStorageService,
    FileScanService,
    FileValidationService,
    LocalFileStorageProvider,
    {
      provide: FILE_STORAGE_PROVIDER,
      useExisting: LocalFileStorageProvider
    }
  ],
  exports: [FileStorageService, FileScanService, FileValidationService]
})
export class FileStorageModule {}
