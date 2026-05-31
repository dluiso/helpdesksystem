import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { FileStorageModule } from "../file-storage/file-storage.module";
import { TicketAttachmentsController } from "./ticket-attachments.controller";
import { TicketAttachmentsService } from "./ticket-attachments.service";

@Module({
  imports: [AuthModule, AuditLogsModule, FileStorageModule],
  controllers: [TicketAttachmentsController],
  providers: [TicketAttachmentsService],
  exports: [TicketAttachmentsService]
})
export class TicketAttachmentsModule {}


