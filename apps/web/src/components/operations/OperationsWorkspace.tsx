"use client";

import { AlertTriangle, CalendarClock, Check, CircleAlert, ClipboardCheck, FolderKanban, RefreshCw, Ticket, UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type WorkKind = "TICKET" | "EVENT" | "EVENT_TASK" | "PROJECT";
type Period = "ALL" | "TODAY" | "7_DAYS" | "30_DAYS";
type DecisionStatus = "OPEN" | "IN_PROGRESS";

interface WorkItem {
  id: string;
  kind: WorkKind;
  reference: string;
  title: string;
  clientName: string | null;
  status: string;
  health?: string | null;
  priority: string | null;
  owner: string | null;
  teamName: string | null;
  dueAt: string | null;
  updatedAt: string;
  href: string;
  attention: boolean;
  requestId?: string;
  internalOwners: string[];
}

interface OperationsDecision {
  id: string;
  title: string;
  description: string | null;
  status: DecisionStatus;
  dueAt: string | null;
  createdAt: string;
  owner: string | null;
  projectId: string;
  projectName: string;
  projectHealth: string;
  attention: boolean;
  href: string;
}

interface OperationsOverview {
  generatedAt: string;
  summary: {
    activeTickets: number;
    unassignedTickets: number;
    activeEvents: number;
    upcomingEvents: number;
    activeProjects: number;
    atRiskProjects: number;
    openProjectDecisions: number;
    projectCommitments: number;
    unassignedProjectCommitments: number;
    blockedTasks: number;
    attentionItems: number;
    overdueItems: number;
    overCapacity: number;
    nearCapacity: number;
    capacityBaseline: number;
    capacityWarningPercent: number;
    dueSoonDays: number;
  };
  capabilities: {
    updateTicketStatus: boolean;
    updateEventStatus: boolean;
  };
  items: WorkItem[];
  decisions: OperationsDecision[];
  workload: Array<{ owner: string; operational: number; projectCommitments: number; total: number; attention: number; capacityPercent: number; capacityStatus: "AVAILABLE" | "NEAR_CAPACITY" | "OVER_CAPACITY" }>;
}

function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function kindLabel(kind: WorkKind) {
  if (kind === "EVENT_TASK") return "Event task";
  if (kind === "EVENT") return "Event request";
  return kind === "PROJECT" ? "Project" : "Ticket";
}

function SummaryCard({ icon: Icon, title, value, note, tone = "default" }: { icon: typeof Ticket; title: string; value: number; note: string; tone?: "default" | "attention" }) {
  return (
    <div className={`operations-summary-card${tone === "attention" ? " attention" : ""}`}>
      <div className="operations-summary-icon"><Icon size={18} aria-hidden="true" /></div>
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </div>
  );
}

export function OperationsWorkspace() {
  const [overview, setOverview] = useState<OperationsOverview | null>(null);
  const [period, setPeriod] = useState<Period>("7_DAYS");
  const [attentionOnly, setAttentionOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>({});
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [decisionOwner, setDecisionOwner] = useState("ALL");
  const [decisionStatus, setDecisionStatus] = useState<"ALL" | DecisionStatus>("ALL");
  const [decisionAttentionOnly, setDecisionAttentionOnly] = useState(true);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setOverview(await apiFetch<OperationsOverview>("/operations/overview"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load Operations Center.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visibleItems = useMemo(() => {
    if (!overview) return [];
    const query = search.trim().toLowerCase();
    const now = new Date();
    const end = new Date(now);
    if (period === "TODAY") end.setHours(23, 59, 59, 999);
    if (period === "7_DAYS") end.setDate(end.getDate() + 7);
    if (period === "30_DAYS") end.setDate(end.getDate() + 30);

    return overview.items.filter((item) => {
      const dueDate = item.dueAt ? new Date(item.dueAt) : null;
      const timeMatches = period === "ALL" || !dueDate || (dueDate >= now && dueDate <= end) || (item.attention && dueDate < now);
      const text = [item.reference, item.title, item.clientName, item.owner, item.teamName, item.status, item.health, item.priority].filter(Boolean).join(" ").toLowerCase();
      return timeMatches && (!attentionOnly || item.attention) && (!query || text.includes(query));
    });
  }, [attentionOnly, overview, period, search]);

  const canUpdateStatus = (item: WorkItem) => item.kind === "TICKET" ? Boolean(overview?.capabilities.updateTicketStatus) : item.kind === "PROJECT" ? false : Boolean(overview?.capabilities.updateEventStatus);

  const decisionOwners = useMemo(() => [...new Set((overview?.decisions ?? []).map((decision) => decision.owner).filter((owner): owner is string => Boolean(owner)))].sort((left, right) => left.localeCompare(right)), [overview?.decisions]);
  const visibleDecisions = useMemo(() => (overview?.decisions ?? []).filter((decision) => {
    const ownerMatches = decisionOwner === "ALL" || (decisionOwner === "UNASSIGNED" ? !decision.owner : decision.owner === decisionOwner);
    return ownerMatches && (decisionStatus === "ALL" || decision.status === decisionStatus) && (!decisionAttentionOnly || decision.attention);
  }), [decisionAttentionOnly, decisionOwner, decisionStatus, overview?.decisions]);

  const statusOptions = (item: WorkItem) => {
    if (item.kind === "TICKET") return ["NEW", "OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "WAITING_ON_TECHNICIAN", "WAITING_ON_THIRD_PARTY", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];
    if (item.kind === "EVENT") return ["NEW", "UNDER_REVIEW", "SCHEDULED", "ASSIGNED", "IN_PROGRESS", "WAITING_ON_CLIENT", "WAITING_ON_INTERNAL_TEAM", "COMPLETED", "CANCELLED"];
    return ["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"];
  };

  const updateStatus = async (item: WorkItem) => {
    const status = statusDrafts[item.id] ?? item.status;
    if (status === item.status || !canUpdateStatus(item)) return;
    setUpdatingItemId(item.id);
    setError("");
    try {
      if (item.kind === "TICKET") {
        await apiFetch("/tickets/bulk", { method: "PATCH", body: JSON.stringify({ ticketIds: [item.id], status }) });
      } else if (item.kind === "EVENT") {
        await apiFetch(`/event-services/${item.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      } else if (item.requestId) {
        await apiFetch(`/event-services/${item.requestId}/tasks/${item.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      }
      setStatusDrafts((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update work item status.");
    } finally {
      setUpdatingItemId(null);
    }
  };

  return (
    <div className="operations-workspace">
      <section className="operations-toolbar panel" aria-label="Operations filters">
        <div className="operations-toolbar-copy">
          <strong>Active work queue</strong>
          <span className="muted">Prioritized operational visibility. Updates remain in their source modules.</span>
        </div>
        <div className="operations-toolbar-controls">
          <div className="segmented-control" aria-label="Queue range">
            {(["TODAY", "7_DAYS", "30_DAYS", "ALL"] as Period[]).map((value) => (
              <button key={value} type="button" className={period === value ? "active" : ""} aria-pressed={period === value} onClick={() => setPeriod(value)}>
                {value === "TODAY" ? "Today" : value === "7_DAYS" ? "7 days" : value === "30_DAYS" ? "30 days" : "All"}
              </button>
            ))}
          </div>
          <label className="operations-attention-toggle">
            <input type="checkbox" checked={attentionOnly} onChange={(event) => setAttentionOnly(event.target.checked)} />
            Needs attention
          </label>
          <input className="input operations-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search work" aria-label="Search work" />
          <button className="button secondary icon-button" type="button" onClick={() => void load()} disabled={loading} title="Refresh operations data" aria-label="Refresh operations data">
            <RefreshCw size={16} className={loading ? "spin" : ""} aria-hidden="true" />
          </button>
        </div>
      </section>

      {error ? <div className="alert error">Unable to load Operations Center. {error}</div> : null}

      <section className="operations-summary-grid" aria-label="Operations summary">
        <SummaryCard icon={CircleAlert} title="Needs attention" value={overview?.summary.attentionItems ?? 0} note={`${overview?.summary.overdueItems ?? 0} overdue work items`} tone="attention" />
        <SummaryCard icon={Ticket} title="Unassigned tickets" value={overview?.summary.unassignedTickets ?? 0} note={`${overview?.summary.activeTickets ?? 0} active tickets`} tone={(overview?.summary.unassignedTickets ?? 0) > 0 ? "attention" : "default"} />
        <SummaryCard icon={FolderKanban} title="Project commitments" value={overview?.summary.projectCommitments ?? 0} note={`${overview?.summary.atRiskProjects ?? 0} at risk · ${overview?.summary.unassignedProjectCommitments ?? 0} unassigned`} tone={(overview?.summary.atRiskProjects ?? 0) > 0 || (overview?.summary.unassignedProjectCommitments ?? 0) > 0 ? "attention" : "default"} />
        <SummaryCard icon={ClipboardCheck} title="Open decisions" value={overview?.summary.openProjectDecisions ?? 0} note="Project actions needing ownership or closure" tone={(overview?.summary.openProjectDecisions ?? 0) > 0 ? "attention" : "default"} />
        <SummaryCard icon={CalendarClock} title="Capacity alerts" value={overview?.summary.overCapacity ?? 0} note={`${overview?.summary.nearCapacity ?? 0} nearing ${overview?.summary.capacityWarningPercent ?? 75}% of capacity`} tone={(overview?.summary.overCapacity ?? 0) > 0 ? "attention" : "default"} />
        <SummaryCard icon={AlertTriangle} title="Blocked tasks" value={overview?.summary.blockedTasks ?? 0} note="Event service tasks requiring follow-up" tone={(overview?.summary.blockedTasks ?? 0) > 0 ? "attention" : "default"} />
      </section>

      <section className="panel operations-queue-panel">
        <div className="section-heading operations-section-heading">
          <div>
            <h2>Operational queue</h2>
            <p>{loading ? "Refreshing work data..." : `${visibleItems.length} active items in view`}</p>
          </div>
          {overview ? <span className="muted">Updated {formatDateTime(overview.generatedAt)}</span> : null}
        </div>
        <div className="operations-table-scroll">
          <table className="table operations-table">
            <thead>
              <tr><th>Work item</th><th>Source</th><th>Owner</th><th>Client / Team</th><th>Status</th><th>Due / Event</th><th>Updated</th><th>Quick action</th></tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => (
                <tr key={`${item.kind}-${item.id}`}>
                  <td>
                    <div className="operations-work-cell">
                      <Link href={item.href}>{item.reference}</Link>
                      <strong title={item.title}>{item.title}</strong>
                    </div>
                  </td>
                  <td><span className="operations-kind-pill">{kindLabel(item.kind)}</span></td>
                  <td>{item.owner ?? <span className="operations-unassigned">Unassigned</span>}</td>
                  <td><div className="operations-context-cell"><strong>{item.clientName ?? "No client"}</strong><span>{item.teamName ?? "No team"}</span></div></td>
                  <td><div className="operations-status-cell"><span>{label(item.status)}</span>{item.health ? <small>{label(item.health)}</small> : item.priority ? <small>{label(item.priority)}</small> : null}</div></td>
                  <td>{formatDate(item.dueAt)}</td>
                  <td>{formatDate(item.updatedAt)}</td>
                  <td>
                    {canUpdateStatus(item) ? (
                      <div className="operations-action-control">
                        <select className="input" value={statusDrafts[item.id] ?? item.status} onChange={(event) => setStatusDrafts((current) => ({ ...current, [item.id]: event.target.value }))} disabled={updatingItemId === item.id} aria-label={`Update ${item.reference} status`}>
                          {statusOptions(item).map((status) => <option value={status} key={status}>{label(status)}</option>)}
                        </select>
                        <button className="button secondary icon-button" type="button" onClick={() => void updateStatus(item)} disabled={updatingItemId === item.id || (statusDrafts[item.id] ?? item.status) === item.status} title={`Save ${item.reference} status`} aria-label={`Save ${item.reference} status`}>
                          <Check size={15} aria-hidden="true" />
                        </button>
                      </div>
                    ) : <span className="muted">View only</span>}
                  </td>
                </tr>
              ))}
              {!loading && visibleItems.length === 0 ? <tr><td colSpan={8}><div className="dashboard-empty">No active work matches these filters.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel operations-decision-panel">
        <div className="section-heading operations-section-heading">
          <div><h2>Decision queue</h2><p>{loading ? "Refreshing project decisions..." : `${visibleDecisions.length} open decisions in view`}</p></div>
          <div className="operations-decision-controls">
            <select className="input" value={decisionStatus} onChange={(event) => setDecisionStatus(event.target.value as "ALL" | DecisionStatus)} aria-label="Filter decision status"><option value="ALL">All statuses</option><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option></select>
            <select className="input" value={decisionOwner} onChange={(event) => setDecisionOwner(event.target.value)} aria-label="Filter decision owner"><option value="ALL">All owners</option><option value="UNASSIGNED">Unassigned</option>{decisionOwners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}</select>
            <label className="operations-attention-toggle"><input type="checkbox" checked={decisionAttentionOnly} onChange={(event) => setDecisionAttentionOnly(event.target.checked)} />Needs attention</label>
          </div>
        </div>
        <div className="operations-table-scroll"><table className="table operations-table operations-decision-table"><thead><tr><th>Decision / action</th><th>Project</th><th>Owner</th><th>Status</th><th>Due</th><th>Project risk</th><th></th></tr></thead><tbody>
          {visibleDecisions.map((decision) => <tr key={decision.id}><td><div className="operations-work-cell"><strong title={decision.title}>{decision.title}</strong>{decision.description ? <span>{decision.description}</span> : null}</div></td><td><Link href={decision.href}>{decision.projectName}</Link></td><td>{decision.owner ?? <span className="operations-unassigned">Unassigned</span>}</td><td>{label(decision.status)}</td><td>{formatDate(decision.dueAt)}</td><td>{decision.attention ? <span className="operations-unassigned">Needs attention</span> : label(decision.projectHealth)}</td><td><Link className="button secondary" href={decision.href}>Open Project</Link></td></tr>)}
          {!loading && !visibleDecisions.length ? <tr><td colSpan={7}><div className="dashboard-empty">No open project decisions match these filters.</div></td></tr> : null}
        </tbody></table></div>
      </section>

      <section className="panel operations-workload-panel">
        <div className="section-heading operations-section-heading"><div><h2>Capacity and work distribution</h2><p>Projected load combines operational assignments with project commitments. Baseline: {overview?.summary.capacityBaseline ?? 12} items; warning at {overview?.summary.capacityWarningPercent ?? 75}%.</p></div><UsersRound size={19} aria-hidden="true" /></div>
        <div className="operations-workload-list">
          {(overview?.workload ?? []).map((entry) => <div className={`operations-workload-row ${entry.capacityStatus.toLowerCase().replace("_", "-")}`} key={entry.owner}><strong>{entry.owner}</strong><span>{entry.total}/{overview?.summary.capacityBaseline ?? 12} projected</span><small>{entry.operational} operational · {entry.projectCommitments} project commitments · {entry.attention} need attention</small><em>{label(entry.capacityStatus)}</em><div className="operations-capacity-meter" aria-label={`${entry.owner} projected capacity ${entry.capacityPercent}%`}><span style={{ width: `${entry.capacityPercent}%` }} /></div></div>)}
          {!loading && !overview?.workload.length ? <div className="dashboard-empty">No assigned active work.</div> : null}
        </div>
      </section>
    </div>
  );
}
