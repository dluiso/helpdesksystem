import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  StreamableFile,
  UseGuards,
  UseInterceptors,
  UploadedFile
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { TicketAttachmentsService } from "./ticket-attachments.service";
import { singleFileUploadOptions } from "../file-storage/upload-limits";

const uploadLimitMb = Number(process.env.MAX_UPLOAD_SIZE_MB ?? 25);
const uploadLimitBytes = uploadLimitMb * 1024 * 1024;

@Controller("tickets/:ticketId/attachments")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class TicketAttachmentsController {
  constructor(private readonly ticketAttachmentsService: TicketAttachmentsService) {}

  @Post()
  @RequirePermissions("ticket_attachments.upload")
  @UseInterceptors(FileInterceptor("file", singleFileUploadOptions(uploadLimitBytes)))
  async upload(
    @Param("ticketId") ticketId: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: { originalname: string; mimetype: string; size: number; buffer: Buffer }
  ) {
    if (!file) {
      throw new BadRequestException("Attachment file is required.");
    }

    return this.ticketAttachmentsService.uploadForTicket(ticketId, user, file);
  }

  @Get("download-all")
  @RequirePermissions("ticket_attachments.download")
  async downloadAll(
    @Param("ticketId") ticketId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.ticketAttachmentsService.getBulkDownload(ticketId, user);
    response.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(result.filename)}"`,
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Cache-Control": "private, no-store"
    });

    return new StreamableFile(result.stream);
  }

  @Get(":attachmentId/download")
  @RequirePermissions("ticket_attachments.download")
  async download(
    @Param("ticketId") ticketId: string,
    @Param("attachmentId") attachmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.ticketAttachmentsService.getDownload(ticketId, attachmentId, user, false);
    response.set({
      "Content-Type": result.attachment.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(result.attachment.originalFilename)}"`,
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Cache-Control": "private, no-store"
    });

    return new StreamableFile(result.stream);
  }

  @Get(":attachmentId/preview")
  @RequirePermissions("ticket_attachments.view")
  async preview(
    @Param("ticketId") ticketId: string,
    @Param("attachmentId") attachmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.ticketAttachmentsService.getDownload(ticketId, attachmentId, user, true);
    response.set({
      "Content-Type": result.attachment.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(result.attachment.originalFilename)}"`,
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Cache-Control": "private, no-store"
    });

    return new StreamableFile(result.stream);
  }

  @Delete(":attachmentId")
  @HttpCode(204)
  @RequirePermissions("ticket_attachments.delete")
  async delete(
    @Param("ticketId") ticketId: string,
    @Param("attachmentId") attachmentId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    await this.ticketAttachmentsService.softDelete(ticketId, attachmentId, user);
  }
}
