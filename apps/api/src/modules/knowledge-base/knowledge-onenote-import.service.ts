import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { KnowledgeStatus } from "@prisma/client";
import { HtmlSanitizerService } from "../../common/html/html-sanitizer.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { PreviewOneNoteImportDto, UpdateKnowledgeOneNoteSettingsDto } from "./dto/knowledge-base.dto";

interface GraphCollection<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

export interface GraphNotebook {
  id: string;
  displayName: string;
  isDefault?: boolean;
  links?: { oneNoteWebUrl?: { href?: string } };
}

export interface GraphSection {
  id: string;
  displayName: string;
  pagesUrl?: string;
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
    private readonly sanitizer: HtmlSanitizerService
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
        knowledgeOneNoteDefaultCategoryId: true
      }
    });

    return {
      knowledgeOneNoteImportEnabled: settings?.knowledgeOneNoteImportEnabled ?? false,
      knowledgeOneNoteTenantId: settings?.knowledgeOneNoteTenantId ?? null,
      knowledgeOneNoteClientId: settings?.knowledgeOneNoteClientId ?? null,
      knowledgeOneNoteClientSecretReference: settings?.knowledgeOneNoteClientSecretReference ?? "env:MICROSOFT_CLIENT_SECRET",
      knowledgeOneNoteSourceUserPrincipalName: settings?.knowledgeOneNoteSourceUserPrincipalName ?? null,
      knowledgeOneNoteDefaultCategoryId: settings?.knowledgeOneNoteDefaultCategoryId ?? null
    };
  }

  async getStatus(user: AuthenticatedUser) {
    const settings = await this.getSettings(user);
    return {
      enabled: settings.knowledgeOneNoteImportEnabled,
      configured: Boolean(settings.knowledgeOneNoteImportEnabled && settings.knowledgeOneNoteSourceUserPrincipalName),
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
        knowledgeOneNoteDefaultCategoryId: true
      }
    });

    return updated;
  }

  async testConnection(user: AuthenticatedUser) {
    const token = await this.getAccessToken(user);
    const notebooks = await this.graphGetCollection<GraphNotebook>(await this.userUrl(user, "/onenote/notebooks?$top=1"), token);
    return { ok: true, notebooks: notebooks.length };
  }

  async listNotebooks(user: AuthenticatedUser) {
    const token = await this.getAccessToken(user);
    return this.graphGetCollection<GraphNotebook>(
      await this.userUrl(user, "/onenote/notebooks?$select=id,displayName,isDefault,links"),
      token
    );
  }

  async listSections(user: AuthenticatedUser, notebookId: string) {
    if (!notebookId.trim()) {
      throw new BadRequestException("Notebook ID is required.");
    }
    const token = await this.getAccessToken(user);
    return this.graphGetCollection<GraphSection>(
      await this.userUrl(user, `/onenote/notebooks/${encodeURIComponent(notebookId)}/sections?$select=id,displayName,pagesUrl`),
      token
    );
  }

  async listPages(user: AuthenticatedUser, sectionId: string) {
    if (!sectionId.trim()) {
      throw new BadRequestException("Section ID is required.");
    }
    const token = await this.getAccessToken(user);
    return this.graphGetCollection<GraphPage>(
      await this.userUrl(
        user,
        `/onenote/sections/${encodeURIComponent(sectionId)}/pages?$top=100&$select=id,title,createdDateTime,lastModifiedDateTime,links,contentUrl`
      ),
      token
    );
  }

  async previewImport(user: AuthenticatedUser, input: PreviewOneNoteImportDto) {
    const pageIds = [...new Set(input.pageIds.map((id) => id.trim()).filter(Boolean))].slice(0, 50);
    if (!pageIds.length) {
      throw new BadRequestException("Select at least one OneNote page to import.");
    }
    const token = await this.getAccessToken(user);
    const sourceUser = await this.sourceUser(user);
    const existing = await this.prisma.knowledgeArticle.findMany({
      where: { organizationId: user.organizationId, sourceType: "ONENOTE", sourceExternalId: { in: pageIds }, deletedAt: null },
      select: { sourceExternalId: true }
    });
    const existingIds = new Set(existing.map((item) => item.sourceExternalId).filter(Boolean));

    const items = [];
    for (const pageId of pageIds) {
      const page = await this.graphGet<GraphPage>(`https://graph.microsoft.com/v1.0/users/${sourceUser}/onenote/pages/${encodeURIComponent(pageId)}?$select=id,title,links`, token);
      const html = await this.graphGetText(`https://graph.microsoft.com/v1.0/users/${sourceUser}/onenote/pages/${encodeURIComponent(pageId)}/content?includeIDs=true`, token);
      const title = this.cleanTitle(page.title || "Imported OneNote page");
      const sourceUrl = page.links?.oneNoteWebUrl?.href ?? null;
      const alreadyImported = existingIds.has(pageId);
      items.push({
        temporaryId: `onenote-${pageId}`,
        selected: !alreadyImported,
        title,
        content: this.sanitizer.sanitize(this.extractOneNoteBody(html)),
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

  private async userUrl(user: AuthenticatedUser, path: string) {
    return `https://graph.microsoft.com/v1.0/users/${await this.sourceUser(user)}${path}`;
  }

  private async sourceUser(user: AuthenticatedUser) {
    const settings = await this.getSettings(user);
    const value = settings.knowledgeOneNoteSourceUserPrincipalName?.trim();
    if (!settings.knowledgeOneNoteImportEnabled || !value) {
      throw new BadRequestException("OneNote import is not enabled or no source user is configured.");
    }
    return encodeURIComponent(value);
  }

  private async getAccessToken(user: AuthenticatedUser) {
    const settings = await this.getSettings(user);
    const tenantId = settings.knowledgeOneNoteTenantId || this.config.get<string>("MICROSOFT_TENANT_ID");
    const clientId = settings.knowledgeOneNoteClientId || this.config.get<string>("MICROSOFT_CLIENT_ID");
    const clientSecret = this.resolveSecret(settings.knowledgeOneNoteClientSecretReference) || this.config.get<string>("MICROSOFT_CLIENT_SECRET");

    if (!settings.knowledgeOneNoteImportEnabled) {
      throw new BadRequestException("OneNote import is disabled.");
    }
    if (!tenantId || !clientId || !clientSecret) {
      throw new InternalServerErrorException("Microsoft Graph OneNote credentials are not configured.");
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials"
    });
    const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    if (!response.ok) {
      throw new InternalServerErrorException("Unable to authenticate with Microsoft Graph OneNote.");
    }

    const token = (await response.json()) as { access_token?: string };
    if (!token.access_token) {
      throw new InternalServerErrorException("Microsoft Graph token response did not include an access token.");
    }
    return token.access_token;
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

  private cleanTitle(value: string) {
    return value.trim().replace(/\s+/g, " ").slice(0, 180) || "Imported OneNote page";
  }

  private resolveSecret(reference: string | null | undefined) {
    if (!reference) return null;
    if (reference.startsWith("env:")) {
      return this.config.get<string>(reference.slice(4)) ?? null;
    }
    return null;
  }

  private optionalTrim(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }
}
