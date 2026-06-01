import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import argon2 from "argon2";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { SignaturesService } from "../signatures/signatures.service";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { UpdateProfileSignatureDto } from "./dto/update-profile-signature.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly notifications: NotificationsService,
    private readonly signatures: SignaturesService
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
}
