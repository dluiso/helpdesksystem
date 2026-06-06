import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import argon2 from "argon2";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { buildOtpAuthUrl, decryptSecret, encryptSecret, generateRecoveryCodes, generateSecurityToken, generateTotpSecret, hashSecurityToken, verifyTotpCode } from "../auth/auth-security.util";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { SignaturesService } from "../signatures/signatures.service";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ConfirmMfaSetupDto, DisableMfaDto, StartMfaSetupDto } from "./dto/mfa.dto";
import { UpdateProfileSignatureDto } from "./dto/update-profile-signature.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly notifications: NotificationsService,
    private readonly signatures: SignaturesService,
    private readonly config: ConfigService
  ) {}

  async getProfile(user: AuthenticatedUser) {
    const [profile, notificationPreference, signature] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isActive: true,
          forcePasswordChange: true,
          mfaEnabled: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          groups: {
            select: {
              group: {
                select: {
                  id: true,
                  name: true,
                  roles: {
                    select: {
                      role: {
                        select: { id: true, name: true }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }),
      this.notifications.preferences(user),
      this.signatures.getForUser(user.id)
    ]);

    if (!profile) {
      throw new UnauthorizedException("Profile was not found.");
    }

    return {
      user: profile,
      notificationPreference,
      signature: signature ?? this.defaultSignature(user.id)
    };
  }

  async updateProfile(user: AuthenticatedUser, input: UpdateProfileDto) {
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim()
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        updatedAt: true
      }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "User",
      entityId: user.id,
      action: "profile.updated"
    });

    return updated;
  }

  async changePassword(user: AuthenticatedUser, input: ChangePasswordDto) {
    if (input.currentPassword === input.newPassword) {
      throw new BadRequestException("The new password must be different from the current password.");
    }

    const existing = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, passwordHash: true }
    });
    if (!existing) {
      throw new UnauthorizedException("Profile was not found.");
    }

    const passwordMatches = await argon2.verify(existing.passwordHash, input.currentPassword);
    if (!passwordMatches) {
      throw new UnauthorizedException("The current password was not accepted.");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await argon2.hash(input.newPassword, { type: argon2.argon2id }),
        forcePasswordChange: false
      }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "User",
      entityId: user.id,
      action: "profile.password_changed"
    });

    return { changed: true };
  }

  async startMfaSetup(user: AuthenticatedUser, input: StartMfaSetupDto) {
    await this.ensureUserManagedMfaAllowed(user.organizationId);
    const existing = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, passwordHash: true }
    });
    if (!existing) {
      throw new UnauthorizedException("Profile was not found.");
    }
    if (!(await argon2.verify(existing.passwordHash, input.currentPassword))) {
      throw new UnauthorizedException("The current password was not accepted.");
    }

    const setupToken = generateSecurityToken();
    const secret = generateTotpSecret();
    await this.prisma.mfaSetupChallenge.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        tokenHash: hashSecurityToken(setupToken),
        secretEncrypted: encryptSecret(secret, this.getSecretEncryptionKey()),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "User",
      entityId: user.id,
      action: "profile.mfa_setup_started"
    });

    return {
      setupToken,
      secret,
      otpauthUrl: buildOtpAuthUrl({
        issuer: "Avidity",
        accountName: existing.email,
        secret
      })
    };
  }

  async confirmMfaSetup(user: AuthenticatedUser, input: ConfirmMfaSetupDto) {
    await this.ensureUserManagedMfaAllowed(user.organizationId);
    const challenge = await this.prisma.mfaSetupChallenge.findUnique({
      where: { tokenHash: hashSecurityToken(input.setupToken) }
    });
    if (!challenge || challenge.userId !== user.id || challenge.usedAt || challenge.expiresAt <= new Date()) {
      throw new UnauthorizedException("The MFA setup challenge is invalid or expired.");
    }
    const secret = decryptSecret(challenge.secretEncrypted, this.getSecretEncryptionKey());
    if (!verifyTotpCode(secret, input.code)) {
      throw new UnauthorizedException("The authentication code was not accepted.");
    }
    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          mfaEnabled: true,
          totpSecretEncrypted: encryptSecret(secret, this.getSecretEncryptionKey()),
          recoveryCodesHash: { set: await Promise.all(recoveryCodes.map((code) => argon2.hash(code.toLowerCase(), { type: argon2.argon2id }))) }
        }
      }),
      this.prisma.mfaSetupChallenge.update({
        where: { id: challenge.id },
        data: { usedAt: new Date() }
      })
    ]);

    await this.auditLogs.create({
      userId: user.id,
      entityType: "User",
      entityId: user.id,
      action: "profile.mfa_enabled"
    });

    return { enabled: true, recoveryCodes };
  }

  async disableMfa(user: AuthenticatedUser, input: DisableMfaDto) {
    await this.ensureUserManagedMfaAllowed(user.organizationId);
    const existing = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, passwordHash: true, mfaEnabled: true, totpSecretEncrypted: true, recoveryCodesHash: true }
    });
    if (!existing) {
      throw new UnauthorizedException("Profile was not found.");
    }
    if (!(await argon2.verify(existing.passwordHash, input.currentPassword))) {
      throw new UnauthorizedException("The current password was not accepted.");
    }
    if (existing.mfaEnabled && existing.totpSecretEncrypted) {
      const secret = decryptSecret(existing.totpSecretEncrypted, this.getSecretEncryptionKey());
      const recoveryMatched = input.code ? await this.consumeRecoveryCode(user.id, input.code, existing.recoveryCodesHash) : false;
      if (!recoveryMatched && !verifyTotpCode(secret, input.code ?? "")) {
        throw new UnauthorizedException("The authentication code was not accepted.");
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: false,
        totpSecretEncrypted: null,
        recoveryCodesHash: { set: [] }
      }
    });
    await this.prisma.mfaTrustedDevice.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "User",
      entityId: user.id,
      action: "profile.mfa_disabled"
    });

    return { disabled: true };
  }

  signature(user: AuthenticatedUser) {
    return this.signatures.getForUser(user.id).then((signature) => signature ?? this.defaultSignature(user.id));
  }

  async updateSignature(user: AuthenticatedUser, input: UpdateProfileSignatureDto) {
    const signature = await this.signatures.upsertForUser({
      userId: user.id,
      htmlSignature: input.htmlSignature,
      useSignatureByDefault: input.useSignatureByDefault
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "UserSignature",
      entityId: signature.id,
      action: "profile.signature_updated",
      metadata: { useSignatureByDefault: signature.useSignatureByDefault }
    });

    return signature;
  }

  private defaultSignature(userId: string) {
    return {
      id: "",
      userId,
      htmlSignature: "",
      plainTextSignature: "",
      useSignatureByDefault: true,
      createdAt: null,
      updatedAt: null
    };
  }

  private async ensureUserManagedMfaAllowed(organizationId: string) {
    const settings = await this.prisma.systemSetting.findUnique({
      where: { organizationId },
      select: { mfaUserManagedEnabled: true }
    });
    if (settings?.mfaUserManagedEnabled === false) {
      throw new BadRequestException("User-managed multi-factor authentication is disabled.");
    }
  }

  private getSecretEncryptionKey() {
    return this.config.get<string>("SESSION_SECRET") ?? "";
  }

  private async consumeRecoveryCode(userId: string, code: string, hashes: string[]) {
    const normalized = code.trim().toLowerCase();
    if (!normalized.includes("-")) return false;
    let matchedHash: string | null = null;
    for (const hash of hashes) {
      if (await argon2.verify(hash, normalized)) {
        matchedHash = hash;
        break;
      }
    }
    if (!matchedHash) return false;
    await this.prisma.user.update({
      where: { id: userId },
      data: { recoveryCodesHash: { set: hashes.filter((hash) => hash !== matchedHash) } }
    });
    return true;
  }
}
