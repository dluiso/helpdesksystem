import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { ClientDomainsService } from "../client-domains/client-domains.service";
import { ClientsService } from "../clients/clients.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateContactDto } from "./dto/create-contact.dto";
import { UpdateContactDto } from "./dto/update-contact.dto";

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
    private readonly clientDomainsService: ClientDomainsService,
    private readonly auditLogs: AuditLogsService
  ) {}

  async listForClient(clientId: string, user: AuthenticatedUser) {
    await this.clientsService.ensureClientExists(clientId, user);

    return this.prisma.contact.findMany({
      where: {
        clientId,
        deletedAt: null
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    });
  }

  async getById(contactId: string, user: AuthenticatedUser) {
    const contact = await this.getContactForUser(contactId, user);
    return contact;
  }

  async create(clientId: string, input: CreateContactDto, user: AuthenticatedUser) {
    await this.clientsService.ensureClientExists(clientId, user);
    const email = input.email.trim().toLowerCase();
    await this.ensureEmailAvailable(clientId, email);

    const contact = await this.prisma.contact.create({
      data: {
        clientId,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email,
        phone: this.optionalTrim(input.phone),
        title: this.optionalTrim(input.title),
        isAuthorizedRequester: input.isAuthorizedRequester ?? true,
        isBillingContact: input.isBillingContact ?? false,
        isTechnicalContact: input.isTechnicalContact ?? false,
        notes: this.optionalTrim(input.notes)
      }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "Contact",
      entityId: contact.id,
      action: "contact.created",
      metadata: { clientId, email: contact.email }
    });

    return contact;
  }

  async update(contactId: string, input: UpdateContactDto, user: AuthenticatedUser) {
    const existing = await this.getContactForUser(contactId, user);
    const email = input.email?.trim().toLowerCase();

    if (email && email !== existing.email) {
      await this.ensureEmailAvailable(existing.clientId, email);
    }

    const contact = await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        firstName: input.firstName?.trim(),
        lastName: input.lastName?.trim(),
        email,
        phone: input.phone === undefined ? undefined : this.optionalTrim(input.phone),
        title: input.title === undefined ? undefined : this.optionalTrim(input.title),
        isAuthorizedRequester: input.isAuthorizedRequester,
        isBillingContact: input.isBillingContact,
        isTechnicalContact: input.isTechnicalContact,
        notes: input.notes === undefined ? undefined : this.optionalTrim(input.notes)
      }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "Contact",
      entityId: contact.id,
      action: "contact.updated",
      metadata: { clientId: contact.clientId, email: contact.email }
    });

    return contact;
  }

  async softDelete(contactId: string, user: AuthenticatedUser) {
    const existing = await this.getContactForUser(contactId, user);
    const contact = await this.prisma.contact.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "Contact",
      entityId: contact.id,
      action: "contact.deleted",
      metadata: { clientId: contact.clientId, email: contact.email }
    });

    return contact;
  }

  async resolveRequesterFromEmail(input: {
    emailAddress: string;
    organizationId: string;
    displayName?: string | null;
    createIfMissing?: boolean;
  }) {
    const email = this.normalizeEmail(input.emailAddress);
    if (!email) {
      return null;
    }

    const mapping = await this.clientDomainsService.findClientMappingBySenderEmail(email, input.organizationId);
    if (!mapping) {
      return null;
    }

    const existingContact = await this.prisma.contact.findFirst({
      where: {
        clientId: mapping.clientId,
        email,
        deletedAt: null
      }
    });

    if (existingContact || input.createIfMissing === false) {
      return {
        client: mapping.client,
        contact: existingContact,
        domain: mapping.domain,
        created: false
      };
    }

    const requesterName = this.splitRequesterName(input.displayName, email);
    const contact = await this.prisma.contact.create({
      data: {
        clientId: mapping.clientId,
        firstName: requesterName.firstName,
        lastName: requesterName.lastName,
        email,
        isAuthorizedRequester: true,
        notes: "Automatically created from inbound email."
      }
    });

    await this.auditLogs.create({
      userId: null,
      entityType: "Contact",
      entityId: contact.id,
      action: "contact.created_from_email",
      metadata: { clientId: contact.clientId, email: contact.email, domain: mapping.domain }
    });

    return {
      client: mapping.client,
      contact,
      domain: mapping.domain,
      created: true
    };
  }

  private async getContactForUser(contactId: string, user: AuthenticatedUser) {
    const contact = await this.prisma.contact.findFirst({
      where: {
        id: contactId,
        deletedAt: null,
        client: {
          organizationId: user.organizationId,
          deletedAt: null
        }
      }
    });

    if (!contact) {
      throw new NotFoundException("Contact was not found.");
    }

    return contact;
  }

  private async ensureEmailAvailable(clientId: string, email: string) {
    const existing = await this.prisma.contact.findFirst({
      where: {
        clientId,
        email,
        deletedAt: null
      }
    });

    if (existing) {
      throw new ConflictException("This contact email already exists for the client.");
    }
  }

  private optionalTrim(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private normalizeEmail(value: string): string | null {
    const normalized = value.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
  }

  private splitRequesterName(displayName: string | null | undefined, email: string) {
    const fallback = email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "Email";
    const normalized = (displayName?.trim() || fallback).replace(/\s+/g, " ");
    const parts = normalized.split(" ").filter(Boolean);

    if (parts.length === 0) {
      return { firstName: "Email", lastName: "Requester" };
    }

    if (parts.length === 1) {
      return { firstName: parts[0], lastName: "Requester" };
    }

    return {
      firstName: parts.slice(0, -1).join(" "),
      lastName: parts[parts.length - 1]
    };
  }
}
