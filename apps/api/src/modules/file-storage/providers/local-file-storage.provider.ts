import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomUUID } from "crypto";
import { createReadStream } from "fs";
import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { FileStorageProviderPort, SaveFileInput, StoredFileResult } from "../file-storage.interfaces";

@Injectable()
export class LocalFileStorageProvider implements FileStorageProviderPort {
  constructor(private readonly config: ConfigService) {}

  async saveFile(input: SaveFileInput): Promise<StoredFileResult> {
    const extension = path.extname(input.originalFilename).toLowerCase();
    const storedFilename = `${randomUUID()}${extension}`;
    const datePath = new Date().toISOString().slice(0, 7).replace("-", "/");
    const storageKey = path.posix.join(input.folder, datePath, storedFilename);
    const absolutePath = this.resolveStorageKey(storageKey);

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.buffer, { flag: "wx" });

    return {
      storageProvider: "LOCAL",
      storageKey,
      originalFilename: input.originalFilename,
      storedFilename,
      mimeType: input.mimeType,
      fileExtension: extension || null,
      fileSize: input.buffer.length,
      sha256Hash: createHash("sha256").update(input.buffer).digest("hex")
    };
  }

  async getFileStream(storageKey: string): Promise<Readable> {
    return createReadStream(this.resolveStorageKey(storageKey));
  }

  async deleteFile(storageKey: string): Promise<void> {
    await rm(this.resolveStorageKey(storageKey), { force: true });
  }

  private resolveStorageKey(storageKey: string): string {
    const storageRoot = this.config.get<string>("LOCAL_STORAGE_PATH") ?? "./storage/local";
    const basePath = path.resolve(process.env.INIT_CWD ?? process.cwd(), storageRoot);
    const absolutePath = path.resolve(basePath, storageKey);
    const relativePath = path.relative(basePath, absolutePath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      throw new Error("Invalid storage key.");
    }

    return absolutePath;
  }
}
