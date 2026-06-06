import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { KnowledgeStatus, KnowledgeVisibility, Prisma } from "@prisma/client";
import { PDFParse } from "pdf-parse";
import { createHash } from "crypto";
import { HtmlSanitizerService } from "../../common/html/html-sanitizer.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { FileStorageService } from "../file-storage/file-storage.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CommitKnowledgeImportDto,
  CreateKnowledgeArticleDto,
  CreateKnowledgeCategoryDto,
  ListKnowledgeArticlesQueryDto,
  UpdateKnowledgeArticleDto,
  UpdateKnowledgeCategoryDto
} from "./dto/knowledge-base.dto";

const SENSITIVE_PATTERNS: Array<{ id: string; pattern: RegExp; tag?: string }> = [
  { id: "contains_password", pattern: /\b(pass(word)?|pwd|wifi key)\b/i, tag: "credentials" },
  { id: "contains_username", pattern: /\b(user(name)?|login)\b/i, tag: "credentials" },
  { id: "contains_2fa_or_secret", pattern: /\b(2fa|mfa|secret|token|product key|license key)\b/i, tag: "credentials" },
  { id: "contains_ip_address", pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/, tag: "network" }
];

@Injectable()
export class KnowledgeBaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sanitizer: HtmlSanitizerService,
    private readonly fileStorage: FileStorageService
  ) {}

  async listArticles(user: AuthenticatedUser, query: ListKnowledgeArticlesQueryDto) {
    const where: Prisma.KnowledgeArticleWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.tag ? { tags: { has: query.tag.trim().toLowerCase() } } : {})
    };
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
        { tags: { has: search.toLowerCase() } }
      ];
    }

    return this.prisma.knowledgeArticle.findMany({
      where,
      include: this.articleInclude(),
      orderBy: [{ updatedAt: "desc" }, { title: "asc" }]
    });
  }

  getArticle(articleId: string, user: AuthenticatedUser) {
    return this.findArticleOrThrow(articleId, user.organizationId);
  }

  listCategories(user: AuthenticatedUser) {
    return this.prisma.knowledgeCategory.findMany({
      where: { organizationId: user.organizationId },
      include: { _count: { select: { articles: true } } },
      orderBy: { name: "asc" }
    });
  }

  async createCategory(user: AuthenticatedUser, input: CreateKnowledgeCategoryDto) {
    const name = input.name.trim();
    return this.prisma.knowledgeCategory.create({
      data: {
        organizationId: user.organizationId,
        name,
        slug: await this.uniqueCategorySlug(user.organizationId, name),
        description: this.optionalTrim(input.description)
      }
    });
  }

  async updateCategory(categoryId: string, user: AuthenticatedUser, input: UpdateKnowledgeCategoryDto) {
    const existing = await this.prisma.knowledgeCategory.findFirst({
      where: { id: categoryId, organizationId: user.organizationId }
    });
    if (!existing) {
      throw new NotFoundException("Knowledge category was not found.");
    }

    const nextName = input.name?.trim();
    return this.prisma.knowledgeCategory.update({
      where: { id: categoryId },
      data: {
        ...(nextName ? { name: nextName, slug: nextName === existing.name ? existing.slug : await this.uniqueCategorySlug(user.organizationId, nextName) } : {}),
        ...(input.description !== undefined ? { description: this.optionalTrim(input.description) } : {})
      }
    });
  }

  async createArticle(user: AuthenticatedUser, input: CreateKnowledgeArticleDto) {
    await this.validateCategory(user.organizationId, input.categoryId ?? null);
    const status = input.status ?? KnowledgeStatus.DRAFT;
    const title = input.title.trim();
    return this.prisma.knowledgeArticle.create({
      data: {
        organizationId: user.organizationId,
        categoryId: input.categoryId ?? null,
        title,
        slug: await this.uniqueArticleSlug(user.organizationId, title),
        content: this.sanitizer.sanitize(input.content),
        tags: this.normalizeTags(input.tags),
        status,
        visibility: input.visibility ?? KnowledgeVisibility.INTERNAL,
        createdById: user.id,
        updatedById: user.id,
        publishedAt: status === KnowledgeStatus.PUBLISHED ? new Date() : null
      },
      include: this.articleInclude()
    });
  }

  async updateArticle(articleId: string, user: AuthenticatedUser, input: UpdateKnowledgeArticleDto) {
    const existing = await this.findArticleOrThrow(articleId, user.organizationId);
    const nextCategoryId = input.categoryId !== undefined ? input.categoryId : existing.categoryId;
    await this.validateCategory(user.organizationId, nextCategoryId ?? null);
    const nextTitle = input.title?.trim();
    const nextStatus = input.status ?? existing.status;

    return this.prisma.knowledgeArticle.update({
      where: { id: existing.id },
      data: {
        ...(nextTitle ? { title: nextTitle, slug: nextTitle === existing.title ? existing.slug : await this.uniqueArticleSlug(user.organizationId, nextTitle) } : {}),
        ...(input.content !== undefined ? { content: this.sanitizer.sanitize(input.content) } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.tags !== undefined ? { tags: this.normalizeTags(input.tags) } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        ...(input.status !== undefined
          ? {
              status: nextStatus,
              publishedAt: nextStatus === KnowledgeStatus.PUBLISHED ? existing.publishedAt ?? new Date() : null
            }
          : {}),
        updatedById: user.id
      },
      include: this.articleInclude()
    });
  }

  async deleteArticle(articleId: string, user: AuthenticatedUser) {
    const article = await this.findArticleOrThrow(articleId, user.organizationId);
    await this.prisma.knowledgeArticle.update({
      where: { id: article.id },
      data: { deletedAt: new Date(), status: KnowledgeStatus.ARCHIVED, updatedById: user.id }
    });
    return { deleted: true };
  }

  async uploadAttachment(
    articleId: string,
    user: AuthenticatedUser,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    isInline = false
  ) {
    const article = await this.findArticleOrThrow(articleId, user.organizationId);
    const stored = await this.fileStorage.saveAttachmentFile({
      originalFilename: file.originalname,
      mimeType: file.mimetype || "application/octet-stream",
      buffer: file.buffer,
      folder: "knowledge-base"
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

      return tx.knowledgeArticleAttachment.create({
        data: {
          articleId: article.id,
          uploadedByUserId: user.id,
          storedFileId: storedFile.id,
          originalFilename: stored.originalFilename,
          storedFilename: stored.storedFilename,
          storageProvider: stored.storageProvider,
          storageKey: stored.storageKey,
          mimeType: stored.mimeType,
          fileExtension: stored.fileExtension,
          fileSize: stored.fileSize,
          sha256Hash: stored.sha256Hash,
          isInline
        }
      });
    });
  }

  async getAttachment(articleId: string, attachmentId: string, user: AuthenticatedUser) {
    const article = await this.findArticleOrThrow(articleId, user.organizationId);
    const attachment = await this.prisma.knowledgeArticleAttachment.findFirst({
      where: { id: attachmentId, articleId: article.id, deletedAt: null },
      include: { storedFile: true }
    });
    if (!attachment) {
      throw new NotFoundException("Knowledge attachment was not found.");
    }

    return {
      attachment,
      stream: await this.fileStorage.getFileStream(attachment.storageKey)
    };
  }

  async createDraftFromTicket(ticketId: string, user: AuthenticatedUser) {
    const ticket = await this.prisma.ticket.findFirst({
      where: this.ticketReferenceWhere(ticketId, user.organizationId),
      include: {
        client: { select: { name: true } },
        messages: {
          include: {
            authorUser: { select: { firstName: true, lastName: true } },
            authorContact: true
          },
          orderBy: { createdAt: "asc" }
        }
      }
    });
    if (!ticket) {
      throw new NotFoundException("Ticket was not found.");
    }

    const content = [
      `<h2>${this.escapeHtml(ticket.subject)}</h2>`,
      `<p><strong>Source ticket:</strong> ${this.escapeHtml(ticket.ticketNumber)}</p>`,
      ticket.client?.name ? `<p><strong>Client:</strong> ${this.escapeHtml(ticket.client.name)}</p>` : "",
      "<h3>Resolution Notes</h3>",
      "<p>Document the final resolution here before publishing.</p>",
      "<h3>Ticket Conversation Summary</h3>",
      ...ticket.messages.map((message) => {
        const author = message.authorUser
          ? `${message.authorUser.firstName} ${message.authorUser.lastName}`
          : message.authorContact
            ? `${message.authorContact.firstName} ${message.authorContact.lastName}`
            : message.senderEmail ?? "Unknown";
        return `<blockquote><strong>${this.escapeHtml(author)} - ${message.direction}</strong><br>${message.sanitizedBodyHtml ?? this.escapeHtml(message.bodyText)}</blockquote>`;
      })
    ].join("\n");

    return this.createArticle(user, {
      title: ticket.subject,
      content,
      status: KnowledgeStatus.DRAFT,
      visibility: KnowledgeVisibility.INTERNAL,
      tags: ["ticket", ticket.ticketNumber.toLowerCase()]
    });
  }

  async previewPdfImport(
    user: AuthenticatedUser,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer }
  ) {
    if (!file.originalname.toLowerCase().endsWith(".pdf") && file.mimetype !== "application/pdf") {
      throw new BadRequestException("Upload a PDF file.");
    }

    const parser = new PDFParse({ data: file.buffer });
    const parsed = await parser.getText();
    await parser.destroy();
    const pages = this.splitPdfTextIntoPages(parsed.text);
    const items = pages.map((text, index) => this.toImportItem(text, index + 1));

    return {
      sourceFilename: file.originalname,
      sourceHash: createHash("sha256").update(file.buffer).digest("hex"),
      itemCount: items.length,
      items
    };
  }

  async commitImport(user: AuthenticatedUser, input: CommitKnowledgeImportDto) {
    const selected = input.items.filter((item) => item.selected !== false && item.title.trim() && item.content.trim());
    const results = [];
    for (const item of selected) {
      const categoryId = item.categoryId ?? (item.categoryName ? (await this.findOrCreateCategory(user, item.categoryName)).id : null);
      results.push(
        await this.createArticle(user, {
          title: item.title,
          content: item.content,
          categoryId,
          tags: item.tags,
          status: KnowledgeStatus.DRAFT,
          visibility: KnowledgeVisibility.INTERNAL
        })
      );
    }

    return { imported: results.length, articles: results };
  }

  private articleInclude() {
    return {
      category: true,
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      updatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      attachments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } }
    } satisfies Prisma.KnowledgeArticleInclude;
  }

  private async findArticleOrThrow(articleId: string, organizationId: string) {
    const article = await this.prisma.knowledgeArticle.findFirst({
      where: { id: articleId, organizationId, deletedAt: null },
      include: this.articleInclude()
    });
    if (!article) {
      throw new NotFoundException("Knowledge article was not found.");
    }
    return article;
  }

  private async validateCategory(organizationId: string, categoryId: string | null) {
    if (!categoryId) {
      return;
    }
    const category = await this.prisma.knowledgeCategory.findFirst({ where: { id: categoryId, organizationId } });
    if (!category) {
      throw new BadRequestException("Knowledge category was not found.");
    }
  }

  private async findOrCreateCategory(user: AuthenticatedUser, name: string) {
    const trimmed = name.trim();
    const slug = this.slugify(trimmed);
    const existing = await this.prisma.knowledgeCategory.findFirst({
      where: { organizationId: user.organizationId, slug }
    });
    if (existing) {
      return existing;
    }
    return this.prisma.knowledgeCategory.create({
      data: { organizationId: user.organizationId, name: trimmed, slug: await this.uniqueCategorySlug(user.organizationId, trimmed) }
    });
  }

  private async uniqueCategorySlug(organizationId: string, value: string) {
    return this.uniqueSlug(value, async (slug) =>
      Boolean(await this.prisma.knowledgeCategory.findFirst({ where: { organizationId, slug }, select: { id: true } }))
    );
  }

  private async uniqueArticleSlug(organizationId: string, value: string) {
    return this.uniqueSlug(value, async (slug) =>
      Boolean(await this.prisma.knowledgeArticle.findFirst({ where: { organizationId, slug }, select: { id: true } }))
    );
  }

  private async uniqueSlug(value: string, exists: (slug: string) => Promise<boolean>) {
    const base = this.slugify(value);
    let slug = base;
    let suffix = 2;
    while (await exists(slug)) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }
    return slug;
  }

  private slugify(value: string) {
    return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "article";
  }

  private normalizeTags(tags: string[] | undefined) {
    return [...new Set((tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
  }

  private optionalTrim(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  splitPdfTextIntoPages(text: string) {
    const normalizedText = text.replace(/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/gim, "");
    const pagePattern = /(^|\n)\s*([A-Za-z0-9 &.'/-]+?) Page \d+\s*(?=\n|$)/g;
    const matches = [...normalizedText.matchAll(pagePattern)];
    if (matches.length < 2) {
      return normalizedText.split(/\f+/).map((page) => page.trim()).filter(Boolean);
    }

    const pages: string[] = [];
    let start = 0;
    for (const match of matches) {
      const end = match.index ?? 0;
      const page = normalizedText.slice(start, end).trim();
      if (page) {
        pages.push(page);
      }
      start = end + match[0].length;
    }
    const last = normalizedText.slice(start).trim();
    if (last) {
      pages.push(last);
    }
    return pages.length ? pages : [normalizedText.trim()].filter(Boolean);
  }

  private toImportItem(rawText: string, pageNumber: number) {
    const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const title = this.cleanImportTitle(this.detectImportTitle(lines, pageNumber));
    const categoryName = this.detectCategory(rawText) ?? "Imported";
    const warnings = SENSITIVE_PATTERNS.filter((item) => item.pattern.test(rawText)).map((item) => item.id);
    const tags = [
      ...SENSITIVE_PATTERNS.filter((item) => item.tag && item.pattern.test(rawText)).map((item) => item.tag as string),
      ...(rawText.match(/office 365|microsoft 365|admin\.microsoft/i) ? ["office-365"] : []),
      ...(rawText.match(/router|wifi|ip|network|gateway/i) ? ["network"] : []),
      ...(rawText.match(/troubleshoot|fix|error|issue/i) ? ["troubleshooting"] : []),
      "imported"
    ];

    return {
      temporaryId: `page-${pageNumber}`,
      selected: true,
      title,
      categoryName,
      tags: this.normalizeTags(tags),
      status: KnowledgeStatus.DRAFT,
      sensitiveWarnings: [...new Set(warnings)],
      content: this.sanitizer.sanitize(`<pre>${this.escapeHtml(rawText)}</pre>`)
    };
  }

  private detectCategory(rawText: string) {
    const footer = [...rawText.matchAll(/^\s*([A-Za-z0-9 &.'/-]+?) Page \d+\s*$/gm)].at(-1)?.[1];
    return footer?.trim() || null;
  }

  private cleanImportTitle(value: string) {
    return value.replace(/[•○▪]+/g, "").trim().slice(0, 180) || "Imported note";
  }

  private detectImportTitle(lines: string[], pageNumber: number) {
    return (
      lines.find(
        (line) =>
          !/^https?:\/\//i.test(line) &&
          !/^[A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}/.test(line) &&
          !/^[•○▪-]+$/.test(line)
      ) ?? `Imported page ${pageNumber}`
    );
  }

  private escapeHtml(value: string) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  private ticketReferenceWhere(ticketRef: string, organizationId: string): Prisma.TicketWhereInput {
    const normalized = ticketRef.trim();
    const matchers: Prisma.TicketWhereInput[] = [{ ticketNumber: normalized.toUpperCase() }];
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
      matchers.push({ id: normalized });
    }
    return { organizationId, deletedAt: null, OR: matchers };
  }
}
