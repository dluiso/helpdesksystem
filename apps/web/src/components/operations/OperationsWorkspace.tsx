"use client";

import { AlertTriangle, CalendarClock, CircleAlert, ClipboardList, RefreshCw, Ticket, UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type WorkKind = "TICKET" | "EVENT" | "EVENT_TASK";
type Period = "ALL" | "TODAY" | "7_DAYS" | "30_DAYS";

interface WorkItem {
  id: string;
  kind: WorkKind;
  reference: string;
  title: string;
  clientName: string | null;
  status: string;
  priority: string | null;
  owner: string | null;
  teamName: string | null;
  dueAt: string | null;
  updatedAt: string;
  href: string;
  attention: boolean;
}

interface OperationsOverview {
  generatedAt: string;
  summary: {
    activeTickets: number;
    unassignedTickets: number;
    activeEvents: number;
    upcomingEvents: number;
    blockedTasks: number;
    attentionItems: number;
  };
  items: WorkItem[];
  workload: Array<{ owner: string; total: number; attention: number }>;
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
  return kind === "EVENT" ? "Event request" : "Ticket";
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
      const text = [item.reference, item.title, item.clientName, item.owner, item.teamName, item.status, item.priority].filter(Boolean).join(" ").toLowerCase();
      return timeMatches && (!attentionOnly || item.attention) && (!query || text.includes(query));
    });
  }, [attentionOnly, overview, period, search]);

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
        <SummaryCard icon={CircleAlert} title="Needs attention" value={overview?.summary.attentionItems ?? 0} note="Unassigned, urgent, blocked, or upcoming work" tone="attention" />
        <SummaryCard icon={Ticket} title="Active tickets" value={overview?.summary.activeTickets ?? 0} note={`${overview?.summary.unassignedTickets ?? 0} currently unassigned`} />
        <SummaryCard icon={CalendarClock} title="Upcoming events" value={overview?.summary.upcomingEvents ?? 0} note={`${overview?.summary.activeEvents ?? 0} active event requests`} />
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
              <tr><th>Work item</th><th>Source</th><th>Owner</th><th>Client / Team</th><th>Status</th><th>Due / Event</th><th>Updated</th></tr>
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
                  <td><div className="operations-status-cell"><span>{label(item.status)}</span>{item.priority ? <small>{label(item.priority)}</small> : null}</div></td>
                  <td>{formatDate(item.dueAt)}</td>
                  <td>{formatDate(item.updatedAt)}</td>
                </tr>
              ))}
              {!loading && visibleItems.length === 0 ? <tr><td colSpan={7}><div className="dashboard-empty">No active work matches these filters.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel operations-workload-panel">
        <div className="section-heading operations-section-heading"><div><h2>Work distribution</h2><p>Active queue items by assignee.</p></div><UsersRound size={19} aria-hidden="true" /></div>
        <div className="operations-workload-list">
          {(overview?.workload ?? []).map((entry) => <div className="operations-workload-row" key={entry.owner}><strong>{entry.owner}</strong><span>{entry.total} active</span><small>{entry.attention} need attention</small></div>)}
          {!loading && !overview?.workload.length ? <div className="dashboard-empty">No assigned active work.</div> : null}
        </div>
      </section>
    </div>
  );
}
