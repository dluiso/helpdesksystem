import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import {
  BLOCKED_ATTACHMENT_EXTENSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  INITIAL_PERMISSIONS,
  INITIAL_ROLES
} from "../packages/shared/src";

const prisma = new PrismaClient();

const ORGANIZATION_ID = "00000000-0000-0000-0000-000000000001";
const SETTINGS_ID = "00000000-0000-0000-0000-000000000002";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@aviditytechnologies.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMeNow!123";

async function main() {
  if ((process.env.APP_ENV ?? "development") === "production" && ADMIN_PASSWORD === "ChangeMeNow!123") {
    throw new Error("Refusing to seed production with the default administrator password. Set ADMIN_PASSWORD first.");
  }

  const organization = await prisma.organization.upsert({
    where: { id: ORGANIZATION_ID },
    update: {
      name: process.env.DEFAULT_COMPANY_NAME ?? "Avidity Technologies"
    },
    create: {
      id: ORGANIZATION_ID,
      name: process.env.DEFAULT_COMPANY_NAME ?? "Avidity Technologies"
    }
  });

  await prisma.systemSetting.upsert({
    where: { id: SETTINGS_ID },
    update: {
      applicationName: process.env.APP_NAME ?? "Avidity IT Management Tool",
      companyName: process.env.DEFAULT_COMPANY_NAME ?? "Avidity Technologies",
      supportEmail: process.env.DEFAULT_SUPPORT_EMAIL ?? "support@aviditytechnologies.com"
    },
    create: {
      id: SETTINGS_ID,
      organizationId: organization.id,
      applicationName: process.env.APP_NAME ?? "Avidity IT Management Tool",
      companyName: process.env.DEFAULT_COMPANY_NAME ?? "Avidity Technologies",
      supportEmail: process.env.DEFAULT_SUPPORT_EMAIL ?? "support@aviditytechnologies.com",
      defaultTimezone: process.env.DEFAULT_TIMEZONE ?? "America/Chicago",
      defaultLanguage: process.env.DEFAULT_LANGUAGE ?? "en",
      defaultTicketAutoReplyTemplate:
        "We received your request {{ticket.number}}: {{ticket.subject}}. Our support team will review it shortly.",
      blockedAttachmentFileTypes: [...BLOCKED_ATTACHMENT_EXTENSIONS],
      allowedAttachmentFileTypes: []
    }
  });

  await prisma.ticketSequence.upsert({
    where: { key: "ticket" },
    update: {},
    create: {
      key: "ticket",
      prefix: "AIT",
      currentValue: 100000
    }
  });

  const permissions = new Map<string, string>();
  for (const name of INITIAL_PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { name },
      update: {},
      create: {
        name,
        description: `Allows ${name.replace(".", " ")}`
      }
    });
    permissions.set(name, permission.id);
  }

  const roles = new Map<string, string>();
  for (const name of INITIAL_ROLES) {
    const role = await prisma.role.upsert({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name
        }
      },
      update: {},
      create: {
        organizationId: organization.id,
        name,
        isSystem: true
      }
    });
    roles.set(name, role.id);
  }

  for (const [roleName, permissionNames] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const roleId = roles.get(roleName);
    if (!roleId) {
      continue;
    }

    for (const permissionName of permissionNames) {
      const permissionId = permissions.get(permissionName);
      if (!permissionId) {
        continue;
      }

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId,
            permissionId
          }
        },
        update: {},
        create: {
          roleId,
          permissionId
        }
      });
    }
  }

  const superAdminRoleId = roles.get("Super Admin");
  if (!superAdminRoleId) {
    throw new Error("Super Admin role was not seeded.");
  }

  const administratorsGroup = await prisma.group.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: "Administrators"
      }
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Administrators",
      description: "Default group for platform administrators.",
      isSystem: true
    }
  });

  await prisma.groupRole.upsert({
    where: {
      groupId_roleId: {
        groupId: administratorsGroup.id,
        roleId: superAdminRoleId
      }
    },
    update: {},
    create: {
      groupId: administratorsGroup.id,
      roleId: superAdminRoleId
    }
  });

  const technicianGroup = await prisma.group.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: "Technicians"
      }
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Technicians",
      description: "Default group for support technicians.",
      isSystem: true
    }
  });

  const technicianRoleId = roles.get("Technician");
  if (technicianRoleId) {
    await prisma.groupRole.upsert({
      where: {
        groupId_roleId: {
          groupId: technicianGroup.id,
          roleId: technicianRoleId
        }
      },
      update: {},
      create: {
        groupId: technicianGroup.id,
        roleId: technicianRoleId
      }
    });
  }

  const managersGroup = await prisma.group.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: "Managers"
      }
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Managers",
      description: "Default group for service managers.",
      isSystem: true
    }
  });

  const managerRoleId = roles.get("Manager");
  if (managerRoleId) {
    await prisma.groupRole.upsert({
      where: {
        groupId_roleId: {
          groupId: managersGroup.id,
          roleId: managerRoleId
        }
      },
      update: {},
      create: {
        groupId: managersGroup.id,
        roleId: managerRoleId
      }
    });
  }

  const passwordHash = await argon2.hash(ADMIN_PASSWORD, {
    type: argon2.argon2id
  });

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      passwordHash,
      isActive: true,
      forcePasswordChange: true
    },
    create: {
      organizationId: organization.id,
      email: ADMIN_EMAIL,
      passwordHash,
      firstName: "System",
      lastName: "Administrator",
      isActive: true,
      forcePasswordChange: true
    }
  });

  await prisma.userGroup.upsert({
    where: {
      userId_groupId: {
        userId: admin.id,
        groupId: administratorsGroup.id
      }
    },
    update: {},
    create: {
      userId: admin.id,
      groupId: administratorsGroup.id
    }
  });

  const defaultTicketTeam = await prisma.ticketTeam.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: "Default Support Team"
      }
    },
    update: { isActive: true },
    create: {
      organizationId: organization.id,
      name: "Default Support Team",
      description: "Default operational ticket assignment team.",
      isActive: true
    }
  });

  await prisma.ticketTeamMember.upsert({
    where: {
      ticketTeamId_userId: {
        ticketTeamId: defaultTicketTeam.id,
        userId: admin.id
      }
    },
    update: {},
    create: {
      ticketTeamId: defaultTicketTeam.id,
      userId: admin.id
    }
  });

  const mailbox = await prisma.mailbox.upsert({
    where: {
      emailAddress: process.env.MICROSOFT_SUPPORT_MAILBOX ?? "support@aviditytechnologies.com"
    },
    update: {
      name: "Support Mailbox",
      isActive: true,
      publicEmailAddress: process.env.MICROSOFT_SUPPORT_MAILBOX ?? "support@aviditytechnologies.com",
      outboundFromAddress: process.env.MICROSOFT_SUPPORT_MAILBOX ?? "support@aviditytechnologies.com",
      outboundReplyToAddress: process.env.MICROSOFT_SUPPORT_MAILBOX ?? "support@aviditytechnologies.com"
    },
    create: {
      organizationId: organization.id,
      name: "Support Mailbox",
      emailAddress: process.env.MICROSOFT_SUPPORT_MAILBOX ?? "support@aviditytechnologies.com",
      provider: "MICROSOFT365",
      connectionMode: "GRAPH_DIRECT",
      publicEmailAddress: process.env.MICROSOFT_SUPPORT_MAILBOX ?? "support@aviditytechnologies.com",
      outboundMode: "GRAPH_SEND_AS",
      outboundFromAddress: process.env.MICROSOFT_SUPPORT_MAILBOX ?? "support@aviditytechnologies.com",
      outboundReplyToAddress: process.env.MICROSOFT_SUPPORT_MAILBOX ?? "support@aviditytechnologies.com",
      tenantId: process.env.MICROSOFT_TENANT_ID || null,
      microsoftClientId: process.env.MICROSOFT_CLIENT_ID || null,
      encryptedClientSecretReference: process.env.MICROSOFT_CLIENT_SECRET ? "env:MICROSOFT_CLIENT_SECRET" : null
    }
  });

  await prisma.autoReplyTemplate.upsert({
    where: { id: "00000000-0000-0000-0000-000000000003" },
    update: {
      bodyText:
        "Hello {{contact.firstName}},\n\nWe received ticket {{ticket.number}} about {{ticket.subject}}. {{company.name}} support will review it shortly.\n\n{{support.email}}"
    },
    create: {
      id: "00000000-0000-0000-0000-000000000003",
      organizationId: organization.id,
      mailboxId: mailbox.id,
      scope: "GLOBAL",
      name: "Default New Ticket Auto-Reply",
      subject: "We received your request {{ticket.number}}",
      bodyHtml:
        "<p>Hello {{contact.firstName}},</p><p>We received ticket <strong>{{ticket.number}}</strong> about {{ticket.subject}}. {{company.name}} support will review it shortly.</p><p>{{support.email}}</p>",
      bodyText:
        "Hello {{contact.firstName}},\n\nWe received ticket {{ticket.number}} about {{ticket.subject}}. {{company.name}} support will review it shortly.\n\n{{support.email}}"
    }
  });

  const mockProvider = await prisma.aiProviderConfig.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: "Mock AI"
      }
    },
    update: {
      provider: "MOCK",
      defaultModel: "mock",
      isEnabled: true
    },
    create: {
      organizationId: organization.id,
      name: "Mock AI",
      provider: "MOCK",
      defaultModel: "mock",
      isEnabled: true,
      priority: 100
    }
  });

  const mockModel = await prisma.aiModelConfig.upsert({
    where: {
      providerConfigId_name: {
        providerConfigId: mockProvider.id,
        name: "mock"
      }
    },
    update: {
      isDefault: true,
      isEnabled: true
    },
    create: {
      organizationId: organization.id,
      providerConfigId: mockProvider.id,
      name: "mock",
      displayName: "Mock AI",
      isDefault: true,
      isEnabled: true
    }
  });

  for (const actionType of ["paraphrase", "improve_reply", "suggest_reply", "fix_grammar", "summarize", "translate", "change_tone"]) {
    await prisma.aiActionSetting.upsert({
      where: {
        organizationId_actionType: {
          organizationId: organization.id,
          actionType
        }
      },
      update: {},
      create: {
        organizationId: organization.id,
        actionType,
        providerConfigId: mockProvider.id,
        modelConfigId: mockModel.id,
        isEnabled: true,
        temperature: 0.3
      }
    });
  }

  console.log(`Seed complete. Admin email: ${ADMIN_EMAIL}. Change the seed password immediately after first login.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
