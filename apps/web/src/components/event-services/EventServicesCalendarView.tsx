"use client";

import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, ExternalLink, RefreshCw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type EventStatus = "NEW" | "UNDER_REVIEW" | "SCHEDULED" | "ASSIGNED" | "IN_PROGRESS" | "WAITING_ON_CLIENT" | "WAITING_ON_INTERNAL_TEAM" | "COMPLETED" | "CANCELLED" | "CONVERTED_TO_TICKET";
type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELLED";
type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT" | "CRITICAL";
type CalendarMode = "month" | "week" | "day";

interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface EventServiceCatalogItem {
  id: string;
  name: string;
}

interface EventServiceTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueAt: string | null;
  calendarEventId: string | null;
  calendarUserEmail: string | null;
  calendarSyncedAt: string | null;
  calendarSyncError: string | null;
  assignedUser: UserOption | null;
}

interface EventServiceCalendarRequest {
  id: string;
  trackingNumber: string;
  eventName: string;
  venue: string | null;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  requesterFirstName: string;
  requesterLastName: string;
  requesterEmail: string;
  status: EventStatus;
  priority: Priority;
  services: Array<{ service: EventServiceCatalogItem }>;
  assignees: Array<{ user: UserOption; role: string | null }>;
  tasks: EventServiceTask[];
}

const statuses: EventStatus[] = ["NEW", "UNDER_REVIEW", "SCHEDULED", "ASSIGNED", "IN_PROGRESS", "WAITING_ON_CLIENT", "WAITING_ON_INTERNAL_TEAM", "COMPLETED", "CANCELLED", "CONVERTED_TO_TICKET"];
const taskStatuses: TaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"];

function label(value: string) {
  if (value === "TODO") return "To Do";
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function userName(user: UserOption | null) {
  return user ? `${user.firstName} ${user.lastName}`.trim() || user.email : "Unassigned";
}

function localDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function startOfWeek(value: Date) {
  const next = new Date(value);
  next.setDate(value.getDate() - value.getDay());
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(value.getDate() + days);
  return next;
}

function calendarRange(anchor: Date, mode: CalendarMode) {
  if (mode === "day") {
    return { start: new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()), end: addDays(anchor, 1) };
  }
  if (mode === "week") {
    const start = startOfWeek(anchor);
    return { start, end: addDays(start, 7) };
  }
  const monthStart = startOfMonth(anchor);
  const gridStart = startOfWeek(monthStart);
  const end = addDays(startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)), 7);
  return { start: gridStart, end };
}

function rangeLabel(anchor: Date, mode: CalendarMode) {
  if (mode === "month") return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  if (mode === "week") {
    const start = startOfWeek(anchor);
    const end = addDays(start, 6);
    return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  return anchor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function shiftAnchor(anchor: Date, mode: CalendarMode, direction: -1 | 1) {
  const next = new Date(anchor);
  if (mode === "month") next.setMonth(anchor.getMonth() + direction);
  if (mode === "week") next.setDate(anchor.getDate() + direction * 7);
  if (mode === "day") next.setDate(anchor.getDate() + direction);
  return next;
}

export function EventServicesCalendarView() {
  const [requests, setRequests] = useState<EventServiceCalendarRequest[]>([]);
  const [services, setServices] = useState<EventServiceCatalogItem[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<CalendarMode>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [filters, setFilters] = useState({ status: "", assignedUserId: "", serviceId: "" });
  const [taskDraft, setTaskDraft] = useState({ title: "", assignedUserId: "", dueAt: "", description: "", syncCalendar: false });
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selected = requests.find((request) => request.id === selectedId) ?? null;
  const { start, end } = useMemo(() => calendarRange(anchor, mode), [anchor, mode]);
  const days = useMemo(() => {
    if (mode === "day") return [new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())];
    const count = mode === "week" ? 7 : Math.round((end.getTime() - start.getTime()) / 86400000);
    return Array.from({ length: count }, (_, index) => addDays(start, index));
  }, [anchor, end, mode, start]);
  const eventsByDay = useMemo(() => {
    const next = new Map<string, EventServiceCalendarRequest[]>();
    requests.forEach((request) => {
      const parsed = parseDate(request.eventDate);
      const key = parsed ? localDateKey(parsed) : "unscheduled";
      next.set(key, [...(next.get(key) ?? []), request]);
    });
    return next;
  }, [requests]);

  async function loadCalendar(nextFilters = filters) {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      start: localDateKey(start),
      end: localDateKey(end)
    });
    Object.entries(nextFilters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    try {
      const [requestData, serviceData, userData] = await Promise.all([
        apiFetch<EventServiceCalendarRequest[]>(`/event-services/calendar?${params.toString()}`),
        apiFetch<EventServiceCatalogItem[]>("/event-services/services"),
        apiFetch<UserOption[]>("/users")
      ]);
      setRequests(requestData);
      setServices(serviceData);
      setUsers(userData);
      if (requestData.length && (!selectedId || !requestData.some((request) => request.id === selectedId))) {
        setSelectedId(requestData[0].id);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load event calendar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCalendar();
  }, [start.getTime(), end.getTime()]);

  useEffect(() => {
    if (selected) {
      setAssignedUserIds(selected.assignees.map((assignee) => assignee.user.id));
      setTaskDraft((current) => ({
        ...current,
        dueAt: current.dueAt || (selected.eventDate ? `${selected.eventDate.slice(0, 10)}T${selected.startTime ?? "09:00"}` : "")
      }));
    }
  }, [selected?.id]);

  async function saveSpecialists() {
    if (!selected) return;
    setBusy("specialists");
    setError(null);
    try {
      const updated = await apiFetch<EventServiceCalendarRequest>(`/event-services/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ assignedUserIds })
      });
      setRequests((current) => current.map((request) => request.id === updated.id ? updated : request));
      setNotice("Specialists saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save specialists.");
    } finally {
      setBusy(null);
    }
  }

  async function createTask() {
    if (!selected || !taskDraft.title.trim()) return;
    setBusy("task");
    setError(null);
    try {
      const task = await apiFetch<EventServiceTask>(`/event-services/${selected.id}/tasks`, {
        method: "POST",
        body: JSON.stringify({
          title: taskDraft.title,
          description: taskDraft.description || null,
          assignedUserId: taskDraft.assignedUserId || null,
          dueAt: taskDraft.dueAt || null
        })
      });
      if (taskDraft.syncCalendar && task.assignedUser) {
        await apiFetch(`/event-services/${selected.id}/tasks/${task.id}/calendar`, {
          method: "POST",
          body: JSON.stringify({
            startDate: taskDraft.dueAt ? taskDraft.dueAt.slice(0, 10) : undefined,
            startTime: taskDraft.dueAt ? taskDraft.dueAt.slice(11, 16) : undefined,
            location: selected.venue ?? undefined,
            notes: taskDraft.description || undefined
          })
        });
      }
      setTaskDraft({ title: "", assignedUserId: "", dueAt: selected.eventDate ? `${selected.eventDate.slice(0, 10)}T${selected.startTime ?? "09:00"}` : "", description: "", syncCalendar: false });
      setNotice(taskDraft.syncCalendar ? "Task created and sent to Microsoft Calendar." : "Task created.");
      await loadCalendar();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create task.");
    } finally {
      setBusy(null);
    }
  }

  async function updateTask(task: EventServiceTask, status: TaskStatus) {
    if (!selected) return;
    setBusy(`task-${task.id}`);
    try {
      await apiFetch(`/event-services/${selected.id}/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      await loadCalendar();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update task.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="event-calendar-page">
      <div className="compact-page-header">
        <div>
          <h1>Event Calendar</h1>
        </div>
        <div className="button-row">
          <button className="button secondary" type="button" onClick={() => { window.location.href = "/event-services"; }}>Back to Requests</button>
          <button className="button secondary" type="button" onClick={() => void loadCalendar()} disabled={loading}>
            <RefreshCw size={16} aria-hidden="true" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error ? <div className="alert error">{error}</div> : null}
      {notice ? <div className="alert success">{notice}</div> : null}

      <section className="panel event-calendar-toolbar">
        <div className="event-calendar-nav">
          <button className="icon-button" type="button" onClick={() => setAnchor((current) => shiftAnchor(current, mode, -1))} aria-label="Previous range">
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <strong>{rangeLabel(anchor, mode)}</strong>
          <button className="icon-button" type="button" onClick={() => setAnchor((current) => shiftAnchor(current, mode, 1))} aria-label="Next range">
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <button className="button secondary" type="button" onClick={() => setAnchor(new Date())}>Today</button>
        </div>
        <div className="event-calendar-mode" role="tablist" aria-label="Calendar view">
          {(["month", "week", "day"] as const).map((item) => (
            <button className={mode === item ? "active" : ""} key={item} type="button" onClick={() => setMode(item)}>
              {label(item)}
            </button>
          ))}
        </div>
        <select className="input" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
          <option value="">All statuses</option>
          {statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
        </select>
        <select className="input" value={filters.serviceId} onChange={(event) => setFilters((current) => ({ ...current, serviceId: event.target.value }))}>
          <option value="">All services</option>
          {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
        </select>
        <select className="input" value={filters.assignedUserId} onChange={(event) => setFilters((current) => ({ ...current, assignedUserId: event.target.value }))}>
          <option value="">All specialists</option>
          {users.map((user) => <option key={user.id} value={user.id}>{userName(user)}</option>)}
        </select>
        <button className="button" type="button" onClick={() => void loadCalendar(filters)}>Apply</button>
      </section>

      <div className="event-calendar-layout">
        <section className={`panel event-calendar-grid-view ${mode}`}>
          {mode !== "day" ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span className="event-calendar-weekday" key={day}>{day}</span>) : null}
          {days.map((day) => {
            const key = localDateKey(day);
            const dayRequests = eventsByDay.get(key) ?? [];
            const outsideMonth = mode === "month" && day.getMonth() !== anchor.getMonth();
            return (
              <article className={`event-calendar-day${outsideMonth ? " muted-day" : ""}`} key={key}>
                <header>
                  <strong>{mode === "day" ? day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : day.getDate()}</strong>
                  <span>{dayRequests.length ? `${dayRequests.length} event${dayRequests.length === 1 ? "" : "s"}` : ""}</span>
                </header>
                <div className="event-calendar-events">
                  {dayRequests.map((request) => (
                    <button className={`event-calendar-card status-${request.status.toLowerCase()}`} type="button" key={request.id} onClick={() => setSelectedId(request.id)}>
                      <span>{request.startTime ?? "--"} {request.trackingNumber}</span>
                      <strong>{request.eventName}</strong>
                      <small>{request.services.map((item) => item.service.name).join(", ") || "No service"}</small>
                    </button>
                  ))}
                  {!dayRequests.length ? <span className="muted empty-calendar-day">No events</span> : null}
                </div>
              </article>
            );
          })}
        </section>

        <aside className="panel event-calendar-detail">
          {selected ? (
            <>
              <div className="section-heading compact-heading">
                <div>
                  <span className="status-pill">{label(selected.status)}</span>
                  <h2>{selected.trackingNumber}</h2>
                  <p className="muted">{selected.eventName}</p>
                </div>
                <button className="button secondary" type="button" onClick={() => { window.location.href = `/event-services/${encodeURIComponent(selected.trackingNumber)}`; }}>
                  <ExternalLink size={16} aria-hidden="true" />
                  <span>Open</span>
                </button>
              </div>
              <div className="event-calendar-facts">
                <div><span className="muted">Date</span><strong>{selected.eventDate ? new Date(selected.eventDate).toLocaleDateString() : "No date"}</strong><small>{selected.startTime ?? "--"} - {selected.endTime ?? "--"}</small></div>
                <div><span className="muted">Requester</span><strong>{selected.requesterFirstName} {selected.requesterLastName}</strong><small>{selected.requesterEmail}</small></div>
                <div><span className="muted">Venue</span><strong>{selected.venue ?? "No venue"}</strong></div>
                <div><span className="muted">Services</span><strong>{selected.services.map((item) => item.service.name).join(", ") || "None"}</strong></div>
              </div>
              <div className="event-calendar-section">
                <h3>Specialists</h3>
                <div className="event-assignee-picker compact">
                  {users.map((user) => (
                    <label key={user.id}>
                      <input
                        type="checkbox"
                        checked={assignedUserIds.includes(user.id)}
                        onChange={(event) => setAssignedUserIds((current) => event.target.checked ? [...new Set([...current, user.id])] : current.filter((id) => id !== user.id))}
                      />
                      {userName(user)}
                    </label>
                  ))}
                </div>
                <button className="button secondary" type="button" onClick={() => void saveSpecialists()} disabled={busy === "specialists"}>
                  <Save size={16} aria-hidden="true" />
                  <span>Save Specialists</span>
                </button>
              </div>
              <div className="event-calendar-section">
                <h3>Create Task</h3>
                <div className="event-calendar-task-form">
                  <input className="input" placeholder="Task title" value={taskDraft.title} onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))} />
                  <select className="input" value={taskDraft.assignedUserId} onChange={(event) => setTaskDraft((current) => ({ ...current, assignedUserId: event.target.value }))}>
                    <option value="">Unassigned</option>
                    {users.map((user) => <option key={user.id} value={user.id}>{userName(user)}</option>)}
                  </select>
                  <input className="input" type="datetime-local" value={taskDraft.dueAt} onChange={(event) => setTaskDraft((current) => ({ ...current, dueAt: event.target.value }))} />
                  <textarea className="input" placeholder="Notes" value={taskDraft.description} onChange={(event) => setTaskDraft((current) => ({ ...current, description: event.target.value }))} />
                  <label className="checkbox-row">
                    <input type="checkbox" checked={taskDraft.syncCalendar} onChange={(event) => setTaskDraft((current) => ({ ...current, syncCalendar: event.target.checked }))} />
                    Add to specialist Microsoft Calendar
                  </label>
                  <button className="button" type="button" onClick={() => void createTask()} disabled={busy === "task" || !taskDraft.title.trim()}>
                    <CalendarPlus size={16} aria-hidden="true" />
                    <span>Create Task</span>
                  </button>
                </div>
              </div>
              <div className="event-calendar-section">
                <h3>Tasks</h3>
                <div className="event-calendar-task-list">
                  {selected.tasks.map((task) => (
                    <article className="event-task-card" key={task.id}>
                      <strong>{task.title}</strong>
                      <span className="muted">{userName(task.assignedUser)} · {task.dueAt ? new Date(task.dueAt).toLocaleString() : "No due date"}</span>
                      <select className="input compact-select" value={task.status} onChange={(event) => void updateTask(task, event.target.value as TaskStatus)} disabled={busy === `task-${task.id}`}>
                        {taskStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                      </select>
                      {task.calendarSyncedAt ? <small className="muted">Calendar: {task.calendarUserEmail}</small> : null}
                      {task.calendarSyncError ? <small className="error">{task.calendarSyncError}</small> : null}
                    </article>
                  ))}
                  {!selected.tasks.length ? <p className="muted">No tasks yet.</p> : null}
                </div>
              </div>
            </>
          ) : (
            <div className="event-calendar-empty">
              <CalendarDays size={24} aria-hidden="true" />
              <p className="muted">{loading ? "Loading events..." : "Select an event to manage specialists and tasks."}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
