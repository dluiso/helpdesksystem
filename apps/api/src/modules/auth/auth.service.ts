import { BadRequestException, Injectable, InternalServerErrorException, UnauthorizedException } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { User } from "@prisma/client";
import argon2 from "argon2";
import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from "crypto";
import { CookieOptions } from "express";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { MailDeliveryService } from "../mailboxes/mail-delivery.service";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { AuthenticatedUser } from "./auth.types";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { VerifyMfaLoginDto } from "./dto/verify-mfa-login.dto";
import { decryptSecret, encryptSecret, generateSecurityToken, hashSecurityToken, verifyTotpCode } from "./auth-security.util";

interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
  trustedDeviceToken?: string | null;
}

type LoginUser = User & {
  groups: Array<{ group: { roles: Array<{ role: { name: string } }> } }>;
};

interface MicrosoftSsoSettings {
  organizationId: string;
  enabled: boolean;
  tenantId: string | null;
  clientId: string | null;
  clientSecret: string | null;
}

interface MicrosoftIdTokenClaims {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  nonce?: string;
  tid?: string;
  oid?: string;
  preferred_username?: string;
  email?: string;
  upn?: string;
}

const MICROSOFT_SSO_SCOPES = ["openid", "profile", "email"];
const MICROSOFT_SSO_CHALLENGE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auditLogs: AuditLogsService,
    private readonly moduleRef: ModuleRef
  ) {}

  getCookieName(): string {
    return this.config.get<string>("SESSION_COOKIE_NAME") ?? "avidity_session";
  }

  getTrustedDeviceCookieName(): string {
    return `${this.getCookieName()}_mfa_device`;
  }

  getMicrosoftMfaChallengeCookieName(): string {
    return `${this.getCookieName()}_microsoft_mfa`;
  }

  getCookieOptions(): CookieOptions {
    return {
      ...this.getBaseCookieOptions(),
      maxAge: this.getSessionTtlHours() * 60 * 60 * 1000
    };
  }

  getClearCookieOptions(): CookieOptions {
    return this.getBaseCookieOptions();
  }

  getTrustedDeviceCookieOptions(expiresAt: Date): CookieOptions {
    return {
      ...this.getBaseCookieOptions(),
      expires: expiresAt
    };
  }

  getMicrosoftMfaChallengeCookieOptions(): CookieOptions {
    return {
      ...this.getBaseCookieOptions(),
      maxAge: 5 * 60 * 1000
    };
  }

  private getBaseCookieOptions(): CookieOptions {
    const secure = (this.config.get<string>("COOKIE_SECURE") ?? "false").toLowerCase() === "true";
    const sameSite = (this.config.get<string>("COOKIE_SAME_SITE") ?? "lax") as CookieOptions["sameSite"];
    const configuredDomain = this.config.get<string>("COOKIE_DOMAIN") || undefined;
    const domain = configuredDomain === "localhost" ? undefined : configuredDomain;

    return {
      httpOnly: true,
      secure,
      sameSite,
      domain,
      path: "/"
    };
  }

  async login(input: LoginDto, context: RequestContext) {
    const email = input.email.trim().toLowerCase();
    await this.verifyTurnstileIfNeeded("login", input.captchaToken, context);
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        groups: { include: { group: { include: { roles: { include: { role: true } } } } } }
      }
    });

    if (!user || user.deletedAt || !user.isActive) {
      await this.auditLogs.create({
        entityType: "User",
        action: "auth.login_failure",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { email, reason: "unknown_or_inactive_user" }
      });
      throw new UnauthorizedException("Invalid email or password.");
    }

    const passwordMatches = await argon2.verify(user.passwordHash, input.password);
    if (!passwordMatches) {
      await this.auditLogs.create({
        userId: user.id,
        entityType: "User",
        entityId: user.id,
        action: "auth.login_failure",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { email, reason: "invalid_password" }
      });
      throw new UnauthorizedException("Invalid email or password.");
    }

    return this.completeAuthenticatedLogin(user, context, "password");
  }

  async startMicrosoftLogin(context: RequestContext) {
    const settings = await this.getMicrosoftSsoSettings();
    this.requireMicrosoftSsoConfiguration(settings);

    const state = generateSecurityToken();
    const nonce = generateSecurityToken();
    const codeVerifier = generateSecurityToken(48);
    await this.prisma.microsoftSsoLoginChallenge.create({
      data: {
        organizationId: settings.organizationId,
        stateHash: hashSecurityToken(state),
        nonce,
        codeVerifierEncrypted: encryptSecret(codeVerifier, this.getSecretEncryptionKey()),
        expiresAt: new Date(Date.now() + MICROSOFT_SSO_CHALLENGE_TTL_MS),
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      }
    });

    const authorizationUrl = new URL(`https://login.microsoftonline.com/${encodeURIComponent(settings.tenantId!)}/oauth2/v2.0/authorize`);
    authorizationUrl.searchParams.set("client_id", settings.clientId!);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("redirect_uri", this.microsoftSsoRedirectUri());
    authorizationUrl.searchParams.set("response_mode", "query");
    authorizationUrl.searchParams.set("scope", MICROSOFT_SSO_SCOPES.join(" "));
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("nonce", nonce);
    authorizationUrl.searchParams.set("code_challenge", createHash("sha256").update(codeVerifier).digest("base64url"));
    authorizationUrl.searchParams.set("code_challenge_method", "S256");

    return { authorizationUrl: authorizationUrl.toString() };
  }

  async completeMicrosoftLogin(input: { code?: string; state?: string; error?: string; errorDescription?: string }, context: RequestContext) {
    if (input.error || !input.code || !input.state) {
      await this.auditLogs.create({
        entityType: "User",
        action: "auth.microsoft_login_failure",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { reason: input.error ? "provider_error" : "missing_callback_parameters" }
      });
      throw new UnauthorizedException("Microsoft sign-in was not completed.");
    }

    const challenge = await this.prisma.microsoftSsoLoginChallenge.findUnique({
      where: { stateHash: hashSecurityToken(input.state) }
    });
    if (!challenge || challenge.usedAt || challenge.expiresAt <= new Date()) {
      throw new UnauthorizedException("Microsoft sign-in request is invalid or expired.");
    }
    const consumed = await this.prisma.microsoftSsoLoginChallenge.updateMany({
      where: { id: challenge.id, usedAt: null },
      data: { usedAt: new Date() }
    });
    if (consumed.count !== 1) {
      throw new UnauthorizedException("Microsoft sign-in request is invalid or expired.");
    }

    const settings = await this.getMicrosoftSsoSettings(challenge.organizationId);
    this.requireMicrosoftSsoConfiguration(settings);
    const token = await this.exchangeMicrosoftCode(settings, input.code, decryptSecret(challenge.codeVerifierEncrypted, this.getSecretEncryptionKey()));
    const identity = await this.validateMicrosoftIdToken(token.idToken, settings, challenge.nonce);
    const user = await this.resolveMicrosoftUser(challenge.organizationId, identity, context);
    return this.completeAuthenticatedLogin(user, context, "microsoft");
  }

  private async completeAuthenticatedLogin(user: LoginUser, context: RequestContext, provider: "password" | "microsoft") {
    if (await this.userRequiresMfa(user)) {
      if (!user.mfaEnabled || !user.totpSecretEncrypted) {
        await this.auditLogs.create({
          userId: user.id,
          entityType: "User",
          entityId: user.id,
          action: "auth.login_failure",
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: { email: user.email, reason: "mfa_required_not_configured", provider }
        });
        throw new UnauthorizedException("Multi-factor authentication is required for this account.");
      }
      const trustedDevice = await this.validateTrustedDevice(user.id, context.trustedDeviceToken);
      if (trustedDevice) {
        const sessionToken = await this.createSession(user.id, context);
        await this.auditLogs.create({
          userId: user.id,
          entityType: "User",
          entityId: user.id,
          action: "auth.login_success_trusted_device",
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: { provider }
        });
        return { mfaRequired: false, sessionToken, user: await this.buildAuthenticatedUser(user.id) };
      }

      const challengeToken = generateSecurityToken();
      await this.prisma.mfaLoginChallenge.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          tokenHash: hashSecurityToken(challengeToken),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          ipAddress: context.ipAddress,
          userAgent: context.userAgent
        }
      });
      await this.auditLogs.create({
        userId: user.id,
        entityType: "User",
        entityId: user.id,
        action: "auth.mfa_challenge_created",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { provider }
      });
      const settings = await this.getSecuritySettings(user.organizationId);
      return { mfaRequired: true, challengeToken, trustedDeviceDays: settings.mfaTrustedDeviceDays };
    }

    const sessionToken = await this.createSession(user.id, context);
    await this.auditLogs.create({
      userId: user.id,
      entityType: "User",
      entityId: user.id,
      action: "auth.login_success",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { provider }
    });
    return { mfaRequired: false, sessionToken, user: await this.buildAuthenticatedUser(user.id) };
  }

  private async getMicrosoftSsoSettings(organizationId?: string): Promise<MicrosoftSsoSettings> {
    const settings = organizationId
      ? await this.prisma.systemSetting.findUnique({ where: { organizationId } })
      : await this.prisma.systemSetting.findFirst({ orderBy: { createdAt: "asc" } });
    return {
      organizationId: settings?.organizationId ?? "",
      enabled: settings?.microsoftSsoEnabled ?? false,
      tenantId: settings?.microsoftSsoTenantId || this.config.get<string>("MICROSOFT_TENANT_ID") || null,
      clientId: settings?.microsoftSsoClientId || this.config.get<string>("MICROSOFT_CLIENT_ID") || null,
      clientSecret: this.resolveEnvironmentReference(settings?.microsoftSsoClientSecretReference) || this.config.get<string>("MICROSOFT_CLIENT_SECRET") || null
    };
  }

  private requireMicrosoftSsoConfiguration(settings: MicrosoftSsoSettings) {
    if (!settings.enabled) {
      throw new BadRequestException("Microsoft sign-in is not enabled.");
    }
    if (!settings.organizationId || !settings.tenantId || !settings.clientId || !settings.clientSecret) {
      throw new InternalServerErrorException("Microsoft sign-in is not fully configured.");
    }
  }

  private async exchangeMicrosoftCode(settings: MicrosoftSsoSettings, code: string, codeVerifier: string) {
    const body = new URLSearchParams({
      client_id: settings.clientId!,
      client_secret: settings.clientSecret!,
      code,
      redirect_uri: this.microsoftSsoRedirectUri(),
      grant_type: "authorization_code",
      code_verifier: codeVerifier
    });
    const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(settings.tenantId!)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok) {
      throw new UnauthorizedException("Microsoft sign-in could not be verified.");
    }
    const token = (await response.json()) as { id_token?: string };
    if (!token.id_token) {
      throw new UnauthorizedException("Microsoft sign-in did not return an identity token.");
    }
    return { idToken: token.id_token };
  }

  private async validateMicrosoftIdToken(idToken: string, settings: MicrosoftSsoSettings, nonce: string) {
    const [headerPart, payloadPart, signaturePart] = idToken.split(".");
    if (!headerPart || !payloadPart || !signaturePart) {
      throw new UnauthorizedException("Microsoft identity token is invalid.");
    }
    let header: { alg?: string; kid?: string };
    let claims: MicrosoftIdTokenClaims;
    try {
      header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8")) as { alg?: string; kid?: string };
      claims = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as MicrosoftIdTokenClaims;
    } catch {
      throw new UnauthorizedException("Microsoft identity token is invalid.");
    }
    if (header.alg !== "RS256" || !header.kid) {
      throw new UnauthorizedException("Microsoft identity token is invalid.");
    }

    const discoveryResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(settings.tenantId!)}/v2.0/.well-known/openid-configuration`);
    if (!discoveryResponse.ok) {
      throw new InternalServerErrorException("Microsoft OpenID configuration is unavailable.");
    }
    const discovery = (await discoveryResponse.json()) as { issuer?: string; jwks_uri?: string };
    if (!discovery.issuer || !discovery.jwks_uri) {
      throw new InternalServerErrorException("Microsoft OpenID configuration is invalid.");
    }
    const keysResponse = await fetch(discovery.jwks_uri);
    if (!keysResponse.ok) {
      throw new InternalServerErrorException("Microsoft signing keys are unavailable.");
    }
    const keys = (await keysResponse.json()) as { keys?: Array<Record<string, string>> };
    const jwk = keys.keys?.find((key) => key.kid === header.kid && key.kty === "RSA");
    if (!jwk) {
      throw new UnauthorizedException("Microsoft identity token signing key is unavailable.");
    }
    const signatureValid = verify("RSA-SHA256", Buffer.from(`${headerPart}.${payloadPart}`), createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(signaturePart, "base64url"));
    if (!signatureValid) {
      throw new UnauthorizedException("Microsoft identity token is invalid.");
    }

    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (
      claims.iss !== discovery.issuer ||
      !audiences.includes(settings.clientId!) ||
      !claims.exp || claims.exp <= now ||
      (claims.nbf !== undefined && claims.nbf > now + 60) ||
      claims.tid !== settings.tenantId ||
      !claims.oid ||
      !claims.nonce ||
      !this.constantTimeEquals(claims.nonce, nonce)
    ) {
      throw new UnauthorizedException("Microsoft identity token is invalid.");
    }

    const principalName = claims.preferred_username || claims.email || claims.upn || null;
    return { tenantId: claims.tid, objectId: claims.oid, principalName };
  }

  private async resolveMicrosoftUser(organizationId: string, identity: { tenantId: string; objectId: string; principalName: string | null }, context: RequestContext): Promise<LoginUser> {
    let user = await this.prisma.user.findUnique({
      where: { microsoftTenantId_microsoftObjectId: { microsoftTenantId: identity.tenantId, microsoftObjectId: identity.objectId } },
      include: { groups: { include: { group: { include: { roles: { include: { role: true } } } } } } }
    });
    let linkedNow = false;
    if (!user) {
      const email = identity.principalName?.trim().toLowerCase();
      if (!email) {
        throw new UnauthorizedException("Microsoft account is not authorized to access this application.");
      }
      const matchedUser = await this.prisma.user.findUnique({
        where: { email },
        include: { groups: { include: { group: { include: { roles: { include: { role: true } } } } } } }
      });
      if (!matchedUser || matchedUser.organizationId !== organizationId || matchedUser.deletedAt || !matchedUser.isActive) {
        await this.auditLogs.create({
          entityType: "User",
          action: "auth.microsoft_login_failure",
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: { reason: "no_matching_active_user" }
        });
        throw new UnauthorizedException("Microsoft account is not authorized to access this application.");
      }
      user = await this.prisma.user.update({
        where: { id: matchedUser.id },
        data: {
          microsoftTenantId: identity.tenantId,
          microsoftObjectId: identity.objectId,
          microsoftPrincipalName: identity.principalName,
          microsoftLinkedAt: new Date()
        },
        include: { groups: { include: { group: { include: { roles: { include: { role: true } } } } } } }
      });
      linkedNow = true;
    } else if (user.organizationId !== organizationId || user.deletedAt || !user.isActive) {
      throw new UnauthorizedException("Microsoft account is not authorized to access this application.");
    } else if (identity.principalName && user.microsoftPrincipalName !== identity.principalName) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { microsoftPrincipalName: identity.principalName },
        include: { groups: { include: { group: { include: { roles: { include: { role: true } } } } } } }
      });
    }
    if (linkedNow) {
      await this.auditLogs.create({
        userId: user.id,
        entityType: "User",
        entityId: user.id,
        action: "auth.microsoft_identity_linked",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { tenantId: identity.tenantId, principalName: identity.principalName }
      });
    }
    return user;
  }

  private microsoftSsoRedirectUri() {
    const appUrl = (this.config.get<string>("APP_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
    return `${appUrl}/api/auth/microsoft/callback`;
  }

  private resolveEnvironmentReference(value: string | null | undefined) {
    return value?.startsWith("env:") ? this.config.get<string>(value.slice(4)) ?? null : null;
  }

  private constantTimeEquals(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  async verifyMfaLogin(input: VerifyMfaLoginDto, context: RequestContext) {
    const challenge = await this.prisma.mfaLoginChallenge.findUnique({
      where: { tokenHash: hashSecurityToken(input.challengeToken) },
      include: { user: true }
    });
    if (!challenge || challenge.usedAt || challenge.expiresAt <= new Date() || !challenge.user.isActive || challenge.user.deletedAt || !challenge.user.totpSecretEncrypted) {
      throw new UnauthorizedException("The authentication challenge is invalid or expired.");
    }

    const secret = decryptSecret(challenge.user.totpSecretEncrypted, this.getSecretEncryptionKey());
    const recoveryCodeMatched = await this.consumeRecoveryCode(challenge.user.id, input.code);
    if (!recoveryCodeMatched && !verifyTotpCode(secret, input.code)) {
      await this.auditLogs.create({
        userId: challenge.user.id,
        entityType: "User",
        entityId: challenge.user.id,
        action: "auth.mfa_failure",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      });
      throw new UnauthorizedException("The authentication code was not accepted.");
    }

    await this.prisma.mfaLoginChallenge.update({
      where: { id: challenge.id },
      data: { usedAt: new Date() }
    });

    const sessionToken = await this.createSession(challenge.user.id, context);
    const trustedDevice = input.trustDevice ? await this.createTrustedDevice(challenge.user, context) : null;
    await this.auditLogs.create({
      userId: challenge.user.id,
      entityType: "User",
      entityId: challenge.user.id,
      action: recoveryCodeMatched ? "auth.mfa_recovery_code_success" : "auth.mfa_success",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return {
      sessionToken,
      trustedDeviceToken: trustedDevice?.token,
      trustedDeviceExpiresAt: trustedDevice?.expiresAt,
      user: await this.buildAuthenticatedUser(challenge.user.id)
    };
  }

  async forgotPassword(input: ForgotPasswordDto, context: RequestContext) {
    await this.verifyTurnstileIfNeeded("passwordReset", input.captchaToken, context);
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const settings = user ? await this.getSecuritySettings(user.organizationId) : null;

    if (user && !user.deletedAt && user.isActive && settings?.passwordResetEnabled !== false) {
      const token = generateSecurityToken();
      const expiresAt = new Date(Date.now() + (settings?.passwordResetTokenTtlMinutes ?? 30) * 60 * 1000);
      await this.prisma.passwordResetToken.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          tokenHash: hashSecurityToken(token),
          expiresAt
        }
      });

      try {
        await this.sendPasswordResetEmail(user.organizationId, user.email, token);
        await this.auditLogs.create({
          userId: user.id,
          entityType: "User",
          entityId: user.id,
          action: "auth.password_reset_requested",
          ipAddress: context.ipAddress,
          userAgent: context.userAgent
        });
      } catch (error) {
        await this.auditLogs.create({
          userId: user.id,
          entityType: "User",
          entityId: user.id,
          action: "auth.password_reset_email_failed",
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: { message: error instanceof Error ? error.message : "Unknown error" }
        });
      }
    } else {
      await this.auditLogs.create({
        entityType: "User",
        action: "auth.password_reset_requested",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { email, result: "generic" }
      });
    }

    return { ok: true };
  }

  async resetPassword(input: ResetPasswordDto, context: RequestContext) {
    const reset = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashSecurityToken(input.token) },
      include: { user: true }
    });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date() || reset.user.deletedAt || !reset.user.isActive) {
      throw new UnauthorizedException("The password reset link is invalid or expired.");
    }
    if (reset.user.mfaEnabled && reset.user.totpSecretEncrypted) {
      if (!input.mfaCode) {
        throw new UnauthorizedException("Two-factor authentication code is required to reset this password.");
      }
      const secret = decryptSecret(reset.user.totpSecretEncrypted, this.getSecretEncryptionKey());
      const recoveryCodeMatched = await this.consumeRecoveryCode(reset.user.id, input.mfaCode);
      if (!recoveryCodeMatched && !verifyTotpCode(secret, input.mfaCode)) {
        await this.auditLogs.create({
          userId: reset.userId,
          entityType: "User",
          entityId: reset.userId,
          action: "auth.password_reset_mfa_failure",
          ipAddress: context.ipAddress,
          userAgent: context.userAgent
        });
        throw new UnauthorizedException("The authentication code was not accepted.");
      }
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: reset.userId },
        data: {
          passwordHash: await argon2.hash(input.newPassword, { type: argon2.argon2id }),
          forcePasswordChange: false
        }
      }),
      this.prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      this.prisma.session.updateMany({ where: { userId: reset.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.mfaTrustedDevice.updateMany({ where: { userId: reset.userId, revokedAt: null }, data: { revokedAt: new Date() } })
    ]);

    await this.auditLogs.create({
      userId: reset.userId,
      entityType: "User",
      entityId: reset.userId,
      action: "auth.password_reset_completed",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return { ok: true };
  }

  async validateSessionToken(sessionToken: string | undefined): Promise<AuthenticatedUser | null> {
    if (!sessionToken) {
      return null;
    }

    const session = await this.prisma.session.findFirst({
      where: {
        tokenHash: this.hashSessionToken(sessionToken),
        revokedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      include: {
        user: {
          include: {
            groups: {
              include: {
                group: {
                  include: {
                    roles: {
                      include: {
                        role: {
                          include: {
                            permissions: {
                              include: {
                                permission: true
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!session || session.user.deletedAt || !session.user.isActive) {
      return null;
    }

    return this.toAuthenticatedUser(session.user);
  }

  async logout(sessionToken: string | undefined, context: RequestContext) {
    if (!sessionToken) {
      return;
    }

    const session = await this.prisma.session.updateMany({
      where: {
        tokenHash: this.hashSessionToken(sessionToken),
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });

    await this.auditLogs.create({
      entityType: "Session",
      action: "auth.logout",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { revokedSessions: session.count }
    });
  }

  private async createSession(userId: string, context: RequestContext) {
    const sessionToken = randomBytes(32).toString("base64url");
    const tokenHash = this.hashSessionToken(sessionToken);
    const expiresAt = new Date(Date.now() + this.getSessionTtlHours() * 60 * 60 * 1000);

    await this.prisma.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      }
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() }
    });

    return sessionToken;
  }

  private async userRequiresMfa(user: User & { groups: Array<{ group: { roles: Array<{ role: { name: string } }> } }> }) {
    const settings = await this.getSecuritySettings(user.organizationId);
    const isAdmin = user.groups.some((membership) => membership.group.roles.some((roleMembership) => roleMembership.role.name.toLowerCase().includes("admin")));
    return user.mfaEnabled || settings.mfaRequiredForAllUsers || (settings.mfaRequiredForAdmins && isAdmin);
  }

  private async consumeRecoveryCode(userId: string, code: string) {
    const normalized = code.trim().toLowerCase();
    if (!normalized.includes("-")) {
      return false;
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { recoveryCodesHash: true } });
    if (!user) {
      return false;
    }
    let matchedHash: string | null = null;
    for (const hash of user.recoveryCodesHash) {
      if (await argon2.verify(hash, normalized)) {
        matchedHash = hash;
        break;
      }
    }
    if (!matchedHash) return false;
    await this.prisma.user.update({
      where: { id: userId },
      data: { recoveryCodesHash: { set: user.recoveryCodesHash.filter((hash) => hash !== matchedHash) } }
    });
    return true;
  }

  private async validateTrustedDevice(userId: string, token: string | null | undefined) {
    if (!token) {
      return null;
    }
    const trustedDevice = await this.prisma.mfaTrustedDevice.findFirst({
      where: {
        userId,
        tokenHash: hashSecurityToken(token),
        revokedAt: null,
        expiresAt: { gt: new Date() }
      }
    });
    if (!trustedDevice) {
      return null;
    }
    await this.prisma.mfaTrustedDevice.update({
      where: { id: trustedDevice.id },
      data: { lastUsedAt: new Date() }
    });
    return trustedDevice;
  }

  private async createTrustedDevice(user: User, context: RequestContext) {
    const settings = await this.getSecuritySettings(user.organizationId);
    const days = Math.min(90, Math.max(1, settings.mfaTrustedDeviceDays));
    const token = generateSecurityToken();
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await this.prisma.mfaTrustedDevice.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        tokenHash: hashSecurityToken(token),
        label: this.trustedDeviceLabel(context.userAgent),
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        expiresAt,
        lastUsedAt: new Date()
      }
    });
    await this.auditLogs.create({
      userId: user.id,
      entityType: "MfaTrustedDevice",
      entityId: user.id,
      action: "auth.mfa_trusted_device_created",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { expiresAt }
    });
    return { token, expiresAt };
  }

  private trustedDeviceLabel(userAgent: string | null | undefined) {
    if (!userAgent) {
      return "Trusted device";
    }
    const browser = userAgent.includes("Edg/") ? "Edge" : userAgent.includes("Chrome/") ? "Chrome" : userAgent.includes("Firefox/") ? "Firefox" : userAgent.includes("Safari/") ? "Safari" : "Browser";
    const platform = userAgent.includes("Windows") ? "Windows" : userAgent.includes("Macintosh") ? "macOS" : userAgent.includes("Android") ? "Android" : userAgent.includes("iPhone") || userAgent.includes("iPad") ? "iOS" : "Device";
    return `${browser} on ${platform}`;
  }

  private async getSecuritySettings(organizationId: string) {
    const settings = await this.prisma.systemSetting.findUnique({
      where: { organizationId },
      select: {
        applicationName: true,
        companyName: true,
        supportEmail: true,
        passwordResetEnabled: true,
        passwordResetTokenTtlMinutes: true,
        mfaRequiredForAdmins: true,
        mfaRequiredForAllUsers: true,
        mfaTrustedDeviceDays: true,
        turnstileEnabled: true,
        turnstileSecretReference: true,
        turnstileProtectLogin: true,
        turnstileProtectPasswordReset: true
      }
    });
    return {
      applicationName: settings?.applicationName ?? this.config.get<string>("APP_NAME") ?? "Avidity IT Management Tool",
      companyName: settings?.companyName ?? this.config.get<string>("DEFAULT_COMPANY_NAME") ?? "Avidity Technologies",
      supportEmail: settings?.supportEmail ?? this.config.get<string>("DEFAULT_SUPPORT_EMAIL") ?? "support@aviditytechnologies.com",
      passwordResetEnabled: settings?.passwordResetEnabled ?? true,
      passwordResetTokenTtlMinutes: settings?.passwordResetTokenTtlMinutes ?? 30,
      mfaRequiredForAdmins: settings?.mfaRequiredForAdmins ?? false,
      mfaRequiredForAllUsers: settings?.mfaRequiredForAllUsers ?? false,
      mfaTrustedDeviceDays: settings?.mfaTrustedDeviceDays ?? 30,
      turnstileEnabled: settings?.turnstileEnabled ?? false,
      turnstileSecretReference: settings?.turnstileSecretReference ?? null,
      turnstileProtectLogin: settings?.turnstileProtectLogin ?? false,
      turnstileProtectPasswordReset: settings?.turnstileProtectPasswordReset ?? false
    };
  }

  private async verifyTurnstileIfNeeded(flow: "login" | "passwordReset", token: string | undefined, context: RequestContext) {
    const settings = await this.prisma.systemSetting.findFirst({
      orderBy: { createdAt: "asc" },
      select: {
        turnstileEnabled: true,
        turnstileSecretReference: true,
        turnstileProtectLogin: true,
        turnstileProtectPasswordReset: true
      }
    });
    const required = settings?.turnstileEnabled && (flow === "login" ? settings.turnstileProtectLogin : settings.turnstileProtectPasswordReset);
    if (!required) {
      return;
    }
    if (!token) {
      throw new UnauthorizedException("Security verification is required.");
    }
    const secret = this.resolveSecret(settings.turnstileSecretReference);
    if (!secret) {
      throw new UnauthorizedException("Security verification is not configured.");
    }
    const formData = new URLSearchParams();
    formData.set("secret", secret);
    formData.set("response", token);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData
    });
    const payload = (await response.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!payload.success) {
      await this.auditLogs.create({
        entityType: "Auth",
        action: "auth.turnstile_failure",
        ipAddress: context.ipAddress ?? undefined,
        userAgent: context.userAgent ?? undefined,
        metadata: { flow, errorCodes: payload["error-codes"] ?? [] }
      });
      throw new UnauthorizedException("Security verification failed.");
    }
  }

  private resolveSecret(reference: string | null | undefined) {
    if (!reference) return null;
    if (reference.startsWith("env:")) {
      return this.config.get<string>(reference.slice(4)) ?? null;
    }
    return null;
  }

  private getSecretEncryptionKey() {
    return this.config.get<string>("SESSION_SECRET") ?? "";
  }

  private async sendPasswordResetEmail(organizationId: string, email: string, token: string) {
    const appUrl = this.config.get<string>("APP_URL") ?? "http://localhost:3000";
    const resetUrl = `${appUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
    const settings = await this.getSecuritySettings(organizationId);
    const bodyText = `A password reset was requested for your ${settings.applicationName} account.\n\nOpen this link within ${settings.passwordResetTokenTtlMinutes} minutes:\n${resetUrl}\n\nIf you did not request this, ignore this email.`;
    const escapedUrl = resetUrl.replace(/"/g, "%22");
    const bodyHtml = `<p>A password reset was requested for your ${this.escapeHtml(settings.applicationName)} account.</p><p><a href="${escapedUrl}">Reset your password</a></p><p>This link expires in ${settings.passwordResetTokenTtlMinutes} minutes.</p><p>If you did not request this, ignore this email.</p>`;
    const mailDelivery = this.moduleRef.get(MailDeliveryService, { strict: false });
    await mailDelivery.sendTicketReply({
      organizationId,
      to: [email],
      subject: `${settings.applicationName} password reset`,
      bodyText,
      bodyHtml
    });
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
  }

  private getSessionTtlHours(): number {
    return Number(this.config.get<string>("SESSION_TTL_HOURS") ?? 12);
  }

  private hashSessionToken(sessionToken: string): string {
    return createHash("sha256").update(sessionToken).digest("hex");
  }

  private async buildAuthenticatedUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        groups: {
          include: {
            group: {
              include: {
                roles: {
                  include: {
                    role: {
                      include: {
                        permissions: {
                          include: {
                            permission: true
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!user) {
      throw new UnauthorizedException("Session user was not found.");
    }

    return this.toAuthenticatedUser(user);
  }

  private toAuthenticatedUser(
    user: User & {
      groups: Array<{
        group: {
          roles: Array<{
            role: {
              permissions: Array<{
                permission: {
                  name: string;
                };
              }>;
            };
          }>;
        };
      }>;
    }
  ): AuthenticatedUser {
    const permissions = new Set<string>();
    for (const userGroup of user.groups) {
      for (const groupRole of userGroup.group.roles) {
        for (const rolePermission of groupRole.role.permissions) {
          permissions.add(rolePermission.permission.name);
        }
      }
    }

    return {
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      forcePasswordChange: user.forcePasswordChange,
      permissions: [...permissions].sort()
    };
  }
}
