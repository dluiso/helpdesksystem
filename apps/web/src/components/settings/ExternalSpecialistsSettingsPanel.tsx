"use client";

import { Pencil, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

interface ExternalSpecialist {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const emptyDraft = {
  name: "",
  email: "",
  phone: "",
  company: "",
  notes: "",
  isActive: true
};

function specialistLabel(specialist: ExternalSpecialist) {
  return `${specialist.name}${specialist.company ? ` (${specialist.company})` : ""}`;
}

export function ExternalSpecialistsSettingsPanel() {
  const [specialists, setSpecialists] = useState<ExternalSpecialist[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeCount = useMemo(() => specialists.filter((specialist) => specialist.isActive).length, [specialists]);
  const editingSpecialist = specialists.find((specialist) => specialist.id === editingId) ?? null;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setSpecialists(await apiFetch<ExternalSpecialist[]>("/external-specialists"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load external specialists.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function resetDraft() {
    setDraft(emptyDraft);
    setEditingId(null);
  }

  function startEdit(specialist: ExternalSpecialist) {
    setEditingId(specialist.id);
    setDraft({
      name: specialist.name,
      email: specialist.email,
      phone: specialist.phone ?? "",
      company: specialist.company ?? "",
      notes: specialist.notes ?? "",
      isActive: specialist.isActive
    });
  }

  async function save() {
    if (!draft.name.trim() || !draft.email.trim()) return;
    setBusy("save");
    setNotice(null);
    setError(null);
    try {
      const saved = await apiFetch<ExternalSpecialist>(editingId ? `/external-specialists/${editingId}` : "/external-specialists", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(draft)
      });
      setSpecialists((current) => {
        const withoutSaved = current.filter((specialist) => specialist.id !== saved.id);
        return [saved, ...withoutSaved].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
      });
      setNotice(editingId ? "External specialist updated." : "External specialist added.");
      resetDraft();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save external specialist.");
    } finally {
      setBusy(null);
    }
  }

  async function archive(specialist: ExternalSpecialist) {
    if (!window.confirm(`Archive ${specialistLabel(specialist)}? Existing tickets and events keep their assignment history.`)) return;
    setBusy(`archive-${specialist.id}`);
    setNotice(null);
    setError(null);
    try {
      await apiFetch(`/external-specialists/${specialist.id}`, { method: "DELETE" });
      setSpecialists((current) => current.filter((item) => item.id !== specialist.id));
      if (editingId === specialist.id) resetDraft();
      setNotice("External specialist archived.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to archive external specialist.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel external-specialists-settings">
      <div className="section-heading compact-heading">
        <div>
          <h2>External Specialists</h2>
          <p className="muted">Manage outside technicians and specialists used by tickets and event service tasks.</p>
        </div>
        <button className="button secondary" type="button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={16} aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </div>

      {error ? <div className="alert error">{error}</div> : null}
      {notice ? <div className="alert success">{notice}</div> : null}

      <div className="settings-summary-grid compact-summary">
        <div className="settings-summary-card">
          <span>Active</span>
          <strong>{activeCount}</strong>
          <small>Available for assignment</small>
        </div>
        <div className="settings-summary-card">
          <span>Total</span>
          <strong>{specialists.length}</strong>
          <small>External contacts</small>
        </div>
      </div>

      <div className="settings-section external-specialist-editor">
        <div className="section-heading compact-heading">
          <div>
            <h3>{editingSpecialist ? "Edit Contact" : "Add Contact"}</h3>
            <p className="muted">{editingSpecialist ? specialistLabel(editingSpecialist) : "Create a reusable external specialist profile."}</p>
          </div>
          {editingSpecialist ? (
            <button className="button secondary" type="button" onClick={resetDraft}>
              <X size={16} aria-hidden="true" />
              <span>Cancel Edit</span>
            </button>
          ) : null}
        </div>
        <div className="event-external-create-grid">
          <label>Name<input className="input" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
          <label>Email<input className="input" type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} /></label>
          <label>Phone<input className="input" value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} /></label>
          <label>Company<input className="input" value={draft.company} onChange={(event) => setDraft((current) => ({ ...current, company: event.target.value }))} /></label>
          <label className="span-2">Notes<textarea className="input" value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} /></label>
          <label className="checkbox-row span-2">
            <input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))} />
            Available for new assignments
          </label>
          <button className="button span-2" type="button" onClick={() => void save()} disabled={busy === "save" || !draft.name.trim() || !draft.email.trim()}>
            {editingSpecialist ? <Save size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
            <span>{busy === "save" ? "Saving..." : editingSpecialist ? "Save Contact" : "Add Contact"}</span>
          </button>
        </div>
      </div>

      <div className="table-scroll settings-section">
        <table className="tickets-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Phone</th><th>Company</th><th>Status</th><th>Updated</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {specialists.map((specialist) => (
              <tr key={specialist.id}>
                <td><strong>{specialist.name}</strong>{specialist.notes ? <small className="muted table-subtext">{specialist.notes}</small> : null}</td>
                <td>{specialist.email}</td>
                <td>{specialist.phone ?? "Not set"}</td>
                <td>{specialist.company ?? "Not set"}</td>
                <td><span className={`status-pill ${specialist.isActive ? "success" : "muted-pill"}`}>{specialist.isActive ? "Active" : "Inactive"}</span></td>
                <td>{new Date(specialist.updatedAt).toLocaleDateString()}</td>
                <td>
                  <div className="table-action-row">
                    <button className="icon-button" type="button" onClick={() => startEdit(specialist)} aria-label={`Edit ${specialist.name}`}>
                      <Pencil size={15} aria-hidden="true" />
                    </button>
                    <button className="icon-button danger" type="button" onClick={() => void archive(specialist)} disabled={busy === `archive-${specialist.id}`} aria-label={`Archive ${specialist.name}`}>
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!specialists.length ? (
              <tr><td colSpan={7} className="muted">{loading ? "Loading external specialists..." : "No external specialists yet."}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
