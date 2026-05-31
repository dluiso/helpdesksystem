import { Module } from "@nestjs/common";
import { FileStorageModule } from "../file-storage/file-storage.module";
import { MailDeliveryService } from "./mail-delivery.service";
import { MicrosoftGraphMailProvider } from "./providers/microsoft-graph-mail.provider";
import { MockMailProvider } from "./providers/mock-mail.provider";

@Module({
  imports: [FileStorageModule],
  providers: [MailDeliveryService, MockMailProvider, MicrosoftGraphMailProvider],
  exports: [MailDeliveryService, MockMailProvider, MicrosoftGraphMailProvider]
})
export class MailTransportModule {}
