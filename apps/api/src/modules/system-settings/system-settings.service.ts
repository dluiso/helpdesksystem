import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthenticatedUser } from "../auth/auth.types";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { LocalFileStorageProvider } from "../file-storage/providers/local-file-storage.provider";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateGeneralSettingsDto } from "./dto/update-general-settings.dto";
import { UpdateSecuritySettingsDto } from "./dto/update-security-settings.dto";

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
      mobileLogoUrl: settings?.mobileLogoUrl ?? settings?.logoUrl ?? null,
      mobileLoginLogoUrl: settings?.mobileLoginLogoUrl ?? settings?.loginLogoUrl ?? settings?.logoUrl ?? null,
      appIconUrl: settings?.appIconUrl ?? null,
      loginLogoWidth: settings?.loginLogoWidth ?? 160,
      loginLogoHeight: settings?.loginLogoHeight ?? 48,
      loginFormLogoWidth: settings?.loginFormLogoWidth ?? 220,
      loginFormLogoHeight: settings?.loginFormLogoHeight ?? 72,
      brandTextSize: settings?.brandTextSize ?? 16,
      brandTextColor: settings?.brandTextColor ?? "#ffffff",
      brandLogoBackgroundColor: settings?.brandLogoBackgroundColor ?? "#ffffff",
      brandLogoTransparentBackground: settings?.brandLogoTransparentBackground ?? false,
      appBrandTextSize: settings?.appBrandTextSize ?? 16,
      appBrandTextColor: settings?.appBrandTextColor ?? "#ffffff",
      mobileLogoWidth: settings?.mobileLogoWidth ?? 34,
      mobileLogoHeight: settings?.mobileLogoHeight ?? 34,
      mobileBrandTextSize: settings?.mobileBrandTextSize ?? 16,
      mobileBrandTextColor: settings?.mobileBrandTextColor ?? "#ffffff",
      mobileLoginLogoWidth: settings?.mobileLoginLogoWidth ?? 140,
      mobileLoginLogoHeight: settings?.mobileLoginLogoHeight ?? 44,
      mobileLoginBrandTextSize: settings?.mobileLoginBrandTextSize ?? 16,
      mobileLoginBrandTextColor: settings?.mobileLoginBrandTextColor ?? "#ffffff",
      brandFontFamily: settings?.brandFontFamily ?? "system",
      appSubtitle: settings?.appSubtitle ?? null,
      showLoginBrandTitle: settings?.showLoginBrandTitle ?? true,
      showSubtitleOnLogin: settings?.showSubtitleOnLogin ?? false,
      showSubtitleInApp: settings?.showSubtitleInApp ?? false,
      subtitlePlacement: settings?.subtitlePlacement ?? "BELOW",
      mobileSubtitlePlacement: settings?.mobileSubtitlePlacement ?? "BELOW",
      subtitleSize: settings?.subtitleSize ?? 14,
      subtitleColor: settings?.subtitleColor ?? "#cbd5e1",
      subtitleWeight: settings?.subtitleWeight ?? "400",
      subtitleStyle: settings?.subtitleStyle ?? "normal",
      subtitleFontFamily: settings?.subtitleFontFamily ?? "system",
      loginHeadlineSize: settings?.loginHeadlineSize ?? 48,
      loginHeadlineColor: settings?.loginHeadlineColor ?? "#ffffff",
      loginHeadlineWeight: settings?.loginHeadlineWeight ?? "800",
      loginHeadlineStyle: settings?.loginHeadlineStyle ?? "normal",
      loginHeadlineFontFamily: settings?.loginHeadlineFontFamily ?? "system",
      loginSubtitleSize: settings?.loginSubtitleSize ?? 18,
      loginSubtitleColor: settings?.loginSubtitleColor ?? "#ffffff",
      loginSubtitleWeight: settings?.loginSubtitleWeight ?? "400",
      loginSubtitleStyle: settings?.loginSubtitleStyle ?? "normal",
      loginSubtitleAlign: settings?.loginSubtitleAlign ?? "left",
      loginSubtitleFontFamily: settings?.loginSubtitleFontFamily ?? "system",
      loginFooterSize: settings?.loginFooterSize ?? 18,
      loginFooterColor: settings?.loginFooterColor ?? "#ffffff",
      loginFooterWeight: settings?.loginFooterWeight ?? "400",
      loginFooterStyle: settings?.loginFooterStyle ?? "normal",
      loginFooterFontFamily: settings?.loginFooterFontFamily ?? "system",
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

  async getPublicAuthSettings() {
    const settings = await this.prisma.systemSetting.findFirst({
      orderBy: { createdAt: "asc" },
      select: {
        passwordResetEnabled: true,
        turnstileEnabled: true,
        turnstileSiteKey: true,
        turnstileProtectLogin: true,
        turnstileProtectPasswordReset: true
      }
    });

    return {
      passwordResetEnabled: settings?.passwordResetEnabled ?? true,
      turnstileSiteKey: settings?.turnstileEnabled ? settings.turnstileSiteKey : null,
      turnstileProtectLogin: Boolean(settings?.turnstileEnabled && settings.turnstileProtectLogin && settings.turnstileSiteKey),
      turnstileProtectPasswordReset: Boolean(settings?.turnstileEnabled && settings.turnstileProtectPasswordReset && settings.turnstileSiteKey)
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
    this.validateHexColor(input.brandLogoBackgroundColor, "Brand logo background color");
    this.validateHexColor(input.appBrandTextColor, "App brand text color");
    this.validateHexColor(input.mobileBrandTextColor, "Mobile brand text color");
    this.validateHexColor(input.mobileLoginBrandTextColor, "Mobile login brand text color");
    this.validateHexColor(input.subtitleColor, "Subtitle color");
    this.validateHexColor(input.loginHeadlineColor, "Login headline color");
    this.validateHexColor(input.loginSubtitleColor, "Login subtitle color");
    this.validateHexColor(input.loginFooterColor, "Login footer color");
    const updated = await this.prisma.systemSetting.update({
      where: { organizationId: user.organizationId },
      data: {
        applicationName: input.applicationName.trim(),
        companyName: input.companyName.trim(),
        supportEmail: input.supportEmail.trim().toLowerCase(),
        logoUrl: this.optionalString(input.logoUrl),
        loginLogoUrl: this.optionalString(input.loginLogoUrl),
        loginFormLogoUrl: this.optionalString(input.loginFormLogoUrl),
        mobileLogoUrl: this.optionalString(input.mobileLogoUrl),
        mobileLoginLogoUrl: this.optionalString(input.mobileLoginLogoUrl),
        appIconUrl: this.optionalString(input.appIconUrl),
        loginHeadline: this.optionalString(input.loginHeadline),
        loginSubtitle: this.optionalString(input.loginSubtitle),
        loginFooterText: this.optionalString(input.loginFooterText),
        appSubtitle: this.optionalString(input.appSubtitle),
        showLoginBrandTitle: input.showLoginBrandTitle,
        showSubtitleOnLogin: input.showSubtitleOnLogin,
        showSubtitleInApp: input.showSubtitleInApp,
        subtitlePlacement: input.subtitlePlacement,
        mobileSubtitlePlacement: input.mobileSubtitlePlacement,
        subtitleSize: input.subtitleSize,
        subtitleColor: input.subtitleColor.trim(),
        subtitleWeight: input.subtitleWeight,
        subtitleStyle: input.subtitleStyle,
        subtitleFontFamily: input.subtitleFontFamily,
        loginLogoWidth: input.loginLogoWidth,
        loginLogoHeight: input.loginLogoHeight,
        loginFormLogoWidth: input.loginFormLogoWidth,
        loginFormLogoHeight: input.loginFormLogoHeight,
        brandTextSize: input.brandTextSize,
        brandTextColor: input.brandTextColor.trim(),
        brandLogoBackgroundColor: input.brandLogoBackgroundColor.trim(),
        brandLogoTransparentBackground: input.brandLogoTransparentBackground,
        appBrandTextSize: input.appBrandTextSize,
        appBrandTextColor: input.appBrandTextColor.trim(),
        mobileLogoWidth: input.mobileLogoWidth,
        mobileLogoHeight: input.mobileLogoHeight,
        mobileBrandTextSize: input.mobileBrandTextSize,
        mobileBrandTextColor: input.mobileBrandTextColor.trim(),
        mobileLoginLogoWidth: input.mobileLoginLogoWidth,
        mobileLoginLogoHeight: input.mobileLoginLogoHeight,
        mobileLoginBrandTextSize: input.mobileLoginBrandTextSize,
        mobileLoginBrandTextColor: input.mobileLoginBrandTextColor.trim(),
        brandFontFamily: input.brandFontFamily,
        loginHeadlineSize: input.loginHeadlineSize,
        loginHeadlineColor: input.loginHeadlineColor.trim(),
        loginHeadlineWeight: input.loginHeadlineWeight,
        loginHeadlineStyle: input.loginHeadlineStyle,
        loginHeadlineFontFamily: input.loginHeadlineFontFamily,
        loginSubtitleSize: input.loginSubtitleSize,
        loginSubtitleColor: input.loginSubtitleColor.trim(),
        loginSubtitleWeight: input.loginSubtitleWeight,
        loginSubtitleStyle: input.loginSubtitleStyle,
        loginSubtitleAlign: input.loginSubtitleAlign,
        loginSubtitleFontFamily: input.loginSubtitleFontFamily,
        loginFooterSize: input.loginFooterSize,
        loginFooterColor: input.loginFooterColor.trim(),
        loginFooterWeight: input.loginFooterWeight,
        loginFooterStyle: input.loginFooterStyle,
        loginFooterFontFamily: input.loginFooterFontFamily,
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

  async getSecuritySettings(user: AuthenticatedUser) {
    const settings = await this.getOrCreateSettings(user.organizationId);
    return this.toSecuritySettings(settings);
  }

  async updateSecuritySettings(user: AuthenticatedUser, input: UpdateSecuritySettingsDto) {
    const updated = await this.prisma.systemSetting.update({
      where: { organizationId: user.organizationId },
      data: {
        passwordResetEnabled: input.passwordResetEnabled,
        passwordResetTokenTtlMinutes: input.passwordResetTokenTtlMinutes,
        mfaUserManagedEnabled: input.mfaUserManagedEnabled,
        mfaRequiredForAdmins: input.mfaRequiredForAdmins,
        mfaRequiredForAllUsers: input.mfaRequiredForAllUsers,
        turnstileEnabled: input.turnstileEnabled,
        turnstileSiteKey: this.optionalString(input.turnstileSiteKey),
        turnstileSecretReference: this.optionalString(input.turnstileSecretReference),
        turnstileProtectLogin: input.turnstileProtectLogin,
        turnstileProtectPasswordReset: input.turnstileProtectPasswordReset
      }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "system_settings",
      entityId: updated.id,
      action: "system_settings.security_updated",
      metadata: {
        passwordResetEnabled: updated.passwordResetEnabled,
        mfaUserManagedEnabled: updated.mfaUserManagedEnabled,
        mfaRequiredForAdmins: updated.mfaRequiredForAdmins,
        mfaRequiredForAllUsers: updated.mfaRequiredForAllUsers,
        turnstileEnabled: updated.turnstileEnabled,
        turnstileProtectLogin: updated.turnstileProtectLogin,
        turnstileProtectPasswordReset: updated.turnstileProtectPasswordReset,
        hasTurnstileSecretReference: Boolean(updated.turnstileSecretReference)
      }
    });

    return this.toSecuritySettings(updated);
  }

  async uploadBrandingAsset(user: AuthenticatedUser, assetType: "logo" | "loginLogo" | "loginFormLogo" | "mobileLogo" | "mobileLoginLogo" | "appIcon", file: { originalname: string; mimetype: string; size: number; buffer: Buffer }) {
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
    const field =
      assetType === "loginLogo"
        ? "loginLogoUrl"
        : assetType === "loginFormLogo"
          ? "loginFormLogoUrl"
          : assetType === "mobileLogo"
            ? "mobileLogoUrl"
            : assetType === "mobileLoginLogo"
              ? "mobileLoginLogoUrl"
              : assetType === "appIcon"
                ? "appIconUrl"
                : "logoUrl";
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
    mobileLogoUrl: string | null;
    mobileLoginLogoUrl: string | null;
    appIconUrl: string | null;
    loginHeadline: string | null;
    loginSubtitle: string | null;
    loginFooterText: string | null;
    appSubtitle: string | null;
    showLoginBrandTitle: boolean;
    showSubtitleOnLogin: boolean;
    showSubtitleInApp: boolean;
    subtitlePlacement: string;
    mobileSubtitlePlacement: string;
    subtitleSize: number;
    subtitleColor: string;
    subtitleWeight: string;
    subtitleStyle: string;
    subtitleFontFamily: string;
    loginLogoWidth: number;
    loginLogoHeight: number;
    loginFormLogoWidth: number;
    loginFormLogoHeight: number;
    brandTextSize: number;
    brandTextColor: string;
    brandLogoBackgroundColor: string;
    brandLogoTransparentBackground: boolean;
    appBrandTextSize: number;
    appBrandTextColor: string;
    mobileLogoWidth: number;
    mobileLogoHeight: number;
    mobileBrandTextSize: number;
    mobileBrandTextColor: string;
    mobileLoginLogoWidth: number;
    mobileLoginLogoHeight: number;
    mobileLoginBrandTextSize: number;
    mobileLoginBrandTextColor: string;
    brandFontFamily: string;
    loginHeadlineSize: number;
    loginHeadlineColor: string;
    loginHeadlineWeight: string;
    loginHeadlineStyle: string;
    loginHeadlineFontFamily: string;
    loginSubtitleSize: number;
    loginSubtitleColor: string;
    loginSubtitleWeight: string;
    loginSubtitleStyle: string;
    loginSubtitleAlign: string;
    loginSubtitleFontFamily: string;
    loginFooterSize: number;
    loginFooterColor: string;
    loginFooterWeight: string;
    loginFooterStyle: string;
    loginFooterFontFamily: string;
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
      mobileLogoUrl: settings.mobileLogoUrl,
      mobileLoginLogoUrl: settings.mobileLoginLogoUrl,
      appIconUrl: settings.appIconUrl,
      loginHeadline: settings.loginHeadline,
      loginSubtitle: settings.loginSubtitle,
      loginFooterText: settings.loginFooterText,
      appSubtitle: settings.appSubtitle,
      showLoginBrandTitle: settings.showLoginBrandTitle,
      showSubtitleOnLogin: settings.showSubtitleOnLogin,
      showSubtitleInApp: settings.showSubtitleInApp,
      subtitlePlacement: settings.subtitlePlacement,
      mobileSubtitlePlacement: settings.mobileSubtitlePlacement,
      subtitleSize: settings.subtitleSize,
      subtitleColor: settings.subtitleColor,
      subtitleWeight: settings.subtitleWeight,
      subtitleStyle: settings.subtitleStyle,
      subtitleFontFamily: settings.subtitleFontFamily,
      loginLogoWidth: settings.loginLogoWidth,
      loginLogoHeight: settings.loginLogoHeight,
      loginFormLogoWidth: settings.loginFormLogoWidth,
      loginFormLogoHeight: settings.loginFormLogoHeight,
      brandTextSize: settings.brandTextSize,
      brandTextColor: settings.brandTextColor,
      brandLogoBackgroundColor: settings.brandLogoBackgroundColor,
      brandLogoTransparentBackground: settings.brandLogoTransparentBackground,
      appBrandTextSize: settings.appBrandTextSize,
      appBrandTextColor: settings.appBrandTextColor,
      mobileLogoWidth: settings.mobileLogoWidth,
      mobileLogoHeight: settings.mobileLogoHeight,
      mobileBrandTextSize: settings.mobileBrandTextSize,
      mobileBrandTextColor: settings.mobileBrandTextColor,
      mobileLoginLogoWidth: settings.mobileLoginLogoWidth,
      mobileLoginLogoHeight: settings.mobileLoginLogoHeight,
      mobileLoginBrandTextSize: settings.mobileLoginBrandTextSize,
      mobileLoginBrandTextColor: settings.mobileLoginBrandTextColor,
      brandFontFamily: settings.brandFontFamily,
      loginHeadlineSize: settings.loginHeadlineSize,
      loginHeadlineColor: settings.loginHeadlineColor,
      loginHeadlineWeight: settings.loginHeadlineWeight,
      loginHeadlineStyle: settings.loginHeadlineStyle,
      loginHeadlineFontFamily: settings.loginHeadlineFontFamily,
      loginSubtitleSize: settings.loginSubtitleSize,
      loginSubtitleColor: settings.loginSubtitleColor,
      loginSubtitleWeight: settings.loginSubtitleWeight,
      loginSubtitleStyle: settings.loginSubtitleStyle,
      loginSubtitleAlign: settings.loginSubtitleAlign,
      loginSubtitleFontFamily: settings.loginSubtitleFontFamily,
      loginFooterSize: settings.loginFooterSize,
      loginFooterColor: settings.loginFooterColor,
      loginFooterWeight: settings.loginFooterWeight,
      loginFooterStyle: settings.loginFooterStyle,
      loginFooterFontFamily: settings.loginFooterFontFamily,
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

  private toSecuritySettings(settings: {
    passwordResetEnabled: boolean;
    passwordResetTokenTtlMinutes: number;
    mfaUserManagedEnabled: boolean;
    mfaRequiredForAdmins: boolean;
    mfaRequiredForAllUsers: boolean;
    turnstileEnabled: boolean;
    turnstileSiteKey: string | null;
    turnstileSecretReference: string | null;
    turnstileProtectLogin: boolean;
    turnstileProtectPasswordReset: boolean;
  }) {
    return {
      passwordResetEnabled: settings.passwordResetEnabled,
      passwordResetTokenTtlMinutes: settings.passwordResetTokenTtlMinutes,
      mfaUserManagedEnabled: settings.mfaUserManagedEnabled,
      mfaRequiredForAdmins: settings.mfaRequiredForAdmins,
      mfaRequiredForAllUsers: settings.mfaRequiredForAllUsers,
      turnstileEnabled: settings.turnstileEnabled,
      turnstileSiteKey: settings.turnstileSiteKey,
      turnstileSecretReference: settings.turnstileSecretReference,
      turnstileProtectLogin: settings.turnstileProtectLogin,
      turnstileProtectPasswordReset: settings.turnstileProtectPasswordReset
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
