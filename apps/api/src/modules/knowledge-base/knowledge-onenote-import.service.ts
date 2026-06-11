import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { KnowledgeStatus } from "@prisma/client";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { HtmlSanitizerService } from "../../common/html/html-sanitizer.service";
import { decryptSecret, encryptSecret } from "../auth/auth-security.util";
import { AuthenticatedUser } from "../auth/auth.types";
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
    return this.graphGetCollection<GraphNotebook>(
      "https://graph.microsoft.com/v1.0/me/onenote/notebooks?$select=id,displayName,isDefault,links",
      token
    );
  }

  async listSections(user: AuthenticatedUser, notebookId: string) {
    if (!notebookId.trim()) {
      throw new BadRequestException("Notebook ID is required.");
    }
    const token = await this.getAccessToken(user);
    return this.graphGetCollection<GraphSection>(
      `https://graph.microsoft.com/v1.0/me/onenote/notebooks/${encodeURIComponent(notebookId)}/sections?$select=id,displayName,pagesUrl`,
      token
    );
  }

  async listPages(user: AuthenticatedUser, sectionId: string) {
    if (!sectionId.trim()) {
      throw new BadRequestException("Section ID is required.");
    }
    const token = await this.getAccessToken(user);
    return this.graphGetCollection<GraphPage>(
      `https://graph.microsoft.com/v1.0/me/onenote/sections/${encodeURIComponent(sectionId)}/pages?$top=100&$select=id,title,createdDateTime,lastModifiedDateTime,links,contentUrl`,
      token
    );
  }

  async previewImport(user: AuthenticatedUser, input: PreviewOneNoteImportDto) {
    const pageIds = [...new Set(input.pageIds.map((id) => id.trim()).filter(Boolean))].slice(0, 50);
    if (!pageIds.length) {
      throw new BadRequestException("Select at least one OneNote page to import.");
    }
    const token = await this.getAccessToken(user);
    const existing = await this.prisma.knowledgeArticle.findMany({
      where: { organizationId: user.organizationId, sourceType: "ONENOTE", sourceExternalId: { in: pageIds }, deletedAt: null },
      select: { sourceExternalId: true }
    });
    const existingIds = new Set(existing.map((item) => item.sourceExternalId).filter(Boolean));

    const items = [];
    for (const pageId of pageIds) {
      const page = await this.graphGet<GraphPage>(`https://graph.microsoft.com/v1.0/me/onenote/pages/${encodeURIComponent(pageId)}?$select=id,title,links`, token);
      const html = await this.graphGetText(`https://graph.microsoft.com/v1.0/me/onenote/pages/${encodeURIComponent(pageId)}/content?includeIDs=true`, token);
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
