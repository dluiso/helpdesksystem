"use client";

import { CalendarDays, CheckCircle2, ClipboardList, MessageSquare, Plus, RefreshCw, RotateCcw, Save, Trash2, UsersRound, X } from "lucide-react";
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
  deletedAt?: string | null;
  client: { id: string; name: string; shortName: string | null } | null;
  assignedTeam: TicketTeam | null;
  services: Array<{ service: EventServiceCatalogItem }>;
  assignees: Array<{ user: UserOption; role: string | null }>;
  tasks: Array<{ id: string; title: string; description: string | null; status: TaskStatus; progressPercent: number; assignedUser: UserOption | null }>;
  comments?: Array<{ id: string; body: string; createdAt: string; user: UserOption | null }>;
}

interface EventServiceTaskAssignment {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  progressPercent: number;
  updatedAt: string;
  assignedUser: UserOption | null;
  request: EventServiceRequest;
}

const statuses: EventStatus[] = ["NEW", "UNDER_REVIEW", "SCHEDULED", "ASSIGNED", "IN_PROGRESS", "WAITING_ON_CLIENT", "WAITING_ON_INTERNAL_TEAM", "COMPLETED", "CANCELLED", "CONVERTED_TO_TICKET"];
const taskStatuses: TaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"];
const priorities: Priority[] = ["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"];

function label(value: string) {
  if (value === "TODO") return "To Do";
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function userName(user: UserOption | null) {
  return user ? `${user.firstName} ${user.lastName}`.trim() || user.email : "Unassigned";
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "No date";
}

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString(undefined, { month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" }) : "No date";
}

export function EventServicesWorkspace() {
  const [activeTab, setActiveTab] = useState<"requests" | "myTasks">("requests");
  const [requests, setRequests] = useState<EventServiceRequest[]>([]);
  const [myTasks, setMyTasks] = useState<EventServiceTaskAssignment[]>([]);
  const [myTaskDrafts, setMyTaskDrafts] = useState<Record<string, { status: TaskStatus; progressPercent: number; comment: string }>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<EventServiceRequest | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  const [recycledRequests, setRecycledRequests] = useState<EventServiceRequest[]>([]);
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
      const [requestData, myTaskData, serviceData, userData, teamData] = await Promise.all([
        apiFetch<EventServiceRequest[]>(`/event-services?${params.toString()}`),
        apiFetch<EventServiceTaskAssignment[]>("/event-services/my-tasks"),
        apiFetch<EventServiceCatalogItem[]>("/event-services/services"),
        apiFetch<UserOption[]>("/users"),
        apiFetch<TicketTeam[]>("/ticket-teams")
      ]);
      setRequests(requestData);
      setMyTasks(myTaskData);
      setMyTaskDrafts((current) => {
        const next: Record<string, { status: TaskStatus; progressPercent: number; comment: string }> = {};
        myTaskData.forEach((task) => {
          next[task.id] = current[task.id] ?? { status: task.status, progressPercent: task.progressPercent, comment: "" };
        });
        return next;
      });
      setServices(serviceData);
      setUsers(userData);
      setTeams(teamData);
      setSelectedRequestIds((current) => current.filter((id) => requestData.some((request) => request.id === id)));
      if (selectedId && !detailOpen && !requestData.some((request) => request.id === selectedId)) {
        setSelectedId(null);
        setSelected(null);
        setDetailOpen(false);
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
    const urlFilters = { ...filters };
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      urlFilters.status = params.get("status") ?? "";
      const requestId = params.get("request");
      if (requestId) {
        setSelectedId(requestId);
        setDetailOpen(true);
      }
      setFilters(urlFilters);
    }
    void loadData(urlFilters);
  }, []);

  useEffect(() => {
    if (detailOpen) {
      void loadSelected(selectedId);
    }
  }, [selectedId, detailOpen]);

  function openRequest(id: string) {
    setSelectedId(id);
    setDetailOpen(true);
    setActiveTab("requests");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("request", id);
      window.history.replaceState(null, "", url);
    }
  }

  function closeRequest() {
    setDetailOpen(false);
    setSelected(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("request");
      window.history.replaceState(null, "", url);
    }
  }

  function toggleRequestSelection(requestId: string, checked: boolean) {
    setSelectedRequestIds((current) => checked ? [...new Set([...current, requestId])] : current.filter((id) => id !== requestId));
  }

  function toggleAllRequests(checked: boolean) {
    setSelectedRequestIds(checked ? requests.map((request) => request.id) : []);
  }

  function updateRequestInState(updated: EventServiceRequest) {
    setRequests((current) => current.map((request) => request.id === updated.id ? updated : request));
    setSelected((current) => current?.id === updated.id ? updated : current);
  }

  async function quickUpdateRequest(request: EventServiceRequest, patch: Partial<Pick<EventServiceRequest, "status" | "priority">> & { assignedTeamId?: string | null }) {
    setBusy(`quick-${request.id}`);
    setError(null);
    try {
      const updated = await apiFetch<EventServiceRequest>(`/event-services/${request.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      updateRequestInState(updated);
      setNotice(`${request.trackingNumber} updated.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update event request.");
    } finally {
      setBusy(null);
    }
  }

  async function moveSelectedToRecycleBin() {
    if (!selectedRequestIds.length) return;
    const confirmed = window.confirm(`Move ${selectedRequestIds.length} event request${selectedRequestIds.length === 1 ? "" : "s"} to the Event & Services recycle bin?`);
    if (!confirmed) return;
    setBusy("delete");
    setError(null);
    try {
      await apiFetch("/event-services/recycle-bin", {
        method: "POST",
        body: JSON.stringify({ requestIds: selectedRequestIds })
      });
      if (selectedId && selectedRequestIds.includes(selectedId)) {
        closeRequest();
        setSelectedId(null);
      }
      setSelectedRequestIds([]);
      setNotice("Event request moved to recycle bin.");
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to move event request to recycle bin.");
    } finally {
      setBusy(null);
    }
  }

  async function loadRecycleBin() {
    setBusy("recycle-bin");
    setError(null);
    try {
      const data = await apiFetch<EventServiceRequest[]>("/event-services/recycle-bin");
      setRecycledRequests(data);
      setRecycleBinOpen(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load event recycle bin.");
    } finally {
      setBusy(null);
    }
  }

  async function restoreRequest(requestId: string) {
    setBusy(`restore-${requestId}`);
    setError(null);
    try {
      await apiFetch("/event-services/recycle-bin/restore", {
        method: "POST",
        body: JSON.stringify({ requestIds: [requestId] })
      });
      setNotice("Event request restored.");
      await Promise.all([loadData(), loadRecycleBin()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to restore event request.");
    } finally {
      setBusy(null);
    }
  }

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

  function updateMyTaskDraft(taskId: string, patch: Partial<{ status: TaskStatus; progressPercent: number; comment: string }>) {
    setMyTaskDrafts((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] ?? { status: "TODO" as TaskStatus, progressPercent: 0, comment: "" }),
        ...patch
      }
    }));
  }

  async function saveMyTask(taskId: string) {
    const draft = myTaskDrafts[taskId];
    if (!draft) return;
    setBusy(`my-task-${taskId}`);
    setError(null);
    try {
      await apiFetch(`/event-services/my-tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: draft.status,
          progressPercent: draft.progressPercent,
          comment: draft.comment.trim() || undefined
        })
      });
      setNotice("Task progress saved.");
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save task progress.");
    } finally {
      setBusy(null);
    }
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
      <div className="compact-page-header">
        <div>
          <h1>Event & Services</h1>
        </div>
        <div className="button-row">
          <button className="button secondary" type="button" onClick={() => void loadRecycleBin()} disabled={busy === "recycle-bin"}>
            <Trash2 size={16} aria-hidden="true" />
            <span>Recycle Bin</span>
          </button>
          <button className="button secondary" type="button" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw size={16} aria-hidden="true" />
            <span>Refresh</span>
          </button>
        </div>
      </div>
      {error ? <div className="alert error">{error}</div> : null}
      {notice ? <div className="alert success">{notice}</div> : null}

      <section className="dashboard-kpi-grid event-kpi-grid event-compact-kpi-grid">
        <div className="dashboard-kpi-card"><ClipboardList size={18} /><span>Total Requests</span><strong>{summary.total}</strong><small>Current filtered view</small></div>
        <div className="dashboard-kpi-card"><CalendarDays size={18} /><span>New</span><strong>{summary.newRequests}</strong><small>Needs review</small></div>
        <div className="dashboard-kpi-card"><UsersRound size={18} /><span>Assigned / Active</span><strong>{summary.assigned}</strong><small>Team workload</small></div>
        <div className="dashboard-kpi-card"><CheckCircle2 size={18} /><span>Completed</span><strong>{summary.completed}</strong><small>Finished events</small></div>
      </section>

      <div className="event-workspace-tabs" role="tablist" aria-label="Event & Services views">
        <button className={activeTab === "requests" ? "active" : ""} type="button" onClick={() => setActiveTab("requests")}>
          Requests
        </button>
        <button className={activeTab === "myTasks" ? "active" : ""} type="button" onClick={() => setActiveTab("myTasks")}>
          My Tasks
          <span>{myTasks.length}</span>
        </button>
      </div>

      {activeTab === "requests" ? (
      <>
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
        <section className="panel event-request-table-panel">
          <div className="section-heading compact-heading">
            <div>
              <h2>Requests</h2>
              <p className="muted">{requests.length} event request{requests.length === 1 ? "" : "s"} in this view.</p>
            </div>
            <div className="button-row">
              <button className="button danger" type="button" onClick={() => void moveSelectedToRecycleBin()} disabled={!selectedRequestIds.length || busy === "delete"}>
                <Trash2 size={16} aria-hidden="true" />
                <span>Delete Selected</span>
              </button>
            </div>
          </div>
          <div className="table-scroll">
            <table className="tickets-table event-request-table">
              <thead>
                <tr>
                  <th>
                    <input
                      aria-label="Select all event requests"
                      type="checkbox"
                      checked={requests.length > 0 && selectedRequestIds.length === requests.length}
                      onChange={(event) => toggleAllRequests(event.target.checked)}
                    />
                  </th>
                  <th>Tracking</th>
                  <th>Event</th>
                  <th>Requester</th>
                  <th>Date / Time</th>
                  <th>Services</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Assigned</th>
                  <th>Progress</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={12}>
                      <span className="muted">{loading ? "Loading requests..." : "No event requests match the filters."}</span>
                    </td>
                  </tr>
                ) : null}
                {requests.map((request) => (
                  <tr className={selectedId === request.id && detailOpen ? "selected-row" : ""} key={request.id} onClick={() => openRequest(request.id)}>
                    <td>
                      <input
                        aria-label={`Select ${request.trackingNumber}`}
                        type="checkbox"
                        checked={selectedRequestIds.includes(request.id)}
                        onChange={(event) => { event.stopPropagation(); toggleRequestSelection(request.id, event.target.checked); }}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </td>
                    <td><strong>{request.trackingNumber}</strong></td>
                    <td>
                      <strong>{request.eventName}</strong>
                      <span className="muted">{request.venue ?? "No venue"}</span>
                    </td>
                    <td>
                      <strong>{request.requesterFirstName} {request.requesterLastName}</strong>
                      <span className="muted">{request.requesterEmail}</span>
                    </td>
                    <td>
                      <strong>{formatDate(request.eventDate)}</strong>
                      <span className="muted">{request.startTime ?? "--"} - {request.endTime ?? "--"}</span>
                    </td>
                    <td>{request.services.map((item) => item.service.name).join(", ") || "None"}</td>
                    <td>
                      <select
                        className="input compact-select event-inline-select"
                        value={request.status}
                        disabled={busy === `quick-${request.id}`}
                        onChange={(event) => { event.stopPropagation(); void quickUpdateRequest(request, { status: event.target.value as EventStatus }); }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                      </select>
                    </td>
                    <td>{label(request.priority)}</td>
                    <td>
                      <select
                        className="input compact-select event-inline-select"
                        value={request.assignedTeam?.id ?? ""}
                        disabled={busy === `quick-${request.id}`}
                        onChange={(event) => { event.stopPropagation(); void quickUpdateRequest(request, { assignedTeamId: event.target.value || null }); }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <option value="">No team</option>
                        {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                      </select>
                      <span className="muted">{request.assignees.map((assignee) => userName(assignee.user)).join(", ") || "Unassigned"}</span>
                    </td>
                    <td><span className="count-pill">{request.progressPercent}%</span></td>
                    <td>{formatDateTime(request.updatedAt)}</td>
                    <td>
                      <button className="icon-button" type="button" onClick={(event) => { event.stopPropagation(); openRequest(request.id); }}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {detailOpen ? (
          <section className="panel event-detail-panel">
            {selected ? (
            <>
              <div className="section-heading">
                <div>
                  <h2>{selected.trackingNumber}</h2>
                  <p className="muted">{selected.eventName}</p>
                </div>
                <div className="button-row">
                  <span className="count-pill">{selected.progressPercent}%</span>
                  <button className="icon-button" type="button" onClick={closeRequest} aria-label="Close event details">
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
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
            ) : <p className="muted">Loading request detail...</p>}
          </section>
        ) : null}
      </div>
      </>
      ) : (
        <section className="panel event-my-tasks-panel">
          <div className="section-heading compact-heading">
            <div>
              <h2>My Event Tasks</h2>
              <p className="muted">Update the event tasks assigned to you and report progress to the rest of the team.</p>
            </div>
            <button className="button secondary" type="button" onClick={() => void loadData()} disabled={loading}>
              <RefreshCw size={16} aria-hidden="true" />
              <span>Refresh</span>
            </button>
          </div>
          <div className="table-scroll">
            <table className="tickets-table event-task-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Event</th>
                  <th>Date / Time</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Progress note</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {myTasks.length === 0 ? (
                  <tr>
                    <td colSpan={8}><span className="muted">{loading ? "Loading tasks..." : "No event tasks are assigned to you."}</span></td>
                  </tr>
                ) : null}
                {myTasks.map((task) => {
                  const draftTask = myTaskDrafts[task.id] ?? { status: task.status, progressPercent: task.progressPercent, comment: "" };
                  return (
                    <tr key={task.id}>
                      <td>
                        <strong>{task.title}</strong>
                        {task.description ? <span className="muted">{task.description}</span> : null}
                      </td>
                      <td>
                        <strong>{task.request.trackingNumber}</strong>
                        <span className="muted">{task.request.eventName}</span>
                      </td>
                      <td>
                        <strong>{formatDate(task.request.eventDate)}</strong>
                        <span className="muted">{task.request.startTime ?? "--"} - {task.request.endTime ?? "--"}</span>
                      </td>
                      <td>
                        <select className="input compact-select event-inline-select" value={draftTask.status} onChange={(event) => updateMyTaskDraft(task.id, { status: event.target.value as TaskStatus })}>
                          {taskStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                        </select>
                      </td>
                      <td>
                        <input className="input event-progress-input" type="number" min={0} max={100} value={draftTask.progressPercent} onChange={(event) => updateMyTaskDraft(task.id, { progressPercent: Number(event.target.value) })} />
                      </td>
                      <td>
                        <input className="input" placeholder="Optional note..." value={draftTask.comment} onChange={(event) => updateMyTaskDraft(task.id, { comment: event.target.value })} />
                      </td>
                      <td>{formatDateTime(task.updatedAt)}</td>
                      <td>
                        <div className="event-task-actions">
                          <button className="button secondary" type="button" onClick={() => openRequest(task.request.id)}>Open Event</button>
                          <button className="button" type="button" onClick={() => void saveMyTask(task.id)} disabled={busy === `my-task-${task.id}`}>Save</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {recycleBinOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel event-recycle-panel" role="dialog" aria-modal="true" aria-label="Event request recycle bin">
            <div className="section-heading">
              <div>
                <h2>Event Recycle Bin</h2>
                <p className="muted">{recycledRequests.length} deleted event request{recycledRequests.length === 1 ? "" : "s"}.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setRecycleBinOpen(false)} aria-label="Close event recycle bin">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="table-scroll">
              <table className="tickets-table event-request-table">
                <thead>
                  <tr>
                    <th>Tracking</th>
                    <th>Event</th>
                    <th>Requester</th>
                    <th>Deleted</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recycledRequests.length === 0 ? (
                    <tr><td colSpan={5}><span className="muted">No deleted event requests.</span></td></tr>
                  ) : null}
                  {recycledRequests.map((request) => (
                    <tr key={request.id}>
                      <td><strong>{request.trackingNumber}</strong></td>
                      <td><strong>{request.eventName}</strong><span className="muted">{request.venue ?? "No venue"}</span></td>
                      <td><strong>{request.requesterFirstName} {request.requesterLastName}</strong><span className="muted">{request.requesterEmail}</span></td>
                      <td>{formatDateTime(request.deletedAt ?? null)}</td>
                      <td>
                        <button className="button secondary" type="button" onClick={() => void restoreRequest(request.id)} disabled={busy === `restore-${request.id}`}>
                          <RotateCcw size={16} aria-hidden="true" />
                          <span>Restore</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
