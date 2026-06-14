"use client";

import { CalendarDays, CalendarPlus, CheckCircle2, ChevronDown, ClipboardList, ExternalLink, MessageSquare, Plus, RefreshCw, RotateCcw, Save, Trash2, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { AttachmentPreviewList } from "../tickets/AttachmentPreviewList";
import { EventMessageComposer } from "./EventMessageComposer";

type EventStatus = "NEW" | "UNDER_REVIEW" | "SCHEDULED" | "ASSIGNED" | "IN_PROGRESS" | "WAITING_ON_CLIENT" | "WAITING_ON_INTERNAL_TEAM" | "COMPLETED" | "CANCELLED" | "CONVERTED_TO_TICKET";
type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELLED";
type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT" | "CRITICAL";

interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface EventServiceCatalogItem {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  isActive: boolean;
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
  additionalInfo: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  client: { id: string; name: string; shortName: string | null } | null;
  services: Array<{ service: EventServiceCatalogItem }>;
  assignees: Array<{ user: UserOption; role: string | null }>;
  tasks: Array<{ id: string; title: string; description: string | null; status: TaskStatus; dueAt: string | null; calendarEventId: string | null; calendarUserEmail: string | null; calendarSyncedAt: string | null; calendarSyncError: string | null; assignedUser: UserOption | null }>;
  comments?: Array<{ id: string; body: string; createdAt: string; user: UserOption | null }>;
  messages?: Array<{
    id: string;
    bodyText: string;
    bodyHtml: string | null;
    sanitizedBodyHtml: string | null;
    direction: "INBOUND" | "OUTBOUND" | "INTERNAL";
    visibility: "PUBLIC" | "INTERNAL";
    createdAt: string;
    senderEmail: string | null;
    authorUser: UserOption | null;
    attachments: Array<{ id: string; originalFilename: string; mimeType: string; fileSize: number; isInline?: boolean }>;
  }>;
}

interface EventServiceTaskAssignment {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueAt: string | null;
  updatedAt: string;
  calendarEventId: string | null;
  calendarUserEmail: string | null;
  calendarSyncedAt: string | null;
  calendarSyncError: string | null;
  assignedUser: UserOption | null;
  request: EventServiceRequest;
}

interface EventServicesWorkspaceProps {
  detailTrackingNumber?: string;
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

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function textToHtml(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 102.4) / 10} KB`;
  }
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}

export function EventServicesWorkspace({ detailTrackingNumber }: EventServicesWorkspaceProps = {}) {
  const detailPage = Boolean(detailTrackingNumber);
  const [activeTab, setActiveTab] = useState<"requests" | "myTasks">("requests");
  const [requests, setRequests] = useState<EventServiceRequest[]>([]);
  const [myTasks, setMyTasks] = useState<EventServiceTaskAssignment[]>([]);
  const [myTaskDrafts, setMyTaskDrafts] = useState<Record<string, { status: TaskStatus; comment: string }>>({});
  const [selectedId, setSelectedId] = useState<string | null>(detailTrackingNumber ?? null);
  const [selected, setSelected] = useState<EventServiceRequest | null>(null);
  const [detailSection, setDetailSection] = useState<"overview" | "tasks" | "messages" | "activity">("overview");
  const [detailOpen, setDetailOpen] = useState(detailPage);
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  const [recycledRequests, setRecycledRequests] = useState<EventServiceRequest[]>([]);
  const [services, setServices] = useState<EventServiceCatalogItem[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [filters, setFilters] = useState({ search: "", status: "", assignedUserId: "", serviceId: "" });
  const [draft, setDraft] = useState({ status: "NEW" as EventStatus, priority: "NORMAL" as Priority, assignedUserIds: [] as string[], additionalInfo: "" });
  const [taskDraft, setTaskDraft] = useState({ title: "", assignedUserId: "", description: "", dueAt: "" });
  const [commentDraft, setCommentDraft] = useState("");
  const [calendarDrafts, setCalendarDrafts] = useState<Record<string, { startDate: string; startTime: string; endDate: string; endTime: string; location: string; notes: string }>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const summary = useMemo(() => ({
    total: requests.length,
    newRequests: requests.filter((item) => item.status === "NEW").length,
    assigned: requests.filter((item) => item.assignees.length > 0 || item.tasks.some((task) => task.assignedUser)).length,
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
      const [requestData, myTaskData, serviceData, userData] = await Promise.all([
        apiFetch<EventServiceRequest[]>(`/event-services?${params.toString()}`),
        apiFetch<EventServiceTaskAssignment[]>("/event-services/my-tasks"),
        apiFetch<EventServiceCatalogItem[]>("/event-services/services"),
        apiFetch<UserOption[]>("/users")
      ]);
      setRequests(requestData);
      setMyTasks(myTaskData);
      setMyTaskDrafts((current) => {
        const next: Record<string, { status: TaskStatus; comment: string }> = {};
        myTaskData.forEach((task) => {
          next[task.id] = current[task.id] ?? { status: task.status, comment: "" };
        });
        return next;
      });
      setServices(serviceData);
      setUsers(userData);
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
      setSelectedId(item.id);
      setDraft({
        status: item.status,
        priority: item.priority,
        assignedUserIds: item.assignees.map((assignee) => assignee.user.id),
        additionalInfo: item.additionalInfo ?? ""
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load request detail.");
    }
  }

  useEffect(() => {
    const urlFilters = { ...filters };
    if (detailTrackingNumber) {
      setSelectedId(detailTrackingNumber);
      setDetailOpen(true);
    } else if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      urlFilters.status = params.get("status") ?? "";
      const legacyRequestRef = params.get("request");
      if (legacyRequestRef) {
        void apiFetch<EventServiceRequest>(`/event-services/${legacyRequestRef}`)
          .then((item) => {
            window.location.replace(`/event-services/${encodeURIComponent(item.trackingNumber)}`);
          })
          .catch((caught) => {
            setError(caught instanceof Error ? caught.message : "Unable to load request detail.");
          });
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

  function openRequest(request: EventServiceRequest) {
    setActiveTab("requests");
    if (typeof window !== "undefined") {
      window.location.href = `/event-services/${encodeURIComponent(request.trackingNumber)}`;
    }
  }

  function closeRequest() {
    if (typeof window !== "undefined") {
      window.location.href = "/event-services";
      return;
    }
    setDetailOpen(false);
    setSelected(null);
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

  async function quickUpdateRequest(request: EventServiceRequest, patch: Partial<Pick<EventServiceRequest, "status" | "priority">>) {
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
        body: JSON.stringify(draft)
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
        body: JSON.stringify({ ...taskDraft, assignedUserId: taskDraft.assignedUserId || null, dueAt: taskDraft.dueAt || null })
      });
      setTaskDraft({ title: "", assignedUserId: "", description: "", dueAt: "" });
      await loadSelected(selected.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create task.");
    } finally {
      setBusy(null);
    }
  }

  async function updateTask(taskId: string, patch: Partial<{ status: TaskStatus; assignedUserId: string; dueAt: string | null }>) {
    if (!selected) return;
    await apiFetch(`/event-services/${selected.id}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
    await loadSelected(selected.id);
    await loadData();
  }

  function updateMyTaskDraft(taskId: string, patch: Partial<{ status: TaskStatus; comment: string }>) {
    setMyTaskDrafts((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] ?? { status: "TODO" as TaskStatus, comment: "" }),
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
          comment: draft.comment.trim() || undefined
        })
      });
      setNotice("Task status saved.");
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save task status.");
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

  function updateCalendarDraft(taskId: string, patch: Partial<{ startDate: string; startTime: string; endDate: string; endTime: string; location: string; notes: string }>) {
    setCalendarDrafts((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] ?? { startDate: selected?.eventDate?.slice(0, 10) ?? "", startTime: selected?.startTime ?? "", endDate: selected?.eventDate?.slice(0, 10) ?? "", endTime: selected?.endTime ?? "", location: selected?.venue ?? "", notes: "" }),
        ...patch
      }
    }));
  }

  async function syncTaskCalendar(taskId: string) {
    if (!selected) return;
    setBusy(`calendar-${taskId}`);
    setError(null);
    try {
      await apiFetch(`/event-services/${selected.id}/tasks/${taskId}/calendar`, {
        method: "POST",
        body: JSON.stringify(calendarDrafts[taskId] ?? {})
      });
      setNotice("Task added to Microsoft Calendar.");
      await loadSelected(selected.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sync task to Microsoft Calendar.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={detailPage ? "event-services-page event-detail-page" : "event-services-page"}>
      <div className="compact-page-header">
        <div>
          <h1>{detailPage ? selected?.trackingNumber ?? detailTrackingNumber : "Event & Services"}</h1>
        </div>
        <div className="button-row">
          {detailPage ? (
            <button className="button secondary" type="button" onClick={closeRequest}>
              <span>Back to Requests</span>
            </button>
          ) : (
            <>
              <button className="button secondary" type="button" onClick={() => window.open("https://events.aviditytechnologies.com/", "_blank", "noopener,noreferrer")}>
                <ExternalLink size={16} aria-hidden="true" />
                <span>Customer Portal</span>
              </button>
              <button className="button secondary" type="button" onClick={() => { window.location.href = "/event-services/calendar"; }}>
                <CalendarDays size={16} aria-hidden="true" />
                <span>Calendar View</span>
              </button>
              <button className="button secondary" type="button" onClick={() => void loadRecycleBin()} disabled={busy === "recycle-bin"}>
                <Trash2 size={16} aria-hidden="true" />
                <span>Recycle Bin</span>
              </button>
            </>
          )}
          <button className="button secondary" type="button" onClick={() => detailPage ? void loadSelected(selectedId) : void loadData()} disabled={loading}>
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
        <div className="dashboard-kpi-card"><UsersRound size={18} /><span>Assigned Specialists</span><strong>{summary.assigned}</strong><small>Direct assignments</small></div>
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
                  <th>Specialists</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={11}>
                      <span className="muted">{loading ? "Loading requests..." : "No event requests match the filters."}</span>
                    </td>
                  </tr>
                ) : null}
                {requests.map((request) => (
                  <tr className={selectedId === request.id && detailOpen ? "selected-row" : ""} key={request.id} onClick={() => openRequest(request)}>
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
                      <span className="event-select-wrap">
                        <select
                          className="input compact-select event-inline-select"
                          value={request.status}
                          disabled={busy === `quick-${request.id}`}
                          onChange={(event) => { event.stopPropagation(); void quickUpdateRequest(request, { status: event.target.value as EventStatus }); }}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                        </select>
                        <ChevronDown className="event-select-chevron" size={15} aria-hidden="true" />
                      </span>
                    </td>
                    <td>{label(request.priority)}</td>
                    <td><span className="muted">{request.assignees.map((assignee) => userName(assignee.user)).join(", ") || "Unassigned"}</span></td>
                    <td>{formatDateTime(request.updatedAt)}</td>
                    <td>
                      <button className="event-open-button" type="button" onClick={(event) => { event.stopPropagation(); openRequest(request); }}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {detailPage && detailOpen ? (
          <section className="panel event-detail-panel">
            {selected ? (
            <>
              <div className="section-heading">
                <div>
                  <h2>{selected.trackingNumber}</h2>
                  <p className="muted">{selected.eventName}</p>
                </div>
                <div className="button-row">
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

              <div className="event-detail-tabs" role="tablist" aria-label="Event detail sections">
                {(["overview", "tasks", "messages", "activity"] as const).map((section) => (
                  <button className={detailSection === section ? "active" : ""} type="button" key={section} onClick={() => setDetailSection(section)}>
                    {label(section)}
                    {section === "tasks" ? <span>{selected.tasks.length}</span> : null}
                    {section === "messages" ? <span>{selected.messages?.length ?? 0}</span> : null}
                  </button>
                ))}
              </div>

              {detailSection === "overview" ? (
                <div className="nested-panel">
                  <div className="section-heading compact-heading">
                    <div>
                      <h3>Request Management</h3>
                      <p className="muted">Update status, priority, specialists, and internal request notes.</p>
                    </div>
                    <button className="button" type="button" onClick={saveRequest} disabled={busy === "request"}><Save size={16} />Save Request</button>
                  </div>
                  <div className="event-management-grid">
                    <label>Status<select className="input" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as EventStatus }))}>{statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></label>
                    <label>Priority<select className="input" value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as Priority }))}>{priorities.map((priority) => <option key={priority} value={priority}>{label(priority)}</option>)}</select></label>
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
                </div>
              ) : null}

              {detailSection === "tasks" ? (
                <div className="nested-panel">
                  <div className="section-heading compact-heading">
                    <div>
                      <h3>Task Flow</h3>
                      <p className="muted">Track specialist work, due dates, status, and optional calendar sync.</p>
                    </div>
                  </div>
                  <div className="event-task-create">
                    <input className="input" placeholder="Task title" value={taskDraft.title} onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))} />
                    <select className="input" value={taskDraft.assignedUserId} onChange={(event) => setTaskDraft((current) => ({ ...current, assignedUserId: event.target.value }))}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{userName(user)}</option>)}</select>
                    <input className="input" type="datetime-local" value={taskDraft.dueAt} onChange={(event) => setTaskDraft((current) => ({ ...current, dueAt: event.target.value }))} />
                    <button className="button secondary" type="button" onClick={createTask} disabled={busy === "task"}><Plus size={16} />Add</button>
                  </div>
                  <div className="event-task-board">
                    {taskStatuses.map((status) => (
                      <div className="event-task-column" key={status}>
                        <h4>{label(status)}</h4>
                        {selected.tasks.filter((task) => task.status === status).map((task) => {
                          const calendarDraft = calendarDrafts[task.id] ?? { startDate: selected.eventDate?.slice(0, 10) ?? "", startTime: selected.startTime ?? "", endDate: selected.eventDate?.slice(0, 10) ?? "", endTime: selected.endTime ?? "", location: selected.venue ?? "", notes: "" };
                          return (
                            <article className="event-task-card" key={task.id}>
                              <strong>{task.title}</strong>
                              {task.description ? <p className="muted">{task.description}</p> : null}
                              <span className="muted">Assigned: {userName(task.assignedUser)}</span>
                              <span className="muted">Due: {formatDateTime(task.dueAt)}</span>
                              <div className="event-task-controls">
                                <select className="input compact-select" value={task.status} onChange={(event) => void updateTask(task.id, { status: event.target.value as TaskStatus })}>{taskStatuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select>
                              </div>
                              <details className="event-calendar-sync">
                                <summary><CalendarPlus size={14} /> Calendar</summary>
                                <div className="event-calendar-grid">
                                  <input className="input" type="date" value={calendarDraft.startDate} onChange={(event) => updateCalendarDraft(task.id, { startDate: event.target.value })} />
                                  <input className="input" type="time" value={calendarDraft.startTime} onChange={(event) => updateCalendarDraft(task.id, { startTime: event.target.value })} />
                                  <input className="input" type="date" value={calendarDraft.endDate} onChange={(event) => updateCalendarDraft(task.id, { endDate: event.target.value })} />
                                  <input className="input" type="time" value={calendarDraft.endTime} onChange={(event) => updateCalendarDraft(task.id, { endTime: event.target.value })} />
                                  <input className="input span-2" placeholder="Location" value={calendarDraft.location} onChange={(event) => updateCalendarDraft(task.id, { location: event.target.value })} />
                                </div>
                                {task.calendarSyncedAt ? <p className="muted">Synced to {task.calendarUserEmail} on {formatDateTime(task.calendarSyncedAt)}</p> : null}
                                {task.calendarSyncError ? <p className="alert error">{task.calendarSyncError}</p> : null}
                                <button className="button secondary" type="button" onClick={() => void syncTaskCalendar(task.id)} disabled={busy === `calendar-${task.id}`}>Add to Calendar</button>
                              </details>
                            </article>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {detailSection === "messages" ? (
                <div className="nested-panel">
                  <div className="section-heading compact-heading">
                    <div>
                      <h3><MessageSquare size={16} />Requester Messages</h3>
                      <p className="muted">Send polished requester updates, save internal notes, attach files, and use AI writing tools.</p>
                    </div>
                  </div>
                  <EventMessageComposer requestId={selected.id} users={users} onSaved={async () => {
                    setNotice("Event message saved.");
                    await loadSelected(selected.id);
                  }} />
                  <div className="event-message-list">
                    {(selected.messages ?? []).map((message) => (
                      <article className={`event-message ${message.direction.toLowerCase()}`} key={message.id}>
                        <strong>{message.direction === "OUTBOUND" || message.direction === "INTERNAL" ? userName(message.authorUser) : message.senderEmail ?? selected.requesterEmail}</strong>
                        <div className="message-body signature-render" dangerouslySetInnerHTML={{ __html: message.sanitizedBodyHtml ?? textToHtml(message.bodyText) }} />
                        {message.attachments?.length ? (
                          <AttachmentPreviewList attachments={message.attachments.map((attachment) => ({
                            id: attachment.id,
                            originalFilename: attachment.originalFilename,
                            mimeType: attachment.mimeType,
                            sizeLabel: formatBytes(attachment.fileSize),
                            isInline: attachment.isInline
                          }))} />
                        ) : null}
                        <small>{formatDateTime(message.createdAt)}</small>
                      </article>
                    ))}
                  </div>
                  <h3>Internal Comments</h3>
                  <textarea className="input" placeholder="Add internal comment..." value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} />
                  <button className="button secondary" type="button" onClick={addComment} disabled={busy === "comment"}>Add Comment</button>
                  {selected.comments?.map((comment) => (
                    <div className="event-comment" key={comment.id}><strong>{userName(comment.user)}</strong><p>{comment.body}</p><small>{new Date(comment.createdAt).toLocaleString()}</small></div>
                  ))}
                </div>
              ) : null}

              {detailSection === "activity" ? (
                <div className="nested-panel">
                  <h3>Activity Timeline</h3>
                  {selected.comments?.length || selected.messages?.length ? null : <p className="muted">No visible activity yet.</p>}
                  {selected.messages?.map((message) => <div className="event-comment" key={`message-${message.id}`}><strong>{label(message.direction)} message</strong><p>{message.bodyText}</p><small>{formatDateTime(message.createdAt)}</small></div>)}
                  {selected.comments?.map((comment) => <div className="event-comment" key={`comment-${comment.id}`}><strong>{userName(comment.user)}</strong><p>{comment.body}</p><small>{formatDateTime(comment.createdAt)}</small></div>)}
                </div>
              ) : null}
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
              <p className="muted">Update the event tasks assigned to you and keep the rest of the team informed.</p>
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
                  <th>Update note</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {myTasks.length === 0 ? (
                  <tr>
                    <td colSpan={7}><span className="muted">{loading ? "Loading tasks..." : "No event tasks are assigned to you."}</span></td>
                  </tr>
                ) : null}
                {myTasks.map((task) => {
                  const draftTask = myTaskDrafts[task.id] ?? { status: task.status, comment: "" };
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
                        <input className="input" placeholder="Optional note..." value={draftTask.comment} onChange={(event) => updateMyTaskDraft(task.id, { comment: event.target.value })} />
                      </td>
                      <td>{formatDateTime(task.updatedAt)}</td>
                      <td>
                        <div className="event-task-actions">
                          <button className="button secondary" type="button" onClick={() => openRequest(task.request)}>Open Event</button>
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
