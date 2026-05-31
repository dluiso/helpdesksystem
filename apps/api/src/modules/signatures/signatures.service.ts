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

  sanitizeSignature(html: string) {
    return this.htmlSanitizer.sanitize(html);
  }
}
