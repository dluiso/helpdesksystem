import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { KnowledgeStatus } from "@prisma/client";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { HtmlSanitizerService } from "../../common/html/html-sanitizer.service";
import { decryptSecret, encryptSecret } from "../auth/auth-security.util";
import { AuthenticatedUser } from "../auth/auth.types";
import { FileStorageService } from "../file-storage/file-storage.service";
import { PrismaService } from "../prisma/prisma.service";
import { PreviewOneNoteImportDto, UpdateKnowledgeOneNoteSettingsDto } from "./dto/knowledge-base.dto";

const ONENOTE_SCOPES = ["offline_access", "User.Read", "Notes.Read.All"];

interface GraphCollection<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

interface OneNoteGraphSettings {
  knowledgeOneNoteTenantId?: string | null;
  knowledgeOneNoteClientId?: string | null;
  knowledgeOneNoteClientSecretReference?: string | null;
}

interface OneNoteTokenResponse {
  access_token: string;
  refresh_token?: string;
}

export interface GraphNotebook {
  id: string;
  displayName: string;
  isDefault?: boolean;
  isShared?: boolean;
  userRole?: string;
  sectionsUrl?: string;
  links?: { oneNoteWebUrl?: { href?: string } };
}

interface GraphRecentNotebook {
  displayName: string;
  links?: { oneNoteWebUrl?: { href?: string } };
}

export interface GraphSection {
  id: string;
  displayName: string;
  pagesUrl?: string;
  links?: { oneNoteWebUrl?: { href?: string } };
  parentNotebook?: { id?: string; displayName?: string };
}

export interface GraphPage {
  id: string;
  title: string;
  contentUrl?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  links?: { oneNoteWebUrl?: { href?: string } };
}

@Injectable()
export class KnowledgeOneNoteImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly sanitizer: HtmlSanitizerService,
    private readonly fileStorage: FileStorageService
  ) {}

  async getSettings(user: AuthenticatedUser) {
    const settings = await this.prisma.systemSetting.findUnique({
      where: { organizationId: user.organizationId },
      select: {
        knowledgeOneNoteImportEnabled: true,
        knowledgeOneNoteTenantId: true,
        knowledgeOneNoteClientId: true,
        knowledgeOneNoteClientSecretReference: true,
        knowledgeOneNoteSourceUserPrincipalName: true,
        knowledgeOneNoteDefaultCategoryId: true,
        knowledgeOneNoteRefreshTokenEncrypted: true,
        knowledgeOneNoteConnectedUserEmail: true,
        knowledgeOneNoteConnectedAt: true
      }
    });

    return {
      knowledgeOneNoteImportEnabled: settings?.knowledgeOneNoteImportEnabled ?? false,
      knowledgeOneNoteTenantId: settings?.knowledgeOneNoteTenantId ?? null,
      knowledgeOneNoteClientId: settings?.knowledgeOneNoteClientId ?? null,
      knowledgeOneNoteClientSecretReference: settings?.knowledgeOneNoteClientSecretReference ?? "env:MICROSOFT_CLIENT_SECRET",
      knowledgeOneNoteSourceUserPrincipalName: settings?.knowledgeOneNoteSourceUserPrincipalName ?? null,
      knowledgeOneNoteDefaultCategoryId: settings?.knowledgeOneNoteDefaultCategoryId ?? null,
      knowledgeOneNoteConnectedUserEmail: settings?.knowledgeOneNoteConnectedUserEmail ?? null,
      knowledgeOneNoteConnectedAt: settings?.knowledgeOneNoteConnectedAt ?? null,
      knowledgeOneNoteConnected: Boolean(settings?.knowledgeOneNoteRefreshTokenEncrypted)
    };
  }

  async getStatus(user: AuthenticatedUser) {
    const settings = await this.getSettings(user);
    return {
      enabled: settings.knowledgeOneNoteImportEnabled,
      configured: Boolean(settings.knowledgeOneNoteImportEnabled && settings.knowledgeOneNoteConnected),
      defaultCategoryId: settings.knowledgeOneNoteDefaultCategoryId
    };
  }

  async updateSettings(user: AuthenticatedUser, input: UpdateKnowledgeOneNoteSettingsDto) {
    if (input.knowledgeOneNoteImportEnabled && input.knowledgeOneNoteClientSecretReference && !input.knowledgeOneNoteClientSecretReference.startsWith("env:")) {
      throw new BadRequestException("OneNote client secret reference must use env:VARIABLE_NAME.");
    }
    if (input.knowledgeOneNoteDefaultCategoryId) {
      const category = await this.prisma.knowledgeCategory.findFirst({
        where: { id: input.knowledgeOneNoteDefaultCategoryId, organizationId: user.organizationId },
        select: { id: true }
      });
      if (!category) {
        throw new BadRequestException("Default Knowledge Base category was not found.");
      }
    }

    const updated = await this.prisma.systemSetting.update({
      where: { organizationId: user.organizationId },
      data: {
        knowledgeOneNoteImportEnabled: input.knowledgeOneNoteImportEnabled,
        knowledgeOneNoteTenantId: this.optionalTrim(input.knowledgeOneNoteTenantId),
        knowledgeOneNoteClientId: this.optionalTrim(input.knowledgeOneNoteClientId),
        knowledgeOneNoteClientSecretReference: this.optionalTrim(input.knowledgeOneNoteClientSecretReference) ?? "env:MICROSOFT_CLIENT_SECRET",
        knowledgeOneNoteSourceUserPrincipalName: this.optionalTrim(input.knowledgeOneNoteSourceUserPrincipalName),
        knowledgeOneNoteDefaultCategoryId: input.knowledgeOneNoteDefaultCategoryId ?? null
      },
      select: {
        knowledgeOneNoteImportEnabled: true,
        knowledgeOneNoteTenantId: true,
        knowledgeOneNoteClientId: true,
        knowledgeOneNoteClientSecretReference: true,
        knowledgeOneNoteSourceUserPrincipalName: true,
        knowledgeOneNoteDefaultCategoryId: true,
        knowledgeOneNoteConnectedUserEmail: true,
        knowledgeOneNoteConnectedAt: true
      }
    });

    return updated;
  }

  async createConnectUrl(user: AuthenticatedUser) {
    const settings = await this.getSettings(user);
    const { tenantId, clientId } = this.graphConfig(settings);
    if (!settings.knowledgeOneNoteImportEnabled) {
      throw new BadRequestException("Enable OneNote import before connecting Microsoft OneNote.");
    }
    if (!tenantId || !clientId) {
      throw new InternalServerErrorException("Microsoft Graph OneNote tenant and client ID are not configured.");
    }

    const authorizationUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("redirect_uri", this.redirectUri());
    authorizationUrl.searchParams.set("response_mode", "query");
    authorizationUrl.searchParams.set("scope", ONENOTE_SCOPES.join(" "));
    authorizationUrl.searchParams.set("state", this.signState({ organizationId: user.organizationId, userId: user.id, nonce: randomBytes(16).toString("base64url"), expiresAt: Date.now() + 10 * 60 * 1000 }));
    if (settings.knowledgeOneNoteSourceUserPrincipalName) {
      authorizationUrl.searchParams.set("login_hint", settings.knowledgeOneNoteSourceUserPrincipalName);
    }
    return { authorizationUrl: authorizationUrl.toString(), redirectUri: this.redirectUri() };
  }

  async completeOAuthCallback(input: { code?: string; state?: string; error?: string; errorDescription?: string }) {
    if (input.error) {
      throw new BadRequestException(input.errorDescription || input.error);
    }
    if (!input.code || !input.state) {
      throw new BadRequestException("Microsoft OneNote callback is missing code or state.");
    }
    const state = this.verifyState(input.state);
    const settings = await this.prisma.systemSetting.findUnique({
      where: { organizationId: state.organizationId },
      select: {
        knowledgeOneNoteImportEnabled: true,
        knowledgeOneNoteTenantId: true,
        knowledgeOneNoteClientId: true,
        knowledgeOneNoteClientSecretReference: true
      }
    });
    if (!settings?.knowledgeOneNoteImportEnabled) {
      throw new BadRequestException("OneNote import is disabled.");
    }

    const token = await this.exchangeCodeForToken(settings, input.code);
    if (!token.refresh_token) {
      throw new InternalServerErrorException("Microsoft did not return a refresh token. Confirm offline_access delegated permission is configured.");
    }
    const profile = await this.graphGet<{ userPrincipalName?: string; mail?: string }>("https://graph.microsoft.com/v1.0/me?$select=userPrincipalName,mail", token.access_token);
    await this.prisma.systemSetting.update({
      where: { organizationId: state.organizationId },
      data: {
        knowledgeOneNoteRefreshTokenEncrypted: encryptSecret(token.refresh_token, this.secretEncryptionKey()),
        knowledgeOneNoteConnectedUserEmail: profile.mail || profile.userPrincipalName || null,
        knowledgeOneNoteConnectedAt: new Date()
      }
    });
  }

  async disconnect(user: AuthenticatedUser) {
    await this.prisma.systemSetting.update({
      where: { organizationId: user.organizationId },
      data: {
        knowledgeOneNoteRefreshTokenEncrypted: null,
        knowledgeOneNoteConnectedUserEmail: null,
        knowledgeOneNoteConnectedAt: null
      }
    });
    return { disconnected: true };
  }

  async testConnection(user: AuthenticatedUser) {
    const token = await this.getAccessToken(user);
    const notebooks = await this.graphGetCollection<GraphNotebook>("https://graph.microsoft.com/v1.0/me/onenote/notebooks?$top=1", token);
    return { ok: true, notebooks: notebooks.length };
  }

  async listNotebooks(user: AuthenticatedUser) {
    const token = await this.getAccessToken(user);
    const notebooks = await this.listNotebooksWithToken(token);
    return notebooks.sort((first, second) => {
      if (first.isDefault && !second.isDefault) return -1;
      if (!first.isDefault && second.isDefault) return 1;
      return first.displayName.localeCompare(second.displayName);
    });
  }

  async listSections(user: AuthenticatedUser, notebookId: string) {
    if (!notebookId.trim()) {
      throw new BadRequestException("Notebook ID is required.");
    }
    const token = await this.getAccessToken(user);
    const notebooks = await this.listNotebooksWithToken(token);
    const notebook = notebooks.find((item) => item.id === notebookId);
    const sectionUrls = [
      notebook?.sectionsUrl ? this.withQuery(notebook.sectionsUrl, { $select: "id,displayName,pagesUrl,parentNotebook" }) : null,
      `https://graph.microsoft.com/v1.0/me/onenote/notebooks/${encodeURIComponent(notebookId)}/sections?$select=id,displayName,pagesUrl,parentNotebook`
    ].filter(Boolean) as string[];

    let lastError: unknown;
    for (const sectionUrl of sectionUrls) {
      try {
        return await this.graphGetCollection<GraphSection>(sectionUrl, token);
      } catch (caught) {
        lastError = caught;
      }
    }

    try {
      const sections = await this.graphGetCollection<GraphSection>(
        "https://graph.microsoft.com/v1.0/me/onenote/sections?$top=100&$select=id,displayName,pagesUrl,parentNotebook",
        token
      );
      return sections.filter((section) => section.parentNotebook?.id === notebookId);
    } catch (caught) {
      lastError = caught;
    }

    throw lastError instanceof Error ? lastError : new InternalServerErrorException("Unable to load OneNote notebook sections.");
  }

  async listPages(user: AuthenticatedUser, sectionId: string) {
    if (!sectionId.trim()) {
      throw new BadRequestException("Section ID is required.");
    }
    const token = await this.getAccessToken(user);
    return this.listPagesForSection(sectionId, token);
  }

  async previewImport(user: AuthenticatedUser, input: PreviewOneNoteImportDto) {
    const sectionIds = [...new Set((input.sectionIds ?? []).map((id) => id.trim()).filter(Boolean))].slice(0, 20);
    const pageIds = [...new Set((input.pageIds ?? []).map((id) => id.trim()).filter(Boolean))].slice(0, 50);
    if (!sectionIds.length && !pageIds.length) {
      throw new BadRequestException("Select at least one OneNote section or page to import.");
    }
    const token = await this.getAccessToken(user);
    if (sectionIds.length) {
      return this.previewSectionImport(user, token, sectionIds, input.categoryId ?? null);
    }

    const existing = await this.prisma.knowledgeArticle.findMany({
      where: { organizationId: user.organizationId, sourceType: "ONENOTE", sourceExternalId: { in: pageIds }, deletedAt: null },
      select: { sourceExternalId: true }
    });
    const existingIds = new Set(existing.map((item) => item.sourceExternalId).filter(Boolean));

    const items = [];
    for (const pageId of pageIds) {
      const page = await this.graphGet<GraphPage>(`https://graph.microsoft.com/v1.0/me/onenote/pages/${encodeURIComponent(pageId)}?$select=id,title,links,contentUrl`, token);
      const html = await this.getPageContent(page, token);
      const title = this.cleanTitle(page.title || "Imported OneNote page");
      const sourceUrl = page.links?.oneNoteWebUrl?.href ?? null;
      const alreadyImported = existingIds.has(pageId);
      items.push({
        temporaryId: `onenote-${pageId}`,
        selected: !alreadyImported,
        title,
        content: this.sanitizer.sanitize(this.extractOneNoteBody(html)),
        pages: [{
          title,
          content: this.sanitizer.sanitize(this.extractOneNoteBody(html)),
          sortOrder: 0,
          sourceType: "ONENOTE_PAGE",
          sourceExternalId: pageId,
          sourceUrl
        }],
        categoryId: input.categoryId ?? null,
        categoryName: input.categoryId ? null : "Imported",
        tags: ["imported", "onenote"],
        status: KnowledgeStatus.DRAFT,
        sensitiveWarnings: [],
        sourceType: "ONENOTE",
        sourceExternalId: pageId,
        sourceUrl,
        alreadyImported
      });
    }

    return { source: "onenote", itemCount: items.length, items };
  }

  async syncImportedArticlesMedia(user: AuthenticatedUser, articleIds: string[]) {
    let synced = 0;
    let skipped = 0;
    for (const articleId of [...new Set(articleIds)]) {
      try {
        const result = await this.syncArticleMedia(user, articleId);
        synced += result.synced;
        skipped += result.skipped;
      } catch {
        skipped += 1;
      }
    }
    return { synced, skipped };
  }

  async syncArticleMedia(user: AuthenticatedUser, articleId: string) {
    const article = await this.prisma.knowledgeArticle.findFirst({
      where: { id: articleId, organizationId: user.organizationId, deletedAt: null },
      include: {
        pages: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        attachments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
        category: true,
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        updatedBy: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    });
    if (!article) {
      throw new BadRequestException("Knowledge article was not found.");
    }
    const isOneNoteArticle = article.sourceType === "ONENOTE" || article.sourceType === "ONENOTE_SECTION";
    const oneNotePages = article.pages.filter((page) => page.sourceType === "ONENOTE_PAGE" && page.sourceExternalId);
    const pagesToSync = oneNotePages.length ? oneNotePages : isOneNoteArticle ? article.pages : [];
    if (!pagesToSync.length && !isOneNoteArticle) {
      throw new BadRequestException("This article is not linked to OneNote.");
    }

    const token = await this.getAccessToken(user);
    let synced = 0;
    let skipped = 0;
    const updatedPages: Array<{ id: string; content: string }> = [];

    for (const page of pagesToSync) {
      let sourceHtml = page.content;
      if (page.sourceExternalId) {
        try {
          sourceHtml = this.extractOneNoteBody(await this.getPageContentById(page.sourceExternalId, token));
        } catch {
          sourceHtml = page.content;
        }
      }

      const localized = await this.localizeOneNoteMedia({
        articleId: article.id,
        userId: user.id,
        token,
        currentHtml: page.content,
        sourceHtml: sourceHtml === page.content ? sourceHtml : `${sourceHtml}\n${page.content}`
      });
      synced += localized.synced;
      skipped += localized.skipped;
      if (localized.html !== page.content) {
        updatedPages.push({ id: page.id, content: this.sanitizer.sanitize(localized.html) });
      }
    }

    if (updatedPages.length) {
      await this.prisma.$transaction(
        updatedPages.map((page) =>
          this.prisma.knowledgeArticlePage.update({
            where: { id: page.id },
            data: { content: page.content, sourceSyncedAt: new Date() }
          })
        )
      );
      const pages = await this.prisma.knowledgeArticlePage.findMany({
        where: { articleId: article.id },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
      });
      await this.prisma.knowledgeArticle.update({
        where: { id: article.id },
        data: {
          content: this.sanitizer.sanitize(pages.map((page) => `<section class="knowledge-page-section"><h2>${this.escapeHtml(page.title)}</h2>${page.content}</section>`).join("\n")),
          sourceSyncedAt: new Date(),
          updatedById: user.id
        }
      });
    }

    const updated = await this.prisma.knowledgeArticle.findFirstOrThrow({
      where: { id: article.id },
      include: {
        category: true,
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        updatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        pages: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        attachments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } }
      }
    });

    return { synced, skipped, article: updated };
  }

  private async localizeOneNoteMedia(input: {
    articleId: string;
    userId: string;
    token: string;
    currentHtml: string;
    sourceHtml: string;
  }) {
    const resources = this.extractOneNoteResourceReferences(input.sourceHtml);
    if (!resources.length) {
      return { html: input.currentHtml, synced: 0, skipped: 0 };
    }

    let html = input.currentHtml;
    const appendedLinks: string[] = [];
    let synced = 0;
    let skipped = 0;

    for (const resource of resources) {
      if (!this.isOneNoteGraphResourceUrl(resource.url)) {
        skipped += 1;
        continue;
      }
      const hasGraphReference = this.htmlIncludesResourceUrl(html, resource.url);
      if (!hasGraphReference && this.hasExistingLocalizedResource(html, resource)) {
        skipped += 1;
        continue;
      }

      try {
        const downloaded = await this.downloadGraphResource(resource.url, input.token);
        const attachment = await this.createInlineAttachment({
          articleId: input.articleId,
          userId: input.userId,
          buffer: downloaded.buffer,
          mimeType: downloaded.mimeType,
          originalFilename: this.mediaFilename(resource.alt || resource.name || "onenote-media", downloaded.mimeType, downloaded.buffer)
        });
        const localUrl = `/api/knowledge-base/articles/${input.articleId}/attachments/${attachment.id}/preview`;
        html = this.replaceAttributeValue(html, resource.url, localUrl);
        if (!html.includes(localUrl)) {
          appendedLinks.push(this.renderMissingResource(resource, localUrl, downloaded.mimeType));
        }
        synced += 1;
      } catch {
        skipped += 1;
      }
    }

    if (appendedLinks.length) {
      html = `${html}\n<div class="knowledge-onenote-media">${appendedLinks.join("\n")}</div>`;
    }

    return { html, synced, skipped };
  }

  private extractOneNoteResourceReferences(html: string) {
    const resources: Array<{ url: string; kind: "image" | "file"; alt?: string; name?: string }> = [];
    const seen = new Set<string>();
    const tagPattern = /<(img|a|object|iframe|embed)\b[^>]*>/gi;
    const attributePattern = /\b(src|href|data|data-fullres-src|data-render-src)=("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
    let match: RegExpExecArray | null;
    while ((match = tagPattern.exec(html)) !== null) {
      const tag = match[0];
      const tagName = match[1].toLowerCase();
      let attributeMatch: RegExpExecArray | null;
      attributePattern.lastIndex = 0;
      while ((attributeMatch = attributePattern.exec(tag)) !== null) {
        const url = this.decodeHtmlAttribute(attributeMatch[3] ?? attributeMatch[4] ?? attributeMatch[5] ?? "");
        if (!this.isOneNoteGraphResourceUrl(url) || seen.has(url)) continue;
        seen.add(url);
        resources.push({
          url,
          kind: tagName === "img" ? "image" : "file",
          alt: this.decodeHtmlAttribute(tag.match(/\balt=["']([^"']*)["']/i)?.[1] ?? ""),
          name: this.decodeHtmlAttribute(tag.match(/\btitle=["']([^"']*)["']/i)?.[1] ?? "")
        });
      }
    }
    return resources;
  }

  private isOneNoteGraphResourceUrl(value: string) {
    return /^https:\/\/graph\.microsoft\.com\/(?:v1\.0|beta)\/.+\/onenote\/resources\/.+/i.test(value);
  }

  private async downloadGraphResource(url: string, token: string) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "*/*" }
    });
    if (!response.ok) {
      const details = await response.text();
      throw new InternalServerErrorException(`Unable to download OneNote media${details ? `: ${details.slice(0, 300)}` : "."}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
    return { buffer, mimeType: this.normalizeMediaMimeType(buffer, contentType) };
  }

  private async createInlineAttachment(input: { articleId: string; userId: string; buffer: Buffer; mimeType: string; originalFilename: string }) {
    const stored = await this.fileStorage.saveAttachmentFile({
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      buffer: input.buffer,
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
          articleId: input.articleId,
          uploadedByUserId: input.userId,
          storedFileId: storedFile.id,
          originalFilename: stored.originalFilename,
          storedFilename: stored.storedFilename,
          storageProvider: stored.storageProvider,
          storageKey: stored.storageKey,
          mimeType: stored.mimeType,
          fileExtension: stored.fileExtension,
          fileSize: stored.fileSize,
          sha256Hash: stored.sha256Hash,
          isInline: input.mimeType.startsWith("image/")
        }
      });
    });
  }

  private replaceAttributeValue(html: string, oldValue: string, newValue: string) {
    const escaped = oldValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedAmp = oldValue.replace(/&/g, "&amp;").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return html.replace(new RegExp(escaped, "g"), newValue).replace(new RegExp(escapedAmp, "g"), newValue);
  }

  private htmlIncludesResourceUrl(html: string, resourceUrl: string) {
    return html.includes(resourceUrl) || html.includes(resourceUrl.replace(/&/g, "&amp;"));
  }

  private hasExistingLocalizedResource(html: string, resource: { alt?: string; name?: string }) {
    const label = this.escapeHtml(resource.alt || resource.name || "");
    return Boolean(label && html.includes("/api/knowledge-base/articles/") && html.includes(label));
  }

  private renderMissingResource(resource: { kind: "image" | "file"; alt?: string; name?: string }, localUrl: string, mimeType: string) {
    const label = this.escapeHtml(resource.alt || resource.name || "OneNote media");
    if (resource.kind === "image" && mimeType.startsWith("image/")) {
      return `<p><img src="${localUrl}" alt="${label}" /></p>`;
    }
    return `<p><a href="${localUrl}" target="_blank" rel="noopener noreferrer">${label}</a></p>`;
  }

  private mediaFilename(name: string, mimeType: string, buffer: Buffer) {
    const extension = this.extensionForMimeType(mimeType);
    const base =
      name
        .replace(/\.[a-z0-9]{2,5}$/i, "")
        .replace(/[^a-z0-9._-]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 72) || "onenote-media";
    return `${base}-${createHash("sha256").update(buffer).digest("hex").slice(0, 10)}${extension}`;
  }

  private normalizeMediaMimeType(buffer: Buffer, contentType: string) {
    if (contentType && contentType !== "application/octet-stream") return contentType;
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
    if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
    const gifHeader = buffer.subarray(0, 6).toString("ascii");
    if (gifHeader === "GIF87a" || gifHeader === "GIF89a") return "image/gif";
    if (buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
    return contentType || "application/octet-stream";
  }

  private extensionForMimeType(mimeType: string) {
    switch (mimeType) {
      case "image/png":
        return ".png";
      case "image/jpeg":
        return ".jpg";
      case "image/gif":
        return ".gif";
      case "image/webp":
        return ".webp";
      case "application/pdf":
        return ".pdf";
      default:
        return "";
    }
  }

  private async previewSectionImport(user: AuthenticatedUser, token: string, sectionIds: string[], categoryId: string | null) {
    const existing = await this.prisma.knowledgeArticle.findMany({
      where: { organizationId: user.organizationId, sourceType: "ONENOTE_SECTION", sourceExternalId: { in: sectionIds }, deletedAt: null },
      select: { sourceExternalId: true }
    });
    const existingIds = new Set(existing.map((item) => item.sourceExternalId).filter(Boolean));
    const items = [];

    for (const sectionId of sectionIds) {
      const section = await this.getSection(sectionId, token);
      const pages = await this.listPagesForSection(sectionId, token);
      const articlePages = await this.mapWithConcurrency(pages, 3, async (page, index) => {
        const html = await this.getPageContent(page, token);
        const title = this.cleanTitle(page.title || `Page ${index + 1}`);
        return {
          title,
          content: this.sanitizer.sanitize(this.extractOneNoteBody(html)),
          sortOrder: index,
          sourceType: "ONENOTE_PAGE",
          sourceExternalId: page.id,
          sourceUrl: page.links?.oneNoteWebUrl?.href ?? null
        };
      });
      const alreadyImported = existingIds.has(sectionId);
      items.push({
        temporaryId: `onenote-section-${sectionId}`,
        selected: !alreadyImported,
        title: this.cleanTitle(section.displayName || "Imported OneNote section"),
        content: this.sanitizer.sanitize(articlePages.map((page) => `<h2>${page.title}</h2>${page.content}`).join("\n")),
        pages: articlePages,
        categoryId,
        categoryName: categoryId ? null : "Imported",
        tags: ["imported", "onenote"],
        status: KnowledgeStatus.DRAFT,
        sensitiveWarnings: [],
        sourceType: "ONENOTE_SECTION",
        sourceExternalId: sectionId,
        sourceUrl: section.links?.oneNoteWebUrl?.href ?? null,
        alreadyImported
      });
    }

    return { source: "onenote", itemCount: items.length, items };
  }

  private async getAccessToken(user: AuthenticatedUser) {
    const settings = await this.prisma.systemSetting.findUnique({
      where: { organizationId: user.organizationId },
      select: {
        knowledgeOneNoteImportEnabled: true,
        knowledgeOneNoteTenantId: true,
        knowledgeOneNoteClientId: true,
        knowledgeOneNoteClientSecretReference: true,
        knowledgeOneNoteRefreshTokenEncrypted: true
      }
    });

    if (!settings?.knowledgeOneNoteImportEnabled) {
      throw new BadRequestException("OneNote import is disabled.");
    }
    if (!settings.knowledgeOneNoteRefreshTokenEncrypted) {
      throw new BadRequestException("Microsoft OneNote is not connected. Connect a Microsoft account before importing.");
    }
    const refreshToken = decryptSecret(settings.knowledgeOneNoteRefreshTokenEncrypted, this.secretEncryptionKey());
    const token = await this.refreshAccessToken(settings, refreshToken);
    if (token.refresh_token && token.refresh_token !== refreshToken) {
      await this.prisma.systemSetting.update({
        where: { organizationId: user.organizationId },
        data: { knowledgeOneNoteRefreshTokenEncrypted: encryptSecret(token.refresh_token, this.secretEncryptionKey()) }
      });
    }
    return token.access_token;
  }

  private async exchangeCodeForToken(settings: OneNoteGraphSettings, code: string) {
    const { tenantId, clientId, clientSecret } = this.graphConfig(settings);
    if (!tenantId || !clientId || !clientSecret) {
      throw new InternalServerErrorException("Microsoft Graph OneNote credentials are not configured.");
    }
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: this.redirectUri(),
      scope: ONENOTE_SCOPES.join(" "),
      grant_type: "authorization_code"
    });
    return this.tokenRequest(tenantId, body);
  }

  private async refreshAccessToken(settings: OneNoteGraphSettings, refreshToken: string) {
    const { tenantId, clientId, clientSecret } = this.graphConfig(settings);
    if (!tenantId || !clientId || !clientSecret) {
      throw new InternalServerErrorException("Microsoft Graph OneNote credentials are not configured.");
    }
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      scope: ONENOTE_SCOPES.join(" "),
      grant_type: "refresh_token"
    });
    return this.tokenRequest(tenantId, body);
  }

  private async tokenRequest(tenantId: string, body: URLSearchParams): Promise<OneNoteTokenResponse> {
    const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    if (!response.ok) {
      const details = await response.text();
      throw new InternalServerErrorException(`Unable to authenticate with Microsoft Graph OneNote${details ? `: ${details.slice(0, 500)}` : "."}`);
    }

    const token = (await response.json()) as { access_token?: string; refresh_token?: string };
    if (!token.access_token) {
      throw new InternalServerErrorException("Microsoft Graph token response did not include an access token.");
    }
    return { access_token: token.access_token, refresh_token: token.refresh_token };
  }

  private async graphGetCollection<T>(url: string, token: string) {
    const results: T[] = [];
    let nextUrl: string | undefined = url;
    while (nextUrl) {
      const data: GraphCollection<T> = await this.graphGet<GraphCollection<T>>(nextUrl, token);
      results.push(...data.value);
      nextUrl = data["@odata.nextLink"];
    }
    return results;
  }

  private async listNotebooksWithToken(token: string) {
    const notebooks = await this.graphGetCollection<GraphNotebook>(
      "https://graph.microsoft.com/v1.0/me/onenote/notebooks?$select=id,displayName,isDefault,isShared,userRole,sectionsUrl,links",
      token
    );
    const byId = new Map(notebooks.map((notebook) => [notebook.id, notebook]));
    const knownWebUrls = new Set(notebooks.map((notebook) => notebook.links?.oneNoteWebUrl?.href).filter(Boolean));
    const recentNotebooks = await this.listRecentNotebooksWithToken(token);

    for (const recentNotebook of recentNotebooks) {
      const webUrl = recentNotebook.links?.oneNoteWebUrl?.href;
      if (!webUrl || knownWebUrls.has(webUrl)) continue;
      const notebook = await this.getNotebookFromWebUrl(webUrl, token);
      if (notebook?.id && !byId.has(notebook.id)) {
        byId.set(notebook.id, { ...notebook, isShared: notebook.isShared ?? true });
      }
    }

    return [...byId.values()];
  }

  private async getSection(sectionId: string, token: string) {
    return this.graphGet<GraphSection>(
      `https://graph.microsoft.com/v1.0/me/onenote/sections/${encodeURIComponent(sectionId)}?$select=id,displayName,pagesUrl,links,parentNotebook`,
      token
    );
  }

  private async listPagesForSection(sectionId: string, token: string) {
    let section: GraphSection | null = null;
    try {
      section = await this.getSection(sectionId, token);
    } catch {
      section = null;
    }
    const pageUrls = [
      section?.pagesUrl ? this.withQuery(section.pagesUrl, { $top: "100", $select: "id,title,createdDateTime,lastModifiedDateTime,links,contentUrl" }) : null,
      `https://graph.microsoft.com/v1.0/me/onenote/sections/${encodeURIComponent(sectionId)}/pages?$top=100&$select=id,title,createdDateTime,lastModifiedDateTime,links,contentUrl`
    ].filter(Boolean) as string[];

    let lastError: unknown;
    for (const pageUrl of pageUrls) {
      try {
        return await this.graphGetCollection<GraphPage>(pageUrl, token);
      } catch (caught) {
        lastError = caught;
      }
    }
    throw lastError instanceof Error ? lastError : new InternalServerErrorException("Unable to load OneNote section pages.");
  }

  private async getPageContent(page: GraphPage, token: string) {
    const contentUrl = page.contentUrl ? this.withQuery(page.contentUrl, { includeIDs: "true" }) : null;
    const urls = [
      contentUrl,
      `https://graph.microsoft.com/v1.0/me/onenote/pages/${encodeURIComponent(page.id)}/content?includeIDs=true`
    ].filter(Boolean) as string[];
    let lastError: unknown;
    for (const url of urls) {
      try {
        return await this.graphGetText(url, token);
      } catch (caught) {
        lastError = caught;
      }
    }
    throw lastError instanceof Error ? lastError : new InternalServerErrorException("Unable to load OneNote page content.");
  }

  private async getPageContentById(pageId: string, token: string) {
    const directUrl = `https://graph.microsoft.com/v1.0/me/onenote/pages/${encodeURIComponent(pageId)}/content?includeIDs=true`;
    try {
      return await this.graphGetText(directUrl, token);
    } catch {
      const graphPage = await this.graphGet<GraphPage>(
        `https://graph.microsoft.com/v1.0/me/onenote/pages/${encodeURIComponent(pageId)}?$select=id,title,links,contentUrl`,
        token
      );
      return this.getPageContent(graphPage, token);
    }
  }

  private async mapWithConcurrency<T, R>(items: T[], limit: number, handler: (item: T, index: number) => Promise<R>) {
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    await Promise.all(
      Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (nextIndex < items.length) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          results[currentIndex] = await handler(items[currentIndex], currentIndex);
        }
      })
    );
    return results;
  }

  private async listRecentNotebooksWithToken(token: string) {
    try {
      return await this.graphGetCollection<GraphRecentNotebook>(
        "https://graph.microsoft.com/v1.0/me/onenote/notebooks/getRecentNotebooks(includePersonalNotebooks=true)",
        token
      );
    } catch {
      return [];
    }
  }

  private async getNotebookFromWebUrl(webUrl: string, token: string) {
    try {
      return await this.graphGet<GraphNotebook>(
        `https://graph.microsoft.com/v1.0/me/onenote/notebooks/getNotebookFromWebUrl(webUrl='${encodeURIComponent(webUrl.replace(/'/g, "''"))}')?$select=id,displayName,isDefault,isShared,userRole,sectionsUrl,links`,
        token
      );
    } catch {
      return null;
    }
  }

  private async graphGet<T>(url: string, token: string) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
    });
    if (!response.ok) {
      const details = await response.text();
      throw new InternalServerErrorException(
        `Microsoft Graph OneNote request failed with status ${response.status}${details ? `: ${details.slice(0, 500)}` : "."}`
      );
    }
    return response.json() as Promise<T>;
  }

  private async graphGetText(url: string, token: string) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "text/html" }
    });
    if (!response.ok) {
      const details = await response.text();
      throw new InternalServerErrorException(
        `Microsoft Graph OneNote content request failed with status ${response.status}${details ? `: ${details.slice(0, 500)}` : "."}`
      );
    }
    return response.text();
  }

  private extractOneNoteBody(html: string) {
    const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
    return body.trim() || "<p></p>";
  }

  private decodeHtmlAttribute(value: string) {
    return value.replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  }

  private escapeHtml(value: string) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  private cleanTitle(value: string) {
    return value.trim().replace(/\s+/g, " ").slice(0, 180) || "Imported OneNote page";
  }

  private withQuery(url: string, params: Record<string, string>) {
    const parsed = new URL(url);
    Object.entries(params).forEach(([key, value]) => parsed.searchParams.set(key, value));
    return parsed.toString();
  }

  private resolveSecret(reference: string | null | undefined) {
    if (!reference) return null;
    if (reference.startsWith("env:")) {
      return this.config.get<string>(reference.slice(4)) ?? null;
    }
    return null;
  }

  private graphConfig(settings: OneNoteGraphSettings) {
    return {
      tenantId: settings.knowledgeOneNoteTenantId || this.config.get<string>("MICROSOFT_TENANT_ID"),
      clientId: settings.knowledgeOneNoteClientId || this.config.get<string>("MICROSOFT_CLIENT_ID"),
      clientSecret: this.resolveSecret(settings.knowledgeOneNoteClientSecretReference) || this.config.get<string>("MICROSOFT_CLIENT_SECRET")
    };
  }

  private redirectUri() {
    const appUrl = (this.config.get<string>("APP_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
    return `${appUrl}/api/knowledge-base/config/onenote/callback`;
  }

  private signState(payload: { organizationId: string; userId: string; nonce: string; expiresAt: number }) {
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const signature = createHmac("sha256", this.secretEncryptionKey()).update(encoded).digest("base64url");
    return `${encoded}.${signature}`;
  }

  private verifyState(value: string) {
    const [encoded, signature] = value.split(".");
    if (!encoded || !signature) {
      throw new BadRequestException("Microsoft OneNote callback state is invalid.");
    }
    const expected = createHmac("sha256", this.secretEncryptionKey()).update(encoded).digest("base64url");
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new BadRequestException("Microsoft OneNote callback state is invalid.");
    }
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { organizationId?: string; userId?: string; expiresAt?: number };
    if (!payload.organizationId || !payload.userId || !payload.expiresAt || payload.expiresAt < Date.now()) {
      throw new BadRequestException("Microsoft OneNote callback state expired or is invalid.");
    }
    return { organizationId: payload.organizationId, userId: payload.userId };
  }

  private secretEncryptionKey() {
    return this.config.get<string>("SESSION_SECRET") ?? "";
  }

  private optionalTrim(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }
}
