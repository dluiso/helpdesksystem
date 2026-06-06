import { Inject, Injectable } from "@nestjs/common";
import {
  FILE_STORAGE_PROVIDER,
  FileStorageProviderPort,
  SaveFileInput,
  StoredFileResult
} from "./file-storage.interfaces";
import { FileValidationService } from "./file-validation.service";

@Injectable()
export class FileStorageService {
  constructor(
    @Inject(FILE_STORAGE_PROVIDER) private readonly provider: FileStorageProviderPort,
    private readonly validation: FileValidationService
  ) {}

  async saveAttachmentFile(input: SaveFileInput): Promise<StoredFileResult> {
    await this.validation.validateAttachment({
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length
    });

    return this.provider.saveFile(input);
  }

  async saveSystemFile(input: SaveFileInput): Promise<StoredFileResult> {
    return this.provider.saveFile(input);
  }

  getFileStream(storageKey: string) {
    return this.provider.getFileStream(storageKey);
  }

  deleteFile(storageKey: string) {
    return this.provider.deleteFile(storageKey);
  }
}
