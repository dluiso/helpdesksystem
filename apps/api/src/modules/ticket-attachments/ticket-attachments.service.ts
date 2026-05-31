import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AttachmentScanResult, AttachmentScanStatus, AttachmentSource } from "@prisma/client";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { FileStorageService } from "../file-storage/file-storage.service";
import { FileValidationService } from "../file-storage/file-validation.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TicketAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
    private readonly validation: FileValidationService,
    private readonly auditLogs: AuditLogsService
  ) {}

  async uploadForTicket(
    ticketId: string,
    user: AuthenticatedUser,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer }
  ) {
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        id: ticketId,
        organizationId: user.organizationId,
        deletedAt: null
      },
      select: { id: true }
    });

    if (!ticket) {
      throw new NotFoundException("Ticket was not found.");
    }

    const attachment = await this.createAttachmentRecord({
      ticketId,
      ticketMessageId: null,
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
      entityType: "TicketAttachment",
      entityId: attachment.id,
      action: "attachment.uploaded",
      metadata: {
        ticketId,
        originalFilename: attachment.originalFilename,
        mimeType: attachment.mimeType,
        fileSize: attachment.fileSize
      }
    });

    return attachment;
  }

  async createInboundEmailAttachment(input: {
    ticketId: string;
    ticketMessageId: string;
    originalFilename: string;
    mimeType: string;
    buffer: Buffer;
    isInline: boolean;
    contentId?: string | null;
    emailAttachmentId?: string | null;
  }) {
    if (input.emailAttachmentId) {
      const existing = await this.prisma.ticketAttachment.findFirst({
        where: {
          ticketMessageId: input.ticketMessageId,
          emailAttachmentId: input.emailAttachmentId,
          deletedAt: null
        }
      });

      if (existing) {
        return existing;
      }
    }

    return this.createAttachmentRecord({
      ticketId: input.ticketId,
      ticketMessageId: input.ticketMessageId,
      uploadedByUserId: null,
      source: AttachmentSource.INBOUND_EMAIL,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      buffer: input.buffer,
      isInline: input.isInline,
      contentId: input.contentId ?? null,
      emailAttachmentId: input.emailAttachmentId ?? null
    });
  }

  async getDownload(ticketId: string, attachmentId: string, user: AuthenticatedUser, preview: boolean) {
    const attachment = await this.prisma.ticketAttachment.findFirst({
      where: {
        id: attachmentId,
        ticketId,
        deletedAt: null
      },
      include: { storedFile: true }
    });

    if (!attachment) {
      throw new NotFoundException("Attachment was not found.");
    }

    if (
      attachment.scanStatus === AttachmentScanStatus.SUSPICIOUS ||
      attachment.scanStatus === AttachmentScanStatus.BLOCKED
    ) {
      throw new ForbiddenException("This attachment is blocked by scan status.");
    }

    if (preview && !this.validation.canPreview(attachment.mimeType)) {
      throw new ForbiddenException("Preview is not allowed for this attachment type.");
    }

    await this.auditLogs.create({
      userId: user.id,
      entityType: "TicketAttachment",
      entityId: attachment.id,
      action: preview ? "attachment.previewed" : "attachment.downloaded",
      metadata: {
        ticketId,
        originalFilename: attachment.originalFilename,
        mimeType: attachment.mimeType
      }
    });

    return {
      attachment,
      stream: await this.fileStorage.getFileStream(attachment.storageKey)
    };
  }

  async softDelete(ticketId: string, attachmentId: string, user: AuthenticatedUser) {
    const attachment = await this.prisma.ticketAttachment.findFirst({
      where: {
        id: attachmentId,
        ticketId,
        deletedAt: null
      }
    });

    if (!attachment) {
      throw new NotFoundException("Attachment was not found.");
    }

    const deleted = await this.prisma.ticketAttachment.update({
      where: { id: attachmentId },
      data: { deletedAt: new Date() }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "TicketAttachment",
      entityId: attachment.id,
      action: "attachment.deleted",
      metadata: { ticketId }
    });

    return deleted;
  }

  private async createAttachmentRecord(input: {
    ticketId: string;
    ticketMessageId: string | null;
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

      return tx.ticketAttachment.create({
        data: {
          ticketId: input.ticketId,
          ticketMessageId: input.ticketMessageId,
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
}
