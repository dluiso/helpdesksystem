"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Eye,
  RefreshCcw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2
} from "lucide-react";
import { MouseEvent as ReactMouseEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

interface TicketListItem {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  source: string;
  senderEmail: string | null;
  senderDomain: string | null;
  createdAt: string;
  updatedAt: string;
  client: { id: string; name: string } | null;
  contact: { id: string; firstName: string; lastName: string; email: string } | null;
  assignedUser: User | null;
  assignees: Array<{ user: User }>;
  assignedGroup: Group | null;
  assignedTeam: TicketTeam | null;
  firstReadAt: string | null;
  firstReadBy: User | null;
  deletedAt: string | null;
  _count: {
    messages: number;
    attachments: number;
  };
}

interface Client {
  id: string;
  name: string;
}

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface Group {
  id: string;
  name: string;
}

interface TicketTeam {
  id: string;
  name: string;
  isActive: boolean;
}

interface PaginatedTickets {
  items: TicketListItem[];
  total: number;
  page: number;
  pageSize: "20" | "50" | "100" | "all";
  totalPages: number;
}

type SortBy = "ticketNumber" | "subject" | "status" | "priority" | "source" | "createdAt" | "updatedAt";
type SortDirection = "asc" | "desc";
type ColumnId =
  | "ticketNumber"
  | "subject"
  | "client"
  | "requester"
  | "readState"
  | "assignees"
  | "team"
  | "status"
  | "priority"
  | "source"
  | "createdAt"
  | "updatedAt"
  | "messages"
  | "attachments";

interface ColumnDefinition {
  id: ColumnId;
  label: string;
  sortable?: SortBy;
}

const COLUMN_STORAGE_KEY = "avidity.ticketTable.columns";
const COLUMN_WIDTH_STORAGE_KEY = "avidity.ticketTable.columnWidths.v2";
const defaultColumnOrder: ColumnId[] = [
  "ticketNumber",
  "subject",
  "client",
  "requester",
  "readState",
  "assignees",
  "team",
  "status",
  "priority",
  "source",
  "createdAt",
  "updatedAt",
  "messages",
  "attachments"
];
const defaultVisibleColumns: ColumnId[] = [
  "ticketNumber",
  "subject",
  "client",
  "requester",
  "readState",
  "assignees",
  "team",
  "status",
  "priority",
  "createdAt",
  "updatedAt",
  "messages"
];
const allColumns: ColumnDefinition[] = [
  { id: "ticketNumber", label: "Number", sortable: "ticketNumber" },
  { id: "subject", label: "Subject", sortable: "subject" },
  { id: "client", label: "Client" },
  { id: "requester", label: "Requester" },
  { id: "readState", label: "Read" },
  { id: "assignees", label: "Specialists" },
  { id: "team", label: "Team" },
  { id: "status", label: "Status", sortable: "status" },
  { id: "priority", label: "Priority", sortable: "priority" },
  { id: "source", label: "Source", sortable: "source" },
  { id: "createdAt", label: "Created", sortable: "createdAt" },
  { id: "updatedAt", label: "Modified", sortable: "updatedAt" },
  { id: "messages", label: "Messages" },
  { id: "attachments", label: "Attachments" }
];
const defaultColumnWidths: Record<ColumnId, number> = {
  ticketNumber: 86,
  subject: 220,
  client: 140,
  requester: 165,
  readState: 60,
  assignees: 115,
  team: 105,
  status: 80,
  priority: 75,
  source: 110,
  createdAt: 118,
  updatedAt: 118,
  messages: 65,
  attachments: 120
};
const statuses = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "WAITING_ON_THIRD_PARTY", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];
const priorities = ["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"];

function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function normalizeColumnOrder(value: unknown): ColumnId[] {
  if (!Array.isArray(value)) {
    return defaultColumnOrder;
  }

  const validIds = new Set(allColumns.map((column) => column.id));
  const saved = value.filter((id): id is ColumnId => typeof id === "string" && validIds.has(id as ColumnId));
  const missing = defaultColumnOrder.filter((id) => !saved.includes(id));
  return [...saved, ...missing];
}

function normalizeVisibleColumns(value: unknown): ColumnId[] {
  if (!Array.isArray(value)) {
    return defaultVisibleColumns;
  }

  const validIds = new Set(allColumns.map((column) => column.id));
  const saved = value.filter((id): id is ColumnId => typeof id === "string" && validIds.has(id as ColumnId));
  if (!saved.length) {
    return defaultVisibleColumns;
  }

  return [...new Set([...saved, ...defaultVisibleColumns])];
}

function normalizeColumnWidths(value: unknown): Record<ColumnId, number> {
  if (!value || typeof value !== "object") {
    return defaultColumnWidths;
  }

  const widths = { ...defaultColumnWidths };
  for (const columnId of defaultColumnOrder) {
    const rawWidth = (value as Partial<Record<ColumnId, unknown>>)[columnId];
    if (typeof rawWidth === "number" && Number.isFinite(rawWidth)) {
      widths[columnId] = Math.min(520, Math.max(80, rawWidth));
    }
  }

  return widths;
}

export function TicketsList() {
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [ticketTeams, setTicketTeams] = useState<TicketTeam[]>([]);
  const [scope, setScope] = useState("all");
  const [assignedTeamId, setAssignedTeamId] = useState("");
  const [search, setSearch] = useState("");
  const [clientId, setClientId] = useState("");
  const [requester, setRequester] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("updatedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(defaultColumnOrder);
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnId>>(new Set(defaultVisibleColumns));
  const [columnWidths, setColumnWidths] = useState<Record<ColumnId, number>>(defaultColumnWidths);
  const [showColumnsPanel, setShowColumnsPanel] = useState(false);
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [trashMode, setTrashMode] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkAssignedUserId, setBulkAssignedUserId] = useState("");
  const [bulkAssignedTeamId, setBulkAssignedTeamId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<"20" | "50" | "100" | "all">("20");
  const [totalTickets, setTotalTickets] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const visibleOrderedColumns = useMemo(
    () =>
      columnOrder
        .map((id) => allColumns.find((column) => column.id === id))
        .filter((column): column is ColumnDefinition => {
          if (!column) {
            return false;
          }
          return visibleColumns.has(column.id);
        }),
    [columnOrder, visibleColumns]
  );

  const hasActiveFilters = Boolean(search || clientId || requester || status || priority || scope !== "all" || assignedTeamId);
  const selectedCount = selectedTicketIds.length;
  const allVisibleSelected = tickets.length > 0 && tickets.every((ticket) => selectedTicketIds.includes(ticket.id));

  async function loadTickets() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) {
        params.set("search", search.trim());
      }
      if (clientId) {
        params.set("clientId", clientId);
      }
      if (scope !== "all") {
        params.set("scope", scope);
      }
      if (assignedTeamId) {
        params.set("assignedTeamId", assignedTeamId);
      }
      if (requester.trim()) {
        params.set("requester", requester.trim());
      }
      if (status) {
        params.set("status", status);
      }
      if (priority) {
        params.set("priority", priority);
      }
      params.set("sortBy", sortBy);
      params.set("sortDirection", sortDirection);
      params.set("deletedScope", trashMode ? "deleted" : "active");
      params.set("page", String(page));
      params.set("pageSize", pageSize);
      const response = await apiFetch<PaginatedTickets | TicketListItem[]>(`/tickets?${params.toString()}`);
      const nextTickets = Array.isArray(response) ? response : Array.isArray(response.items) ? response.items : [];
      if (Array.isArray(response)) {
        setTickets(nextTickets);
        setTotalTickets(nextTickets.length);
        setTotalPages(1);
      } else {
        setTickets(nextTickets);
        setTotalTickets(response.total ?? nextTickets.length);
        setTotalPages(response.totalPages ?? 1);
      }
    } catch {
      setError("Unable to load tickets.");
    } finally {
      setLoading(false);
    }
  }

  async function loadClients() {
    try {
      const [clientData, userData, teamData] = await Promise.all([apiFetch<Client[]>("/clients"), apiFetch<User[]>("/users"), apiFetch<TicketTeam[]>("/ticket-teams")]);
      setClients(clientData);
      setUsers(userData);
      setTicketTeams(teamData);
    } catch {
      setClients([]);
      setUsers([]);
      setTicketTeams([]);
    }
  }

  async function applyBulkUpdate() {
    if (selectedCount === 0) {
      return;
    }

    const body: Record<string, unknown> = { ticketIds: selectedTicketIds };
    if (bulkStatus) {
      body.status = bulkStatus;
    }
    if (bulkAssignedUserId) {
      body.assignedUserId = bulkAssignedUserId;
      body.assignedUserIds = [bulkAssignedUserId];
    }
    if (bulkAssignedTeamId) {
      body.assignedTeamId = bulkAssignedTeamId;
    }
    if (!bulkStatus && !bulkAssignedUserId && !bulkAssignedTeamId) {
      setError("Choose a status, technician, or ticket team before applying changes.");
      return;
    }

    setBulkBusy(true);
    setError(null);
    try {
      await apiFetch("/tickets/bulk", {
        method: "PATCH",
        body: JSON.stringify(body)
      });
      setSelectedTicketIds([]);
      setBulkStatus("");
      setBulkAssignedUserId("");
      setBulkAssignedTeamId("");
      await loadTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to apply bulk update.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function deleteSelectedTickets() {
    if (selectedCount === 0 || !window.confirm(`Move ${selectedCount} selected ticket${selectedCount === 1 ? "" : "s"} to the recycle bin?`)) {
      return;
    }

    setBulkBusy(true);
    setError(null);
    try {
      await apiFetch("/tickets/bulk/delete", {
        method: "POST",
        body: JSON.stringify({ ticketIds: selectedTicketIds })
      });
      setSelectedTicketIds([]);
      await loadTickets();
    } catch {
      setError("Unable to move tickets to recycle bin.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function restoreSelectedTickets() {
    if (selectedCount === 0) {
      return;
    }

    setBulkBusy(true);
    setError(null);
    try {
      await apiFetch("/tickets/bulk/restore", {
        method: "POST",
        body: JSON.stringify({ ticketIds: selectedTicketIds })
      });
      setSelectedTicketIds([]);
      await loadTickets();
    } catch {
      setError("Unable to restore tickets.");
    } finally {
      setBulkBusy(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setClientId("");
    setScope("all");
    setAssignedTeamId("");
    setRequester("");
    setStatus("");
    setPriority("");
  }

  function changeSort(column: ColumnDefinition) {
    if (!column.sortable) {
      return;
    }

    if (sortBy === column.sortable) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortBy(column.sortable);
    setSortDirection(column.sortable === "createdAt" || column.sortable === "updatedAt" ? "desc" : "asc");
  }

  function toggleColumn(columnId: ColumnId) {
    setVisibleColumns((current) => {
      const next = new Set(current);
      if (next.has(columnId)) {
        if (next.size === 1) {
          return next;
        }
        next.delete(columnId);
      } else {
        next.add(columnId);
      }
      return next;
    });
  }

  function moveColumn(columnId: ColumnId, direction: -1 | 1) {
    setColumnOrder((current) => {
      const index = current.indexOf(columnId);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function startColumnResize(columnId: ColumnId, event: ReactMouseEvent<HTMLSpanElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = columnWidths[columnId] ?? defaultColumnWidths[columnId];

    function handleMouseMove(moveEvent: MouseEvent) {
      const nextWidth = Math.min(520, Math.max(56, startWidth + moveEvent.clientX - startX));
      setColumnWidths((current) => ({ ...current, [columnId]: nextWidth }));
    }

    function handleMouseUp() {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  function toggleTicketSelection(ticketId: string) {
    setSelectedTicketIds((current) => (current.includes(ticketId) ? current.filter((id) => id !== ticketId) : [...current, ticketId]));
  }

  function toggleSelectAllVisible() {
    setSelectedTicketIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !tickets.some((ticket) => ticket.id === id));
      }

      return [...new Set([...current, ...tickets.map((ticket) => ticket.id)])];
    });
  }

  function renderCell(ticket: TicketListItem, columnId: ColumnId) {
    switch (columnId) {
      case "ticketNumber":
        return ticket.id ? <Link href={`/tickets/${ticket.id}`}>{ticket.ticketNumber}</Link> : ticket.ticketNumber;
      case "subject":
        return ticket.id ? (
          <Link className="table-cell-stack ticket-subject-link" href={`/tickets/${ticket.id}`}>
            <strong>{ticket.subject}</strong>
            <span>{ticket.senderEmail ?? label(ticket.source)}</span>
          </Link>
        ) : (
          <span className="table-cell-stack">
            <strong>{ticket.subject}</strong>
            <span>{ticket.senderEmail ?? label(ticket.source)}</span>
          </span>
        );
      case "client":
        return ticket.client?.name ?? (ticket.senderDomain ? `Unmapped: ${ticket.senderDomain}` : "Unassigned");
      case "requester":
        return ticket.contact ? (
          <span className="table-cell-stack">
            <strong>
              {ticket.contact.firstName} {ticket.contact.lastName}
            </strong>
            <span>{ticket.contact.email}</span>
          </span>
        ) : (
          ticket.senderEmail ?? "Unknown"
        );
      case "readState":
        return (
          <span className={`status-pill ${ticket.firstReadAt ? "success" : ""}`} title={ticket.firstReadBy ? `Opened by ${ticket.firstReadBy.firstName} ${ticket.firstReadBy.lastName}` : undefined}>
            {ticket.firstReadAt ? "Read" : "Unread"}
          </span>
        );
      case "assignees":
        return ticket.assignees?.length
          ? ticket.assignees.map((assignment) => `${assignment.user.firstName} ${assignment.user.lastName}`).join(", ")
          : ticket.assignedUser
            ? `${ticket.assignedUser.firstName} ${ticket.assignedUser.lastName}`
            : "Unassigned";
      case "team":
        return ticket.assignedTeam?.name ?? (ticket.assignedGroup ? `${ticket.assignedGroup.name} (legacy)` : "Unassigned");
      case "status":
        return <span className="status-pill">{label(ticket.status)}</span>;
      case "priority":
        return label(ticket.priority);
      case "source":
        return label(ticket.source);
      case "createdAt":
        return formatDate(ticket.createdAt);
      case "updatedAt":
        return formatDate(ticket.updatedAt);
      case "messages":
        return ticket._count.messages;
      case "attachments":
        return ticket._count.attachments;
      default:
        return null;
    }
  }

  useEffect(() => {
    void loadClients();
    const savedColumns = window.localStorage.getItem(COLUMN_STORAGE_KEY);
    if (savedColumns) {
      try {
        const parsed = JSON.parse(savedColumns) as { order?: unknown; visible?: unknown };
        const nextOrder = normalizeColumnOrder(parsed.order);
        const nextVisible = normalizeVisibleColumns(parsed.visible);
        setColumnOrder(nextOrder);
        setVisibleColumns(new Set(nextVisible));
      } catch {
        window.localStorage.removeItem(COLUMN_STORAGE_KEY);
      }
    }
    const savedWidths = window.localStorage.getItem(COLUMN_WIDTH_STORAGE_KEY);
    if (savedWidths) {
      try {
        setColumnWidths(normalizeColumnWidths(JSON.parse(savedWidths)));
      } catch {
        window.localStorage.removeItem(COLUMN_WIDTH_STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      COLUMN_STORAGE_KEY,
      JSON.stringify({
        order: columnOrder,
        visible: [...visibleColumns]
      })
    );
  }, [columnOrder, visibleColumns]);

  useEffect(() => {
    window.localStorage.setItem(COLUMN_WIDTH_STORAGE_KEY, JSON.stringify(columnWidths));
  }, [columnWidths]);

  useEffect(() => {
    setPage(1);
  }, [search, clientId, scope, assignedTeamId, requester, status, priority, sortBy, sortDirection, trashMode, pageSize]);

  useEffect(() => {
    setSelectedTicketIds([]);
    const timeoutId = window.setTimeout(() => {
      void loadTickets();
    }, 300);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, clientId, scope, assignedTeamId, requester, status, priority, sortBy, sortDirection, trashMode, page, pageSize]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Tickets</h1>
          <p className="muted">Live ticket list from manual and email-created requests.</p>
        </div>
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={() => void loadTickets()} disabled={loading}>
            <RefreshCcw size={16} aria-hidden="true" />
            <span>Refresh</span>
          </button>
          <button className="button secondary" type="button" onClick={() => setShowColumnsPanel((current) => !current)}>
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span>Columns</span>
          </button>
          <button className={`button ${trashMode ? "" : "secondary"}`} type="button" onClick={() => setTrashMode((current) => !current)}>
            {trashMode ? <RotateCcw size={16} aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
            <span>{trashMode ? "Active Tickets" : "Recycle Bin"}</span>
          </button>
        </div>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      <section className="panel tickets-toolbar-panel">
        <div className="tickets-filter-grid">
          <label className="input-with-icon tickets-search-field">
            <Search size={16} aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search number, subject, body, client, domain, or requester" />
          </label>
          <select className="input" value={clientId} onChange={(event) => setClientId(event.target.value)}>
            <option value="">All clients</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <select className="input" value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="all">All tickets</option>
            <option value="assigned_to_me">My tickets</option>
            <option value="my_teams">My team tickets</option>
            <option value="unassigned">Unassigned</option>
          </select>
          <select className="input" value={assignedTeamId} onChange={(event) => setAssignedTeamId(event.target.value)}>
            <option value="">All ticket teams</option>
            {ticketTeams.filter((team) => team.isActive).map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <input className="input" value={requester} onChange={(event) => setRequester(event.target.value)} placeholder="Requester name or email" />
          <select className="input" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {statuses.map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
          <select className="input" value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option value="">All priorities</option>
            {priorities.map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
          <button className="button secondary" type="button" onClick={clearFilters} disabled={!hasActiveFilters}>
            Clear
          </button>
        </div>
        {showColumnsPanel ? (
          <div className="column-config-panel">
            {columnOrder.map((columnId, index) => {
              const column = allColumns.find((item) => item.id === columnId);
              if (!column) {
                return null;
              }

              return (
                <div className="column-config-row" key={column.id}>
                  <label>
                    <input type="checkbox" checked={visibleColumns.has(column.id)} onChange={() => toggleColumn(column.id)} />
                    <span>{column.label}</span>
                  </label>
                  <div className="row-actions">
                    <button className="icon-button" type="button" title="Move left" onClick={() => moveColumn(column.id, -1)} disabled={index === 0}>
                      <ArrowLeft size={15} aria-hidden="true" />
                    </button>
                    <button className="icon-button" type="button" title="Move right" onClick={() => moveColumn(column.id, 1)} disabled={index === columnOrder.length - 1}>
                      <ArrowRight size={15} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>
      <section className="panel bulk-actions-panel">
        <div className="bulk-actions-summary">
          <strong>
            {selectedCount} selected {trashMode ? "in recycle bin" : ""}
          </strong>
          {selectedCount > 0 ? (
            <button className="button secondary" type="button" onClick={() => setSelectedTicketIds([])}>
              Clear selection
            </button>
          ) : null}
        </div>
        {trashMode ? (
          <div className="form-actions">
            <button className="button" type="button" onClick={restoreSelectedTickets} disabled={selectedCount === 0 || bulkBusy}>
              <RotateCcw size={16} aria-hidden="true" />
              <span>Restore Selected</span>
            </button>
          </div>
        ) : (
          <div className="bulk-actions-grid">
            <select className="input" value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)}>
              <option value="">Change status</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
            <select className="input" value={bulkAssignedUserId} onChange={(event) => setBulkAssignedUserId(event.target.value)}>
              <option value="">Assign technician</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.firstName} {user.lastName}
                </option>
              ))}
            </select>
            <select className="input" value={bulkAssignedTeamId} onChange={(event) => setBulkAssignedTeamId(event.target.value)}>
              <option value="">Assign ticket team</option>
              {ticketTeams.filter((team) => team.isActive).map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            <button className="button" type="button" onClick={applyBulkUpdate} disabled={selectedCount === 0 || bulkBusy}>
              Apply
            </button>
            <button className="button danger" type="button" onClick={deleteSelectedTickets} disabled={selectedCount === 0 || bulkBusy}>
              <Trash2 size={16} aria-hidden="true" />
              <span>Delete</span>
            </button>
          </div>
        )}
      </section>
      <section className="panel tickets-table-panel">
        <div className="table-summary">
          <span>
            {totalTickets} ticket{totalTickets === 1 ? "" : "s"}
          </span>
          <span className="muted">{loading ? "Refreshing..." : `Sorted by ${allColumns.find((column) => column.sortable === sortBy)?.label ?? "Modified"}`}</span>
        </div>
        <div className="table-scroll">
          <table className="table tickets-table">
            <colgroup>
              <col style={{ width: 42 }} />
              {visibleOrderedColumns.map((column) => (
                <col key={column.id} style={{ width: columnWidths[column.id] ?? defaultColumnWidths[column.id] }} />
              ))}
              <col style={{ width: 54 }} />
            </colgroup>
            <thead>
              <tr>
                <th>
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} aria-label="Select all visible tickets" />
                </th>
                {visibleOrderedColumns.map((column) => (
                  <th key={column.id}>
                    <div className="resizable-column-header">
                      {column.sortable ? (
                        <button className="table-sort-button" type="button" onClick={() => changeSort(column)}>
                          <span>{column.label}</span>
                          {sortBy === column.sortable ? (
                            sortDirection === "asc" ? (
                              <ArrowUp size={14} aria-hidden="true" />
                            ) : (
                              <ArrowDown size={14} aria-hidden="true" />
                            )
                          ) : (
                            <ArrowUpDown size={14} aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        <span>{column.label}</span>
                      )}
                      <span className="column-resize-handle" role="separator" aria-label={`Resize ${column.label} column`} onMouseDown={(event) => startColumnResize(column.id, event)} />
                    </div>
                  </th>
                ))}
                <th>
                  <span className="visually-hidden">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={visibleOrderedColumns.length + 2}>Loading tickets...</td>
                </tr>
              ) : null}
              {!loading && tickets.length === 0 ? (
                <tr>
                  <td colSpan={visibleOrderedColumns.length + 2}>No tickets match the current filters.</td>
                </tr>
              ) : null}
              {tickets.map((ticket, index) => (
                <tr key={ticket.id ?? `${ticket.ticketNumber}-${index}`}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedTicketIds.includes(ticket.id)}
                      onChange={() => toggleTicketSelection(ticket.id)}
                      aria-label={`Select ${ticket.ticketNumber}`}
                    />
                  </td>
                  {visibleOrderedColumns.map((column) => (
                    <td key={column.id}>{renderCell(ticket, column.id)}</td>
                  ))}
                  <td className="row-actions-cell">
                    {ticket.id ? (
                      <Link className="icon-button" href={`/tickets/${ticket.id}`} title="Open ticket">
                        <Eye size={16} aria-hidden="true" />
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pagination-bar">
          <div className="form-actions">
            <span className="muted">Rows</span>
            <select className="input compact-select" value={pageSize} onChange={(event) => setPageSize(event.target.value as "20" | "50" | "100" | "all")}>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="all">All</option>
            </select>
          </div>
          <div className="form-actions">
            <button className="button secondary" type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || pageSize === "all"}>
              Previous
            </button>
            <span className="muted">
              Page {pageSize === "all" ? 1 : page} of {totalPages}
            </span>
            <button className="button secondary" type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || pageSize === "all"}>
              Next
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
