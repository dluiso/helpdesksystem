import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  GetMessageAttachmentsInput,
  MailAttachment,
  MailProvider,
  SendMessageInput,
  SendMessageResult,
  SyncInboundMessagesInput,
  SyncInboundMessagesResult
} from "./mail-provider.interface";

@Injectable()
export class MockMailProvider implements MailProvider {
  constructor(private readonly config: ConfigService) {}

  async syncInboundMessages(input: SyncInboundMessagesInput): Promise<SyncInboundMessagesResult> {
    if (this.config.get<string>("MOCK_INBOUND_EMAIL_ENABLED") === "false") {
      return { messages: [], nextSyncCursor: input.lastSyncCursor ?? null };
    }

    const senderEmail = this.config.get<string>("MOCK_INBOUND_SENDER_EMAIL") ?? "requester@example.org";
    const senderName = this.config.get<string>("MOCK_INBOUND_SENDER_NAME") ?? "Mock Requester";
    const rawForwarderEmail = input.connectionMode === "GRAPH_FORWARDED_MAILBOX" ? input.publicEmailAddress ?? input.mailboxEmailAddress : senderEmail;
    const messageKey = senderEmail.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "requester";

    return {
      messages: [
        {
          providerMessageId: `mock-inbound-${messageKey}`,
          internetMessageId: `<mock-inbound-${messageKey}@local.avidity>`,
          conversationId: `mock-conversation-${messageKey}`,
          from: {
            email: senderEmail,
            name: senderName
          },
          rawFrom: {
            email: rawForwarderEmail,
            name: input.connectionMode === "GRAPH_FORWARDED_MAILBOX" ? "Forwarded Support Mailbox" : senderName
          },
          subject: "Mock inbound support request",
          bodyText: `This is a local mock email received by ${input.mailboxEmailAddress}.`,
          bodyHtml: `<p>This is a local mock email received by <strong>${input.mailboxEmailAddress}</strong>.</p>`,
          hasAttachments: false
        }
      ],
      nextSyncCursor: "mock-cursor-001"
    };
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    return {
      providerMessageId: `mock-${Date.now()}`,
      internetMessageId: `<mock-${Date.now()}@local.avidity>`,
      conversationId: input.inReplyTo ?? null
    };
  }

  async getMessageAttachments(_input: GetMessageAttachmentsInput): Promise<MailAttachment[]> {
    return [];
  }
}
