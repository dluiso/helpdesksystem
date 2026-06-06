import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthenticatedUser } from "../auth/auth.types";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { LocalFileStorageProvider } from "../file-storage/providers/local-file-storage.provider";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateGeneralSettingsDto } from "./dto/update-general-settings.dto";

const BRANDING_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"]);
const BRANDING_MAX_BYTES = 2 * 1024 * 1024;

@Injectable()
export class SystemSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auditLogs: AuditLogsService,
    private readonly brandingStorage: LocalFileStorageProvider
  ) {}

  async getPublicBranding() {
    const settings = await this.prisma.systemSetting.findFirst({
      orderBy: { createdAt: "asc" }
    });

    return {
      applicationName: settings?.applicationName ?? this.config.get<string>("APP_NAME") ?? "Avidity IT Management Tool",
      companyName: settings?.companyName ?? this.config.get<string>("DEFAULT_COMPANY_NAME") ?? "Avidity Technologies",
      logoUrl: settings?.logoUrl ?? null,
      loginLogoUrl: settings?.loginLogoUrl ?? settings?.logoUrl ?? null,
      loginFormLogoUrl: settings?.loginFormLogoUrl ?? null,
      appIconUrl: settings?.appIconUrl ?? null,
      loginLogoWidth: settings?.loginLogoWidth ?? 160,
      loginLogoHeight: settings?.loginLogoHeight ?? 48,
      loginFormLogoWidth: settings?.loginFormLogoWidth ?? 220,
      loginFormLogoHeight: settings?.loginFormLogoHeight ?? 72,
      brandTextSize: settings?.brandTextSize ?? 16,
      brandTextColor: settings?.brandTextColor ?? "#ffffff",
      primaryColor: settings?.primaryColor ?? "#155eef",
      secondaryColor: settings?.secondaryColor ?? "#0f172a",
      supportEmail:
        settings?.supportEmail ?? this.config.get<string>("DEFAULT_SUPPORT_EMAIL") ?? "support@aviditytechnologies.com",
      supportButtonEnabled: settings?.supportButtonEnabled ?? true,
      supportButtonLabel: settings?.supportButtonLabel ?? "Support",
      supportButtonUrl: settings?.supportButtonUrl ?? null,
      defaultLandingPage: settings?.defaultLandingPage ?? "/dashboard",
      defaultTimezone: settings?.defaultTimezone ?? "America/Chicago",
      defaultLanguage: settings?.defaultLanguage ?? "en",
      dateFormat: settings?.dateFormat ?? "MMM dd, yyyy",
      timeFormat: settings?.timeFormat ?? "12h",
      loginHeadline: settings?.loginHeadline ?? settings?.applicationName ?? this.config.get<string>("APP_NAME") ?? "Avidity IT Management Tool",
      loginSubtitle:
        settings?.loginSubtitle ??
        "Secure service desk operations, client context, attachments, mail flow, reporting, and remote access readiness in one configurable platform.",
      loginFooterText: settings?.loginFooterText ?? settings?.companyName ?? this.config.get<string>("DEFAULT_COMPANY_NAME") ?? "Avidity Technologies"
    };
  }

  async getGeneralSettings(user: AuthenticatedUser) {
    const settings = await this.getOrCreateSettings(user.organizationId);
    return this.toGeneralSettings(settings);
  }

  async updateGeneralSettings(user: AuthenticatedUser, input: UpdateGeneralSettingsDto) {
    this.validateHexColor(input.primaryColor, "Primary color");
    this.validateHexColor(input.secondaryColor, "Secondary color");
    this.validateHexColor(input.brandTextColor, "Brand text color");
    const updated = await this.prisma.systemSetting.update({
      where: { organizationId: user.organizationId },
      data: {
        applicationName: input.applicationName.trim(),
        companyName: input.companyName.trim(),
        supportEmail: input.supportEmail.trim().toLowerCase(),
        logoUrl: this.optionalString(input.logoUrl),
        loginLogoUrl: this.optionalString(input.loginLogoUrl),
        loginFormLogoUrl: this.optionalString(input.loginFormLogoUrl),
        appIconUrl: this.optionalString(input.appIconUrl),
        loginHeadline: this.optionalString(input.loginHeadline),
        loginSubtitle: this.optionalString(input.loginSubtitle),
        loginFooterText: this.optionalString(input.loginFooterText),
        loginLogoWidth: input.loginLogoWidth,
        loginLogoHeight: input.loginLogoHeight,
        loginFormLogoWidth: input.loginFormLogoWidth,
        loginFormLogoHeight: input.loginFormLogoHeight,
        brandTextSize: input.brandTextSize,
        brandTextColor: input.brandTextColor.trim(),
        primaryColor: input.primaryColor.trim(),
        secondaryColor: input.secondaryColor.trim(),
        supportButtonEnabled: input.supportButtonEnabled,
        supportButtonLabel: input.supportButtonLabel.trim() || "Support",
        supportButtonUrl: this.optionalString(input.supportButtonUrl),
        defaultTimezone: input.defaultTimezone.trim() || "America/Chicago",
        defaultLanguage: input.defaultLanguage.trim() || "en",
        defaultLandingPage: input.defaultLandingPage,
        dateFormat: input.dateFormat,
        timeFormat: input.timeFormat
      }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "system_settings",
      entityId: updated.id,
      action: "system_settings.updated",
      metadata: { applicationName: updated.applicationName, companyName: updated.companyName }
    });

    return this.toGeneralSettings(updated);
  }

  async uploadBrandingAsset(user: AuthenticatedUser, assetType: "logo" | "loginLogo" | "loginFormLogo" | "appIcon", file: { originalname: string; mimetype: string; size: number; buffer: Buffer }) {
    if (!BRANDING_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException("Branding asset must be a PNG, JPG, WEBP, SVG, or ICO image.");
    }
    if (file.size > BRANDING_MAX_BYTES) {
      throw new BadRequestException("Branding asset must be 2 MB or smaller.");
    }

    const stored = await this.brandingStorage.saveFile({
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
      folder: "branding"
    });
    const assetUrl = `/api/system-settings/assets?key=${encodeURIComponent(stored.storageKey)}`;
    const field = assetType === "loginLogo" ? "loginLogoUrl" : assetType === "loginFormLogo" ? "loginFormLogoUrl" : assetType === "appIcon" ? "appIconUrl" : "logoUrl";
    const settings = await this.getOrCreateSettings(user.organizationId);
    const updated = await this.prisma.systemSetting.update({
      where: { id: settings.id },
      data: { [field]: assetUrl }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "system_settings",
      entityId: updated.id,
      action: `system_settings.${assetType}_uploaded`,
      metadata: { filename: stored.originalFilename, mimeType: stored.mimeType, size: stored.fileSize }
    });

    return { url: assetUrl };
  }

  async getBrandingAsset(storageKey: string) {
    if (!storageKey || !storageKey.startsWith("branding/")) {
      throw new NotFoundException("Branding asset was not found.");
    }
    return this.brandingStorage.getFileStream(storageKey);
  }

  async getAttachmentPolicy() {
    const settings = await this.prisma.systemSetting.findFirst({
      orderBy: { createdAt: "asc" }
    });

    return {
      maximumUploadSizeMb: settings?.maximumUploadSizeMb ?? Number(this.config.get<string>("MAX_UPLOAD_SIZE_MB") ?? 25),
      allowedAttachmentFileTypes: settings?.allowedAttachmentFileTypes ?? [],
      blockedAttachmentFileTypes: settings?.blockedAttachmentFileTypes ?? []
    };
  }

  private async getOrCreateSettings(organizationId: string) {
    const existing = await this.prisma.systemSetting.findUnique({ where: { organizationId } });
    if (existing) return existing;

    return this.prisma.systemSetting.create({
      data: {
        organizationId,
        applicationName: this.config.get<string>("APP_NAME") ?? "Avidity IT Management Tool",
        companyName: this.config.get<string>("DEFAULT_COMPANY_NAME") ?? "Avidity Technologies",
        supportEmail: this.config.get<string>("DEFAULT_SUPPORT_EMAIL") ?? "support@aviditytechnologies.com"
      }
    });
  }

  private toGeneralSettings(settings: {
    applicationName: string;
    companyName: string;
    supportEmail: string;
    logoUrl: string | null;
    loginLogoUrl: string | null;
    loginFormLogoUrl: string | null;
    appIconUrl: string | null;
    loginHeadline: string | null;
    loginSubtitle: string | null;
    loginFooterText: string | null;
    loginLogoWidth: number;
    loginLogoHeight: number;
    loginFormLogoWidth: number;
    loginFormLogoHeight: number;
    brandTextSize: number;
    brandTextColor: string;
    primaryColor: string;
    secondaryColor: string;
    supportButtonEnabled: boolean;
    supportButtonLabel: string;
    supportButtonUrl: string | null;
    defaultTimezone: string;
    defaultLanguage: string;
    defaultLandingPage: string;
    dateFormat: string;
    timeFormat: string;
  }) {
    return {
      applicationName: settings.applicationName,
      companyName: settings.companyName,
      supportEmail: settings.supportEmail,
      logoUrl: settings.logoUrl,
      loginLogoUrl: settings.loginLogoUrl,
      loginFormLogoUrl: settings.loginFormLogoUrl,
      appIconUrl: settings.appIconUrl,
      loginHeadline: settings.loginHeadline,
      loginSubtitle: settings.loginSubtitle,
      loginFooterText: settings.loginFooterText,
      loginLogoWidth: settings.loginLogoWidth,
      loginLogoHeight: settings.loginLogoHeight,
      loginFormLogoWidth: settings.loginFormLogoWidth,
      loginFormLogoHeight: settings.loginFormLogoHeight,
      brandTextSize: settings.brandTextSize,
      brandTextColor: settings.brandTextColor,
      primaryColor: settings.primaryColor,
      secondaryColor: settings.secondaryColor,
      supportButtonEnabled: settings.supportButtonEnabled,
      supportButtonLabel: settings.supportButtonLabel,
      supportButtonUrl: settings.supportButtonUrl,
      defaultTimezone: settings.defaultTimezone,
      defaultLanguage: settings.defaultLanguage,
      defaultLandingPage: settings.defaultLandingPage,
      dateFormat: settings.dateFormat,
      timeFormat: settings.timeFormat
    };
  }

  private optionalString(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed || null;
  }

  private validateHexColor(value: string, label: string) {
    if (!/^#[0-9a-fA-F]{6}$/.test(value.trim())) {
      throw new BadRequestException(`${label} must be a valid hex color.`);
    }
  }
}
