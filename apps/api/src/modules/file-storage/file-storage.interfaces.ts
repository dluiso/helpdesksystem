import { Readable } from "stream";

export interface SaveFileInput {
  originalFilename: string;
  mimeType: string;
  buffer: Buffer;
  folder: "attachments" | "exports" | "knowledge-base" | "temp";
}

export interface StoredFileResult {
  storageProvider: "LOCAL";
  storageKey: string;
  originalFilename: string;
  storedFilename: string;
  mimeType: string;
  fileExtension: string | null;
  fileSize: number;
  sha256Hash: string;
}

export interface FileStorageProviderPort {
  saveFile(input: SaveFileInput): Promise<StoredFileResult>;
  getFileStream(storageKey: string): Promise<Readable>;
  deleteFile(storageKey: string): Promise<void>;
  getSignedUrl?(storageKey: string, expiresInSeconds: number): Promise<string>;
}

export const FILE_STORAGE_PROVIDER = "FILE_STORAGE_PROVIDER";
