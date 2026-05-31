import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const AUTO_GENERATED_HEADERS = new Set(["auto-replied", "auto-generated", "bulk", "junk"]);
const NO_REPLY_PREFIXES = ["no-reply@", "noreply@", "do-not-reply@", "donotreply@"];

@Injectable()
export class AutoRepliesService {
  constructor(private readonly prisma: PrismaService) {}

  shouldSuppressAutoReply(input: { senderEmail: string; autoSubmittedHeader?: string | null; threadKey?: string | null }) {
    const sender = input.senderEmail.trim().toLowerCase();
    const header = input.autoSubmittedHeader?.trim().toLowerCase();

    if (NO_REPLY_PREFIXES.some((prefix) => sender.startsWith(prefix))) {
      return true;
    }

    if (header && AUTO_GENERATED_HEADERS.has(header)) {
      return true;
    }

    return false;
  }

  async hasRecentAutoReply(recipientEmail: string, threadKey: string | null) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const count = await this.prisma.autoReplyHistory.count({
      where: {
        recipientEmail: recipientEmail.toLowerCase(),
        threadKey,
        sentAt: { gte: since }
      }
    });

    return count > 0;
  }
}
