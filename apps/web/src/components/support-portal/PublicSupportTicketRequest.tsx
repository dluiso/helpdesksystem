"use client";

import { Building2, CheckCircle2, ClipboardList, Mail, Send, UserRound } from "lucide-react";
import Script from "next/script";
import type { ReactNode } from "react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useBranding } from "@/components/providers/BrandingProvider";
import { apiFetch } from "@/lib/api";

declare global {
  interface Window {
    turnstile?: {
      reset: () => void;
    };
  }
}

interface SupportField {
  id: string;
  sectionId: string | null;
  type: "TEXT" | "TEXTAREA" | "EMAIL" | "PHONE" | "DATE" | "TIME" | "SELECT" | "MULTI_SELECT" | "CHECKBOX" | "RADIO" | "NUMBER";
  label: string;
  fieldKey: string;
  placeholder: string | null;
  helpText: string | null;
  options: string[];
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
  isCore: boolean;
  layoutWidth: "FULL" | "HALF" | "THIRD" | "QUARTER";
  visibilityCondition: { fieldKey?: string; operator?: string; value?: string } | { logic?: "ANY" | "ALL"; rules?: Array<{ fieldKey?: string; operator?: string; value?: string }> } | null;
}

interface SupportSection {
  id: string;
  title: string;
  sectionKey: string;
  icon: string | null;
  sortOrder: number;
  isCore: boolean;
  isActive: boolean;
  fields: SupportField[];
}

type VisibilityRule = { fieldKey?: string; operator?: string; value?: string };

interface SupportPortalConfig {
  organization: { name: string; supportEmail: string };
  portal: {
    browserTitle: string;
    title: string;
    introText: string | null;
    successMessage: string;
    turnstileSiteKey: string | null;
  };
  form: {
    name: string;
    introText: string | null;
    sections?: SupportSection[];
    fields: SupportField[];
  };
}

type FormDataState = Record<string, string | string[]>;
type LayoutWidth = SupportField["layoutWidth"];

const requesterKeys = new Set(["requesterName", "requesterEmail", "requesterPhone", "department", "location", "supervisor"]);
const requestKeys = new Set(["requestType", "subject", "description", "occurredAt", "issueFrequency", "category", "hardwareSubcategory", "softwareSubcategory", "priority", "affectedPeople", "impact"]);
const assetKeys = new Set(["deviceName", "assetTag", "serialNumber", "ipAddress", "systemName", "systemUrl", "systemVersion"]);

function fieldValue(data: FormDataState, key: string) {
  const value = data[key];
  return Array.isArray(value) ? value.join(", ") : value ?? "";
}

function fieldArrayValue(data: FormDataState, key: string) {
  const value = data[key];
  return Array.isArray(value) ? value : value ? [value] : [];
}

function visibilityRules(condition: SupportField["visibilityCondition"]) {
  if (!condition || typeof condition !== "object") {
    return { logic: "ANY" as const, rules: [] as VisibilityRule[] };
  }
  if ("rules" in condition && Array.isArray(condition.rules)) {
    return { logic: condition.logic === "ALL" ? "ALL" as const : "ANY" as const, rules: condition.rules };
  }
  return { logic: "ANY" as const, rules: [condition as VisibilityRule] };
}

function isVisible(field: SupportField, data: FormDataState) {
  const { logic, rules } = visibilityRules(field.visibilityCondition);
  const checks = rules
    .filter((rule) => rule.fieldKey && rule.operator)
    .map((rule) => {
      const current = fieldValue(data, rule.fieldKey ?? "");
      const expected = rule.value ?? "";
      if (rule.operator === "equals") return current === expected;
      if (rule.operator === "not_equals") return current !== expected;
      if (rule.operator === "contains") return current.toLowerCase().includes(expected.toLowerCase());
      if (rule.operator === "is_one_of") return expected.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean).includes(current.toLowerCase());
      if (rule.operator === "is_empty") return !current;
      if (rule.operator === "is_not_empty") return Boolean(current);
      return true;
    });
  if (checks.length === 0) {
    return true;
  }
  return logic === "ALL" ? checks.every(Boolean) : checks.some(Boolean);
}

function priorityLabel(option: string) {
  if (option === "LOW") return "Low - Does not affect daily work";
  if (option === "NORMAL") return "Medium - Affects some functions";
  if (option === "HIGH") return "High - Blocks important tasks";
  if (option === "CRITICAL") return "Critical - Service is down";
  return option;
}

function effectiveLayoutWidth(field: SupportField): LayoutWidth {
  if (field.layoutWidth) {
    return field.layoutWidth;
  }
  if (["TEXTAREA", "MULTI_SELECT", "CHECKBOX", "RADIO"].includes(field.type)) {
    return "FULL";
  }
  return "HALF";
}

export function PublicSupportTicketRequest() {
  const branding = useBranding();
  const [config, setConfig] = useState<SupportPortalConfig | null>(null);
  const [formData, setFormData] = useState<FormDataState>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logoUrl = branding.loginLogoUrl ?? branding.logoUrl;
  const logoBackgroundStyle = {
    background: branding.brandLogoTransparentBackground ? "transparent" : (branding.brandLogoBackgroundColor ?? "#ffffff")
  };

  const activeSections = useMemo<SupportSection[]>(() => {
    const sections = config?.form.sections ?? [];
    if (sections.length > 0) {
      return sections
        .filter((section) => section.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((section) => ({
          ...section,
          fields: section.fields.filter((field) => field.isActive).sort((a, b) => a.sortOrder - b.sortOrder)
        }));
    }
    const fields = (config?.form.fields ?? []).filter((field) => field.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
    return [
      { id: "requester", title: "Requester Information", sectionKey: "requester", icon: "user", sortOrder: 10, isCore: true, isActive: true, fields: fields.filter((field) => requesterKeys.has(field.fieldKey)) },
      { id: "request", title: "Request Information", sectionKey: "request", icon: "clipboard", sortOrder: 20, isCore: true, isActive: true, fields: fields.filter((field) => requestKeys.has(field.fieldKey)) },
      { id: "asset", title: "Affected Asset or System", sectionKey: "asset", icon: "building", sortOrder: 30, isCore: true, isActive: true, fields: fields.filter((field) => assetKeys.has(field.fieldKey)) },
      { id: "diagnostics", title: "Diagnostic Details", sectionKey: "diagnostics", icon: "mail", sortOrder: 40, isCore: true, isActive: true, fields: fields.filter((field) => !requesterKeys.has(field.fieldKey) && !requestKeys.has(field.fieldKey) && !assetKeys.has(field.fieldKey)) }
    ];
  }, [config]);
  const activeFields = useMemo(() => activeSections.flatMap((section) => section.fields), [activeSections]);
  const visibleSections = useMemo(() => activeSections
    .map((section) => ({ ...section, fields: section.fields.filter((field) => isVisible(field, formData)) }))
    .filter((section) => section.fields.length > 0), [activeSections, formData]);

  useEffect(() => {
    apiFetch<SupportPortalConfig>("/public/support/form")
      .then((response) => {
        setConfig(response);
        const initialData = Object.fromEntries(
          response.form.fields
            .filter((field) => field.type === "RADIO" && field.options.length === 1)
            .map((field) => [field.fieldKey, field.options[0]])
        );
        setFormData(initialData);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load the support request form."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!config) return;
    document.title = `${branding.applicationName} - ${config.portal.browserTitle || "Support Portal"}`;
  }, [branding.applicationName, config]);

  function updateField(key: string, value: string | string[]) {
    setFormData((current) => ({ ...current, [key]: value }));
  }

  function resetTurnstile() {
    window.turnstile?.reset();
  }

  function startAnotherTicket() {
    setTicketNumber(null);
    setFormData({});
    setError(null);
    resetTurnstile();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const captchaToken = String(new FormData(event.currentTarget).get("cf-turnstile-response") ?? "");
    setSubmitting(true);
    try {
      const response = await apiFetch<{ ticketNumber: string }>("/public/support/tickets", {
        method: "POST",
        body: JSON.stringify({
          requesterName: fieldValue(formData, "requesterName"),
          requesterEmail: fieldValue(formData, "requesterEmail"),
          requesterPhone: fieldValue(formData, "requesterPhone") || undefined,
          subject: fieldValue(formData, "subject"),
          description: fieldValue(formData, "description"),
          priority: fieldValue(formData, "priority") || undefined,
          formData: Object.fromEntries(activeFields.filter((field) => isVisible(field, formData)).map((field) => [field.fieldKey, formData[field.fieldKey] ?? ""])),
          captchaToken: captchaToken || undefined
        })
      });
      setTicketNumber(response.ticketNumber);
    } catch (caught) {
      resetTurnstile();
      setError(caught instanceof Error ? caught.message : "Unable to submit the support request.");
    } finally {
      setSubmitting(false);
    }
  }

  function renderField(field: SupportField) {
    const label = `${field.label}${field.isRequired ? " *" : ""}`;
    const commonHelp = field.helpText ? <small>{field.helpText}</small> : null;
    const layoutWidth = effectiveLayoutWidth(field);
    const layoutProps = {
      className: `support-layout-${layoutWidth.toLowerCase()}`,
      "data-layout-width": layoutWidth
    };
    if (field.type === "TEXTAREA") {
      return (
        <label {...layoutProps} key={field.id}>
          {label}
          <textarea className="public-event-input" required={field.isRequired} placeholder={field.placeholder ?? ""} value={fieldValue(formData, field.fieldKey)} onChange={(event) => updateField(field.fieldKey, event.target.value)} />
          {commonHelp}
        </label>
      );
    }
    if (field.type === "SELECT") {
      return (
        <label {...layoutProps} key={field.id}>
          {label}
          <select className="public-event-input" required={field.isRequired} value={fieldValue(formData, field.fieldKey)} onChange={(event) => updateField(field.fieldKey, event.target.value)}>
            <option value="">Select...</option>
            {field.options.map((option) => <option key={option} value={option}>{field.fieldKey === "priority" ? priorityLabel(option) : option}</option>)}
          </select>
          {commonHelp}
        </label>
      );
    }
    if (field.type === "MULTI_SELECT") {
      return (
        <label {...layoutProps} key={field.id}>
          {label}
          <select
            className="public-event-input"
            required={field.isRequired}
            multiple
            value={fieldArrayValue(formData, field.fieldKey)}
            onChange={(event) => updateField(field.fieldKey, Array.from(event.target.selectedOptions).map((option) => option.value))}
          >
            {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          {commonHelp}
        </label>
      );
    }
    if (field.type === "RADIO" || field.type === "CHECKBOX") {
      const selected = fieldArrayValue(formData, field.fieldKey);
      return (
        <fieldset {...layoutProps} className={`public-support-choice-field ${layoutProps.className}`} key={field.id}>
          <legend>{label}</legend>
          <div className="public-event-choice-group">
            {field.options.map((option) => (
              <label key={option}>
                <input
                  type={field.type === "RADIO" ? "radio" : "checkbox"}
                  name={field.fieldKey}
                  checked={selected.includes(option)}
                  required={field.isRequired && selected.length === 0}
                  onChange={(event) => {
                    if (field.type === "RADIO") {
                      updateField(field.fieldKey, option);
                      return;
                    }
                    updateField(field.fieldKey, event.target.checked ? [...selected, option] : selected.filter((value) => value !== option));
                  }}
                />
                {option}
              </label>
            ))}
          </div>
          {commonHelp}
        </fieldset>
      );
    }
    const type =
      field.fieldKey === "occurredAt"
        ? "datetime-local"
        : field.type === "NUMBER"
          ? "number"
          : field.type === "DATE"
            ? "date"
            : field.type === "EMAIL"
              ? "email"
              : field.type === "PHONE"
                ? "tel"
                : "text";
    return (
      <label {...layoutProps} key={field.id}>
        {label}
        <input className="public-event-input" type={type} required={field.isRequired} placeholder={type === "datetime-local" ? undefined : (field.placeholder ?? "")} value={fieldValue(formData, field.fieldKey)} onChange={(event) => updateField(field.fieldKey, event.target.value)} />
        {commonHelp}
      </label>
    );
  }

  function sectionIcon(section: SupportSection): ReactNode {
    if (section.icon === "building") return <Building2 size={18} />;
    if (section.icon === "mail") return <Mail size={18} />;
    if (section.icon === "clipboard") return <ClipboardList size={18} />;
    return <UserRound size={18} />;
  }

  function renderSection(section: SupportSection) {
    return (
      <section className="public-support-section" key={section.id}>
        <h3>{sectionIcon(section)}{section.title}</h3>
        <div className="public-event-grid">{section.fields.map(renderField)}</div>
      </section>
    );
  }

  if (loading) {
    return <main className="public-event-page"><section className="public-event-form-card">Loading support request form...</section></main>;
  }

  if (!config) {
    return (
      <main className="public-event-page">
        <section className="public-event-form-card">
          <p className="form-error">{error ?? "Unable to load the support request form."}</p>
        </section>
      </main>
    );
  }

  if (ticketNumber) {
    return (
      <main className="public-event-page">
        <section className="public-event-success">
          <CheckCircle2 size={42} />
          <h1>Request Submitted</h1>
          <p>{config.portal.successMessage}</p>
          <strong>{ticketNumber}</strong>
          <p>Use this ticket number when following up with {config.organization.supportEmail}.</p>
          <button className="button" type="button" onClick={startAnotherTicket}>Submit Another Ticket</button>
        </section>
      </main>
    );
  }

  return (
    <main className="public-event-page">
      <section className="public-event-hero public-support-hero">
        <div className="public-event-brand">
          {logoUrl ? <img src={logoUrl} alt={branding.companyName} style={logoBackgroundStyle} /> : null}
        </div>
        <h1>Support Portal</h1>
        <p>{config.portal.introText ?? config.form.introText ?? "Tell us what is happening so our team can help."}</p>
      </section>

      <form className="public-event-form-card public-support-form-card" onSubmit={submit}>
        <div className="section-heading public-support-form-heading">
          <div>
            <span className="public-support-eyebrow">Support request</span>
            <h2>{config.portal.title}</h2>
          </div>
          <p>Fields marked with an asterisk are required.</p>
        </div>
        <div className="public-support-note">
          Attachments are not accepted here yet. Email files to <strong>{config.organization.supportEmail}</strong> after submitting and include your ticket number.
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        {visibleSections.map(renderSection)}
        {config.portal.turnstileSiteKey ? (
          <>
            <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
            <div className="cf-turnstile" data-sitekey={config.portal.turnstileSiteKey} />
          </>
        ) : null}
        <button className="button public-event-submit" type="submit" disabled={submitting}>
          <Send size={16} /> {submitting ? "Submitting..." : "Submit Ticket"}
        </button>
      </form>
      <footer className="public-event-footer">
        {config.organization.name ?? branding.companyName} - {config.organization.supportEmail ?? branding.supportEmail}
      </footer>
    </main>
  );
}
