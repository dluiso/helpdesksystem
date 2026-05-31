import { BadRequestException, Injectable } from "@nestjs/common";
import path from "path";
import { SystemSettingsService } from "../system-settings/system-settings.service";

const BLOCKED_ATTACHMENT_EXTENSIONS = [
  ".exe",
  ".msi",
  ".bat",
  ".cmd",
  ".ps1",
  ".vbs",
  ".js",
  ".jse",
  ".scr",
  ".com",
  ".pif",
  ".cpl",
  ".hta",
  ".reg"
] as const;

const ALLOWED_PREVIEW_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain"
] as const;

export interface AttachmentValidationInput {
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
}

@Injectable()
export class FileValidationService {
  constructor(private readonly systemSettings: SystemSettingsService) {}

  async validateAttachment(input: AttachmentValidationInput) {
    const policy = await this.systemSettings.getAttachmentPolicy();
    const extension = path.extname(input.originalFilename).toLowerCase();
    const blockedExtensions = new Set([
      ...BLOCKED_ATTACHMENT_EXTENSIONS,
      ...policy.blockedAttachmentFileTypes.map((item) => item.toLowerCase())
    ]);
    const maxBytes = policy.maximumUploadSizeMb * 1024 * 1024;

    if (input.sizeBytes > maxBytes) {
      throw new BadRequestException(`Attachment exceeds the ${policy.maximumUploadSizeMb} MB limit.`);
    }

    if (blockedExtensions.has(extension)) {
      throw new BadRequestException("This attachment type is blocked.");
    }

    if (policy.allowedAttachmentFileTypes.length > 0 && !policy.allowedAttachmentFileTypes.includes(input.mimeType)) {
      throw new BadRequestException("This attachment MIME type is not allowed.");
    }
  }

  canPreview(mimeType: string): boolean {
    return ALLOWED_PREVIEW_MIME_TYPES.includes(mimeType as (typeof ALLOWED_PREVIEW_MIME_TYPES)[number]);
  }
}
