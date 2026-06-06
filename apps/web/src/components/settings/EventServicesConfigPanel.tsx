"use client";

import { ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface EventServiceCatalogItem {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  isActive: boolean;
}

interface EventForm {
  id: string;
  name: string;
  introText: string | null;
  fields: Array<{ id: string; label: string; fieldKey: string; type: string; isRequired: boolean; sortOrder: number; isActive: boolean }>;
}

interface EventTurnstileSettings {
  eventTurnstileEnabled: boolean;
  eventTurnstileSiteKey: string | null;
  eventTurnstileSecretReference: string | null;
}

const fieldTypes = ["TEXT", "TEXTAREA", "EMAIL", "PHONE", "DATE", "TIME", "SELECT", "MULTI_SELECT", "CHECKBOX", "RADIO", "NUMBER"];

function label(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function EventServicesConfigPanel() {
  const [activeTab, setActiveTab] = useState<"form" | "turnstile">("form");
  const [services, setServices] = useState<EventServiceCatalogItem[]>([]);
  const [form, setForm] = useState<EventForm | null>(null);
  const [turnstile, setTurnstile] = useState<EventTurnstileSettings>({
    eventTurnstileEnabled: false,
    eventTurnstileSiteKey: "",
    eventTurnstileSecretReference: "env:EVENT_TURNSTILE_SECRET_KEY"
  });
  const [serviceDraft, setServiceDraft] = useState({ name: "", description: "", icon: "", isActive: true });
  const [fieldDraft, setFieldDraft] = useState({ label: "", fieldKey: "", type: "TEXT", isRequired: false, sortOrder: 100 });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadConfig() {
    setError(null);
    try {
      const [serviceData, formData, turnstileData] = await Promise.all([
        apiFetch<EventServiceCatalogItem[]>("/event-services/services"),
        apiFetch<EventForm>("/event-services/form"),
        apiFetch<EventTurnstileSettings>("/event-services/config/turnstile")
      ]);
      setServices(serviceData);
      setForm(formData);
      setTurnstile({
        eventTurnstileEnabled: turnstileData.eventTurnstileEnabled,
        eventTurnstileSiteKey: turnstileData.eventTurnstileSiteKey ?? "",
        eventTurnstileSecretReference: turnstileData.eventTurnstileSecretReference ?? "env:EVENT_TURNSTILE_SECRET_KEY"
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load event configuration.");
    }
  }

  useEffect(() => {
    void loadConfig();
  }, []);

  async function createService() {
    if (!serviceDraft.name.trim()) return;
    setBusy("service");
    setError(null);
    try {
      await apiFetch("/event-services/services", { method: "POST", body: JSON.stringify(serviceDraft) });
      setServiceDraft({ name: "", description: "", icon: "", isActive: true });
      setNotice("Event service added.");
      await loadConfig();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create service.");
    } finally {
      setBusy(null);
    }
  }

  async function createField() {
    if (!fieldDraft.label.trim() || !fieldDraft.fieldKey.trim()) return;
    setBusy("field");
    setError(null);
    try {
      await apiFetch("/event-services/form/fields", { method: "POST", body: JSON.stringify(fieldDraft) });
      setFieldDraft({ label: "", fieldKey: "", type: "TEXT", isRequired: false, sortOrder: 100 });
      setNotice("Event form field added.");
      await loadConfig();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create form field.");
    } finally {
      setBusy(null);
    }
  }

  async function saveTurnstile() {
    setBusy("turnstile");
    setError(null);
    try {
      const saved = await apiFetch<EventTurnstileSettings>("/event-services/config/turnstile", {
        method: "PATCH",
        body: JSON.stringify(turnstile)
      });
      setTurnstile({
        eventTurnstileEnabled: saved.eventTurnstileEnabled,
        eventTurnstileSiteKey: saved.eventTurnstileSiteKey ?? "",
        eventTurnstileSecretReference: saved.eventTurnstileSecretReference ?? "env:EVENT_TURNSTILE_SECRET_KEY"
      });
      setNotice("Event Turnstile settings saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save event Turnstile settings.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel event-config-panel">
      <div className="section-heading">
        <div>
          <h2>Events Config</h2>
          <p className="muted">Configure the public Event & Services form and its dedicated Cloudflare Turnstile protection.</p>
        </div>
      </div>

      {error ? <div className="alert error">{error}</div> : null}
      {notice ? <div className="alert success">{notice}</div> : null}

      <div className="settings-subtabs" role="tablist" aria-label="Event configuration sections">
        <button className={activeTab === "form" ? "active" : ""} type="button" onClick={() => setActiveTab("form")}>
          <SlidersHorizontal size={16} aria-hidden="true" />
          Public Form
        </button>
        <button className={activeTab === "turnstile" ? "active" : ""} type="button" onClick={() => setActiveTab("turnstile")}>
          <ShieldCheck size={16} aria-hidden="true" />
          Cloudflare Turnstile
        </button>
      </div>

      {activeTab === "form" ? (
        <div className="event-admin-grid settings-section">
          <div className="nested-panel">
            <h3>Services</h3>
            <div className="event-service-create">
              <input className="input" placeholder="Service name" value={serviceDraft.name} onChange={(event) => setServiceDraft((current) => ({ ...current, name: event.target.value }))} />
              <input className="input" placeholder="Description" value={serviceDraft.description} onChange={(event) => setServiceDraft((current) => ({ ...current, description: event.target.value }))} />
              <button className="button secondary" type="button" onClick={createService} disabled={busy === "service"}>Add Service</button>
            </div>
            {services.map((service) => <div className="event-admin-row" key={service.id}><strong>{service.name}</strong><span>{service.isActive ? "Active" : "Inactive"}</span></div>)}
          </div>
          <div className="nested-panel">
            <h3>Form Fields</h3>
            <div className="event-service-create event-field-create">
              <input className="input" placeholder="Label" value={fieldDraft.label} onChange={(event) => setFieldDraft((current) => ({ ...current, label: event.target.value }))} />
              <input className="input" placeholder="field_key" value={fieldDraft.fieldKey} onChange={(event) => setFieldDraft((current) => ({ ...current, fieldKey: event.target.value }))} />
              <select className="input" value={fieldDraft.type} onChange={(event) => setFieldDraft((current) => ({ ...current, type: event.target.value }))}>
                {fieldTypes.map((type) => <option key={type} value={type}>{label(type)}</option>)}
              </select>
              <label className="checkbox-row">
                <input type="checkbox" checked={fieldDraft.isRequired} onChange={(event) => setFieldDraft((current) => ({ ...current, isRequired: event.target.checked }))} />
                Required
              </label>
              <button className="button secondary" type="button" onClick={createField} disabled={busy === "field"}>Add Field</button>
            </div>
            {form?.fields.map((field) => <div className="event-admin-row" key={field.id}><strong>{field.label}</strong><span>{label(field.type)} - {field.isRequired ? "Required" : "Optional"}</span></div>)}
          </div>
        </div>
      ) : null}

      {activeTab === "turnstile" ? (
        <div className="nested-panel settings-section">
          <div className="section-heading">
            <div>
              <h3>Public Event Form Turnstile</h3>
              <p className="muted">Use separate Cloudflare keys for events. Store the real secret in the server environment and save only its reference here.</p>
            </div>
            <span className="status-pill">{turnstile.eventTurnstileEnabled ? "Enabled" : "Disabled"}</span>
          </div>
          <label className="checkbox-row">
            <input type="checkbox" checked={turnstile.eventTurnstileEnabled} onChange={(event) => setTurnstile((current) => ({ ...current, eventTurnstileEnabled: event.target.checked }))} />
            Enable Turnstile on the public event form
          </label>
          <div className="grid columns-2">
            <label className="field">
              <span>Site key</span>
              <input className="input" value={turnstile.eventTurnstileSiteKey ?? ""} onChange={(event) => setTurnstile((current) => ({ ...current, eventTurnstileSiteKey: event.target.value }))} />
            </label>
            <label className="field">
              <span>Secret reference</span>
              <input className="input" placeholder="env:EVENT_TURNSTILE_SECRET_KEY" value={turnstile.eventTurnstileSecretReference ?? ""} onChange={(event) => setTurnstile((current) => ({ ...current, eventTurnstileSecretReference: event.target.value }))} />
            </label>
          </div>
          <p className="muted">Production example: add EVENT_TURNSTILE_SECRET_KEY to .env.production, then save env:EVENT_TURNSTILE_SECRET_KEY here.</p>
          <button className="button" type="button" onClick={saveTurnstile} disabled={busy === "turnstile"}>Save Events Turnstile</button>
        </div>
      ) : null}
    </section>
  );
}
