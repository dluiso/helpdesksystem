import { Injectable } from "@nestjs/common";
import { HtmlSanitizerService } from "../../common/html/html-sanitizer.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SignaturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly htmlSanitizer: HtmlSanitizerService
  ) {}

  async getForUser(userId: string) {
    return this.prisma.userSignature.findUnique({
      where: { userId }
    });
  }

  async upsertForUser(input: { userId: string; htmlSignature: string; useSignatureByDefault?: boolean }) {
    const htmlSignature = this.sanitizeSignature(input.htmlSignature);
    const plainTextSignature = this.toPlainText(htmlSignature);

    return this.prisma.userSignature.upsert({
      where: { userId: input.userId },
      update: {
        htmlSignature,
        plainTextSignature,
        useSignatureByDefault: input.useSignatureByDefault
      },
      create: {
        userId: input.userId,
        htmlSignature,
        plainTextSignature,
        useSignatureByDefault: input.useSignatureByDefault ?? true
      }
    });
  }

  sanitizeSignature(html: string) {
    return this.htmlSanitizer.sanitize(html);
  }

  private toPlainText(html: string) {
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
}
