import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthenticatedUser } from "../auth/auth.types";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { LocalFileStorageProvider } from "../file-storage/providers/local-file-storage.provider";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateGeneralSettingsDto } from "./dto/update-general-settings.dto";
import { UpdateSecuritySettingsDto } from "./dto/update-security-settings.dto";

const BRANDING_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/x-icon", "image/vnd.microsoft.icon"]);
const BRANDING_MAX_BYTES = 2 * 1024 * 1024;
const EMAIL_OPERATIONAL_DAYS = new Set(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]);
const DEFAULT_EMAIL_OPERATIONAL_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
        turnstileProtectPasswordReset: true,
        microsoftSsoEnabled: true
      }
    });

    return {
      passwordResetEnabled: settings?.passwordResetEnabled ?? true,
      turnstileSiteKey: settings?.turnstileEnabled ? settings.turnstileSiteKey : null,
      turnstileProtectLogin: Boolean(settings?.turnstileEnabled && settings.turnstileProtectLogin && settings.turnstileSiteKey),
      turnstileProtectPasswordReset: Boolean(settings?.turnstileEnabled && settings.turnstileProtectPasswordReset && settings.turnstileSiteKey),
      microsoftSsoEnabled: Boolean(settings?.microsoftSsoEnabled)
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
        timeFormat: input.timeFormat,
        emailOperationalHoursEnabled: input.emailOperationalHoursEnabled ?? false,
        emailOperationalTimezone: this.normalizedTimezone(input.emailOperationalTimezone, input.defaultTimezone),
        emailOperationalDays: this.normalizedOperationalDays(input.emailOperationalDays),
        emailOperationalStartTime: this.normalizedTimeOfDay(input.emailOperationalStartTime, "06:00"),
        emailOperationalEndTime: this.normalizedTimeOfDay(input.emailOperationalEndTime, "17:00"),
        emailSkipUsFederalHolidays: input.emailSkipUsFederalHolidays ?? false,
        emailCustomClosedDates: this.normalizedClosedDates(input.emailCustomClosedDates)
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
    const turnstileSecretReference = this.optionalString(input.turnstileSecretReference);
    const microsoftSsoTenantId = this.optionalString(input.microsoftSsoTenantId);
    const microsoftSsoClientId = this.optionalString(input.microsoftSsoClientId);
    const microsoftSsoClientSecretReference = this.optionalString(input.microsoftSsoClientSecretReference);
    if (input.turnstileEnabled && !turnstileSecretReference?.startsWith("env:")) {
      throw new BadRequestException("Cloudflare Turnstile secret reference must use an environment reference such as env:TURNSTILE_SECRET_KEY.");
    }
    if (microsoftSsoClientSecretReference && !microsoftSsoClientSecretReference.startsWith("env:")) {
      throw new BadRequestException("Microsoft SSO secret reference must use an environment reference such as env:MICROSOFT_SSO_CLIENT_SECRET.");
    }
    if (input.microsoftSsoEnabled) {
      const tenantId = microsoftSsoTenantId || this.config.get<string>("MICROSOFT_TENANT_ID");
      const clientId = microsoftSsoClientId || this.config.get<string>("MICROSOFT_CLIENT_ID");
      const clientSecret = this.resolveEnvironmentReference(microsoftSsoClientSecretReference) || this.config.get<string>("MICROSOFT_CLIENT_SECRET");
      if (!tenantId || !clientId || !clientSecret) {
        throw new BadRequestException("Microsoft SSO requires a tenant ID, client ID, and an environment-backed client secret.");
      }
    }

    const updated = await this.prisma.systemSetting.update({
      where: { organizationId: user.organizationId },
      data: {
        passwordResetEnabled: input.passwordResetEnabled,
        passwordResetTokenTtlMinutes: input.passwordResetTokenTtlMinutes,
        mfaUserManagedEnabled: input.mfaUserManagedEnabled,
        mfaRequiredForAdmins: input.mfaRequiredForAdmins,
        mfaRequiredForAllUsers: input.mfaRequiredForAllUsers,
        mfaTrustedDeviceDays: input.mfaTrustedDeviceDays,
        microsoftSsoEnabled: input.microsoftSsoEnabled,
        microsoftSsoTenantId,
        microsoftSsoClientId,
        microsoftSsoClientSecretReference,
        turnstileEnabled: input.turnstileEnabled,
        turnstileSiteKey: this.optionalString(input.turnstileSiteKey),
        turnstileSecretReference,
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
        mfaTrustedDeviceDays: updated.mfaTrustedDeviceDays,
        microsoftSsoEnabled: updated.microsoftSsoEnabled,
        microsoftSsoTenantConfigured: Boolean(updated.microsoftSsoTenantId || this.config.get<string>("MICROSOFT_TENANT_ID")),
        microsoftSsoClientConfigured: Boolean(updated.microsoftSsoClientId || this.config.get<string>("MICROSOFT_CLIENT_ID")),
        hasMicrosoftSsoSecretReference: Boolean(updated.microsoftSsoClientSecretReference),
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
      throw new BadRequestException("Branding asset must be a PNG, JPG, WEBP, or ICO image.");
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

  async getSecurityPosture(user: AuthenticatedUser) {
    const settings = await this.getOrCreateSettings(user.organizationId);
    const attachmentPolicy = await this.getAttachmentPolicy();
    const aiProviders = await this.prisma.aiProviderConfig.findMany({
      where: { organizationId: user.organizationId },
      select: { name: true, provider: true, apiKeyReference: true }
    });

    const appUrl = this.config.get<string>("APP_URL") ?? "";
    const corsOrigins = this.csvEnv("CORS_ORIGINS");
    const globalAllowedHosts = this.csvEnv("INTEGRATION_ALLOWED_HOSTS");
    const aiAllowedHosts = this.csvEnv("AI_ALLOWED_HOSTS");
    const rmmAllowedHosts = this.csvEnv("RMM_ALLOWED_HOSTS");
    const clamavEnabled = this.booleanEnv("CLAMAV_ENABLED", false);
    const clamavFailClosed = this.booleanEnv("CLAMAV_FAIL_CLOSED", false);
    const clamavSocketPath = this.config.get<string>("CLAMAV_SOCKET_PATH")?.trim();
    const clamavEndpoint = clamavSocketPath || `${this.config.get<string>("CLAMAV_HOST") ?? "127.0.0.1"}:${this.config.get<string>("CLAMAV_PORT") ?? "3310"}`;
    const allowInsecureIntegrationUrls = this.booleanEnv("ALLOW_INSECURE_INTEGRATION_URLS", false);
    const allowPrivateIntegrationHosts = this.booleanEnv("ALLOW_PRIVATE_INTEGRATION_HOSTS", false);
    const nonMockAiProviders = aiProviders.filter((provider) => provider.provider !== "MOCK");
    const legacyAiProviders = nonMockAiProviders.filter((provider) => Boolean(provider.apiKeyReference) && !provider.apiKeyReference?.startsWith("env:"));
    const missingAiSecretReferences = nonMockAiProviders.filter((provider) => !provider.apiKeyReference);

    const groups = [
      {
        key: "access",
        title: "Access Protection",
        description: "Session, origin, MFA, and password recovery controls.",
        checks: [
          this.securityCheck("origin-protection", "Origin protection", "ok", "Active for authenticated unsafe requests.", "Active"),
          this.securityCheck("allowed-origins", "Allowed origins", corsOrigins.length || appUrl ? "ok" : "warning", corsOrigins.length ? `${corsOrigins.length} configured` : appUrl ? "Falls back to APP_URL" : "Not configured", corsOrigins.length ? corsOrigins.join(", ") : appUrl || "Configure APP_URL/CORS_ORIGINS"),
          this.securityCheck("session-cookie", "Session cookie name", "ok", "Used consistently by API and web proxy.", this.config.get<string>("SESSION_COOKIE_NAME") ?? "avidity_session"),
          this.securityCheck("mfa-policy", "MFA policy", settings.mfaRequiredForAdmins || settings.mfaRequiredForAllUsers ? "ok" : "warning", settings.mfaRequiredForAllUsers ? "Required for all users" : settings.mfaRequiredForAdmins ? "Required for admins" : "Optional", "Configured in this page"),
          this.securityCheck("password-reset", "Password reset", settings.passwordResetEnabled ? "ok" : "info", settings.passwordResetEnabled ? `${settings.passwordResetTokenTtlMinutes} minute token TTL` : "Disabled", "Settings-driven")
        ]
      },
      {
        key: "bot",
        title: "Bot Protection",
        description: "Public entry points and Cloudflare Turnstile coverage.",
        checks: [
          this.securityCheck("public-throttle", "Public form throttling", "ok", "Support and Event Services public submissions use throttling.", "Active"),
          this.securityCheck("turnstile", "Cloudflare Turnstile", settings.turnstileEnabled ? "ok" : "warning", settings.turnstileEnabled ? "Enabled" : "Disabled", settings.turnstileEnabled ? "Configured below" : "Enable when Cloudflare keys are ready"),
          this.securityCheck("turnstile-login", "Login coverage", settings.turnstileEnabled && settings.turnstileProtectLogin ? "ok" : "warning", settings.turnstileProtectLogin ? "Protected" : "Not protected", "Protect sign-in after validating keys"),
          this.securityCheck("turnstile-secret", "Secret storage", settings.turnstileSecretReference?.startsWith("env:") ? "ok" : "warning", settings.turnstileSecretReference?.startsWith("env:") ? "Environment reference" : "Missing env reference", "Use env:TURNSTILE_SECRET_KEY")
        ]
      },
      {
        key: "uploads",
        title: "Upload Security",
        description: "File size, type, scanner, and media handling protections.",
        checks: [
          this.securityCheck("upload-size", "Maximum upload size", "ok", "Enforced by API upload interceptors.", `${attachmentPolicy.maximumUploadSizeMb} MB`),
          this.securityCheck("upload-limits", "Multipart limits", "ok", "File count, field count, field size, and part count limits are enforced.", "Active"),
          this.securityCheck("svg-branding", "SVG branding uploads", "ok", "SVG is blocked for uploaded branding assets.", "Blocked"),
          this.securityCheck("pdf-header", "PDF import validation", "ok", "Knowledge Base imports require a real PDF header.", "Active"),
          this.securityCheck("clamav", "Antivirus scanner", clamavEnabled ? "ok" : "warning", clamavEnabled ? "Enabled" : "Not enabled", clamavEnabled ? clamavEndpoint : "Install and enable ClamAV on the server"),
          this.securityCheck("clamav-fail-mode", "Scanner failure mode", clamavEnabled && clamavFailClosed ? "ok" : "warning", clamavFailClosed ? "Fail closed" : "Fail open", "Use fail closed after server validation")
        ]
      },
      {
        key: "integrations",
        title: "Integration Security",
        description: "RMM, AI, and custom URL restrictions.",
        checks: [
          this.securityCheck("integration-https", "HTTPS requirement", allowInsecureIntegrationUrls ? "warning" : "ok", allowInsecureIntegrationUrls ? "HTTP allowed by env" : "HTTPS required in production", "ALLOW_INSECURE_INTEGRATION_URLS"),
          this.securityCheck("private-hosts", "Private integration hosts", allowPrivateIntegrationHosts ? "warning" : "ok", allowPrivateIntegrationHosts ? "Private/local hosts allowed by env" : "Private/local hosts blocked in production", "ALLOW_PRIVATE_INTEGRATION_HOSTS"),
          this.securityCheck("global-allowlist", "Global host allowlist", globalAllowedHosts.length ? "ok" : "info", globalAllowedHosts.length ? `${globalAllowedHosts.length} hosts` : "Not set", globalAllowedHosts.join(", ") || "Optional INTEGRATION_ALLOWED_HOSTS"),
          this.securityCheck("ai-allowlist", "AI host allowlist", aiAllowedHosts.length ? "ok" : "warning", aiAllowedHosts.length ? `${aiAllowedHosts.length} hosts` : "Not set", aiAllowedHosts.join(", ") || "Recommended: AI_ALLOWED_HOSTS"),
          this.securityCheck("rmm-allowlist", "RMM host allowlist", rmmAllowedHosts.length ? "ok" : "warning", rmmAllowedHosts.length ? `${rmmAllowedHosts.length} hosts` : "Not set", rmmAllowedHosts.join(", ") || "Recommended: RMM_ALLOWED_HOSTS"),
          this.securityCheck("ai-secret-references", "AI secret references", legacyAiProviders.length || missingAiSecretReferences.length ? "warning" : "ok", legacyAiProviders.length ? `${legacyAiProviders.length} legacy provider${legacyAiProviders.length === 1 ? "" : "s"}` : missingAiSecretReferences.length ? `${missingAiSecretReferences.length} missing reference${missingAiSecretReferences.length === 1 ? "" : "s"}` : "Environment references only", legacyAiProviders.map((provider) => provider.name).join(", ") || "Use env:API_KEY_NAME")
        ]
      },
      {
        key: "operations",
        title: "Operational Security",
        description: "Auditability, dependency posture, and known follow-up controls.",
        checks: [
          this.securityCheck("audit-logs", "Audit logs", "ok", "Administrative actions are recorded and exportable.", "Active"),
          this.securityCheck("audit-org-scope", "Audit org isolation", "ok", "Audit logs are scoped by organization with legacy user backfill compatibility.", "Active"),
          this.securityCheck("dependency-audit", "Dependency audit", "warning", "Some vulnerabilities are transitive and require a controlled dependency phase.", "Manual review required"),
          this.securityCheck("runtime-storage", "Runtime storage", "ok", "Local storage is kept outside git and should stay ignored on production.", "Operational control")
        ]
      }
    ];

    return {
      generatedAt: new Date().toISOString(),
      environment: this.config.get<string>("NODE_ENV") ?? "development",
      groups,
      summary: {
        ok: groups.flatMap((group) => group.checks).filter((check) => check.status === "ok").length,
        warning: groups.flatMap((group) => group.checks).filter((check) => check.status === "warning").length,
        info: groups.flatMap((group) => group.checks).filter((check) => check.status === "info").length
      }
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
    emailOperationalHoursEnabled: boolean;
    emailOperationalTimezone: string;
    emailOperationalDays: string[];
    emailOperationalStartTime: string;
    emailOperationalEndTime: string;
    emailSkipUsFederalHolidays: boolean;
    emailCustomClosedDates: string[];
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
      timeFormat: settings.timeFormat,
      emailOperationalHoursEnabled: settings.emailOperationalHoursEnabled,
      emailOperationalTimezone: settings.emailOperationalTimezone,
      emailOperationalDays: settings.emailOperationalDays,
      emailOperationalStartTime: settings.emailOperationalStartTime,
      emailOperationalEndTime: settings.emailOperationalEndTime,
      emailSkipUsFederalHolidays: settings.emailSkipUsFederalHolidays,
      emailCustomClosedDates: settings.emailCustomClosedDates
    };
  }

  private toSecuritySettings(settings: {
    passwordResetEnabled: boolean;
    passwordResetTokenTtlMinutes: number;
    mfaUserManagedEnabled: boolean;
    mfaRequiredForAdmins: boolean;
    mfaRequiredForAllUsers: boolean;
    mfaTrustedDeviceDays: number;
    microsoftSsoEnabled: boolean;
    microsoftSsoTenantId: string | null;
    microsoftSsoClientId: string | null;
    microsoftSsoClientSecretReference: string | null;
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
      mfaTrustedDeviceDays: settings.mfaTrustedDeviceDays,
      microsoftSsoEnabled: settings.microsoftSsoEnabled,
      microsoftSsoTenantId: settings.microsoftSsoTenantId ?? "",
      microsoftSsoClientId: settings.microsoftSsoClientId ?? "",
      microsoftSsoClientSecretReference: settings.microsoftSsoClientSecretReference ?? "",
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

  private resolveEnvironmentReference(value: string | null) {
    return value?.startsWith("env:") ? this.config.get<string>(value.slice(4)) ?? null : null;
  }

  private normalizedTimezone(value: string | null | undefined, fallback: string) {
    const timezone = value?.trim() || fallback?.trim() || "America/Chicago";
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
      return timezone;
    } catch {
      return "America/Chicago";
    }
  }

  private normalizedOperationalDays(days: string[] | undefined) {
    const normalized = (days ?? DEFAULT_EMAIL_OPERATIONAL_DAYS)
      .map((day) => day.trim().toUpperCase())
      .filter((day, index, values) => EMAIL_OPERATIONAL_DAYS.has(day) && values.indexOf(day) === index);
    return normalized.length > 0 ? normalized : DEFAULT_EMAIL_OPERATIONAL_DAYS;
  }

  private normalizedTimeOfDay(value: string | undefined, fallback: string) {
    const trimmed = value?.trim();
    return trimmed && TIME_OF_DAY_PATTERN.test(trimmed) ? trimmed : fallback;
  }

  private normalizedClosedDates(dates: string[] | undefined) {
    return Array.from(
      new Set(
        (dates ?? [])
          .map((date) => date.trim())
          .filter((date) => ISO_DATE_PATTERN.test(date))
      )
    ).sort();
  }

  private booleanEnv(key: string, fallback: boolean) {
    const value = this.config.get<string>(key);
    if (value === undefined || value === null || value === "") {
      return fallback;
    }
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  }

  private csvEnv(key: string) {
    return (this.config.get<string>(key) ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  private securityCheck(key: string, label: string, status: "ok" | "warning" | "info", description: string, value: string) {
    return { key, label, status, description, value };
  }

  private validateHexColor(value: string, label: string) {
    if (!/^#[0-9a-fA-F]{6}$/.test(value.trim())) {
      throw new BadRequestException(`${label} must be a valid hex color.`);
    }
  }
}
