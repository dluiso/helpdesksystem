"use client";

import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type ProjectStatus = "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED";
type ProjectHealth = "ON_TRACK" | "AT_RISK" | "OFF_TRACK";

interface ProjectDraft {
  name: string;
  description: string;
  clientId: string;
  ownerId: string;
  status: ProjectStatus;
  health: ProjectHealth;
  startAt: string;
  targetDate: string;
}

interface ProjectOptionsResponse {
  clients: Array<{ id: string; name: string }>;
  assignableUsers: Array<{ id: string; firstName: string; lastName: string }>;
  capabilities: { create: boolean };
}

const initialDraft: ProjectDraft = { name: "", description: "", clientId: "", ownerId: "", status: "PLANNING", health: "ON_TRACK", startAt: "", targetDate: "" };

function label(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export function ProjectCreateWorkspace() {
  const router = useRouter();
  const [options, setOptions] = useState<ProjectOptionsResponse | null>(null);
  const [draft, setDraft] = useState<ProjectDraft>(initialDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setOptions(await apiFetch<ProjectOptionsResponse>("/projects"));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to load project options.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const updateDraft = (field: keyof ProjectDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim() || !options?.capabilities.create) return;
    setSaving(true);
    setError("");
    try {
      const project = await apiFetch<{ id: string }>("/projects", {
        method: "POST",
        body: JSON.stringify({ ...draft, clientId: draft.clientId || null, ownerId: draft.ownerId || null, startAt: draft.startAt || null, targetDate: draft.targetDate || null }),
      });
      router.push(`/projects?project=${project.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create project.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="project-create-workspace">
      {error ? <div className="alert error">{error}</div> : null}
      {!loading && options && !options.capabilities.create ? <div className="alert error">You do not have permission to create projects.</div> : null}
      <form className="panel project-create-form" onSubmit={(event) => void submit(event)}>
        <div className="project-create-form-heading">
          <div><h2>Project setup</h2><p>Define ownership, delivery dates, and the initial operating state.</p></div>
          <Link className="button secondary" href="/projects"><ArrowLeft size={15} aria-hidden="true" /> Back to portfolio</Link>
        </div>
        <div className="projects-fields project-create-fields">
          <label><span>Name</span><input className="input" value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} maxLength={180} autoFocus required /></label>
          <label><span>Client</span><select className="input" value={draft.clientId} onChange={(event) => updateDraft("clientId", event.target.value)}><option value="">Internal / no client</option>{(options?.clients ?? []).map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label>
          <label><span>Project owner</span><select className="input" value={draft.ownerId} onChange={(event) => updateDraft("ownerId", event.target.value)}><option value="">Unassigned</option>{(options?.assignableUsers ?? []).map((owner) => <option value={owner.id} key={owner.id}>{owner.firstName} {owner.lastName}</option>)}</select></label>
          <label><span>Status</span><select className="input" value={draft.status} onChange={(event) => updateDraft("status", event.target.value)}>{(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"] as ProjectStatus[]).map((status) => <option value={status} key={status}>{label(status)}</option>)}</select></label>
          <label><span>Health</span><select className="input" value={draft.health} onChange={(event) => updateDraft("health", event.target.value)}>{(["ON_TRACK", "AT_RISK", "OFF_TRACK"] as ProjectHealth[]).map((health) => <option value={health} key={health}>{label(health)}</option>)}</select></label>
          <label><span>Start date</span><input className="input" type="date" value={draft.startAt} onChange={(event) => updateDraft("startAt", event.target.value)} /></label>
          <label><span>Target date</span><input className="input" type="date" value={draft.targetDate} onChange={(event) => updateDraft("targetDate", event.target.value)} /></label>
          <label className="projects-field-wide"><span>Description</span><textarea className="input" value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} maxLength={4000} placeholder="Scope, expected outcome, or delivery context" /></label>
        </div>
        <div className="project-create-actions"><Link className="button secondary" href="/projects">Cancel</Link><button className="button" type="submit" disabled={loading || saving || !draft.name.trim() || !options?.capabilities.create}><Save size={16} aria-hidden="true" /> {saving ? "Creating..." : "Create Project"}</button></div>
      </form>
    </div>
  );
}
