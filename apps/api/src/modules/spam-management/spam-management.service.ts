import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, SpamBlockType } from "@prisma/client";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { CreateSpamBlockEntryDto } from "./dto/create-spam-block-entry.dto";
import { UpdateSpamBlockEntryDto } from "./dto/update-spam-block-entry.dto";

@Injectable()
export class SpamManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService
  ) {}

  async list(user: AuthenticatedUser, query: { search?: string; type?: SpamBlockType; active?: string }) {
    const filters: Prisma.SpamBlockEntryWhereInput[] = [{ organizationId: user.organizationId }];
    const search = query.search?.trim();

    if (query.type) {
      filters.push({ type: query.type });
    }

    if (query.active === "true") {
      filters.push({ isActive: true });
    } else if (query.active === "false") {
      filters.push({ isActive: false });
    }

    if (search) {
      filters.push({
        OR: [
          { value: { contains: search, mode: "insensitive" } },
          { normalizedValue: { contains: search.toLowerCase(), mode: "insensitive" } },
          { notes: { contains: search, mode: "insensitive" } }
        ]
      });
    }

    return this.prisma.spamBlockEntry.findMany({
      where: { AND: filters },
      include: { createdBy: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }]
    });
  }

  async create(input: CreateSpamBlockEntryDto, user: AuthenticatedUser) {
    const normalizedValue = this.normalizeValue(input.type, input.value);

    try {
      const entry = await this.prisma.spamBlockEntry.create({
        data: {
          organizationId: user.organizationId,
          type: input.type,
          value: input.value.trim(),
          normalizedValue,
          notes: input.notes?.trim() || null,
          createdByUserId: user.id
        },
        include: { createdBy: { select: { id: true, firstName: true, lastName: true, email: true } } }
      });

      await this.auditLogs.create({
        userId: user.id,
        entityType: "SpamBlockEntry",
        entityId: entry.id,
        action: "spam_block_entry.created",
        metadata: { type: entry.type, value: entry.normalizedValue }
      });

      return entry;
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException("This spam block entry already exists.");
      }
      throw error;
    }
  }

  async update(entryId: string, input: UpdateSpamBlockEntryDto, user: AuthenticatedUser) {
    await this.ensureEntry(entryId, user.organizationId);
    const entry = await this.prisma.spamBlockEntry.update({
      where: { id: entryId },
      data: {
        isActive: input.isActive,
        notes: input.notes === undefined ? undefined : input.notes.trim() || null
      },
      include: { createdBy: { select: { id: true, firstName: true, lastName: true, email: true } } }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "SpamBlockEntry",
      entityId: entry.id,
      action: "spam_block_entry.updated",
      metadata: { isActive: entry.isActive }
    });

    return entry;
  }

  async delete(entryId: string, user: AuthenticatedUser) {
    const entry = await this.ensureEntry(entryId, user.organizationId);
    await this.prisma.spamBlockEntry.delete({ where: { id: entryId } });
    await this.auditLogs.create({
      userId: user.id,
      entityType: "SpamBlockEntry",
      entityId: entry.id,
      action: "spam_block_entry.deleted",
      metadata: { type: entry.type, value: entry.normalizedValue }
    });
    return { deleted: true };
  }

  async findBlockForSender(organizationId: string, senderEmail: string, senderDomain?: string | null) {
    const normalizedEmail = this.normalizeEmail(senderEmail);
    const normalizedDomain = senderDomain ? this.normalizeDomain(senderDomain) : this.domainFromEmail(normalizedEmail);

    return this.prisma.spamBlockEntry.findFirst({
      where: {
        organizationId,
        isActive: true,
        OR: [
          { type: SpamBlockType.EMAIL, normalizedValue: normalizedEmail },
          ...(normalizedDomain ? [{ type: SpamBlockType.DOMAIN, normalizedValue: normalizedDomain }] : [])
        ]
      },
      orderBy: { type: "asc" }
    });
  }

  async logBlockedInboundEmail(input: {
    organizationId: string;
    mailboxId?: string | null;
    spamBlockEntryId?: string | null;
    senderEmail: string;
    senderDomain?: string | null;
    subject: string;
    emailMessageId?: string | null;
    emailInternetMessageId?: string | null;
    emailConversationId?: string | null;
    reason: string;
  }) {
    return this.prisma.blockedInboundEmail.create({
      data: {
        organizationId: input.organizationId,
        mailboxId: input.mailboxId ?? null,
        spamBlockEntryId: input.spamBlockEntryId ?? null,
        senderEmail: this.normalizeEmail(input.senderEmail),
        senderDomain: input.senderDomain ? this.normalizeDomain(input.senderDomain) : this.domainFromEmail(input.senderEmail),
        subject: input.subject.slice(0, 500),
        emailMessageId: input.emailMessageId ?? null,
        emailInternetMessageId: input.emailInternetMessageId ?? null,
        emailConversationId: input.emailConversationId ?? null,
        reason: input.reason
      }
    });
  }

  private async ensureEntry(entryId: string, organizationId: string) {
    const entry = await this.prisma.spamBlockEntry.findFirst({ where: { id: entryId, organizationId } });
    if (!entry) {
      throw new NotFoundException("Spam block entry was not found.");
    }
    return entry;
  }

  private normalizeValue(type: SpamBlockType, value: string) {
    return type === SpamBlockType.EMAIL ? this.normalizeEmail(value) : this.normalizeDomain(value);
  }

  private normalizeEmail(value: string) {
    const normalized = value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new BadRequestException("Enter a valid email address.");
    }
    return normalized;
  }

  private normalizeDomain(value: string) {
    const normalized = value.trim().toLowerCase().replace(/^@/, "").replace(/\.$/, "");
    if (!/^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(normalized)) {
      throw new BadRequestException("Enter a valid domain.");
    }
    return normalized;
  }

  private domainFromEmail(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const atIndex = normalizedEmail.lastIndexOf("@");
    return atIndex === -1 ? null : normalizedEmail.slice(atIndex + 1).replace(/\.$/, "") || null;
  }

  private isUniqueConstraint(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }
}
