import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AttachmentScanResult, AttachmentScanStatus, AttachmentSource, Prisma } from "@prisma/client";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { FileStorageService } from "../file-storage/file-storage.service";
import { FileValidationService } from "../file-storage/file-validation.service";
import { OutboundMailAttachment } from "../mailboxes/providers/mail-provider.interface";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class EventServicesAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
    private readonly validation: FileValidationService,
    private readonly auditLogs: AuditLogsService
  ) {}

  async uploadForRequest(
    requestRef: string,
    user: AuthenticatedUser,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer }
  ) {
    const request = await this.resolveRequest(requestRef, user);
    const attachment = await this.createAttachmentRecord({
      requestId: request.id,
      messageId: null,
      uploadedByUserId: user.id,
      source: AttachmentSource.OUTBOUND_REPLY,
      originalFilename: file.originalname,
      mimeType: file.mimetype || "application/octet-stream",
      buffer: file.buffer,
      isInline: false,
      contentId: null,
      emailAttachmentId: null
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "EventServiceAttachment",
      entityId: attachment.id,
      action: "event_service_attachment.uploaded",
      metadata: {
        requestId: request.id,
        originalFilename: attachment.originalFilename,
        mimeType: attachment.mimeType,
        fileSize: attachment.fileSize
      }
    });

    return attachment;
  }

  async getDownload(requestRef: string, attachmentId: string, user: AuthenticatedUser, preview: boolean) {
    const request = await this.resolveRequest(requestRef, user);
    const attachment = await this.prisma.eventServiceAttachment.findFirst({
      where: {
        id: attachmentId,
        requestId: request.id,
        deletedAt: null
      },
      include: { storedFile: true }
    });
    if (!attachment) {
      throw new NotFoundException("Attachment was not found.");
    }
    if (attachment.scanStatus === AttachmentScanStatus.SUSPICIOUS || attachment.scanStatus === AttachmentScanStatus.BLOCKED) {
      throw new ForbiddenException("This attachment is blocked by scan status.");
    }
    if (preview && !this.validation.canPreview(attachment.mimeType)) {
      throw new ForbiddenException("Preview is not allowed for this attachment type.");
    }

    await this.auditLogs.create({
      userId: user.id,
      entityType: "EventServiceAttachment",
      entityId: attachment.id,
      action: preview ? "event_service_attachment.previewed" : "event_service_attachment.downloaded",
      metadata: { requestId: request.id, originalFilename: attachment.originalFilename, mimeType: attachment.mimeType }
    });

    return {
      attachment,
      stream: await this.fileStorage.getFileStream(attachment.storageKey)
    };
  }

  async softDelete(requestRef: string, attachmentId: string, user: AuthenticatedUser) {
    const request = await this.resolveRequest(requestRef, user);
    const attachment = await this.prisma.eventServiceAttachment.findFirst({
      where: { id: attachmentId, requestId: request.id, deletedAt: null }
    });
    if (!attachment) {
      throw new NotFoundException("Attachment was not found.");
    }
    const deleted = await this.prisma.eventServiceAttachment.update({
      where: { id: attachmentId },
      data: { deletedAt: new Date() }
    });
    await this.auditLogs.create({
      userId: user.id,
      entityType: "EventServiceAttachment",
      entityId: attachment.id,
      action: "event_service_attachment.deleted",
      metadata: { requestId: request.id }
    });
    return deleted;
  }

  async loadOutboundAttachments(requestId: string, attachmentIds: string[]): Promise<OutboundMailAttachment[]> {
    if (!attachmentIds.length) {
      return [];
    }

    const attachments = await this.prisma.eventServiceAttachment.findMany({
      where: {
        id: { in: attachmentIds },
        requestId,
        messageId: null,
        deletedAt: null,
        scanStatus: { notIn: [AttachmentScanStatus.SUSPICIOUS, AttachmentScanStatus.BLOCKED] }
      },
      orderBy: { createdAt: "asc" }
    });

    return Promise.all(
      attachments.map(async (attachment) => ({
        originalFilename: attachment.originalFilename,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.fileSize,
        contentBytes: await this.streamToBuffer(await this.fileStorage.getFileStream(attachment.storageKey)),
        isInline: attachment.isInline,
        contentId: attachment.contentId
      }))
    );
  }

  private async createAttachmentRecord(input: {
    requestId: string;
    messageId: string | null;
    uploadedByUserId: string | null;
    source: AttachmentSource;
    originalFilename: string;
    mimeType: string;
    buffer: Buffer;
    isInline: boolean;
    contentId: string | null;
    emailAttachmentId: string | null;
  }) {
    const stored = await this.fileStorage.saveAttachmentFile({
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      buffer: input.buffer,
      folder: "attachments"
    });

    return this.prisma.$transaction(async (tx) => {
      const storedFile = await tx.storedFile.create({
        data: {
          storageProvider: stored.storageProvider,
          storageKey: stored.storageKey,
          originalFilename: stored.originalFilename,
          storedFilename: stored.storedFilename,
          mimeType: stored.mimeType,
          fileExtension: stored.fileExtension,
          fileSize: stored.fileSize,
          sha256Hash: stored.sha256Hash
        }
      });

      return tx.eventServiceAttachment.create({
        data: {
          requestId: input.requestId,
          messageId: input.messageId,
          uploadedByUserId: input.uploadedByUserId,
          storedFileId: storedFile.id,
          source: input.source,
          originalFilename: stored.originalFilename,
          storedFilename: stored.storedFilename,
          storageProvider: stored.storageProvider,
          storageKey: stored.storageKey,
          mimeType: stored.mimeType,
          fileExtension: stored.fileExtension,
          fileSize: stored.fileSize,
          sha256Hash: stored.sha256Hash,
          isInline: input.isInline,
          contentId: input.contentId,
          emailAttachmentId: input.emailAttachmentId,
          scanStatus: AttachmentScanStatus.PENDING,
          scanResult: AttachmentScanResult.NOT_SCANNED
        }
      });
    });
  }

  private async resolveRequest(requestRef: string, user: AuthenticatedUser) {
    const request = await this.prisma.eventServiceRequest.findFirst({
      where: this.requestReferenceWhere(requestRef, user.organizationId),
      select: { id: true }
    });
    if (!request) {
      throw new NotFoundException("Event service request was not found.");
    }
    return request;
  }

  private requestReferenceWhere(requestRef: string, organizationId: string): Prisma.EventServiceRequestWhereInput {
    const normalized = requestRef.trim();
    const matchers: Prisma.EventServiceRequestWhereInput[] = [{ trackingNumber: normalized.toUpperCase() }];
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
      matchers.push({ id: normalized });
    }

    return {
      organizationId,
      deletedAt: null,
      OR: matchers
    };
  }

  private async streamToBuffer(stream: NodeJS.ReadableStream) {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
