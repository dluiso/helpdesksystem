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
  visibilityCondition: { fieldKey?: string; operator?: string; value?: string } | null;
}

interface SupportPortalConfig {
  organization: { name: string; supportEmail: string };
  portal: {
    title: string;
    introText: string | null;
    successMessage: string;
    turnstileSiteKey: string | null;
  };
  form: {
    name: string;
    introText: string | null;
    fields: SupportField[];
  };
}

type FormDataState = Record<string, string | string[]>;

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

function isVisible(field: SupportField, data: FormDataState) {
  const condition = field.visibilityCondition;
  if (!condition?.fieldKey || !condition.operator) {
    return true;
  }
  const current = fieldValue(data, condition.fieldKey);
  const expected = condition.value ?? "";
  if (condition.operator === "equals") return current === expected;
  if (condition.operator === "not_equals") return current !== expected;
  if (condition.operator === "contains") return current.toLowerCase().includes(expected.toLowerCase());
  if (condition.operator === "is_empty") return !current;
  if (condition.operator === "is_not_empty") return Boolean(current);
  return true;
}

function priorityLabel(option: string) {
  if (option === "LOW") return "Low - Does not affect daily work";
  if (option === "NORMAL") return "Medium - Affects some functions";
  if (option === "HIGH") return "High - Blocks important tasks";
  if (option === "CRITICAL") return "Critical - Service is down";
  return option;
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

  const activeFields = useMemo(() => (config?.form.fields ?? []).filter((field) => field.isActive).sort((a, b) => a.sortOrder - b.sortOrder), [config]);
  const fieldGroups = useMemo(() => {
    const visibleFields = activeFields.filter((field) => isVisible(field, formData));
    return {
      requester: visibleFields.filter((field) => requesterKeys.has(field.fieldKey)),
      request: visibleFields.filter((field) => requestKeys.has(field.fieldKey)),
      asset: visibleFields.filter((field) => assetKeys.has(field.fieldKey)),
      diagnostics: visibleFields.filter((field) => !requesterKeys.has(field.fieldKey) && !requestKeys.has(field.fieldKey) && !assetKeys.has(field.fieldKey))
    };
  }, [activeFields, formData]);

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
    if (field.type === "TEXTAREA") {
      return (
        <label className="span-2" key={field.id}>
          {label}
          <textarea className="public-event-input" required={field.isRequired} placeholder={field.placeholder ?? ""} value={fieldValue(formData, field.fieldKey)} onChange={(event) => updateField(field.fieldKey, event.target.value)} />
          {commonHelp}
        </label>
      );
    }
    if (field.type === "SELECT") {
      return (
        <label key={field.id}>
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
        <label className="span-2" key={field.id}>
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
        <fieldset className="public-support-choice-field span-2" key={field.id}>
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
      <label key={field.id}>
        {label}
        <input className="public-event-input" type={type} required={field.isRequired} placeholder={type === "datetime-local" ? undefined : (field.placeholder ?? "")} value={fieldValue(formData, field.fieldKey)} onChange={(event) => updateField(field.fieldKey, event.target.value)} />
        {commonHelp}
      </label>
    );
  }

  function renderSection(title: string, icon: ReactNode, fields: SupportField[]) {
    if (fields.length === 0) {
      return null;
    }
    return (
      <section className="public-support-section">
        <h3>{icon}{title}</h3>
        <div className="public-event-grid">{fields.map(renderField)}</div>
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
        {renderSection("Requester Information", <UserRound size={18} />, fieldGroups.requester)}
        {renderSection("Request Information", <ClipboardList size={18} />, fieldGroups.request)}
        {renderSection("Affected Asset or System", <Building2 size={18} />, fieldGroups.asset)}
        {renderSection("Diagnostic Details", <Mail size={18} />, fieldGroups.diagnostics)}
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
