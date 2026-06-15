import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  EventServiceFieldType,
  MessageDirection,
  MessageVisibility,
  Prisma,
  TicketPriority,
  TicketSource
} from "@prisma/client";
import { HtmlSanitizerService } from "../../common/html/html-sanitizer.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { AutoRepliesService } from "../auto-replies/auto-replies.service";
import { ContactsService } from "../contacts/contacts.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { TicketRoutingService } from "../ticket-routing/ticket-routing.service";
import { CreatePublicSupportTicketDto } from "./dto/create-public-support-ticket.dto";
import { ReorderSupportPortalFieldsDto, ReorderSupportPortalSectionsDto } from "./dto/reorder-support-portal-form.dto";
import { UpdateSupportPortalSettingsDto } from "./dto/update-support-portal-settings.dto";
import { UpsertSupportPortalFormFieldDto } from "./dto/upsert-support-portal-form-field.dto";
import { UpsertSupportPortalFormSectionDto } from "./dto/upsert-support-portal-form-section.dto";

const DEFAULT_SUPPORT_TURNSTILE_SECRET_REFERENCE = "env:SUPPORT_PORTAL_TURNSTILE_SECRET_KEY";
const CORE_FIELD_KEYS = new Set(["requesterName", "requesterEmail", "subject", "description"]);
const REQUESTER_FIELD_KEYS = new Set(["requesterName", "requesterEmail", "requesterPhone", "department", "location", "supervisor"]);
const REQUEST_FIELD_KEYS = new Set(["requestType", "subject", "description", "occurredAt", "issueFrequency", "category", "hardwareSubcategory", "softwareSubcategory", "priority", "affectedPeople", "impact"]);
const ASSET_FIELD_KEYS = new Set(["deviceName", "assetTag", "serialNumber", "ipAddress", "systemName", "systemUrl", "systemVersion"]);

const supportPortalFormInclude = Prisma.validator<Prisma.SupportPortalFormInclude>()({
  fields: { orderBy: [{ sortOrder: "asc" }, { label: "asc" }] },
  sections: {
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    include: { fields: { orderBy: [{ sortOrder: "asc" }, { label: "asc" }] } }
  }
});

type SupportPortalFormWithRelations = Prisma.SupportPortalFormGetPayload<{ include: typeof supportPortalFormInclude }>;

type SupportPortalField = {
  id: string;
  sectionId: string | null;
  type: EventServiceFieldType;
  label: string;
  fieldKey: string;
  placeholder: string | null;
  helpText: string | null;
  options: string[];
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
  isCore: boolean;
  layoutWidth: string;
  visibilityCondition: Prisma.JsonValue | null;
};

type SupportPortalSection = {
  id: string;
  title: string;
  sectionKey: string;
  icon: string | null;
  sortOrder: number;
  isCore: boolean;
  isActive: boolean;
  fields: SupportPortalField[];
};

type SupportPortalVisibilityRule = {
  fieldKey: string;
  operator: string;
  value: string;
};

type PublicFormData = Record<string, unknown>;

@Injectable()
export class SupportPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auditLogs: AuditLogsService,
    private readonly contactsService: ContactsService,
    private readonly ticketRouting: TicketRoutingService,
    private readonly notifications: NotificationsService,
    private readonly autoReplies: AutoRepliesService,
    private readonly htmlSanitizer: HtmlSanitizerService
  ) {}

  async getPublicForm() {
    const organization = await this.getPublicOrganization();
    const form = await this.ensureDefaultForm(organization.id);
    const settings = await this.prisma.systemSetting.findUnique({
      where: { organizationId: organization.id },
      select: {
        companyName: true,
        supportEmail: true,
        supportPortalEnabled: true,
        supportPortalTitle: true,
        supportPortalIntroText: true,
        supportPortalSuccessMessage: true,
        supportPortalTurnstileEnabled: true,
        supportPortalTurnstileSiteKey: true
      }
    });

    if (settings && !settings.supportPortalEnabled) {
      throw new ServiceUnavailableException("The support request portal is currently unavailable.");
    }

    return {
      organization: {
        name: settings?.companyName ?? organization.name,
        supportEmail: settings?.supportEmail ?? "support@aviditytechnologies.com"
      },
      portal: {
        title: settings?.supportPortalTitle ?? "Submit a Support Request",
        introText: settings?.supportPortalIntroText ?? form.introText,
        successMessage:
          settings?.supportPortalSuccessMessage ??
          "Your support request was submitted successfully. Keep the ticket number for follow-up.",
        turnstileSiteKey: settings?.supportPortalTurnstileEnabled ? settings.supportPortalTurnstileSiteKey : null
      },
      form: this.serializeForm(form, true)
    };
  }

  async getConfig(user: AuthenticatedUser) {
    const form = await this.ensureDefaultForm(user.organizationId);
    const settings = await this.prisma.systemSetting.findUnique({
      where: { organizationId: user.organizationId },
      select: {
        supportPortalEnabled: true,
        supportPortalTitle: true,
        supportPortalIntroText: true,
        supportPortalSuccessMessage: true,
        supportPortalTurnstileEnabled: true,
        supportPortalTurnstileSiteKey: true,
        supportPortalTurnstileSecretReference: true
      }
    });

    return {
      settings: {
        supportPortalEnabled: settings?.supportPortalEnabled ?? true,
        supportPortalTitle: settings?.supportPortalTitle ?? "Submit a Support Request",
        supportPortalIntroText: settings?.supportPortalIntroText ?? null,
        supportPortalSuccessMessage: settings?.supportPortalSuccessMessage ?? null,
        supportPortalTurnstileEnabled: settings?.supportPortalTurnstileEnabled ?? false,
        supportPortalTurnstileSiteKey: settings?.supportPortalTurnstileSiteKey ?? null,
        supportPortalTurnstileSecretReference: settings?.supportPortalTurnstileSecretReference ?? DEFAULT_SUPPORT_TURNSTILE_SECRET_REFERENCE
      },
      form: this.serializeForm(form)
    };
  }

  async updateConfig(user: AuthenticatedUser, input: UpdateSupportPortalSettingsDto) {
    const secretReference = this.secretReference(input.supportPortalTurnstileSecretReference);
    if (input.supportPortalTurnstileEnabled && !secretReference.startsWith("env:")) {
      throw new BadRequestException("Support portal Turnstile secret reference must use an environment reference such as env:SUPPORT_PORTAL_TURNSTILE_SECRET_KEY.");
    }

    const settings = await this.prisma.systemSetting.upsert({
      where: { organizationId: user.organizationId },
      create: {
        organizationId: user.organizationId,
        applicationName: this.config.get<string>("APP_NAME") ?? "Avidity IT Management Tool",
        companyName: this.config.get<string>("DEFAULT_COMPANY_NAME") ?? "Avidity Technologies",
        supportEmail: this.config.get<string>("DEFAULT_SUPPORT_EMAIL") ?? "support@aviditytechnologies.com",
        supportPortalEnabled: input.supportPortalEnabled,
        supportPortalTitle: input.supportPortalTitle.trim() || "Submit a Support Request",
        supportPortalIntroText: this.optionalTrim(input.supportPortalIntroText),
        supportPortalSuccessMessage: this.optionalTrim(input.supportPortalSuccessMessage),
        supportPortalTurnstileEnabled: input.supportPortalTurnstileEnabled,
        supportPortalTurnstileSiteKey: this.optionalTrim(input.supportPortalTurnstileSiteKey),
        supportPortalTurnstileSecretReference: secretReference
      },
      update: {
        supportPortalEnabled: input.supportPortalEnabled,
        supportPortalTitle: input.supportPortalTitle.trim() || "Submit a Support Request",
        supportPortalIntroText: this.optionalTrim(input.supportPortalIntroText),
        supportPortalSuccessMessage: this.optionalTrim(input.supportPortalSuccessMessage),
        supportPortalTurnstileEnabled: input.supportPortalTurnstileEnabled,
        supportPortalTurnstileSiteKey: this.optionalTrim(input.supportPortalTurnstileSiteKey),
        supportPortalTurnstileSecretReference: secretReference
      },
      select: {
        supportPortalEnabled: true,
        supportPortalTitle: true,
        supportPortalIntroText: true,
        supportPortalSuccessMessage: true,
        supportPortalTurnstileEnabled: true,
        supportPortalTurnstileSiteKey: true,
        supportPortalTurnstileSecretReference: true
      }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "SupportPortalConfig",
      entityId: user.organizationId,
      action: "support_portal.config_updated",
      metadata: { supportPortalEnabled: settings.supportPortalEnabled }
    });

    return settings;
  }

  async createField(user: AuthenticatedUser, input: UpsertSupportPortalFormFieldDto) {
    const form = await this.ensureDefaultForm(user.organizationId);
    const data = this.fieldData(input);
    if (CORE_FIELD_KEYS.has(data.fieldKey)) {
      throw new BadRequestException("Core support portal fields already exist and cannot be recreated.");
    }
    const sectionId = await this.resolveSectionId(form.id, input.sectionId);

    const field = await this.prisma.supportPortalFormField.create({
      data: {
        ...data,
        sectionId,
        formId: form.id
      }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "SupportPortalFormField",
      entityId: field.id,
      action: "support_portal.field_created",
      metadata: { label: field.label, fieldKey: field.fieldKey }
    });
    return field;
  }

  async updateField(user: AuthenticatedUser, fieldId: string, input: UpsertSupportPortalFormFieldDto) {
    const existing = await this.prisma.supportPortalFormField.findFirst({
      where: {
        id: fieldId,
        form: { organizationId: user.organizationId }
      }
    });
    if (!existing) {
      throw new NotFoundException("Support portal field was not found.");
    }

    const data = this.fieldData(input);
    const sectionId = await this.resolveSectionId(existing.formId, input.sectionId ?? existing.sectionId);
    const nextData = existing.isCore
      ? {
          label: data.label,
          placeholder: data.placeholder,
          helpText: data.helpText,
          sortOrder: data.sortOrder,
          options: data.options,
          layoutWidth: this.normalizeLayoutWidth(input.layoutWidth ?? existing.layoutWidth, existing.type),
          sectionId,
          isRequired: true,
          isActive: true,
          visibilityCondition: Prisma.JsonNull
        }
      : { ...data, sectionId };

    const field = await this.prisma.supportPortalFormField.update({
      where: { id: fieldId },
      data: nextData
    });
    await this.auditLogs.create({
      userId: user.id,
      entityType: "SupportPortalFormField",
      entityId: field.id,
      action: "support_portal.field_updated",
      metadata: { label: field.label, fieldKey: field.fieldKey }
    });
    return field;
  }

  async deleteField(user: AuthenticatedUser, fieldId: string) {
    const existing = await this.prisma.supportPortalFormField.findFirst({
      where: {
        id: fieldId,
        form: { organizationId: user.organizationId }
      }
    });
    if (!existing) {
      throw new NotFoundException("Support portal field was not found.");
    }
    if (existing.isCore) {
      throw new BadRequestException("Core support portal fields cannot be deleted.");
    }

    await this.prisma.supportPortalFormField.delete({ where: { id: fieldId } });
    await this.auditLogs.create({
      userId: user.id,
      entityType: "SupportPortalFormField",
      entityId: fieldId,
      action: "support_portal.field_deleted",
      metadata: { label: existing.label, fieldKey: existing.fieldKey }
    });
    return { deleted: true };
  }

  async createSection(user: AuthenticatedUser, input: UpsertSupportPortalFormSectionDto) {
    const form = await this.ensureDefaultForm(user.organizationId);
    const title = input.title.trim();
    if (!title) {
      throw new BadRequestException("Section title is required.");
    }
    const sectionKey = await this.uniqueSectionKey(form.id, title);
    const section = await this.prisma.supportPortalFormSection.create({
      data: {
        formId: form.id,
        title,
        sectionKey,
        icon: this.optionalTrim(input.icon),
        sortOrder: input.sortOrder ?? Math.max(10, Math.max(0, ...form.sections.map((section) => section.sortOrder)) + 10),
        isActive: input.isActive ?? true,
        isCore: false
      }
    });
    await this.auditLogs.create({
      userId: user.id,
      entityType: "SupportPortalFormSection",
      entityId: section.id,
      action: "support_portal.section_created",
      metadata: { title: section.title, sectionKey: section.sectionKey }
    });
    return section;
  }

  async updateSection(user: AuthenticatedUser, sectionId: string, input: UpsertSupportPortalFormSectionDto) {
    const existing = await this.prisma.supportPortalFormSection.findFirst({
      where: { id: sectionId, form: { organizationId: user.organizationId } }
    });
    if (!existing) {
      throw new NotFoundException("Support portal section was not found.");
    }
    const title = input.title.trim();
    if (!title) {
      throw new BadRequestException("Section title is required.");
    }
    const section = await this.prisma.supportPortalFormSection.update({
      where: { id: sectionId },
      data: {
        title,
        icon: this.optionalTrim(input.icon),
        sortOrder: input.sortOrder ?? existing.sortOrder,
        isActive: input.isActive ?? existing.isActive
      }
    });
    await this.auditLogs.create({
      userId: user.id,
      entityType: "SupportPortalFormSection",
      entityId: section.id,
      action: "support_portal.section_updated",
      metadata: { title: section.title, sectionKey: section.sectionKey }
    });
    return section;
  }

  async deleteSection(user: AuthenticatedUser, sectionId: string) {
    const existing = await this.prisma.supportPortalFormSection.findFirst({
      where: { id: sectionId, form: { organizationId: user.organizationId } },
      include: { _count: { select: { fields: true } } }
    });
    if (!existing) {
      throw new NotFoundException("Support portal section was not found.");
    }
    if (existing.isCore) {
      throw new BadRequestException("Core support portal sections cannot be deleted.");
    }
    if (existing._count.fields > 0) {
      throw new BadRequestException("Move or delete the section fields before deleting this section.");
    }
    await this.prisma.supportPortalFormSection.delete({ where: { id: sectionId } });
    await this.auditLogs.create({
      userId: user.id,
      entityType: "SupportPortalFormSection",
      entityId: sectionId,
      action: "support_portal.section_deleted",
      metadata: { title: existing.title, sectionKey: existing.sectionKey }
    });
    return { deleted: true };
  }

  async reorderSections(user: AuthenticatedUser, input: ReorderSupportPortalSectionsDto) {
    const form = await this.ensureDefaultForm(user.organizationId);
    const ids = new Set(form.sections.map((section) => section.id));
    if (input.sections.some((section) => !ids.has(section.id))) {
      throw new BadRequestException("Section reorder payload contains an invalid section.");
    }
    await this.prisma.$transaction(
      input.sections.map((section) =>
        this.prisma.supportPortalFormSection.update({
          where: { id: section.id },
          data: { sortOrder: section.sortOrder }
        })
      )
    );
    return this.getConfig(user);
  }

  async reorderFields(user: AuthenticatedUser, input: ReorderSupportPortalFieldsDto) {
    const form = await this.ensureDefaultForm(user.organizationId);
    const fieldIds = new Set(form.fields.map((field) => field.id));
    const sectionIds = new Set(form.sections.map((section) => section.id));
    if (input.fields.some((field) => !fieldIds.has(field.id) || !sectionIds.has(field.sectionId))) {
      throw new BadRequestException("Field reorder payload contains an invalid field or section.");
    }
    await this.prisma.$transaction(
      input.fields.map((field) =>
        this.prisma.supportPortalFormField.update({
          where: { id: field.id },
          data: {
            sectionId: field.sectionId,
            sortOrder: field.sortOrder
          }
        })
      )
    );
    if (input.movedFieldId) {
      await this.auditLogs.create({
        userId: user.id,
        entityType: "SupportPortalFormField",
        entityId: input.movedFieldId,
        action: "support_portal.field_reordered",
        metadata: { fieldId: input.movedFieldId }
      });
    }
    return this.getConfig(user);
  }

  async createPublicTicket(input: CreatePublicSupportTicketDto, context: { ipAddress?: string; userAgent?: string }) {
    const organization = await this.getPublicOrganization();
    const form = await this.ensureDefaultForm(organization.id);
    const settings = await this.prisma.systemSetting.findUnique({
      where: { organizationId: organization.id },
      select: {
        supportPortalEnabled: true,
        supportPortalTurnstileEnabled: true,
        supportPortalTurnstileSiteKey: true,
        supportPortalTurnstileSecretReference: true
      }
    });

    if (settings && !settings.supportPortalEnabled) {
      throw new ServiceUnavailableException("The support request portal is currently unavailable.");
    }
    await this.verifyTurnstile(settings, input.captchaToken, context.ipAddress);

    const publicFields = this.publicFields(form);
    const formData = input.formData ?? {};
    this.validateRequiredFields(publicFields, formData);
    const requesterName = this.valueFrom(input.requesterName, formData.requesterName);
    const requesterEmail = this.valueFrom(input.requesterEmail, formData.requesterEmail).toLowerCase();
    const subject = this.valueFrom(input.subject, formData.subject);
    const description = this.valueFrom(input.description, formData.description);
    const priority = this.normalizePriority(formData.priority, input.priority);
    const senderDomain = this.extractDomain(requesterEmail);
    const requester = await this.contactsService.resolveRequesterFromEmail({
      emailAddress: requesterEmail,
      organizationId: organization.id,
      displayName: requesterName,
      createIfMissing: true
    });
    const { bodyText, bodyHtml } = this.buildStructuredBody({
      fields: publicFields,
      formData: { ...formData, requesterName, requesterEmail, subject, description, priority },
      requesterName,
      requesterEmail,
      subject,
      description,
      context
    });
    const sanitizedBodyHtml = this.htmlSanitizer.sanitize(bodyHtml);

    const result = await this.prisma.$transaction(async (tx) => {
      const ticketNumber = await this.nextTicketNumber(tx);
      const ticket = await tx.ticket.create({
        data: {
          ticketNumber,
          organizationId: organization.id,
          clientId: requester?.client.id ?? null,
          contactId: requester?.contact?.id ?? null,
          senderEmail: requesterEmail,
          senderDomain,
          subject,
          description: bodyText,
          priority,
          source: TicketSource.PORTAL,
          status: "NEW",
          lastCustomerResponseAt: new Date()
        }
      });

      const message = await tx.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          authorContactId: requester?.contact?.id ?? null,
          direction: MessageDirection.INBOUND,
          visibility: MessageVisibility.PUBLIC,
          bodyText,
          bodyHtml,
          sanitizedBodyHtml,
          senderEmail: requesterEmail,
          senderDomain,
          hasAttachments: false
        }
      });

      return { ticket, message };
    });

    const matchedRule = await this.ticketRouting.applyInboundRules({
      ticketId: result.ticket.id,
      organizationId: organization.id,
      mailboxId: null,
      clientId: requester?.client.id ?? null,
      senderEmail: requesterEmail,
      senderDomain,
      subject,
      bodyText
    });
    await this.recordUnknownSenderDomain(organization.id, senderDomain, requesterEmail, Boolean(requester));
    await this.auditLogs.create({
      userId: null,
      entityType: "Ticket",
      entityId: result.ticket.id,
      action: "ticket.created_from_support_portal",
      metadata: {
        ticketNumber: result.ticket.ticketNumber,
        senderEmail: requesterEmail,
        clientId: result.ticket.clientId,
        contactId: result.ticket.contactId,
        routingRuleId: matchedRule?.id ?? null
      }
    });
    await this.notifications.notifyNewTicketCreated({
      ticketId: result.ticket.id,
      organizationId: organization.id
    });
    await this.autoReplies.sendForNewInboundTicket({
      organizationId: organization.id,
      ticketId: result.ticket.id,
      messageId: result.message.id,
      senderEmail: requesterEmail,
      mailboxId: null,
      threadKey: result.ticket.ticketNumber
    });

    return {
      ticketNumber: result.ticket.ticketNumber,
      subject: result.ticket.subject
    };
  }

  private serializeForm(form: SupportPortalFormWithRelations, publicOnly = false) {
    const sections = this.formSections(form, publicOnly);
    const fields = publicOnly ? sections.flatMap((section) => section.fields) : form.fields;
    return {
      id: form.id,
      name: form.name,
      slug: form.slug,
      introText: form.introText,
      sections: sections.map((section) => ({
        id: section.id,
        title: section.title,
        sectionKey: section.sectionKey,
        icon: section.icon,
        sortOrder: section.sortOrder,
        isCore: section.isCore,
        isActive: section.isActive,
        fields: section.fields.map((field) => this.serializeField(field))
      })),
      fields: fields.map((field) => this.serializeField(field))
    };
  }

  private serializeField(field: SupportPortalField) {
    return {
        id: field.id,
        sectionId: field.sectionId,
        type: field.type,
        label: field.label,
        fieldKey: field.fieldKey,
        placeholder: field.placeholder,
        helpText: field.helpText,
        options: field.options,
        isRequired: field.isRequired,
        isActive: field.isActive,
        sortOrder: field.sortOrder,
        isCore: field.isCore,
        layoutWidth: field.layoutWidth,
        visibilityCondition: field.visibilityCondition
    };
  }

  private publicFields(form: SupportPortalFormWithRelations) {
    return this.formSections(form, true).flatMap((section) => section.fields);
  }

  private formSections(form: SupportPortalFormWithRelations, publicOnly: boolean): SupportPortalSection[] {
    const sections = publicOnly ? form.sections.filter((section) => section.isActive) : form.sections;
    const sectionIds = new Set(sections.map((section) => section.id));
    const unsectionedFields = form.fields.filter((field) => !field.sectionId || !sectionIds.has(field.sectionId));
    const fallbackSection = sections.find((section) => section.sectionKey === "diagnostics") ?? sections[sections.length - 1];
    const mappedSections = sections.map((section) => ({
      ...section,
      fields: section.fields.filter((field) => !publicOnly || field.isActive)
    }));
    if (fallbackSection && unsectionedFields.length > 0) {
      return mappedSections.map((section) =>
        section.id === fallbackSection.id
          ? { ...section, fields: [...section.fields, ...unsectionedFields.filter((field) => !publicOnly || field.isActive)] }
          : section
      );
    }
    return mappedSections;
  }

  private async getPublicOrganization() {
    const organization = await this.prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
    if (!organization) {
      throw new ServiceUnavailableException("No organization is configured.");
    }
    return organization;
  }

  private async ensureDefaultForm(organizationId: string): Promise<SupportPortalFormWithRelations> {
    let form = await this.prisma.supportPortalForm.findFirst({
      where: { organizationId, slug: "default" },
      include: supportPortalFormInclude
    });

    if (!form) {
      form = await this.prisma.supportPortalForm.create({
        data: {
          organizationId,
          name: "Default Support Request",
          slug: "default",
          introText: "Tell us what is happening so our team can route and resolve your request."
        },
        include: supportPortalFormInclude
      });
    }

    await this.ensureDefaultSections(form.id);
    form = await this.prisma.supportPortalForm.findFirstOrThrow({
      where: { id: form.id },
      include: supportPortalFormInclude
    });

    const formId = form.id;
    const sectionByKey = new Map(form.sections.map((section) => [section.sectionKey, section.id]));
    const missingCoreFields = this.defaultFields().filter((field) => CORE_FIELD_KEYS.has(field.fieldKey) && !form.fields.some((existing) => existing.fieldKey === field.fieldKey));
    if (missingCoreFields.length > 0) {
      await this.prisma.supportPortalFormField.createMany({
        data: missingCoreFields.map((field) => ({
          ...field,
          formId,
          sectionId: sectionByKey.get(this.sectionKeyForFieldKey(field.fieldKey)) ?? sectionByKey.get("diagnostics")
        })),
        skipDuplicates: true
      });
    }
    await this.assignMissingFieldSections(formId);

    return this.prisma.supportPortalForm.findFirstOrThrow({
      where: { id: formId },
      include: supportPortalFormInclude
    });
  }

  private async ensureDefaultSections(formId: string) {
    const existingSections = await this.prisma.supportPortalFormSection.findMany({ where: { formId } });
    const existingKeys = new Set(existingSections.map((section) => section.sectionKey));
    const missingSections = this.defaultSections().filter((section) => !existingKeys.has(section.sectionKey));
    if (missingSections.length === 0) {
      return;
    }
    await this.prisma.supportPortalFormSection.createMany({
      data: missingSections.map((section) => ({ ...section, formId })),
      skipDuplicates: true
    });
  }

  private async assignMissingFieldSections(formId: string) {
    const sections = await this.prisma.supportPortalFormSection.findMany({ where: { formId } });
    const sectionByKey = new Map(sections.map((section) => [section.sectionKey, section.id]));
    for (const [sectionKey, fieldKeys] of [
      ["requester", REQUESTER_FIELD_KEYS],
      ["request", REQUEST_FIELD_KEYS],
      ["asset", ASSET_FIELD_KEYS]
    ] as const) {
      const sectionId = sectionByKey.get(sectionKey);
      if (!sectionId) continue;
      await this.prisma.supportPortalFormField.updateMany({
        where: { formId, sectionId: null, fieldKey: { in: Array.from(fieldKeys) } },
        data: { sectionId }
      });
    }
    const diagnosticsSectionId = sectionByKey.get("diagnostics");
    if (diagnosticsSectionId) {
      await this.prisma.supportPortalFormField.updateMany({
        where: { formId, sectionId: null },
        data: { sectionId: diagnosticsSectionId }
      });
    }
  }

  private defaultSections(): Prisma.SupportPortalFormSectionCreateManyInput[] {
    return [
      { formId: "", title: "Requester Information", sectionKey: "requester", icon: "user", sortOrder: 10, isCore: true, isActive: true },
      { formId: "", title: "Request Information", sectionKey: "request", icon: "clipboard", sortOrder: 20, isCore: true, isActive: true },
      { formId: "", title: "Affected Asset or System", sectionKey: "asset", icon: "building", sortOrder: 30, isCore: true, isActive: true },
      { formId: "", title: "Diagnostic Details", sectionKey: "diagnostics", icon: "mail", sortOrder: 40, isCore: true, isActive: true }
    ];
  }

  private sectionKeyForFieldKey(fieldKey: string) {
    if (REQUESTER_FIELD_KEYS.has(fieldKey)) return "requester";
    if (REQUEST_FIELD_KEYS.has(fieldKey)) return "request";
    if (ASSET_FIELD_KEYS.has(fieldKey)) return "asset";
    return "diagnostics";
  }

  private async resolveSectionId(formId: string, sectionId?: string | null) {
    if (sectionId) {
      const section = await this.prisma.supportPortalFormSection.findFirst({ where: { id: sectionId, formId } });
      if (!section) {
        throw new BadRequestException("Support portal section was not found.");
      }
      return section.id;
    }
    const fallback = await this.prisma.supportPortalFormSection.findFirst({
      where: { formId, sectionKey: "diagnostics" },
      orderBy: { sortOrder: "asc" }
    });
    return fallback?.id ?? null;
  }

  private async uniqueSectionKey(formId: string, title: string) {
    const baseKey = this.normalizeSectionKey(title);
    let candidate = baseKey;
    let suffix = 2;
    while (await this.prisma.supportPortalFormSection.findUnique({ where: { formId_sectionKey: { formId, sectionKey: candidate } } })) {
      candidate = `${baseKey}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  private normalizeSectionKey(value: string) {
    const key = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return key || "section";
  }

  private defaultFields(): Prisma.SupportPortalFormFieldCreateWithoutFormInput[] {
    return [
      this.defaultField("requesterName", "Full name", EventServiceFieldType.TEXT, 10, true, true, "Jane Smith"),
      this.defaultField("requesterEmail", "Email address", EventServiceFieldType.EMAIL, 20, true, true, "name@organization.com"),
      this.defaultField("requesterPhone", "Contact phone", EventServiceFieldType.PHONE, 30, false, false, "(555) 555-5555"),
      this.defaultField("department", "Department / area", EventServiceFieldType.TEXT, 40, false, false, "Accounting, Front Desk, Operations"),
      this.defaultField("location", "Location", EventServiceFieldType.TEXT, 50, false, false, "Office, branch, city, or room"),
      this.defaultField("supervisor", "Supervisor", EventServiceFieldType.TEXT, 60, false, false, "Optional"),
      this.defaultField("requestType", "Request type", EventServiceFieldType.RADIO, 70, true, false, null, null, ["Incident", "Service Request"]),
      this.defaultField("subject", "Subject / problem title", EventServiceFieldType.TEXT, 80, true, true, "Brief summary"),
      this.defaultField("description", "Detailed description", EventServiceFieldType.TEXTAREA, 90, true, true, "Describe the issue, request, or service needed."),
      this.defaultField("occurredAt", "Date and time the issue occurred", EventServiceFieldType.TEXT, 100, false, false, "Example: Today at 9:30 AM"),
      this.defaultField("issueFrequency", "Is this new or recurring?", EventServiceFieldType.RADIO, 110, false, false, null, null, ["New", "Recurring"]),
      this.defaultField(
        "category",
        "Ticket category",
        EventServiceFieldType.SELECT,
        120,
        false,
        false,
        null,
        null,
        ["Hardware", "Software", "Email", "Network / Internet", "Printers", "Access and Passwords", "Telephony", "Business Applications", "Security", "Service Request", "Other"]
      ),
      this.defaultField("hardwareSubcategory", "Hardware subcategory", EventServiceFieldType.SELECT, 130, false, false, null, this.condition("category", "equals", "Hardware"), [
        "Laptop",
        "Desktop",
        "Monitor",
        "Printer",
        "Scanner",
        "Other"
      ]),
      this.defaultField("softwareSubcategory", "Software subcategory", EventServiceFieldType.SELECT, 140, false, false, null, this.condition("category", "equals", "Software"), [
        "Microsoft Office",
        "Adobe",
        "ERP",
        "CRM",
        "Other"
      ]),
      this.defaultField("priority", "Priority", EventServiceFieldType.SELECT, 150, false, false, null, null, ["LOW", "NORMAL", "HIGH", "CRITICAL"]),
      this.defaultField("affectedPeople", "How many people are affected?", EventServiceFieldType.SELECT, 160, false, false, null, null, [
        "Only me",
        "My department",
        "The whole organization"
      ]),
      this.defaultField("impact", "Impact", EventServiceFieldType.SELECT, 170, false, false, null, null, ["Individual", "Team", "Department", "Full organization"]),
      this.defaultField("deviceName", "Computer or device name", EventServiceFieldType.TEXT, 180, false, false),
      this.defaultField("assetTag", "Asset tag", EventServiceFieldType.TEXT, 190, false, false),
      this.defaultField("serialNumber", "Serial number", EventServiceFieldType.TEXT, 200, false, false),
      this.defaultField("ipAddress", "IP address", EventServiceFieldType.TEXT, 210, false, false),
      this.defaultField("systemName", "Application or system name", EventServiceFieldType.TEXT, 220, false, false),
      this.defaultField("systemUrl", "System URL", EventServiceFieldType.TEXT, 230, false, false),
      this.defaultField("systemVersion", "Version", EventServiceFieldType.TEXT, 240, false, false),
      this.defaultField("activityBeforeIssue", "What were you doing when it happened?", EventServiceFieldType.TEXTAREA, 250, false, false),
      this.defaultField("errorMessage", "Does an error message appear?", EventServiceFieldType.RADIO, 260, false, false, null, null, ["Yes", "No"]),
      this.defaultField("exactErrorMessage", "Exact error message", EventServiceFieldType.TEXTAREA, 270, false, false, null, this.condition("errorMessage", "equals", "Yes")),
      this.defaultField("rebootAttempted", "Have you tried restarting?", EventServiceFieldType.RADIO, 280, false, false, null, null, ["Yes", "No", "Not applicable"]),
      this.defaultField("happenedBefore", "Has this happened before?", EventServiceFieldType.RADIO, 290, false, false, null, null, ["Yes", "No", "Not sure"])
    ];
  }

  private defaultField(
    fieldKey: string,
    label: string,
    type: EventServiceFieldType,
    sortOrder: number,
    isRequired: boolean,
    isCore: boolean,
    placeholder?: string | null,
    visibilityCondition?: Prisma.InputJsonValue | null,
    options: string[] = []
  ): Prisma.SupportPortalFormFieldCreateWithoutFormInput {
    return {
      fieldKey,
      label,
      type,
      sortOrder,
      isRequired,
      isCore,
      layoutWidth: this.defaultLayoutWidth(type),
      placeholder: placeholder ?? null,
      visibilityCondition: visibilityCondition ?? undefined,
      options
    };
  }

  private fieldData(input: UpsertSupportPortalFormFieldDto) {
    const fieldKey = this.normalizeFieldKey(input.fieldKey);
    if (!fieldKey) {
      throw new BadRequestException("Field key is required.");
    }
    return {
      type: input.type,
      label: input.label.trim(),
      fieldKey,
      placeholder: this.optionalTrim(input.placeholder),
      helpText: this.optionalTrim(input.helpText),
      options: this.normalizeOptions(input.options ?? []),
      isRequired: input.isRequired ?? false,
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 100,
      layoutWidth: this.normalizeLayoutWidth(input.layoutWidth, input.type),
      visibilityCondition: this.normalizeCondition(input.visibilityCondition)
    };
  }

  private validateRequiredFields(fields: SupportPortalField[], formData: PublicFormData) {
    for (const field of fields) {
      if (!field.isActive || !field.isRequired || !this.isFieldVisible(field, formData)) {
        continue;
      }
      const value = this.valueAsText(formData[field.fieldKey]);
      if (!value) {
        throw new BadRequestException(`${field.label} is required.`);
      }
    }
  }

  private buildStructuredBody(input: {
    fields: SupportPortalField[];
    formData: PublicFormData;
    requesterName: string;
    requesterEmail: string;
    subject: string;
    description: string;
    context: { ipAddress?: string; userAgent?: string };
  }) {
    const visibleFields = input.fields.filter((field) => field.isActive && this.isFieldVisible(field, input.formData));
    const lines = [
      "Support Portal Submission",
      "",
      "Requester Information",
      `Full name: ${input.requesterName}`,
      `Email address: ${input.requesterEmail}`,
      "",
      "Request Details",
      `Subject: ${input.subject}`,
      `Description: ${input.description}`,
      ""
    ];
    const htmlRows: string[] = [];
    for (const field of visibleFields) {
      const value = this.valueAsText(input.formData[field.fieldKey]);
      if (!value || ["requesterName", "requesterEmail", "subject", "description"].includes(field.fieldKey)) {
        continue;
      }
      lines.push(`${field.label}: ${value}`);
      htmlRows.push(`<tr><th>${this.escapeHtml(field.label)}</th><td>${this.escapeHtml(value)}</td></tr>`);
    }
    lines.push("", "Submission Metadata", `IP address: ${input.context.ipAddress ?? "Unavailable"}`, `User agent: ${input.context.userAgent ?? "Unavailable"}`);

    const bodyHtml = `
      <section>
        <h2>Support Portal Submission</h2>
        <h3>Requester Information</h3>
        <table>
          <tr><th>Full name</th><td>${this.escapeHtml(input.requesterName)}</td></tr>
          <tr><th>Email address</th><td>${this.escapeHtml(input.requesterEmail)}</td></tr>
        </table>
        <h3>Request Details</h3>
        <p><strong>${this.escapeHtml(input.subject)}</strong></p>
        <p>${this.escapeHtml(input.description).replace(/\n/g, "<br />")}</p>
        ${htmlRows.length > 0 ? `<h3>Additional Details</h3><table>${htmlRows.join("")}</table>` : ""}
      </section>
    `;

    return { bodyText: lines.join("\n").trim(), bodyHtml };
  }

  private isFieldVisible(field: SupportPortalField, data: PublicFormData) {
    const conditions = this.readConditions(field.visibilityCondition);
    if (conditions.rules.length === 0) {
      return true;
    }
    const checks = conditions.rules.map((condition) => this.matchesCondition(condition, data));
    return conditions.logic === "ALL" ? checks.every(Boolean) : checks.some(Boolean);
  }

  private matchesCondition(condition: SupportPortalVisibilityRule, data: PublicFormData) {
    const currentValue = this.valueAsText(data[condition.fieldKey]);
    const expectedValue = this.valueAsText(condition.value);
    switch (condition.operator) {
      case "equals":
        return currentValue === expectedValue;
      case "not_equals":
        return currentValue !== expectedValue;
      case "contains":
        return currentValue.toLowerCase().includes(expectedValue.toLowerCase());
      case "is_one_of":
        return this.valueList(condition.value).some((value) => value.toLowerCase() === currentValue.toLowerCase());
      case "is_empty":
        return !currentValue;
      case "is_not_empty":
        return Boolean(currentValue);
      default:
        return true;
    }
  }

  private normalizePriority(value: unknown, fallback?: TicketPriority) {
    const normalized = this.valueAsText(value).toUpperCase().replace(/\s+/g, "_");
    if (normalized === "LOW") return TicketPriority.LOW;
    if (normalized === "HIGH") return TicketPriority.HIGH;
    if (normalized === "URGENT") return TicketPriority.URGENT;
    if (normalized === "CRITICAL") return TicketPriority.CRITICAL;
    if (normalized === "NORMAL" || normalized === "MEDIUM") return TicketPriority.NORMAL;
    return fallback ?? TicketPriority.NORMAL;
  }

  private async verifyTurnstile(
    settings: { supportPortalTurnstileEnabled: boolean; supportPortalTurnstileSiteKey: string | null; supportPortalTurnstileSecretReference: string | null } | null,
    token?: string | null,
    ipAddress?: string
  ) {
    if (!settings?.supportPortalTurnstileEnabled || !settings.supportPortalTurnstileSiteKey) {
      return;
    }
    if (!token) {
      throw new BadRequestException("Complete the verification challenge before submitting.");
    }
    const secret = this.resolveSecret(settings.supportPortalTurnstileSecretReference ?? DEFAULT_SUPPORT_TURNSTILE_SECRET_REFERENCE);
    if (!secret) {
      throw new BadRequestException("Support portal Turnstile secret is not configured.");
    }

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, ...(ipAddress ? { remoteip: ipAddress } : {}) })
    });
    const payload = (await response.json()) as { success?: boolean };
    if (!payload.success) {
      throw new BadRequestException("Verification failed. Try again.");
    }
  }

  private async recordUnknownSenderDomain(organizationId: string, senderDomain: string | null, senderEmail: string, hasRequester: boolean) {
    if (hasRequester || !senderDomain) {
      return;
    }
    await this.prisma.unmappedEmailDomain.upsert({
      where: {
        organizationId_domain: {
          organizationId,
          domain: senderDomain
        }
      },
      update: {
        lastSenderEmail: senderEmail,
        messageCount: { increment: 1 },
        lastSeenAt: new Date()
      },
      create: {
        organizationId,
        domain: senderDomain,
        firstSenderEmail: senderEmail,
        lastSenderEmail: senderEmail,
        messageCount: 1
      }
    });
  }

  private async nextTicketNumber(tx: Prisma.TransactionClient) {
    const sequence = await tx.ticketSequence.upsert({
      where: { key: "ticket" },
      update: { currentValue: { increment: 1 } },
      create: { key: "ticket", prefix: "AIT", currentValue: 100001 }
    });

    return `${sequence.prefix}-${sequence.currentValue}`;
  }

  private normalizeCondition(value?: Record<string, unknown> | null): Prisma.InputJsonValue | undefined {
    if (!value) {
      return undefined;
    }

    const rawRules = Array.isArray(value.rules) ? value.rules : [value];
    const rules = rawRules
      .map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return null;
        }
        const condition = entry as Record<string, unknown>;
        const fieldKey = typeof condition.fieldKey === "string" ? this.normalizeFieldKey(condition.fieldKey) : "";
        const operator = typeof condition.operator === "string" ? condition.operator : "";
        if (!fieldKey || !this.isSupportedConditionOperator(operator)) {
          return null;
        }
        return {
          fieldKey,
          operator,
          value: ["is_empty", "is_not_empty"].includes(operator) ? "" : this.valueAsText(condition.value)
        };
      })
      .filter((entry): entry is SupportPortalVisibilityRule => Boolean(entry));

    if (rules.length === 0) {
      return undefined;
    }
    if (rules.length === 1 && !Array.isArray(value.rules)) {
      return rules[0] as Prisma.InputJsonValue;
    }
    return {
      logic: value.logic === "ALL" ? "ALL" : "ANY",
      rules: rules as unknown as Prisma.InputJsonValue
    };
  }

  private readConditions(value: Prisma.JsonValue | null): { logic: "ANY" | "ALL"; rules: SupportPortalVisibilityRule[] } {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { logic: "ANY", rules: [] };
    }
    const condition = value as { fieldKey?: unknown; operator?: unknown; value?: unknown; logic?: unknown; rules?: unknown };
    const rawRules = Array.isArray(condition.rules) ? condition.rules : [condition];
    const rules = rawRules
      .map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return null;
        }
        const rule = entry as { fieldKey?: unknown; operator?: unknown; value?: unknown };
        if (typeof rule.fieldKey !== "string" || typeof rule.operator !== "string" || !this.isSupportedConditionOperator(rule.operator)) {
          return null;
        }
        return {
          fieldKey: rule.fieldKey,
          operator: rule.operator,
          value: this.valueAsText(rule.value)
        };
      })
      .filter((entry): entry is SupportPortalVisibilityRule => Boolean(entry));
    return {
      logic: condition.logic === "ALL" ? "ALL" : "ANY",
      rules
    };
  }

  private isSupportedConditionOperator(operator: string) {
    return ["equals", "not_equals", "contains", "is_one_of", "is_empty", "is_not_empty"].includes(operator);
  }

  private normalizeLayoutWidth(value: unknown, type: EventServiceFieldType) {
    if (typeof value === "string" && ["FULL", "HALF", "THIRD", "QUARTER"].includes(value)) {
      return value;
    }
    return this.defaultLayoutWidth(type);
  }

  private defaultLayoutWidth(type: EventServiceFieldType) {
    switch (type) {
      case EventServiceFieldType.TEXTAREA:
      case EventServiceFieldType.MULTI_SELECT:
      case EventServiceFieldType.CHECKBOX:
      case EventServiceFieldType.RADIO:
        return "FULL";
      default:
        return "HALF";
    }
  }

  private condition(fieldKey: string, operator: string, value?: string): Prisma.InputJsonValue {
    return { fieldKey, operator, value: value ?? "" };
  }

  private valueFrom(fallback: string, value: unknown) {
    return this.valueAsText(value) || fallback.trim();
  }

  private valueAsText(value: unknown) {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry).trim()).filter(Boolean).join(", ");
    }
    return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  }

  private valueList(value: unknown) {
    if (Array.isArray(value)) {
      return value.map((entry) => this.valueAsText(entry)).filter(Boolean);
    }
    return this.valueAsText(value).split(",").map((entry) => entry.trim()).filter(Boolean);
  }

  private normalizeOptions(options: string[]) {
    return [...new Set(options.map((option) => option.trim()).filter(Boolean))];
  }

  private normalizeFieldKey(fieldKey: string) {
    return fieldKey.trim().replace(/[^a-zA-Z0-9_]/g, "").replace(/^[0-9]+/, "");
  }

  private optionalTrim(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed || null;
  }

  private secretReference(reference?: string | null) {
    return this.optionalTrim(reference) ?? DEFAULT_SUPPORT_TURNSTILE_SECRET_REFERENCE;
  }

  private resolveSecret(reference: string) {
    if (reference.startsWith("env:")) {
      return process.env[reference.slice(4)] ?? "";
    }
    return reference;
  }

  private extractDomain(emailAddress: string): string | null {
    const atIndex = emailAddress.lastIndexOf("@");
    if (atIndex === -1 || atIndex === emailAddress.length - 1) {
      return null;
    }
    return emailAddress.slice(atIndex + 1).trim().toLowerCase().replace(/\.$/, "") || null;
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
