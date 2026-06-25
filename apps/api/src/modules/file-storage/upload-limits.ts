import { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";

export function singleFileUploadOptions(fileSize: number): MulterOptions {
  return {
    limits: {
      fileSize,
      files: 1,
      fields: 8,
      parts: 12,
      fieldNameSize: 100,
      fieldSize: 64 * 1024
    }
  };
}
