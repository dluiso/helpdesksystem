"use client";

import { Eye, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type FieldType = "TEXT" | "TEXTAREA" | "EMAIL" | "PHONE" | "DATE" | "TIME" | "SELECT" | "MULTI_SELECT" | "CHECKBOX" | "RADIO" | "NUMBER";

interface SupportPortalField {
  id: string;
  type: FieldType;
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
  settings: {
    supportPortalEnabled: boolean;
    supportPortalTitle: string;
    supportPortalIntroText: string | null;
    supportPortalSuccessMessage: string | null;
    supportPortalTurnstileEnabled: boolean;
    supportPortalTurnstileSiteKey: string | null;
    supportPortalTurnstileSecretReference: string | null;
  };
  form: {
    id: string;
    name: string;
    slug: string;
    introText: string | null;
    fields: SupportPortalField[];
  };
}

type SettingsDraft = SupportPortalConfig["settings"];

type FieldDraft = {
  label: string;
  fieldKey: string;
  type: FieldType;
  placeholder: string;
  helpText: string;
  optionsText: string;
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
  conditionFieldKey: string;
  conditionOperator: string;
  conditionValue: string;
};

const fieldTypes: FieldType[] = ["TEXT", "TEXTAREA", "EMAIL", "PHONE", "DATE", "TIME", "SELECT", "MULTI_SELECT", "CHECKBOX", "RADIO", "NUMBER"];
const optionFieldTypes = new Set<FieldType>(["SELECT", "MULTI_SELECT", "CHECKBOX", "RADIO"]);
const blankFieldDraft: FieldDraft = {
  label: "",
  fieldKey: "",
  type: "TEXT",
  placeholder: "",
  helpText: "",
  optionsText: "",
  isRequired: false,
  isActive: true,
  sortOrder: 100,
  conditionFieldKey: "",
  conditionOperator: "equals",
  conditionValue: ""
};

function label(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function makeFieldKey(value: string) {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_([a-zA-Z0-9])/g, (_, character: string) => character.toUpperCase());
  const camel = normalized.slice(0, 1).toLowerCase() + normalized.slice(1);
  return /^[a-z]/.test(camel) ? camel : `field${camel}`;
}

function optionsToText(options: string[]) {
  return options.join("\n");
}

function textToOptions(value: string) {
  return value.split(/\r?\n/).map((option) => option.trim()).filter(Boolean);
}

function fieldToDraft(field: SupportPortalField): FieldDraft {
  return {
    label: field.label,
    fieldKey: field.fieldKey,
    type: field.type,
    placeholder: field.placeholder ?? "",
    helpText: field.helpText ?? "",
    optionsText: optionsToText(field.options),
    isRequired: field.isRequired,
    isActive: field.isActive,
    sortOrder: field.sortOrder,
    conditionFieldKey: field.visibilityCondition?.fieldKey ?? "",
    conditionOperator: field.visibilityCondition?.operator ?? "equals",
    conditionValue: field.visibilityCondition?.value ?? ""
  };
}

function fieldPayload(draft: FieldDraft) {
  return {
    type: draft.type,
    label: draft.label.trim(),
    fieldKey: draft.fieldKey.trim(),
    placeholder: draft.placeholder.trim() || null,
    helpText: draft.helpText.trim() || null,
    options: optionFieldTypes.has(draft.type) ? textToOptions(draft.optionsText) : [],
    isRequired: draft.isRequired,
    isActive: draft.isActive,
    sortOrder: draft.sortOrder,
    visibilityCondition: draft.conditionFieldKey
      ? {
          fieldKey: draft.conditionFieldKey,
          operator: draft.conditionOperator,
          value: draft.conditionValue
        }
      : null
  };
}

export function SupportPortalConfigPanel() {
  const [activeTab, setActiveTab] = useState<"form" | "preview" | "security">("form");
  const [config, setConfig] = useState<SupportPortalConfig | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft | null>(null);
  const [fieldDraft, setFieldDraft] = useState<FieldDraft>(blankFieldDraft);
  const [fieldEdits, setFieldEdits] = useState<Record<string, FieldDraft>>({});
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sortedFields = useMemo(() => [...(config?.form.fields ?? [])].sort((a, b) => a.sortOrder - b.sortOrder), [config]);
  const editableConditionFields = useMemo(() => sortedFields.filter((field) => field.isActive), [sortedFields]);

  async function loadConfig() {
    setError(null);
    try {
      const data = await apiFetch<SupportPortalConfig>("/support-portal/config");
      setConfig(data);
      setSettingsDraft(data.settings);
      setFieldDraft((current) => ({ ...current, sortOrder: Math.max(10, Math.max(0, ...data.form.fields.map((field) => field.sortOrder)) + 10) }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load support portal settings.");
    }
  }

  useEffect(() => {
    void loadConfig();
  }, []);

  async function saveSettings() {
    if (!settingsDraft) return;
    setBusy("settings");
    setError(null);
    try {
      await apiFetch("/support-portal/config", {
        method: "PATCH",
        body: JSON.stringify(settingsDraft)
      });
      setNotice("Support portal settings saved.");
      await loadConfig();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save support portal settings.");
    } finally {
      setBusy(null);
    }
  }

  async function createField() {
    if (!fieldDraft.label.trim()) return;
    setBusy("create-field");
    setError(null);
    try {
      await apiFetch("/support-portal/form/fields", {
        method: "POST",
        body: JSON.stringify(fieldPayload({ ...fieldDraft, fieldKey: fieldDraft.fieldKey || makeFieldKey(fieldDraft.label) }))
      });
      setFieldDraft({ ...blankFieldDraft, sortOrder: Math.max(10, Math.max(0, ...sortedFields.map((field) => field.sortOrder)) + 10) });
      setNotice("Support portal field added.");
      await loadConfig();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add field.");
    } finally {
      setBusy(null);
    }
  }

  async function updateField(fieldId: string) {
    const draft = fieldEdits[fieldId];
    if (!draft) return;
    setBusy(fieldId);
    setError(null);
    try {
      await apiFetch(`/support-portal/form/fields/${fieldId}`, {
        method: "PATCH",
        body: JSON.stringify(fieldPayload(draft))
      });
      setEditingFieldId(null);
      setNotice("Support portal field updated.");
      await loadConfig();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update field.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteField(field: SupportPortalField) {
    if (!window.confirm(`Delete "${field.label}" from the support portal form?`)) {
      return;
    }
    setBusy(field.id);
    setError(null);
    try {
      await apiFetch(`/support-portal/form/fields/${field.id}`, { method: "DELETE" });
      setNotice("Support portal field deleted.");
      await loadConfig();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete field.");
    } finally {
      setBusy(null);
    }
  }

  function renderFieldDraftControls(draft: FieldDraft, onChange: (next: FieldDraft) => void, lockedKey = false) {
    return (
      <div className="support-field-editor">
        <input value={draft.label} placeholder="Field label" onChange={(event) => onChange({ ...draft, label: event.target.value, fieldKey: lockedKey ? draft.fieldKey : draft.fieldKey || makeFieldKey(event.target.value) })} />
        <input value={draft.fieldKey} placeholder="fieldKey" disabled={lockedKey} onChange={(event) => onChange({ ...draft, fieldKey: event.target.value })} />
        <select value={draft.type} disabled={lockedKey} onChange={(event) => onChange({ ...draft, type: event.target.value as FieldType })}>
          {fieldTypes.map((type) => <option key={type} value={type}>{label(type)}</option>)}
        </select>
        <input type="number" min="0" value={draft.sortOrder} onChange={(event) => onChange({ ...draft, sortOrder: Number(event.target.value) })} />
        <input value={draft.placeholder} placeholder="Placeholder" onChange={(event) => onChange({ ...draft, placeholder: event.target.value })} />
        <input value={draft.helpText} placeholder="Help text" onChange={(event) => onChange({ ...draft, helpText: event.target.value })} />
        {optionFieldTypes.has(draft.type) ? (
          <textarea value={draft.optionsText} placeholder="Options, one per line" onChange={(event) => onChange({ ...draft, optionsText: event.target.value })} />
        ) : null}
        <label><input type="checkbox" checked={draft.isRequired} disabled={lockedKey} onChange={(event) => onChange({ ...draft, isRequired: event.target.checked })} /> Required</label>
        <label><input type="checkbox" checked={draft.isActive} disabled={lockedKey} onChange={(event) => onChange({ ...draft, isActive: event.target.checked })} /> Active</label>
        <div className="support-condition-row">
          <select value={draft.conditionFieldKey} disabled={lockedKey} onChange={(event) => onChange({ ...draft, conditionFieldKey: event.target.value })}>
            <option value="">Always show</option>
            {editableConditionFields.map((field) => <option key={field.id} value={field.fieldKey}>{field.label}</option>)}
          </select>
          <select value={draft.conditionOperator} disabled={lockedKey || !draft.conditionFieldKey} onChange={(event) => onChange({ ...draft, conditionOperator: event.target.value })}>
            <option value="equals">Equals</option>
            <option value="not_equals">Does not equal</option>
            <option value="contains">Contains</option>
            <option value="is_empty">Is empty</option>
            <option value="is_not_empty">Is not empty</option>
          </select>
          <input value={draft.conditionValue} disabled={lockedKey || !draft.conditionFieldKey || ["is_empty", "is_not_empty"].includes(draft.conditionOperator)} placeholder="Value" onChange={(event) => onChange({ ...draft, conditionValue: event.target.value })} />
        </div>
      </div>
    );
  }

  if (!config || !settingsDraft) {
    return <section className="panel support-portal-config-panel">{error ? <p className="form-error">{error}</p> : "Loading support portal settings..."}</section>;
  }

  return (
    <section className="panel support-portal-config-panel">
      <div className="panel-header-row">
        <div>
          <h2>Support Portal</h2>
          <p>Configure the public ticket request portal, form fields, conditional logic, and verification.</p>
        </div>
        <span className={`status-pill ${settingsDraft.supportPortalEnabled ? "active" : "inactive"}`}>{settingsDraft.supportPortalEnabled ? "Enabled" : "Disabled"}</span>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-success">{notice}</p> : null}
      <div className="settings-tabs">
        <button className={activeTab === "form" ? "active" : ""} onClick={() => setActiveTab("form")} type="button">Form Fields</button>
        <button className={activeTab === "preview" ? "active" : ""} onClick={() => setActiveTab("preview")} type="button"><Eye size={15} /> Preview</button>
        <button className={activeTab === "security" ? "active" : ""} onClick={() => setActiveTab("security")} type="button"><ShieldCheck size={15} /> Security</button>
      </div>

      {activeTab === "form" ? (
        <div className="support-config-stack">
          <div className="support-settings-grid">
            <label><input type="checkbox" checked={settingsDraft.supportPortalEnabled} onChange={(event) => setSettingsDraft({ ...settingsDraft, supportPortalEnabled: event.target.checked })} /> Enable public support portal</label>
            <label>Portal title<input value={settingsDraft.supportPortalTitle} onChange={(event) => setSettingsDraft({ ...settingsDraft, supportPortalTitle: event.target.value })} /></label>
            <label className="span-2">Intro text<textarea value={settingsDraft.supportPortalIntroText ?? ""} onChange={(event) => setSettingsDraft({ ...settingsDraft, supportPortalIntroText: event.target.value })} /></label>
            <label className="span-2">Success message<textarea value={settingsDraft.supportPortalSuccessMessage ?? ""} onChange={(event) => setSettingsDraft({ ...settingsDraft, supportPortalSuccessMessage: event.target.value })} /></label>
            <button className="button" type="button" disabled={busy === "settings"} onClick={saveSettings}><Save size={15} /> Save Portal Settings</button>
          </div>

          <div className="support-field-create">
            <h3>Add Field</h3>
            {renderFieldDraftControls(fieldDraft, setFieldDraft)}
            <button className="button" type="button" disabled={busy === "create-field"} onClick={createField}><Plus size={15} /> Add Field</button>
          </div>

          <div className="support-field-list">
            {sortedFields.map((field) => {
              const draft = fieldEdits[field.id] ?? fieldToDraft(field);
              const editing = editingFieldId === field.id;
              return (
                <div className="support-field-row" key={field.id}>
                  <div className="support-field-summary">
                    <strong>{field.label}</strong>
                    <span>{field.fieldKey} - {label(field.type)} {field.isCore ? "- Core" : ""}</span>
                  </div>
                  {editing ? renderFieldDraftControls(draft, (next) => setFieldEdits((current) => ({ ...current, [field.id]: next })), field.isCore) : null}
                  <div className="support-field-actions">
                    {editing ? (
                      <>
                        <button type="button" onClick={() => updateField(field.id)} disabled={busy === field.id}>Save</button>
                        <button type="button" onClick={() => setEditingFieldId(null)}>Cancel</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => { setFieldEdits((current) => ({ ...current, [field.id]: draft })); setEditingFieldId(field.id); }}>Edit</button>
                    )}
                    {!field.isCore ? <button className="danger-button" type="button" onClick={() => deleteField(field)} disabled={busy === field.id}><Trash2 size={14} /> Delete</button> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {activeTab === "preview" ? (
        <div className="support-preview-card">
          <h3>{settingsDraft.supportPortalTitle}</h3>
          <p>{settingsDraft.supportPortalIntroText || config.form.introText}</p>
          <div className="support-preview-grid">
            {sortedFields.filter((field) => field.isActive).slice(0, 12).map((field) => (
              <label key={field.id}>{field.label}{field.isRequired ? " *" : ""}<input disabled placeholder={field.placeholder ?? ""} /></label>
            ))}
          </div>
        </div>
      ) : null}

      {activeTab === "security" ? (
        <div className="support-settings-grid">
          <label><input type="checkbox" checked={settingsDraft.supportPortalTurnstileEnabled} onChange={(event) => setSettingsDraft({ ...settingsDraft, supportPortalTurnstileEnabled: event.target.checked })} /> Enable Cloudflare Turnstile</label>
          <label>Site key<input value={settingsDraft.supportPortalTurnstileSiteKey ?? ""} onChange={(event) => setSettingsDraft({ ...settingsDraft, supportPortalTurnstileSiteKey: event.target.value })} /></label>
          <label>Secret reference<input value={settingsDraft.supportPortalTurnstileSecretReference ?? "env:SUPPORT_PORTAL_TURNSTILE_SECRET_KEY"} onChange={(event) => setSettingsDraft({ ...settingsDraft, supportPortalTurnstileSecretReference: event.target.value })} /></label>
          <p className="muted span-2">Use an environment variable reference such as env:SUPPORT_PORTAL_TURNSTILE_SECRET_KEY instead of storing secrets in the database.</p>
          <button className="button" type="button" disabled={busy === "settings"} onClick={saveSettings}><Save size={15} /> Save Security Settings</button>
        </div>
      ) : null}
    </section>
  );
}
