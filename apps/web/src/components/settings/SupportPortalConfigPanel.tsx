"use client";

import { Eye, GripVertical, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import type { DragEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useBranding } from "@/components/providers/BrandingProvider";
import { apiFetch } from "@/lib/api";

type FieldType = "TEXT" | "TEXTAREA" | "EMAIL" | "PHONE" | "DATE" | "TIME" | "SELECT" | "MULTI_SELECT" | "CHECKBOX" | "RADIO" | "NUMBER";
type LayoutWidth = "FULL" | "HALF" | "THIRD" | "QUARTER";
type VisibilityLogic = "ANY" | "ALL";
type VisibilityRule = { fieldKey: string; operator: string; value: string };
type VisibilityCondition = { fieldKey?: string; operator?: string; value?: string } | { logic?: VisibilityLogic; rules?: VisibilityRule[] } | null;

interface SupportPortalField {
  id: string;
  sectionId: string | null;
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
  layoutWidth: LayoutWidth;
  visibilityCondition: VisibilityCondition;
}

interface SupportPortalSection {
  id: string;
  title: string;
  sectionKey: string;
  icon: string | null;
  sortOrder: number;
  isCore: boolean;
  isActive: boolean;
  fields: SupportPortalField[];
}

interface SupportPortalConfig {
  settings: {
    supportPortalEnabled: boolean;
    supportPortalBrowserTitle: string;
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
    sections: SupportPortalSection[];
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
  layoutWidth: LayoutWidth;
  sectionId: string;
  conditionLogic: VisibilityLogic;
  conditionRules: VisibilityRule[];
};

type SectionDraft = {
  title: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
};

const fieldTypes: FieldType[] = ["TEXT", "TEXTAREA", "EMAIL", "PHONE", "DATE", "TIME", "SELECT", "MULTI_SELECT", "CHECKBOX", "RADIO", "NUMBER"];
const optionFieldTypes = new Set<FieldType>(["SELECT", "MULTI_SELECT", "CHECKBOX", "RADIO"]);
const sectionIcons = ["user", "clipboard", "building", "mail", "settings"];
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
  layoutWidth: "HALF",
  sectionId: "",
  conditionLogic: "ANY",
  conditionRules: []
};
const blankSectionDraft: SectionDraft = { title: "", icon: "settings", sortOrder: 100, isActive: true };

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

function defaultLayoutWidth(type: FieldType): LayoutWidth {
  return ["TEXTAREA", "MULTI_SELECT", "CHECKBOX", "RADIO"].includes(type) ? "FULL" : "HALF";
}

function conditionToRules(condition: VisibilityCondition): { logic: VisibilityLogic; rules: VisibilityRule[] } {
  if (!condition || typeof condition !== "object") {
    return { logic: "ANY", rules: [] };
  }
  if ("rules" in condition && Array.isArray(condition.rules)) {
    return {
      logic: condition.logic === "ALL" ? "ALL" : "ANY",
      rules: condition.rules
        .filter((rule) => rule.fieldKey && rule.operator)
        .map((rule) => ({ fieldKey: rule.fieldKey, operator: rule.operator, value: rule.value ?? "" }))
    };
  }
  if ("fieldKey" in condition && condition.fieldKey && condition.operator) {
    return { logic: "ANY", rules: [{ fieldKey: condition.fieldKey, operator: condition.operator, value: condition.value ?? "" }] };
  }
  return { logic: "ANY", rules: [] };
}

function fieldToDraft(field: SupportPortalField, fallbackSectionId: string): FieldDraft {
  const condition = conditionToRules(field.visibilityCondition);
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
    layoutWidth: field.layoutWidth ?? defaultLayoutWidth(field.type),
    sectionId: field.sectionId ?? fallbackSectionId,
    conditionLogic: condition.logic,
    conditionRules: condition.rules
  };
}

function sectionToDraft(section: SupportPortalSection): SectionDraft {
  return {
    title: section.title,
    icon: section.icon ?? "settings",
    sortOrder: section.sortOrder,
    isActive: section.isActive
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
    layoutWidth: draft.layoutWidth,
    sectionId: draft.sectionId || null,
    visibilityCondition: draft.conditionRules.length > 0
      ? {
          logic: draft.conditionLogic,
          rules: draft.conditionRules.map((rule) => ({
            fieldKey: rule.fieldKey,
            operator: rule.operator,
            value: ["is_empty", "is_not_empty"].includes(rule.operator) ? "" : rule.value
          }))
        }
      : null
  };
}

function sectionPayload(draft: SectionDraft) {
  return {
    title: draft.title.trim(),
    icon: draft.icon || null,
    sortOrder: draft.sortOrder,
    isActive: draft.isActive
  };
}

function sortSections(sections: SupportPortalSection[]) {
  return [...sections].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
}

function sortFields(fields: SupportPortalField[]) {
  return [...fields].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

export function SupportPortalConfigPanel() {
  const branding = useBranding();
  const [activeTab, setActiveTab] = useState<"form" | "preview" | "security">("form");
  const [config, setConfig] = useState<SupportPortalConfig | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft | null>(null);
  const [fieldDraft, setFieldDraft] = useState<FieldDraft>(blankFieldDraft);
  const [sectionDraft, setSectionDraft] = useState<SectionDraft>(blankSectionDraft);
  const [fieldEdits, setFieldEdits] = useState<Record<string, FieldDraft>>({});
  const [sectionEdits, setSectionEdits] = useState<Record<string, SectionDraft>>({});
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [showSectionCreate, setShowSectionCreate] = useState(false);
  const [showFieldCreate, setShowFieldCreate] = useState(false);
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sortedSections = useMemo(() => sortSections(config?.form.sections ?? []), [config]);
  const fallbackSectionId = sortedSections[0]?.id ?? "";
  const sortedFields = useMemo(() => sortFields(config?.form.fields ?? []), [config]);
  const editableConditionFields = useMemo(() => sortedFields.filter((field) => field.isActive), [sortedFields]);

  async function loadConfig() {
    setError(null);
    try {
      const data = await apiFetch<SupportPortalConfig>("/support-portal/config");
      const defaultSectionId = sortSections(data.form.sections)[0]?.id ?? "";
      setConfig(data);
      setSettingsDraft(data.settings);
      setFieldDraft((current) => ({
        ...current,
        sectionId: current.sectionId || defaultSectionId,
        sortOrder: Math.max(10, Math.max(0, ...data.form.fields.map((field) => field.sortOrder)) + 10)
      }));
      setSectionDraft((current) => ({
        ...current,
        sortOrder: Math.max(10, Math.max(0, ...data.form.sections.map((section) => section.sortOrder)) + 10)
      }));
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

  async function createSection() {
    if (!sectionDraft.title.trim()) return;
    setBusy("create-section");
    setError(null);
    try {
      await apiFetch("/support-portal/form/sections", {
        method: "POST",
        body: JSON.stringify(sectionPayload(sectionDraft))
      });
      setSectionDraft({ ...blankSectionDraft, sortOrder: Math.max(10, Math.max(0, ...sortedSections.map((section) => section.sortOrder)) + 10) });
      setShowSectionCreate(false);
      setNotice("Support portal section added.");
      await loadConfig();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add section.");
    } finally {
      setBusy(null);
    }
  }

  async function updateSection(sectionId: string) {
    const draft = sectionEdits[sectionId];
    if (!draft) return;
    setBusy(sectionId);
    setError(null);
    try {
      await apiFetch(`/support-portal/form/sections/${sectionId}`, {
        method: "PATCH",
        body: JSON.stringify(sectionPayload(draft))
      });
      setEditingSectionId(null);
      setNotice("Support portal section updated.");
      await loadConfig();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update section.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteSection(section: SupportPortalSection) {
    if (!window.confirm(`Delete "${section.title}" from the support portal form? Empty custom sections only can be deleted.`)) {
      return;
    }
    setBusy(section.id);
    setError(null);
    try {
      await apiFetch(`/support-portal/form/sections/${section.id}`, { method: "DELETE" });
      setNotice("Support portal section deleted.");
      await loadConfig();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete section.");
    } finally {
      setBusy(null);
    }
  }

  async function moveSection(sectionId: string, direction: -1 | 1) {
    const sections = sortSections(sortedSections);
    const index = sections.findIndex((section) => section.id === sectionId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= sections.length) return;
    const reordered = [...sections];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    setBusy("reorder-sections");
    setError(null);
    try {
      const updated = await apiFetch<SupportPortalConfig>("/support-portal/form/sections/reorder", {
        method: "PATCH",
        body: JSON.stringify({ sections: reordered.map((section, sectionIndex) => ({ id: section.id, sortOrder: (sectionIndex + 1) * 10 })) })
      });
      setConfig(updated);
      setSettingsDraft(updated.settings);
      setNotice("Support portal sections reordered.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to reorder sections.");
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
        body: JSON.stringify(fieldPayload({ ...fieldDraft, fieldKey: fieldDraft.fieldKey || makeFieldKey(fieldDraft.label), sectionId: fieldDraft.sectionId || fallbackSectionId }))
      });
      setFieldDraft({ ...blankFieldDraft, sectionId: fallbackSectionId, sortOrder: Math.max(10, Math.max(0, ...sortedFields.map((field) => field.sortOrder)) + 10) });
      setShowFieldCreate(false);
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

  async function moveField(draggedId: string, targetSectionId: string, targetIndex: number) {
    if (!config || busy === "reorder-fields") return;
    const sections = sortedSections.map((section) => ({ ...section, fields: sortFields(section.fields) }));
    const sourceSection = sections.find((section) => section.fields.some((field) => field.id === draggedId));
    if (!sourceSection) return;
    const sourceIndex = sourceSection.fields.findIndex((field) => field.id === draggedId);
    const draggedField = sourceSection.fields[sourceIndex];
    const sourceSectionId = sourceSection.id;
    if (!draggedField) return;
    const sectionsWithoutField = sections.map((section) => {
      if (section.id !== sourceSectionId) return section;
      return { ...section, fields: section.fields.filter((field) => field.id !== draggedId) };
    });
    const normalizedIndex = sourceSectionId === targetSectionId && sourceIndex >= 0 && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    const nextSections = sectionsWithoutField.map((section) => {
      if (section.id !== targetSectionId) return section;
      const nextFields = [...section.fields];
      nextFields.splice(Math.max(0, Math.min(normalizedIndex, nextFields.length)), 0, { ...draggedField, sectionId: targetSectionId });
      return { ...section, fields: nextFields };
    });
    setBusy("reorder-fields");
    setError(null);
    try {
      const updated = await apiFetch<SupportPortalConfig>("/support-portal/form/fields/reorder", {
        method: "PATCH",
        body: JSON.stringify({
          movedFieldId: draggedId,
          fields: nextSections.flatMap((section) =>
            section.fields.map((field, index) => ({ id: field.id, sectionId: section.id, sortOrder: (index + 1) * 10 }))
          )
        })
      });
      setConfig(updated);
      setSettingsDraft(updated.settings);
      setNotice("Support portal fields reordered.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to reorder fields.");
    } finally {
      setBusy(null);
      setDraggedFieldId(null);
    }
  }

  function handleFieldDrop(event: DragEvent<HTMLElement>, sectionId: string, index: number) {
    event.preventDefault();
    if (!draggedFieldId) return;
    void moveField(draggedFieldId, sectionId, index);
  }

  function renderFieldDraftControls(draft: FieldDraft, onChange: (next: FieldDraft) => void, lockedKey = false) {
    const updateRule = (index: number, patch: Partial<VisibilityRule>) => {
      onChange({
        ...draft,
        conditionRules: draft.conditionRules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule)
      });
    };
    const removeRule = (index: number) => {
      onChange({ ...draft, conditionRules: draft.conditionRules.filter((_, ruleIndex) => ruleIndex !== index) });
    };
    const addRule = () => {
      onChange({ ...draft, conditionRules: [...draft.conditionRules, { fieldKey: "", operator: "equals", value: "" }] });
    };
    return (
      <div className="support-field-editor">
        <input value={draft.label} placeholder="Field label" onChange={(event) => onChange({ ...draft, label: event.target.value, fieldKey: lockedKey ? draft.fieldKey : draft.fieldKey || makeFieldKey(event.target.value) })} />
        <input value={draft.fieldKey} placeholder="fieldKey" disabled={lockedKey} onChange={(event) => onChange({ ...draft, fieldKey: event.target.value })} />
        <select value={draft.type} disabled={lockedKey} onChange={(event) => {
          const nextType = event.target.value as FieldType;
          onChange({ ...draft, type: nextType, layoutWidth: defaultLayoutWidth(nextType) });
        }}>
          {fieldTypes.map((type) => <option key={type} value={type}>{label(type)}</option>)}
        </select>
        <input type="number" min="0" value={draft.sortOrder} onChange={(event) => onChange({ ...draft, sortOrder: Number(event.target.value) })} />
        <select value={draft.layoutWidth} onChange={(event) => onChange({ ...draft, layoutWidth: event.target.value as LayoutWidth })}>
          <option value="FULL">Full width</option>
          <option value="HALF">1/2 width</option>
          <option value="THIRD">1/3 width</option>
          <option value="QUARTER">1/4 width</option>
        </select>
        <select value={draft.sectionId} onChange={(event) => onChange({ ...draft, sectionId: event.target.value })}>
          {sortedSections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}
        </select>
        <input value={draft.placeholder} placeholder="Placeholder" onChange={(event) => onChange({ ...draft, placeholder: event.target.value })} />
        <input value={draft.helpText} placeholder="Help text" onChange={(event) => onChange({ ...draft, helpText: event.target.value })} />
        {optionFieldTypes.has(draft.type) ? (
          <textarea value={draft.optionsText} placeholder="Options, one per line" onChange={(event) => onChange({ ...draft, optionsText: event.target.value })} />
        ) : null}
        <label><input type="checkbox" checked={draft.isRequired} disabled={lockedKey} onChange={(event) => onChange({ ...draft, isRequired: event.target.checked })} /> Required</label>
        <label><input type="checkbox" checked={draft.isActive} disabled={lockedKey} onChange={(event) => onChange({ ...draft, isActive: event.target.checked })} /> Active</label>
        <div className="support-condition-builder">
          <div className="support-condition-toolbar">
            <span>Visibility rules</span>
            <select value={draft.conditionLogic} disabled={lockedKey || draft.conditionRules.length < 2} onChange={(event) => onChange({ ...draft, conditionLogic: event.target.value as VisibilityLogic })}>
              <option value="ANY">Show when any rule matches</option>
              <option value="ALL">Show when all rules match</option>
            </select>
            <button type="button" disabled={lockedKey} onClick={addRule}>Add Rule</button>
          </div>
          {draft.conditionRules.length === 0 ? <p className="muted">Always visible.</p> : null}
          {draft.conditionRules.map((rule, index) => (
            <div className="support-condition-row" key={`${rule.fieldKey}-${index}`}>
              <select value={rule.fieldKey} disabled={lockedKey} onChange={(event) => updateRule(index, { fieldKey: event.target.value })}>
                <option value="">Select field</option>
                {editableConditionFields.filter((field) => field.fieldKey !== draft.fieldKey).map((field) => <option key={field.id} value={field.fieldKey}>{field.label}</option>)}
              </select>
              <select value={rule.operator} disabled={lockedKey || !rule.fieldKey} onChange={(event) => updateRule(index, { operator: event.target.value })}>
                <option value="equals">Equals</option>
                <option value="not_equals">Does not equal</option>
                <option value="contains">Contains</option>
                <option value="is_one_of">Is one of</option>
                <option value="is_empty">Is empty</option>
                <option value="is_not_empty">Is not empty</option>
              </select>
              <input value={rule.value} disabled={lockedKey || !rule.fieldKey || ["is_empty", "is_not_empty"].includes(rule.operator)} placeholder={rule.operator === "is_one_of" ? "Value 1, Value 2" : "Value"} onChange={(event) => updateRule(index, { value: event.target.value })} />
              <button type="button" disabled={lockedKey} onClick={() => removeRule(index)}>Remove</button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderSectionEditor(section: SupportPortalSection, index: number) {
    const editing = editingSectionId === section.id;
    const draft = sectionEdits[section.id] ?? sectionToDraft(section);
    return (
      <div
        className="support-section-editor"
        key={section.id}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => handleFieldDrop(event, section.id, sortFields(section.fields).length)}
      >
        <div className="support-section-header">
          <div>
            <strong>{section.title}</strong>
            <span>{section.sectionKey} - {section.fields.length} field{section.fields.length === 1 ? "" : "s"} {section.isCore ? "- Core" : ""}</span>
          </div>
          <div className="support-field-actions">
            <button type="button" disabled={index === 0 || busy === "reorder-sections"} onClick={() => moveSection(section.id, -1)}>Up</button>
            <button type="button" disabled={index === sortedSections.length - 1 || busy === "reorder-sections"} onClick={() => moveSection(section.id, 1)}>Down</button>
            {editing ? (
              <>
                <button type="button" onClick={() => updateSection(section.id)} disabled={busy === section.id}>Save</button>
                <button type="button" onClick={() => setEditingSectionId(null)}>Cancel</button>
              </>
            ) : (
              <button type="button" onClick={() => { setSectionEdits((current) => ({ ...current, [section.id]: draft })); setEditingSectionId(section.id); }}>Edit Section</button>
            )}
            {!section.isCore ? <button className="danger-button" type="button" onClick={() => deleteSection(section)} disabled={busy === section.id}><Trash2 size={14} /> Delete</button> : null}
          </div>
        </div>
        {editing ? (
          <div className="support-section-edit-grid">
            <input value={draft.title} placeholder="Section title" onChange={(event) => setSectionEdits((current) => ({ ...current, [section.id]: { ...draft, title: event.target.value } }))} />
            <select value={draft.icon} onChange={(event) => setSectionEdits((current) => ({ ...current, [section.id]: { ...draft, icon: event.target.value } }))}>
              {sectionIcons.map((icon) => <option key={icon} value={icon}>{label(icon)}</option>)}
            </select>
            <input type="number" min="0" value={draft.sortOrder} onChange={(event) => setSectionEdits((current) => ({ ...current, [section.id]: { ...draft, sortOrder: Number(event.target.value) } }))} />
            <label><input type="checkbox" checked={draft.isActive} onChange={(event) => setSectionEdits((current) => ({ ...current, [section.id]: { ...draft, isActive: event.target.checked } }))} /> Active</label>
          </div>
        ) : null}
        <div className="support-section-field-list">
          {sortFields(section.fields).map((field, fieldIndex) => renderFieldRow(field, section.id, fieldIndex))}
          {section.fields.length === 0 ? <p className="muted">Drop fields here or add a new field to this section.</p> : null}
        </div>
      </div>
    );
  }

  function renderFieldRow(field: SupportPortalField, sectionId: string, fieldIndex: number) {
    const draft = fieldEdits[field.id] ?? fieldToDraft(field, fallbackSectionId);
    const editing = editingFieldId === field.id;
    return (
      <div
        className={`support-field-row ${draggedFieldId === field.id ? "dragging" : ""}`}
        key={field.id}
        draggable={!editing}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          setDraggedFieldId(field.id);
        }}
        onDragEnd={() => setDraggedFieldId(null)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => handleFieldDrop(event, sectionId, fieldIndex)}
      >
        <div className="support-field-summary">
          <span className="drag-handle" aria-hidden="true"><GripVertical size={16} /></span>
          <div>
            <strong>{field.label}</strong>
            <span>{field.fieldKey} - {label(field.type)} {field.isCore ? "- Core" : ""}</span>
          </div>
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
  }

  function renderPreviewIcon(section: SupportPortalSection): ReactNode {
    if (section.icon === "building") return "Building";
    if (section.icon === "mail") return "Mail";
    if (section.icon === "clipboard") return "Clipboard";
    if (section.icon === "user") return "User";
    return "Section";
  }

  if (!config || !settingsDraft) {
    return <section className="panel support-portal-config-panel">{error ? <p className="form-error">{error}</p> : "Loading support portal settings..."}</section>;
  }

  return (
    <section className="panel support-portal-config-panel">
      <div className="panel-header-row">
        <div>
          <h2>Support Portal</h2>
          <p>Configure the public ticket request portal, sections, form fields, conditional logic, and verification.</p>
        </div>
        <span className={`status-pill ${settingsDraft.supportPortalEnabled ? "active" : "inactive"}`}>{settingsDraft.supportPortalEnabled ? "Enabled" : "Disabled"}</span>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-success">{notice}</p> : null}
      <div className="settings-tabs">
        <button className={activeTab === "form" ? "active" : ""} onClick={() => setActiveTab("form")} type="button">Form Builder</button>
        <button className={activeTab === "preview" ? "active" : ""} onClick={() => setActiveTab("preview")} type="button"><Eye size={15} /> Preview</button>
        <button className={activeTab === "security" ? "active" : ""} onClick={() => setActiveTab("security")} type="button"><ShieldCheck size={15} /> Security</button>
      </div>

      {activeTab === "form" ? (
        <div className="support-config-stack">
          <div className="support-settings-grid">
            <label><input type="checkbox" checked={settingsDraft.supportPortalEnabled} onChange={(event) => setSettingsDraft({ ...settingsDraft, supportPortalEnabled: event.target.checked })} /> Enable public support portal</label>
            <label>Portal title<input value={settingsDraft.supportPortalTitle} onChange={(event) => setSettingsDraft({ ...settingsDraft, supportPortalTitle: event.target.value })} /></label>
            <label>Browser title<input value={settingsDraft.supportPortalBrowserTitle} onChange={(event) => setSettingsDraft({ ...settingsDraft, supportPortalBrowserTitle: event.target.value })} /></label>
            <label>Browser tab preview<input readOnly value={`${branding.applicationName} - ${settingsDraft.supportPortalBrowserTitle || "Support Portal"}`} /></label>
            <label className="span-2">Intro text<textarea value={settingsDraft.supportPortalIntroText ?? ""} onChange={(event) => setSettingsDraft({ ...settingsDraft, supportPortalIntroText: event.target.value })} /></label>
            <label className="span-2">Success message<textarea value={settingsDraft.supportPortalSuccessMessage ?? ""} onChange={(event) => setSettingsDraft({ ...settingsDraft, supportPortalSuccessMessage: event.target.value })} /></label>
            <button className="button" type="button" disabled={busy === "settings"} onClick={saveSettings}><Save size={15} /> Save Portal Settings</button>
          </div>

          <div className="settings-table-toolbar support-builder-toolbar">
            <div><strong>Form structure</strong><span className="muted">{sortedSections.length} sections · {sortedFields.length} fields</span></div>
            <div className="form-actions">
              <button className="button secondary compact-button" type="button" onClick={() => { setShowSectionCreate((open) => !open); setShowFieldCreate(false); }}><Plus size={15} /> Add Section</button>
              <button className="button compact-button" type="button" onClick={() => { setShowFieldCreate((open) => !open); setShowSectionCreate(false); }}><Plus size={15} /> Add Field</button>
            </div>
          </div>

          {showSectionCreate ? <div className="support-field-create settings-create-panel">
            <h3>Add Section</h3>
            <div className="support-section-edit-grid">
              <input value={sectionDraft.title} placeholder="Section title" onChange={(event) => setSectionDraft((current) => ({ ...current, title: event.target.value }))} />
              <select value={sectionDraft.icon} onChange={(event) => setSectionDraft((current) => ({ ...current, icon: event.target.value }))}>
                {sectionIcons.map((icon) => <option key={icon} value={icon}>{label(icon)}</option>)}
              </select>
              <input type="number" min="0" value={sectionDraft.sortOrder} onChange={(event) => setSectionDraft((current) => ({ ...current, sortOrder: Number(event.target.value) }))} />
              <label><input type="checkbox" checked={sectionDraft.isActive} onChange={(event) => setSectionDraft((current) => ({ ...current, isActive: event.target.checked }))} /> Active</label>
            </div>
            <div className="form-actions"><button className="button secondary" type="button" onClick={() => setShowSectionCreate(false)}>Cancel</button><button className="button" type="button" disabled={busy === "create-section"} onClick={createSection}><Plus size={15} /> Add Section</button></div>
          </div> : null}

          {showFieldCreate ? <div className="support-field-create settings-create-panel">
            <h3>Add Field</h3>
            {renderFieldDraftControls(fieldDraft, setFieldDraft)}
            <div className="form-actions"><button className="button secondary" type="button" onClick={() => setShowFieldCreate(false)}>Cancel</button><button className="button" type="button" disabled={busy === "create-field"} onClick={createField}><Plus size={15} /> Add Field</button></div>
          </div> : null}

          <div className="support-section-list">
            {sortedSections.map((section, index) => renderSectionEditor(section, index))}
          </div>
        </div>
      ) : null}

      {activeTab === "preview" ? (
        <div className="support-preview-card">
          <h3>{settingsDraft.supportPortalTitle}</h3>
          <p>{settingsDraft.supportPortalIntroText || config.form.introText}</p>
          {sortedSections.filter((section) => section.isActive).map((section) => (
            <div className="support-preview-section" key={section.id}>
              <h4>{renderPreviewIcon(section)} - {section.title}</h4>
              <div className="support-preview-grid">
                {sortFields(section.fields).filter((field) => field.isActive).slice(0, 12).map((field) => (
                  <label className={`support-layout-${field.layoutWidth?.toLowerCase() ?? "half"}`} key={field.id}>{field.label}{field.isRequired ? " *" : ""}<input disabled placeholder={field.placeholder ?? ""} /></label>
                ))}
              </div>
            </div>
          ))}
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
