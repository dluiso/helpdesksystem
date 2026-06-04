"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Eye,
  GitMerge,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  X
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
  mergedIntoTicket: { id: string; ticketNumber: string; subject: string } | null;
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

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
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
type TableDensity = "compact" | "comfortable";
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

interface TicketViewState {
  search: string;
  clientId: string;
  scope: string;
  assignedTeamId: string;
  requester: string;
  statuses: string[];
  priority: string;
  sortBy: SortBy;
  sortDirection: SortDirection;
  pageSize: "20" | "50" | "100" | "all";
  density: TableDensity;
  columnOrder: ColumnId[];
  visibleColumns: ColumnId[];
}

interface TicketView {
  id: string;
  name: string;
  state: TicketViewState;
  isDefault: boolean;
}

const COLUMN_STORAGE_KEY = "avidity.ticketTable.columns";
const COLUMN_WIDTH_STORAGE_KEY = "avidity.ticketTable.columnWidths.v2";
const DENSITY_STORAGE_KEY = "avidity.ticketTable.density.v1";
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
const statuses = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "WAITING_ON_THIRD_PARTY", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED", "MERGED"];
const mutableStatuses = statuses.filter((value) => value !== "MERGED");
const priorities = ["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"];
const builtInViews: Array<{ id: string; name: string; state: Partial<TicketViewState> }> = [
  { id: "all", name: "All tickets", state: { scope: "all", statuses: [], priority: "" } },
  { id: "new", name: "New tickets", state: { statuses: ["NEW"], scope: "all" } },
  { id: "open", name: "Open tickets", state: { statuses: ["OPEN"], scope: "all" } },
  { id: "closed", name: "Closed tickets", state: { statuses: ["CLOSED"], scope: "all" } },
  { id: "mine", name: "My tickets", state: { scope: "assigned_to_me", statuses: [] } },
  { id: "unassigned", name: "Unassigned", state: { scope: "unassigned", statuses: [] } },
  { id: "high", name: "High priority", state: { priority: "HIGH", scope: "all" } }
];

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

  return [...new Set(saved)];
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

function normalizeDensity(value: unknown): TableDensity {
  return value === "compact" || value === "comfortable" ? value : "comfortable";
}

function normalizeTicketViewState(value: unknown): TicketViewState {
  const state = value && typeof value === "object" ? (value as Partial<TicketViewState>) : {};
  const nextSortBy = allColumns.some((column) => column.sortable === state.sortBy) ? state.sortBy as SortBy : "updatedAt";
  const nextPageSize = state.pageSize === "20" || state.pageSize === "50" || state.pageSize === "100" || state.pageSize === "all" ? state.pageSize : "20";
  const legacyStatus = typeof (state as { status?: unknown }).status === "string" ? (state as { status: string }).status : "";
  const nextStatuses = Array.isArray(state.statuses)
    ? state.statuses.filter((status): status is string => typeof status === "string" && statuses.includes(status))
    : legacyStatus && statuses.includes(legacyStatus)
      ? [legacyStatus]
      : [];

  return {
    search: typeof state.search === "string" ? state.search : "",
    clientId: typeof state.clientId === "string" ? state.clientId : "",
    scope: typeof state.scope === "string" ? state.scope : "all",
    assignedTeamId: typeof state.assignedTeamId === "string" ? state.assignedTeamId : "",
    requester: typeof state.requester === "string" ? state.requester : "",
    statuses: [...new Set(nextStatuses)],
    priority: typeof state.priority === "string" ? state.priority : "",
    sortBy: nextSortBy,
    sortDirection: state.sortDirection === "asc" || state.sortDirection === "desc" ? state.sortDirection : "desc",
    pageSize: nextPageSize,
    density: normalizeDensity(state.density),
    columnOrder: normalizeColumnOrder(state.columnOrder),
    visibleColumns: normalizeVisibleColumns(state.visibleColumns)
  };
}

export function TicketsList() {
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [ticketTeams, setTicketTeams] = useState<TicketTeam[]>([]);
  const [ticketViews, setTicketViews] = useState<TicketView[]>([]);
  const [selectedViewId, setSelectedViewId] = useState("built-in:all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [scope, setScope] = useState("all");
  const [assignedTeamId, setAssignedTeamId] = useState("");
  const [search, setSearch] = useState("");
  const [clientId, setClientId] = useState("");
  const [requester, setRequester] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [priority, setPriority] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("updatedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(defaultColumnOrder);
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnId>>(new Set(defaultVisibleColumns));
  const [columnWidths, setColumnWidths] = useState<Record<ColumnId, number>>(defaultColumnWidths);
  const [showColumnsPanel, setShowColumnsPanel] = useState(false);
  const [density, setDensity] = useState<TableDensity>("comfortable");
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [trashMode, setTrashMode] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkAssignedUserId, setBulkAssignedUserId] = useState("");
  const [bulkAssignedTeamId, setBulkAssignedTeamId] = useState("");
  const [bulkPriority, setBulkPriority] = useState("");
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergePrimaryTicketId, setMergePrimaryTicketId] = useState("");
  const [mergeReason, setMergeReason] = useState("");
  const [mergeAllowDifferentClient, setMergeAllowDifferentClient] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<"20" | "50" | "100" | "all">("20");
  const [totalTickets, setTotalTickets] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [newTicketClientId, setNewTicketClientId] = useState("");
  const [newTicketContactId, setNewTicketContactId] = useState("");
  const [newTicketContacts, setNewTicketContacts] = useState<Contact[]>([]);
  const [newTicketSubject, setNewTicketSubject] = useState("");
  const [newTicketDescription, setNewTicketDescription] = useState("");
  const [newTicketPriority, setNewTicketPriority] = useState("NORMAL");
  const [newTicketStatus, setNewTicketStatus] = useState("NEW");
  const [newTicketAssignedUserId, setNewTicketAssignedUserId] = useState("");
  const [newTicketAssignedTeamId, setNewTicketAssignedTeamId] = useState("");
  const [newTicketBusy, setNewTicketBusy] = useState(false);
  const [inlineAssignmentTicketId, setInlineAssignmentTicketId] = useState<string | null>(null);
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

  const hasActiveFilters = Boolean(search || clientId || requester || selectedStatuses.length > 0 || priority || scope !== "all" || assignedTeamId);
  const selectedCount = selectedTicketIds.length;
  const allVisibleSelected = tickets.length > 0 && tickets.every((ticket) => selectedTicketIds.includes(ticket.id));
  const selectedTickets = useMemo(() => selectedTicketIds.map((id) => tickets.find((ticket) => ticket.id === id)).filter((ticket): ticket is TicketListItem => Boolean(ticket)), [selectedTicketIds, tickets]);
  const mergePrimaryTicket = selectedTickets.find((ticket) => ticket.id === mergePrimaryTicketId) ?? selectedTickets[0] ?? null;
  const mergeSourceTickets = selectedTickets.filter((ticket) => ticket.id !== mergePrimaryTicket?.id);

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
      if (selectedStatuses.length > 0) {
        params.set("statuses", selectedStatuses.join(","));
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

  async function loadTicketViews(applyDefault = false) {
    try {
      const viewData = await apiFetch<TicketView[]>("/tickets/views");
      const normalizedViews = viewData.map((view) => ({ ...view, state: normalizeTicketViewState(view.state) }));
      setTicketViews(normalizedViews);
      if (applyDefault) {
        const defaultView = normalizedViews.find((view) => view.isDefault);
        if (defaultView) {
          applyViewState(defaultView.state);
          setSelectedViewId(`saved:${defaultView.id}`);
        }
      }
    } catch {
      setTicketViews([]);
    }
  }

  function currentViewState(): TicketViewState {
    return {
      search,
      clientId,
      scope,
      assignedTeamId,
      requester,
      statuses: selectedStatuses,
      priority,
      sortBy,
      sortDirection,
      pageSize,
      density,
      columnOrder,
      visibleColumns: [...visibleColumns]
    };
  }

  function applyViewState(nextState: Partial<TicketViewState>) {
    const normalized = normalizeTicketViewState({ ...currentViewState(), ...nextState });
    setSearch(normalized.search);
    setClientId(normalized.clientId);
    setScope(normalized.scope);
    setAssignedTeamId(normalized.assignedTeamId);
    setRequester(normalized.requester);
    setSelectedStatuses(normalized.statuses);
    setPriority(normalized.priority);
    setSortBy(normalized.sortBy);
    setSortDirection(normalized.sortDirection);
    setPageSize(normalized.pageSize);
    setDensity(normalized.density);
    setColumnOrder(normalized.columnOrder);
    setVisibleColumns(new Set(normalized.visibleColumns));
    setPage(1);
  }

  function changeView(value: string) {
    setSelectedViewId(value);
    if (value.startsWith("built-in:")) {
      const builtIn = builtInViews.find((view) => `built-in:${view.id}` === value);
      if (builtIn) {
        applyViewState(builtIn.state);
      }
      return;
    }

    const savedView = ticketViews.find((view) => `saved:${view.id}` === value);
    if (savedView) {
      applyViewState(savedView.state);
    }
  }

  async function saveCurrentView() {
    const existingView = selectedViewId.startsWith("saved:")
      ? ticketViews.find((view) => `saved:${view.id}` === selectedViewId)
      : null;
    const name = window.prompt("View name", existingView?.name ?? "");
    if (!name?.trim()) {
      return;
    }

    const isDefault = window.confirm("Make this your default ticket view?");
    const saved = await apiFetch<TicketView>(existingView ? `/tickets/views/${existingView.id}` : "/tickets/views", {
      method: existingView ? "PATCH" : "POST",
      body: JSON.stringify({
        name: name.trim(),
        state: currentViewState(),
        isDefault
      })
    });
    await loadTicketViews();
    setSelectedViewId(`saved:${saved.id}`);
  }

  async function deleteCurrentView() {
    const savedView = selectedViewId.startsWith("saved:")
      ? ticketViews.find((view) => `saved:${view.id}` === selectedViewId)
      : null;
    if (!savedView || !window.confirm(`Delete saved view "${savedView.name}"?`)) {
      return;
    }

    await apiFetch(`/tickets/views/${savedView.id}`, { method: "DELETE" });
    setSelectedViewId("built-in:all");
    await loadTicketViews();
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
    if (bulkPriority) {
      body.priority = bulkPriority;
    }
    if (!bulkStatus && !bulkAssignedUserId && !bulkAssignedTeamId && !bulkPriority) {
      setError("Choose a status, technician, ticket team, or priority before applying changes.");
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
      setBulkPriority("");
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

  function resetNewTicketForm() {
    setNewTicketClientId("");
    setNewTicketContactId("");
    setNewTicketContacts([]);
    setNewTicketSubject("");
    setNewTicketDescription("");
    setNewTicketPriority("NORMAL");
    setNewTicketStatus("NEW");
    setNewTicketAssignedUserId("");
    setNewTicketAssignedTeamId("");
  }

  async function loadNewTicketContacts(clientIdValue: string) {
    setNewTicketContactId("");
    if (!clientIdValue) {
      setNewTicketContacts([]);
      return;
    }

    try {
      const contactData = await apiFetch<Contact[]>(`/clients/${clientIdValue}/contacts`);
      setNewTicketContacts(contactData);
    } catch {
      setNewTicketContacts([]);
    }
  }

  async function createManualTicket() {
    if (!newTicketSubject.trim()) {
      setError("Subject is required to create a ticket.");
      return;
    }

    setNewTicketBusy(true);
    setError(null);
    try {
      const created = await apiFetch<TicketListItem>("/tickets", {
        method: "POST",
        body: JSON.stringify({
          subject: newTicketSubject.trim(),
          description: newTicketDescription.trim() || undefined,
          clientId: newTicketClientId || undefined,
          contactId: newTicketContactId || undefined,
          priority: newTicketPriority,
          source: "MANUAL"
        })
      });

      if (newTicketStatus !== "NEW" || newTicketAssignedUserId || newTicketAssignedTeamId) {
        await apiFetch(`/tickets/${created.ticketNumber}/assignment`, {
          method: "PATCH",
          body: JSON.stringify({
            status: newTicketStatus,
            assignedUserId: newTicketAssignedUserId || null,
            assignedUserIds: newTicketAssignedUserId ? [newTicketAssignedUserId] : [],
            assignedTeamId: newTicketAssignedTeamId || null
          })
        });
      }

      resetNewTicketForm();
      setShowNewTicketModal(false);
      await loadTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create ticket.");
    } finally {
      setNewTicketBusy(false);
    }
  }

  async function assignTicketInline(ticket: TicketListItem, assignedUserId: string) {
    setInlineAssignmentTicketId(ticket.id);
    setError(null);
    try {
      await apiFetch(`/tickets/${ticket.ticketNumber}/assignment`, {
        method: "PATCH",
        body: JSON.stringify({
          assignedUserId: assignedUserId || null,
          assignedUserIds: assignedUserId ? [assignedUserId] : []
        })
      });
      await loadTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to assign ticket.");
    } finally {
      setInlineAssignmentTicketId(null);
    }
  }

  function openMergeModal() {
    if (selectedCount < 2) {
      setError("Select at least two tickets to merge.");
      return;
    }

    setMergePrimaryTicketId(selectedTicketIds[0] ?? "");
    setMergeReason("");
    setMergeAllowDifferentClient(false);
    setShowMergeModal(true);
  }

  async function mergeSelectedTickets() {
    if (!mergePrimaryTicket || mergeSourceTickets.length === 0) {
      setError("Choose one primary ticket and at least one ticket to merge into it.");
      return;
    }

    setMergeBusy(true);
    setError(null);
    try {
      await apiFetch(`/tickets/${mergePrimaryTicket.ticketNumber}/merge`, {
        method: "POST",
        body: JSON.stringify({
          sourceTicketIds: mergeSourceTickets.map((ticket) => ticket.id),
          reason: mergeReason.trim() || undefined,
          allowDifferentClient: mergeAllowDifferentClient
        })
      });
      setShowMergeModal(false);
      setSelectedTicketIds([]);
      await loadTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to merge selected tickets.");
    } finally {
      setMergeBusy(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setClientId("");
    setScope("all");
    setAssignedTeamId("");
    setRequester("");
    setSelectedStatuses([]);
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

  function toggleStatusFilter(value: string) {
    setSelectedStatuses((current) => (current.includes(value) ? current.filter((status) => status !== value) : [...current, value]));
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
        return ticket.id ? <Link href={`/tickets/${ticket.ticketNumber}`}>{ticket.ticketNumber}</Link> : ticket.ticketNumber;
      case "subject":
        return ticket.id ? (
          <Link className="table-cell-stack ticket-subject-link" href={`/tickets/${ticket.ticketNumber}`}>
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
        return (
          <select
            className="input inline-ticket-select"
            value={ticket.assignees?.[0]?.user.id ?? ticket.assignedUser?.id ?? ""}
            onChange={(event) => void assignTicketInline(ticket, event.target.value)}
            disabled={inlineAssignmentTicketId === ticket.id || ticket.status === "MERGED" || trashMode}
            title="Assign specialist"
          >
            <option value="">Unassigned</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.firstName} {user.lastName}
              </option>
            ))}
          </select>
        );
      case "team":
        return ticket.assignedTeam?.name ?? (ticket.assignedGroup ? `${ticket.assignedGroup.name} (legacy)` : "Unassigned");
      case "status":
        return <span className={`status-pill ${ticket.status === "MERGED" ? "muted-pill" : ""}`}>{label(ticket.status)}</span>;
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
    void loadTicketViews(true);
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
    const savedDensity = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    setDensity(normalizeDensity(savedDensity));
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
    window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
  }, [density]);

  useEffect(() => {
    setPage(1);
  }, [search, clientId, scope, assignedTeamId, requester, selectedStatuses, priority, sortBy, sortDirection, trashMode, pageSize]);

  useEffect(() => {
    setSelectedTicketIds([]);
    const timeoutId = window.setTimeout(() => {
      void loadTickets();
    }, 300);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, clientId, scope, assignedTeamId, requester, selectedStatuses, priority, sortBy, sortDirection, trashMode, page, pageSize]);

  useEffect(() => {
    void loadNewTicketContacts(newTicketClientId);
  }, [newTicketClientId]);

  return (
    <>
      <div className="tickets-compact-header">
        <div className="tickets-compact-title">
          <h1>Tickets</h1>
          <span className="status-pill">{totalTickets} total</span>
        </div>
        <label className="input-with-icon tickets-search-field">
          <Search size={16} aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search number, subject, body, client, domain, or requester" />
        </label>
        <select className="input tickets-view-select" value={selectedViewId} onChange={(event) => changeView(event.target.value)}>
          <optgroup label="Standard views">
            {builtInViews.map((view) => (
              <option key={view.id} value={`built-in:${view.id}`}>
                {view.name}
              </option>
            ))}
          </optgroup>
          {ticketViews.length ? (
            <optgroup label="Saved views">
              {ticketViews.map((view) => (
                <option key={view.id} value={`saved:${view.id}`}>
                  {view.isDefault ? "* " : ""}{view.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <div className="form-actions tickets-header-actions">
          <button className={`button ${hasActiveFilters ? "" : "secondary"}`} type="button" onClick={() => setShowAdvancedFilters((current) => !current)}>
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span>{hasActiveFilters ? "Filters Active" : "Filters"}</span>
          </button>
          <button className="button" type="button" onClick={() => setShowNewTicketModal(true)}>
            <Plus size={16} aria-hidden="true" />
            <span>New Ticket</span>
          </button>
          <button className="button secondary" type="button" onClick={saveCurrentView}>
            <Save size={16} aria-hidden="true" />
            <span>Save View</span>
          </button>
          {selectedViewId.startsWith("saved:") ? (
            <button className="button secondary" type="button" onClick={deleteCurrentView}>
              <X size={16} aria-hidden="true" />
              <span>Delete View</span>
            </button>
          ) : null}
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
      {showAdvancedFilters ? (
        <section className="panel tickets-toolbar-panel">
          <div className="tickets-filter-grid">
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
          <div className="ticket-status-filter">
            <span>{selectedStatuses.length ? `${selectedStatuses.length} status${selectedStatuses.length === 1 ? "" : "es"}` : "All statuses"}</span>
            <div className="ticket-status-filter-menu">
              {statuses.map((value) => (
                <label className="checkbox-row" key={value}>
                  <input type="checkbox" checked={selectedStatuses.includes(value)} onChange={() => toggleStatusFilter(value)} />
                  {label(value)}
                </label>
              ))}
              {selectedStatuses.length ? (
                <button className="button secondary compact-button" type="button" onClick={() => setSelectedStatuses([])}>
                  Clear statuses
                </button>
              ) : null}
            </div>
          </div>
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
        </section>
      ) : null}
      {showColumnsPanel ? (
        <section className="panel tickets-toolbar-panel">
          <div className="column-config-toolbar">
            <select className="input compact-select" value={density} onChange={(event) => setDensity(event.target.value as TableDensity)}>
              <option value="comfortable">Comfortable rows</option>
              <option value="compact">Compact rows</option>
            </select>
          </div>
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
        </section>
      ) : null}
      {selectedCount > 0 ? (
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
              {mutableStatuses.map((value) => (
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
            <select className="input" value={bulkPriority} onChange={(event) => setBulkPriority(event.target.value)}>
              <option value="">Set priority</option>
              {priorities.map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
            <button className="button" type="button" onClick={applyBulkUpdate} disabled={selectedCount === 0 || bulkBusy}>
              Apply
            </button>
            <button className="button secondary" type="button" onClick={openMergeModal} disabled={selectedCount < 2 || bulkBusy}>
              <GitMerge size={16} aria-hidden="true" />
              <span>Merge</span>
            </button>
            <button className="button danger" type="button" onClick={deleteSelectedTickets} disabled={selectedCount === 0 || bulkBusy}>
              <Trash2 size={16} aria-hidden="true" />
              <span>Delete</span>
            </button>
          </div>
        )}
      </section>
      ) : null}
      <section className="panel tickets-table-panel">
        <div className="table-summary">
          <span>
            {totalTickets} ticket{totalTickets === 1 ? "" : "s"}
          </span>
          <span className="muted">{loading ? "Refreshing..." : `Sorted by ${allColumns.find((column) => column.sortable === sortBy)?.label ?? "Modified"}`}</span>
        </div>
        <div className="table-scroll">
          <table className={`table tickets-table ${density}`}>
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
                      <Link className="icon-button" href={`/tickets/${ticket.ticketNumber}`} title="Open ticket">
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
      {showNewTicketModal ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel compact-modal" role="dialog" aria-modal="true" aria-labelledby="new-ticket-modal-title">
            <div className="modal-header">
              <div>
                <h2 id="new-ticket-modal-title">New Ticket</h2>
                <p className="muted">Create a manual ticket using the existing ticket workflow.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setShowNewTicketModal(false)} aria-label="Close new ticket dialog">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="ticket-create-grid">
              <label className="field">
                <span>Client</span>
                <select className="input" value={newTicketClientId} onChange={(event) => setNewTicketClientId(event.target.value)}>
                  <option value="">No client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Requester</span>
                <select className="input" value={newTicketContactId} onChange={(event) => setNewTicketContactId(event.target.value)} disabled={!newTicketClientId}>
                  <option value="">No requester</option>
                  {newTicketContacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.firstName} {contact.lastName} - {contact.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field ticket-create-wide">
                <span>Subject</span>
                <input className="input" value={newTicketSubject} onChange={(event) => setNewTicketSubject(event.target.value)} />
              </label>
              <label className="field ticket-create-wide">
                <span>Description</span>
                <textarea className="input" rows={4} value={newTicketDescription} onChange={(event) => setNewTicketDescription(event.target.value)} />
              </label>
              <label className="field">
                <span>Priority</span>
                <select className="input" value={newTicketPriority} onChange={(event) => setNewTicketPriority(event.target.value)}>
                  {priorities.map((value) => (
                    <option key={value} value={value}>
                      {label(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Status</span>
                <select className="input" value={newTicketStatus} onChange={(event) => setNewTicketStatus(event.target.value)}>
                  {mutableStatuses.map((value) => (
                    <option key={value} value={value}>
                      {label(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Assigned technician</span>
                <select className="input" value={newTicketAssignedUserId} onChange={(event) => setNewTicketAssignedUserId(event.target.value)}>
                  <option value="">Unassigned</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.firstName} {user.lastName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Ticket team</span>
                <select className="input" value={newTicketAssignedTeamId} onChange={(event) => setNewTicketAssignedTeamId(event.target.value)}>
                  <option value="">No team</option>
                  {ticketTeams.filter((team) => team.isActive).map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="modal-actions">
              <button className="button secondary" type="button" onClick={() => setShowNewTicketModal(false)} disabled={newTicketBusy}>
                Cancel
              </button>
              <button className="button" type="button" onClick={createManualTicket} disabled={newTicketBusy || !newTicketSubject.trim()}>
                <Plus size={16} aria-hidden="true" />
                <span>{newTicketBusy ? "Creating..." : "Create Ticket"}</span>
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {showMergeModal ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel compact-modal" role="dialog" aria-modal="true" aria-labelledby="ticket-merge-modal-title">
            <div className="modal-header">
              <div>
                <h2 id="ticket-merge-modal-title">Merge Tickets</h2>
                <p className="muted">Choose the primary ticket that will keep the full conversation.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setShowMergeModal(false)} aria-label="Close merge dialog">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="merge-ticket-list">
              {selectedTickets.map((ticket) => (
                <label className="merge-ticket-option" key={ticket.id}>
                  <input type="radio" name="merge-primary-ticket" checked={ticket.id === mergePrimaryTicket?.id} onChange={() => setMergePrimaryTicketId(ticket.id)} />
                  <span>
                    <strong>{ticket.ticketNumber}</strong>
                    <span>{ticket.subject}</span>
                    <span className="muted">{ticket.client?.name ?? "Unassigned"} - {label(ticket.status)}</span>
                  </span>
                </label>
              ))}
            </div>
            <label className="field">
              <span>Merge reason</span>
              <textarea className="input" rows={3} value={mergeReason} onChange={(event) => setMergeReason(event.target.value)} placeholder="Optional note for the internal merge summary" />
            </label>
            <label className="checkbox-card">
              <input type="checkbox" checked={mergeAllowDifferentClient} onChange={(event) => setMergeAllowDifferentClient(event.target.checked)} />
              <span>Allow merge if selected tickets belong to different clients</span>
            </label>
            {mergePrimaryTicket ? (
              <p className="muted">
                {mergeSourceTickets.length} ticket{mergeSourceTickets.length === 1 ? "" : "s"} will be merged into {mergePrimaryTicket.ticketNumber}. Messages and files are moved to the primary ticket.
              </p>
            ) : null}
            <div className="modal-actions">
              <button className="button secondary" type="button" onClick={() => setShowMergeModal(false)} disabled={mergeBusy}>
                Cancel
              </button>
              <button className="button" type="button" onClick={mergeSelectedTickets} disabled={mergeBusy || !mergePrimaryTicket || mergeSourceTickets.length === 0}>
                <GitMerge size={16} aria-hidden="true" />
                <span>{mergeBusy ? "Merging..." : "Merge Tickets"}</span>
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
