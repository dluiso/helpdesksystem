import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { ClientsService } from "../clients/clients.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateClientDomainDto } from "./dto/create-client-domain.dto";
import { UpdateClientDomainDto } from "./dto/update-client-domain.dto";

const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com"
]);

@Injectable()
export class ClientDomainsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
    private readonly auditLogs: AuditLogsService
  ) {}

  async listForClient(clientId: string, user: AuthenticatedUser) {
    await this.clientsService.ensureClientExists(clientId, user);

    return this.prisma.clientDomain.findMany({
      where: { clientId },
      orderBy: { domain: "asc" }
    });
  }

  async listUnmapped(user: AuthenticatedUser) {
    return this.prisma.unmappedEmailDomain.findMany({
      where: {
        organizationId: user.organizationId,
        resolvedAt: null
      },
      orderBy: [{ lastSeenAt: "desc" }, { domain: "asc" }],
      take: 100
    });
  }

  async create(clientId: string, input: CreateClientDomainDto, user: AuthenticatedUser) {
    await this.clientsService.ensureClientExists(clientId, user);
    const domain = this.normalizeDomain(input.domain);
    const existing = await this.prisma.clientDomain.findUnique({
      where: { domain },
      include: { client: true }
    });

    if (existing?.isActive) {
      throw new ConflictException("This domain is already active for a client.");
    }

    const clientDomain = existing
      ? await this.prisma.clientDomain.update({
          where: { id: existing.id },
          data: {
            clientId,
            isActive: input.isActive ?? true,
            isVerified: input.isVerified ?? existing.isVerified
          }
        })
      : await this.prisma.clientDomain.create({
          data: {
            clientId,
            domain,
            isActive: input.isActive ?? true,
            isVerified: input.isVerified ?? false
          }
        });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "ClientDomain",
      entityId: clientDomain.id,
      action: existing ? "client_domain.reactivated" : "client_domain.created",
      metadata: { clientId, domain: clientDomain.domain }
    });

    return clientDomain;
  }

  async update(domainId: string, input: UpdateClientDomainDto, user: AuthenticatedUser) {
    const existing = await this.getDomainForUser(domainId, user);

    if (input.isActive === true && !existing.isActive) {
      const activeConflict = await this.prisma.clientDomain.findFirst({
        where: {
          domain: existing.domain,
          isActive: true,
          id: { not: existing.id }
        }
      });

      if (activeConflict) {
        throw new ConflictException("This domain is already active for a client.");
      }
    }

    const clientDomain = await this.prisma.clientDomain.update({
      where: { id: domainId },
      data: {
        isActive: input.isActive,
        isVerified: input.isVerified
      }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "ClientDomain",
      entityId: clientDomain.id,
      action: "client_domain.updated",
      metadata: { clientId: clientDomain.clientId, domain: clientDomain.domain }
    });

    return clientDomain;
  }

  async deactivate(domainId: string, user: AuthenticatedUser) {
    const existing = await this.getDomainForUser(domainId, user);
    const clientDomain = await this.prisma.clientDomain.update({
      where: { id: existing.id },
      data: { isActive: false }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "ClientDomain",
      entityId: clientDomain.id,
      action: "client_domain.deleted",
      metadata: { clientId: clientDomain.clientId, domain: clientDomain.domain }
    });

    return clientDomain;
  }

  async associateUnmappedDomain(unmappedDomainId: string, clientId: string, user: AuthenticatedUser) {
    const unmapped = await this.prisma.unmappedEmailDomain.findFirst({
      where: {
        id: unmappedDomainId,
        organizationId: user.organizationId,
        resolvedAt: null
      }
    });

    if (!unmapped) {
      throw new NotFoundException("Unmapped email domain was not found.");
    }

    await this.clientsService.ensureClientExists(clientId, user);
    const domain = this.normalizeDomain(unmapped.domain);
    const existing = await this.prisma.clientDomain.findUnique({
      where: { domain }
    });

    if (existing?.isActive && existing.clientId !== clientId) {
      throw new ConflictException("This domain is already active for another client.");
    }

    const tickets = await this.prisma.ticket.findMany({
      where: {
        organizationId: user.organizationId,
        senderDomain: domain,
        clientId: null,
        deletedAt: null
      },
      select: {
        id: true,
        senderEmail: true
      }
    });
    const contactByEmail = new Map<string, string>();

    for (const ticket of tickets) {
      const senderEmail = ticket.senderEmail?.trim().toLowerCase();
      if (!senderEmail || contactByEmail.has(senderEmail)) {
        continue;
      }

      const existingContact = await this.prisma.contact.findFirst({
        where: {
          clientId,
          email: senderEmail,
          deletedAt: null
        },
        select: { id: true }
      });

      if (existingContact) {
        contactByEmail.set(senderEmail, existingContact.id);
        continue;
      }

      const name = this.nameFromEmail(senderEmail);
      const contact = await this.prisma.contact.create({
        data: {
          clientId,
          firstName: name.firstName,
          lastName: name.lastName,
          email: senderEmail,
          isAuthorizedRequester: true,
          notes: "Automatically created when an unmapped email domain was associated to this client."
        },
        select: { id: true }
      });
      contactByEmail.set(senderEmail, contact.id);
    }

    const clientDomain = existing
      ? await this.prisma.clientDomain.update({
          where: { id: existing.id },
          data: { clientId, isActive: true }
        })
      : await this.prisma.clientDomain.create({
          data: { clientId, domain, isActive: true, isVerified: false }
        });

    for (const ticket of tickets) {
      const contactId = ticket.senderEmail ? contactByEmail.get(ticket.senderEmail.trim().toLowerCase()) : undefined;
      await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          clientId,
          contactId: contactId ?? null
        }
      });
      if (contactId) {
        await this.prisma.ticketMessage.updateMany({
          where: {
            ticketId: ticket.id,
            direction: "INBOUND",
            authorContactId: null
          },
          data: {
            authorContactId: contactId
          }
        });
      }
    }

    const resolved = await this.prisma.unmappedEmailDomain.update({
      where: { id: unmapped.id },
      data: {
        resolvedAt: new Date(),
        resolvedClientId: clientId
      }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "UnmappedEmailDomain",
      entityId: resolved.id,
      action: "unmapped_email_domain.associated",
      metadata: { clientId, domain, reassociatedTicketCount: tickets.length }
    });

    return {
      domain: clientDomain,
      resolved,
      reassociatedTicketCount: tickets.length,
      createdContactCount: contactByEmail.size
    };
  }

  async findClientBySenderEmail(emailAddress: string, organizationId?: string) {
    const mapping = await this.findClientMappingBySenderEmail(emailAddress, organizationId);
    return mapping?.client ?? null;
  }

  async findClientMappingBySenderEmail(emailAddress: string, organizationId?: string) {
    const domain = this.extractDomain(emailAddress);
    if (!domain || GENERIC_EMAIL_DOMAINS.has(domain)) {
      return null;
    }

    const mapping = await this.prisma.clientDomain.findFirst({
      where: {
        domain,
        isActive: true,
        client: {
          ...(organizationId ? { organizationId } : {}),
          deletedAt: null,
          status: "ACTIVE"
        }
      },
      include: {
        client: true
      }
    });

    return mapping ?? null;
  }

  extractDomain(emailAddress: string): string | null {
    const normalized = emailAddress.trim().toLowerCase();
    const atIndex = normalized.lastIndexOf("@");
    if (atIndex === -1 || atIndex === normalized.length - 1) {
      return null;
    }

    try {
      return this.normalizeDomain(normalized.slice(atIndex + 1));
    } catch {
      return null;
    }
  }

  normalizeDomain(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/\.$/, "");

    if (
      normalized.includes("://") ||
      normalized.includes("/") ||
      normalized.includes("@") ||
      !/^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(normalized)
    ) {
      throw new BadRequestException("Domain must be a valid DNS domain such as example.com.");
    }

    return normalized;
  }

  private nameFromEmail(email: string) {
    const localPart = email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "Email";
    const parts = localPart.split(/\s+/).filter(Boolean);

    if (parts.length === 0) {
      return { firstName: "Email", lastName: "Requester" };
    }

    if (parts.length === 1) {
      return { firstName: this.capitalize(parts[0]), lastName: "Requester" };
    }

    return {
      firstName: parts.slice(0, -1).map((part) => this.capitalize(part)).join(" "),
      lastName: this.capitalize(parts[parts.length - 1])
    };
  }

  private capitalize(value: string) {
    return value.slice(0, 1).toUpperCase() + value.slice(1).toLowerCase();
  }

  private async getDomainForUser(domainId: string, user: AuthenticatedUser) {
    const clientDomain = await this.prisma.clientDomain.findFirst({
      where: {
        id: domainId,
        client: {
          organizationId: user.organizationId,
          deletedAt: null
        }
      }
    });

    if (!clientDomain) {
      throw new NotFoundException("Client domain was not found.");
    }

    return clientDomain;
  }
}
