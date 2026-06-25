import { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";

export function singleFileUploadOptions(fileSize: number): MulterOptions {
  return {
    limits: {
      fileSize,
      files: 1,
      fields: 0,
      parts: 2,
      fieldNameSize: 100,
      fieldSize: 64 * 1024
    }
  };
}
