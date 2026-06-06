"use client";

import { CalendarDays, CheckCircle2, ClipboardList, MessageSquare, Plus, RefreshCw, Save, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type EventStatus = "NEW" | "UNDER_REVIEW" | "SCHEDULED" | "ASSIGNED" | "IN_PROGRESS" | "WAITING_ON_CLIENT" | "WAITING_ON_INTERNAL_TEAM" | "COMPLETED" | "CANCELLED" | "CONVERTED_TO_TICKET";
type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELLED";
type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT" | "CRITICAL";

interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface TicketTeam {
  id: string;
  name: string;
}

interface EventServiceCatalogItem {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  isActive: boolean;
  defaultTeamId: string | null;
  defaultUserIds: string[];
}

interface EventServiceRequest {
  id: string;
  trackingNumber: string;
  eventName: string;
  organizer: string | null;
  venue: string | null;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  requesterFirstName: string;
  requesterLastName: string;
  requesterEmail: string;
  requesterPhone: string | null;
  status: EventStatus;
  priority: Priority;
  progressPercent: number;
  additionalInfo: string | null;
  createdAt: string;
  updatedAt: string;
  client: { id: string; name: string; shortName: string | null } | null;
  assignedTeam: TicketTeam | null;
  services: Array<{ service: EventServiceCatalogItem }>;
  assignees: Array<{ user: UserOption; role: string | null }>;
  tasks: Array<{ id: string; title: string; description: string | null; status: TaskStatus; progressPercent: number; assignedUser: UserOption | null }>;
  comments?: Array<{ id: string; body: string; createdAt: string; user: UserOption | null }>;
}

const statuses: EventStatus[] = ["NEW", "UNDER_REVIEW", "SCHEDULED", "ASSIGNED", "IN_PROGRESS", "WAITING_ON_CLIENT", "WAITING_ON_INTERNAL_TEAM", "COMPLETED", "CANCELLED", "CONVERTED_TO_TICKET"];
const taskStatuses: TaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"];
const priorities: Priority[] = ["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"];

function label(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function userName(user: UserOption | null) {
  return user ? `${user.firstName} ${user.lastName}`.trim() || user.email : "Unassigned";
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "No date";
}

export function EventServicesWorkspace() {
  const [requests, setRequests] = useState<EventServiceRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<EventServiceRequest | null>(null);
  const [services, setServices] = useState<EventServiceCatalogItem[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [teams, setTeams] = useState<TicketTeam[]>([]);
  const [filters, setFilters] = useState({ search: "", status: "", assignedUserId: "", assignedTeamId: "", serviceId: "" });
  const [draft, setDraft] = useState({ status: "NEW" as EventStatus, priority: "NORMAL" as Priority, progressPercent: 0, assignedTeamId: "", assignedUserIds: [] as string[], additionalInfo: "" });
  const [taskDraft, setTaskDraft] = useState({ title: "", assignedUserId: "", description: "" });
  const [commentDraft, setCommentDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const summary = useMemo(() => ({
    total: requests.length,
    newRequests: requests.filter((item) => item.status === "NEW").length,
    assigned: requests.filter((item) => item.status === "ASSIGNED" || item.status === "IN_PROGRESS").length,
    completed: requests.filter((item) => item.status === "COMPLETED").length
  }), [requests]);

  async function loadData(nextFilters = filters) {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    Object.entries(nextFilters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    try {
      const [requestData, serviceData, userData, teamData] = await Promise.all([
        apiFetch<EventServiceRequest[]>(`/event-services?${params.toString()}`),
        apiFetch<EventServiceCatalogItem[]>("/event-services/services"),
        apiFetch<UserOption[]>("/users"),
        apiFetch<TicketTeam[]>("/ticket-teams")
      ]);
      setRequests(requestData);
      setServices(serviceData);
      setUsers(userData);
      setTeams(teamData);
      if (!selectedId && requestData[0]) {
        setSelectedId(requestData[0].id);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Event & Services.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSelected(id: string | null) {
    if (!id) {
      setSelected(null);
      return;
    }
    try {
      const item = await apiFetch<EventServiceRequest>(`/event-services/${id}`);
      setSelected(item);
      setDraft({
        status: item.status,
        priority: item.priority,
        progressPercent: item.progressPercent,
        assignedTeamId: item.assignedTeam?.id ?? "",
        assignedUserIds: item.assignees.map((assignee) => assignee.user.id),
        additionalInfo: item.additionalInfo ?? ""
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load request detail.");
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    void loadSelected(selectedId);
  }, [selectedId]);

  async function saveRequest() {
    if (!selected) return;
    setBusy("request");
    setError(null);
    try {
      const updated = await apiFetch<EventServiceRequest>(`/event-services/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...draft, assignedTeamId: draft.assignedTeamId || null })
      });
      setSelected(updated);
      setNotice("Event request saved.");
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save event request.");
    } finally {
      setBusy(null);
    }
  }

  async function createTask() {
    if (!selected || !taskDraft.title.trim()) return;
    setBusy("task");
    try {
      await apiFetch(`/event-services/${selected.id}/tasks`, {
        method: "POST",
        body: JSON.stringify({ ...taskDraft, assignedUserId: taskDraft.assignedUserId || null })
      });
      setTaskDraft({ title: "", assignedUserId: "", description: "" });
      await loadSelected(selected.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create task.");
    } finally {
      setBusy(null);
    }
  }

  async function updateTask(taskId: string, patch: Partial<{ status: TaskStatus; progressPercent: number; assignedUserId: string }>) {
    if (!selected) return;
    await apiFetch(`/event-services/${selected.id}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
    await loadSelected(selected.id);
    await loadData();
  }

  async function addComment() {
    if (!selected || !commentDraft.trim()) return;
    setBusy("comment");
    try {
      await apiFetch(`/event-services/${selected.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: commentDraft })
      });
      setCommentDraft("");
      await loadSelected(selected.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add comment.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="event-services-page">
      <div className="page-title-row">
        <div>
          <h1>Event & Services</h1>
          <p className="muted">Manage event requests, service assignments, task progress, and public scheduling intake.</p>
        </div>
        <button className="button secondary" type="button" onClick={() => void loadData()} disabled={loading}>
          <RefreshCw size={16} aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </div>
      {error ? <div className="alert error">{error}</div> : null}
      {notice ? <div className="alert success">{notice}</div> : null}

      <section className="dashboard-kpi-grid event-kpi-grid">
        <div className="dashboard-kpi-card"><ClipboardList size={18} /><span>Total Requests</span><strong>{summary.total}</strong><small>Current filtered view</small></div>
        <div className="dashboard-kpi-card"><CalendarDays size={18} /><span>New</span><strong>{summary.newRequests}</strong><small>Needs review</small></div>
        <div className="dashboard-kpi-card"><UsersRound size={18} /><span>Assigned / Active</span><strong>{summary.assigned}</strong><small>Team workload</small></div>
        <div className="dashboard-kpi-card"><CheckCircle2 size={18} /><span>Completed</span><strong>{summary.completed}</strong><small>Finished events</small></div>
      </section>

      <section className="panel event-filter-panel">
        <input className="input" placeholder="Search tracking, event, requester, venue..." value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
        <select className="input" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
          <option value="">All statuses</option>
          {statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
        </select>
        <select className="input" value={filters.serviceId} onChange={(event) => setFilters((current) => ({ ...current, serviceId: event.target.value }))}>
          <option value="">All services</option>
          {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
        </select>
        <select className="input" value={filters.assignedUserId} onChange={(event) => setFilters((current) => ({ ...current, assignedUserId: event.target.value }))}>
          <option value="">All technicians</option>
          {users.map((user) => <option key={user.id} value={user.id}>{userName(user)}</option>)}
        </select>
        <button className="button" type="button" onClick={() => void loadData(filters)}>Apply Filters</button>
      </section>

      <div className="event-services-layout">
        <section className="panel event-request-list">
          <h2>Requests</h2>
          {requests.length === 0 ? <p className="muted">{loading ? "Loading requests..." : "No event requests match the filters."}</p> : null}
          {requests.map((request) => (
            <button className={`event-request-row${selectedId === request.id ? " active" : ""}`} type="button" key={request.id} onClick={() => setSelectedId(request.id)}>
              <span>
                <strong>{request.trackingNumber}</strong>
                <span>{request.eventName}</span>
                <small>{request.requesterFirstName} {request.requesterLastName} - {formatDate(request.eventDate)}</small>
              </span>
              <span className={`status-pill status-${request.status.toLowerCase().replaceAll("_", "-")}`}>{label(request.status)}</span>
            </button>
          ))}
        </section>

        <section className="panel event-detail-panel">
          {selected ? (
            <>
              <div className="section-heading">
                <div>
                  <h2>{selected.trackingNumber}</h2>
                  <p className="muted">{selected.eventName}</p>
                </div>
                <span className="count-pill">{selected.progressPercent}%</span>
              </div>
              <div className="event-detail-grid">
                <div><span className="muted">Requester</span><strong>{selected.requesterFirstName} {selected.requesterLastName}</strong><small>{selected.requesterEmail}</small></div>
                <div><span className="muted">Client</span><strong>{selected.client?.name ?? "Unmapped / no client"}</strong></div>
                <div><span className="muted">Date</span><strong>{formatDate(selected.eventDate)}</strong><small>{selected.startTime ?? "--"} - {selected.endTime ?? "--"}</small></div>
                <div><span className="muted">Services</span><strong>{selected.services.map((item) => item.service.name).join(", ") || "None"}</strong></div>
              </div>

              <div className="event-management-grid">
                <label>Status<select className="input" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as EventStatus }))}>{statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></label>
                <label>Priority<select className="input" value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as Priority }))}>{priorities.map((priority) => <option key={priority} value={priority}>{label(priority)}</option>)}</select></label>
                <label>Progress<input className="input" type="number" min={0} max={100} value={draft.progressPercent} onChange={(event) => setDraft((current) => ({ ...current, progressPercent: Number(event.target.value) }))} /></label>
                <label>Team<select className="input" value={draft.assignedTeamId} onChange={(event) => setDraft((current) => ({ ...current, assignedTeamId: event.target.value }))}><option value="">No team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
              </div>
              <div className="event-assignee-picker">
                <strong>Technicians</strong>
                {users.map((user) => (
                  <label key={user.id}>
                    <input
                      type="checkbox"
                      checked={draft.assignedUserIds.includes(user.id)}
                      onChange={(event) => setDraft((current) => ({ ...current, assignedUserIds: event.target.checked ? [...current.assignedUserIds, user.id] : current.assignedUserIds.filter((id) => id !== user.id) }))}
                    />
                    {userName(user)}
                  </label>
                ))}
              </div>
              <label>Internal notes / additional info<textarea className="input" value={draft.additionalInfo} onChange={(event) => setDraft((current) => ({ ...current, additionalInfo: event.target.value }))} /></label>
              <button className="button" type="button" onClick={saveRequest} disabled={busy === "request"}><Save size={16} />Save Request</button>

              <div className="event-detail-columns">
                <div className="nested-panel">
                  <h3>Tasks</h3>
                  <div className="event-task-create">
                    <input className="input" placeholder="Task title" value={taskDraft.title} onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))} />
                    <select className="input" value={taskDraft.assignedUserId} onChange={(event) => setTaskDraft((current) => ({ ...current, assignedUserId: event.target.value }))}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{userName(user)}</option>)}</select>
                    <button className="button secondary" type="button" onClick={createTask} disabled={busy === "task"}><Plus size={16} />Add</button>
                  </div>
                  {selected.tasks.map((task) => (
                    <div className="event-task-row" key={task.id}>
                      <strong>{task.title}</strong>
                      <select className="input" value={task.status} onChange={(event) => void updateTask(task.id, { status: event.target.value as TaskStatus })}>{taskStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select>
                      <input className="input" type="number" min={0} max={100} value={task.progressPercent} onChange={(event) => void updateTask(task.id, { progressPercent: Number(event.target.value) })} />
                      <small>{userName(task.assignedUser)}</small>
                    </div>
                  ))}
                </div>
                <div className="nested-panel">
                  <h3><MessageSquare size={16} />Comments</h3>
                  <textarea className="input" placeholder="Add internal comment..." value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} />
                  <button className="button secondary" type="button" onClick={addComment} disabled={busy === "comment"}>Add Comment</button>
                  {selected.comments?.map((comment) => (
                    <div className="event-comment" key={comment.id}><strong>{userName(comment.user)}</strong><p>{comment.body}</p><small>{new Date(comment.createdAt).toLocaleString()}</small></div>
                  ))}
                </div>
              </div>
            </>
          ) : <p className="muted">Select a request to review details.</p>}
        </section>
      </div>
    </div>
  );
}
