"use client";

import { AlertTriangle, FolderKanban, Link2, Milestone, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type ProjectStatus = "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED";
type ProjectHealth = "ON_TRACK" | "AT_RISK" | "OFF_TRACK";
type MilestoneStatus = "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";

interface ProjectMilestone {
  id: string;
  title: string;
  description: string | null;
  status: MilestoneStatus;
  dueAt: string | null;
}

interface ProjectWorkItem {
  id: string;
  ticket: { id: string; ticketNumber: string; subject: string; status: string; priority: string } | null;
  eventServiceRequest: { id: string; trackingNumber: string; eventName: string; status: string; priority: string; eventDate: string | null } | null;
}

interface ProjectDependency {
  id: string;
  dependsOnProject: { id: string; name: string; status: ProjectStatus; health: ProjectHealth; targetDate: string | null };
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  health: ProjectHealth;
  startAt: string | null;
  targetDate: string | null;
  client: { id: string; name: string } | null;
  owner: { id: string; firstName: string; lastName: string } | null;
  milestones: ProjectMilestone[];
  workItems: ProjectWorkItem[];
  dependencies: ProjectDependency[];
}

interface ProjectsResponse {
  items: Project[];
  clients: Array<{ id: string; name: string }>;
  capabilities: { create: boolean; update: boolean; delete: boolean };
}

interface ProjectDraft {
  name: string;
  description: string;
  clientId: string;
  status: ProjectStatus;
  health: ProjectHealth;
  startAt: string;
  targetDate: string;
}

const emptyDraft: ProjectDraft = { name: "", description: "", clientId: "", status: "PLANNING", health: "ON_TRACK", startAt: "", targetDate: "" };

function label(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function toDateInput(value: string | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "-";
}

function draftFromProject(project: Project): ProjectDraft {
  return { name: project.name, description: project.description ?? "", clientId: project.client?.id ?? "", status: project.status, health: project.health, startAt: toDateInput(project.startAt), targetDate: toDateInput(project.targetDate) };
}

export function ProjectsWorkspace() {
  const [data, setData] = useState<ProjectsResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProjectDraft>(emptyDraft);
  const [showCreate, setShowCreate] = useState(false);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDueAt, setMilestoneDueAt] = useState("");
  const [linkType, setLinkType] = useState<"TICKET" | "EVENT_SERVICE">("TICKET");
  const [linkReference, setLinkReference] = useState("");
  const [dependencyProjectId, setDependencyProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selected = useMemo(() => data?.items.find((item) => item.id === selectedId) ?? null, [data, selectedId]);

  const selectProject = (project: Project | null) => {
    setSelectedId(project?.id ?? null);
    setDraft(project ? draftFromProject(project) : emptyDraft);
    setMilestoneTitle("");
    setMilestoneDueAt("");
    setLinkReference("");
    setDependencyProjectId("");
  };

  const load = async (preferredProjectId?: string | null) => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch<ProjectsResponse>("/projects");
      setData(response);
      const next = response.items.find((project) => project.id === (preferredProjectId ?? selectedId)) ?? response.items[0] ?? null;
      selectProject(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load projects.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const updateDraft = (field: keyof ProjectDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }));

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const project = await apiFetch<Project>("/projects", { method: "POST", body: JSON.stringify({ ...draft, clientId: draft.clientId || null, startAt: draft.startAt || null, targetDate: draft.targetDate || null }) });
      setShowCreate(false);
      await load(project.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create project.");
    } finally {
      setSaving(false);
    }
  };

  const saveProject = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/projects/${selected.id}`, { method: "PATCH", body: JSON.stringify({ ...draft, clientId: draft.clientId || null, startAt: draft.startAt || null, targetDate: draft.targetDate || null }) });
      await load(selected.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save project.");
    } finally {
      setSaving(false);
    }
  };

  const addMilestone = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !milestoneTitle.trim()) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/projects/${selected.id}/milestones`, { method: "POST", body: JSON.stringify({ title: milestoneTitle, dueAt: milestoneDueAt || null }) });
      await load(selected.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add milestone.");
    } finally {
      setSaving(false);
    }
  };

  const updateMilestoneStatus = async (milestone: ProjectMilestone, status: MilestoneStatus) => {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/projects/${selected.id}/milestones/${milestone.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load(selected.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update milestone.");
    } finally {
      setSaving(false);
    }
  };

  const removeMilestone = async (milestoneId: string) => {
    if (!selected || !window.confirm("Remove this milestone from the project?")) return;
    setSaving(true);
    try {
      await apiFetch(`/projects/${selected.id}/milestones/${milestoneId}`, { method: "DELETE" });
      await load(selected.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove milestone.");
    } finally {
      setSaving(false);
    }
  };

  const addWorkItem = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !linkReference.trim()) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/projects/${selected.id}/work-items`, { method: "POST", body: JSON.stringify({ sourceType: linkType, reference: linkReference }) });
      await load(selected.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to link work item.");
    } finally {
      setSaving(false);
    }
  };

  const removeWorkItem = async (workItemId: string) => {
    if (!selected || !window.confirm("Remove this linked item from the project?")) return;
    setSaving(true);
    try {
      await apiFetch(`/projects/${selected.id}/work-items/${workItemId}`, { method: "DELETE" });
      await load(selected.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove linked work item.");
    } finally {
      setSaving(false);
    }
  };

  const removeProject = async () => {
    if (!selected || !window.confirm(`Archive project "${selected.name}"?`)) return;
    setSaving(true);
    try {
      await apiFetch(`/projects/${selected.id}`, { method: "DELETE" });
      await load(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to archive project.");
    } finally {
      setSaving(false);
    }
  };

  const addDependency = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !dependencyProjectId) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/projects/${selected.id}/dependencies`, { method: "POST", body: JSON.stringify({ dependsOnProjectId: dependencyProjectId }) });
      await load(selected.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add project dependency.");
    } finally {
      setSaving(false);
    }
  };

  const removeDependency = async (dependencyId: string) => {
    if (!selected || !window.confirm("Remove this project dependency?")) return;
    setSaving(true);
    try {
      await apiFetch(`/projects/${selected.id}/dependencies/${dependencyId}`, { method: "DELETE" });
      await load(selected.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove project dependency.");
    } finally {
      setSaving(false);
    }
  };

  const blockedDependencies = selected?.dependencies.filter((dependency) => dependency.dependsOnProject.status !== "COMPLETED") ?? [];
  const availableDependencies = (data?.items ?? []).filter((project) => project.id !== selected?.id && !selected?.dependencies.some((dependency) => dependency.dependsOnProject.id === project.id));

  return (
    <div className="projects-workspace">
      <div className="projects-toolbar panel">
        <div><strong>Project portfolio</strong><span className="muted">Projects coordinate existing work without changing its source ownership.</span></div>
        <div className="projects-toolbar-actions">
          <button className="button secondary icon-button" type="button" onClick={() => void load()} disabled={loading} title="Refresh projects" aria-label="Refresh projects"><RefreshCw size={16} className={loading ? "spin" : ""} aria-hidden="true" /></button>
          {data?.capabilities.create ? <button className="button" type="button" onClick={() => { setShowCreate(true); selectProject(null); }}><Plus size={16} aria-hidden="true" /> Add Project</button> : null}
        </div>
      </div>

      {error ? <div className="alert error">{error}</div> : null}

      {showCreate ? <form className="panel projects-create-panel" onSubmit={(event) => void submitCreate(event)}>
        <div className="section-heading"><div><h2>New project</h2><p>Create a planning container before linking operational work.</p></div><button className="button secondary icon-button" type="button" onClick={() => { setShowCreate(false); setDraft(selected ? draftFromProject(selected) : emptyDraft); }} title="Cancel" aria-label="Cancel"><X size={16} aria-hidden="true" /></button></div>
        <ProjectFields draft={draft} clients={data?.clients ?? []} onChange={updateDraft} />
        <div className="form-actions"><button className="button" type="submit" disabled={saving || !draft.name.trim()}><Save size={16} aria-hidden="true" /> Create Project</button></div>
      </form> : null}

      <div className="projects-layout">
        <section className="panel projects-list-panel">
          <div className="section-heading"><div><h2>Projects</h2><p>{data?.items.length ?? 0} active planning records</p></div></div>
          <div className="projects-list">
            {data?.items.map((project) => <button className={`projects-list-row${project.id === selected?.id ? " selected" : ""}`} type="button" key={project.id} onClick={() => selectProject(project)}><span className={`projects-health-dot ${project.health.toLowerCase()}`} aria-hidden="true" /><span><strong>{project.name}</strong><small>{project.client?.name ?? "Internal"} · {label(project.status)}</small></span><time>{formatDate(project.targetDate)}</time></button>)}
            {!loading && !data?.items.length ? <div className="dashboard-empty">No projects have been created.</div> : null}
          </div>
        </section>

        <section className="panel projects-detail-panel">
          {!selected ? <div className="projects-empty"><FolderKanban size={28} aria-hidden="true" /><h2>Select a project</h2><p>Create or select a project to manage milestones and linked work.</p></div> : <>
            <div className="section-heading projects-detail-heading"><div><h2>{selected.name}</h2><p>Owner: {selected.owner ? `${selected.owner.firstName} ${selected.owner.lastName}` : "Unassigned"}</p></div>{data?.capabilities.delete ? <button className="button secondary icon-button" type="button" onClick={() => void removeProject()} disabled={saving} title="Archive project" aria-label="Archive project"><Trash2 size={16} aria-hidden="true" /></button> : null}</div>
            {data?.capabilities.update ? <form className="projects-detail-form" onSubmit={(event) => void saveProject(event)}><ProjectFields draft={draft} clients={data?.clients ?? []} onChange={updateDraft} /><div className="form-actions"><button className="button" type="submit" disabled={saving || !draft.name.trim()}><Save size={16} aria-hidden="true" /> Save Plan</button></div></form> : null}

            {blockedDependencies.length ? <div className="projects-dependency-alert"><AlertTriangle size={17} aria-hidden="true" /><span>{blockedDependencies.length === 1 ? `Blocked by ${blockedDependencies[0].dependsOnProject.name}.` : `Blocked by ${blockedDependencies.length} incomplete project dependencies.`}</span></div> : null}

            <div className="projects-detail-section"><div className="projects-detail-section-heading"><Milestone size={17} aria-hidden="true" /><div><h3>Milestones</h3><p>Track the intended delivery checkpoints.</p></div></div>
              <div className="projects-milestone-list">{selected.milestones.map((milestone) => <div className="projects-milestone-row" key={milestone.id}><div><strong>{milestone.title}</strong><span>Due {formatDate(milestone.dueAt)}</span></div>{data?.capabilities.update ? <><select className="input" value={milestone.status} onChange={(event) => void updateMilestoneStatus(milestone, event.target.value as MilestoneStatus)} disabled={saving}>{(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED"] as MilestoneStatus[]).map((status) => <option value={status} key={status}>{label(status)}</option>)}</select><button className="button secondary icon-button" type="button" onClick={() => void removeMilestone(milestone.id)} disabled={saving} title="Remove milestone" aria-label={`Remove ${milestone.title}`}><Trash2 size={15} aria-hidden="true" /></button></> : <span>{label(milestone.status)}</span>}</div>)}{!selected.milestones.length ? <span className="muted">No milestones defined.</span> : null}</div>
              {data?.capabilities.update ? <form className="projects-inline-form" onSubmit={(event) => void addMilestone(event)}><input className="input" value={milestoneTitle} onChange={(event) => setMilestoneTitle(event.target.value)} placeholder="Milestone title" /><input className="input" type="date" value={milestoneDueAt} onChange={(event) => setMilestoneDueAt(event.target.value)} /><button className="button secondary" type="submit" disabled={saving || !milestoneTitle.trim()}><Plus size={15} aria-hidden="true" /> Add</button></form> : null}
            </div>

            <div className="projects-detail-section"><div className="projects-detail-section-heading"><Link2 size={17} aria-hidden="true" /><div><h3>Linked operational work</h3><p>Tickets and event requests remain managed in their source modules.</p></div></div>
              <div className="projects-work-list">{selected.workItems.map((workItem) => { const ticket = workItem.ticket; const event = workItem.eventServiceRequest; const href = ticket ? `/tickets/${ticket.ticketNumber}` : `/event-services/${event?.trackingNumber}`; const reference = ticket?.ticketNumber ?? event?.trackingNumber ?? "Unknown"; const title = ticket?.subject ?? event?.eventName ?? "Unavailable work item"; return <div className="projects-work-row" key={workItem.id}><div><Link href={href}>{reference}</Link><strong>{title}</strong><span>{label(ticket?.status ?? event?.status ?? "")}</span></div>{data?.capabilities.update ? <button className="button secondary icon-button" type="button" onClick={() => void removeWorkItem(workItem.id)} disabled={saving} title="Remove linked work" aria-label={`Remove ${reference}`}><Trash2 size={15} aria-hidden="true" /></button> : null}</div>; })}{!selected.workItems.length ? <span className="muted">No linked work items.</span> : null}</div>
              {data?.capabilities.update ? <form className="projects-inline-form projects-link-form" onSubmit={(event) => void addWorkItem(event)}><select className="input" value={linkType} onChange={(event) => setLinkType(event.target.value as "TICKET" | "EVENT_SERVICE")}><option value="TICKET">Ticket</option><option value="EVENT_SERVICE">Event request</option></select><input className="input" value={linkReference} onChange={(event) => setLinkReference(event.target.value)} placeholder={linkType === "TICKET" ? "AIT-100001 or ID" : "EVT-100001 or ID"} /><button className="button secondary" type="submit" disabled={saving || !linkReference.trim()}><Plus size={15} aria-hidden="true" /> Link</button></form> : null}
            </div>

            <div className="projects-detail-section"><div className="projects-detail-section-heading"><AlertTriangle size={17} aria-hidden="true" /><div><h3>Project dependencies</h3><p>Work that must be completed before this project can close safely.</p></div></div>
              <div className="projects-dependency-list">{selected.dependencies.map((dependency) => <div className="projects-dependency-row" key={dependency.id}><div><strong>{dependency.dependsOnProject.name}</strong><span>{label(dependency.dependsOnProject.status)} · Target {formatDate(dependency.dependsOnProject.targetDate)}</span></div>{data?.capabilities.update ? <button className="button secondary icon-button" type="button" onClick={() => void removeDependency(dependency.id)} disabled={saving} title="Remove dependency" aria-label={`Remove ${dependency.dependsOnProject.name}`}><Trash2 size={15} aria-hidden="true" /></button> : null}</div>)}{!selected.dependencies.length ? <span className="muted">No project dependencies.</span> : null}</div>
              {data?.capabilities.update && availableDependencies.length ? <form className="projects-inline-form projects-dependency-form" onSubmit={(event) => void addDependency(event)}><select className="input" value={dependencyProjectId} onChange={(event) => setDependencyProjectId(event.target.value)}><option value="">Select prerequisite project</option>{availableDependencies.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select><button className="button secondary" type="submit" disabled={saving || !dependencyProjectId}><Plus size={15} aria-hidden="true" /> Add dependency</button></form> : null}
            </div>
          </>}
        </section>
      </div>
    </div>
  );
}

function ProjectFields({ draft, clients, onChange }: { draft: ProjectDraft; clients: Array<{ id: string; name: string }>; onChange: (field: keyof ProjectDraft, value: string) => void }) {
  return <div className="projects-fields"><label><span>Name</span><input className="input" value={draft.name} onChange={(event) => onChange("name", event.target.value)} maxLength={180} required /></label><label><span>Client</span><select className="input" value={draft.clientId} onChange={(event) => onChange("clientId", event.target.value)}><option value="">Internal / no client</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label><label className="projects-field-wide"><span>Description</span><textarea className="input" value={draft.description} onChange={(event) => onChange("description", event.target.value)} maxLength={4000} /></label><label><span>Status</span><select className="input" value={draft.status} onChange={(event) => onChange("status", event.target.value)}>{(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"] as ProjectStatus[]).map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></label><label><span>Health</span><select className="input" value={draft.health} onChange={(event) => onChange("health", event.target.value)}>{(["ON_TRACK", "AT_RISK", "OFF_TRACK"] as ProjectHealth[]).map((health) => <option key={health} value={health}>{label(health)}</option>)}</select></label><label><span>Start date</span><input className="input" type="date" value={draft.startAt} onChange={(event) => onChange("startAt", event.target.value)} /></label><label><span>Target date</span><input className="input" type="date" value={draft.targetDate} onChange={(event) => onChange("targetDate", event.target.value)} /></label></div>;
}
