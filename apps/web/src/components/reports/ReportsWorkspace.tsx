"use client";

import { Download, Filter, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiBaseUrl, apiFetch } from "@/lib/api";

interface ReportOption {
  id: string;
  name: string;
}

interface ReportSummary {
  filters: {
    startDate: string;
    endDate: string;
    groupBy: "day" | "week" | "month" | "year";
    estimateMode: "none" | "perTicket";
    valuePerTicket: number | null;
  };
  options: {
    clients: ReportOption[];
    users: ReportOption[];
    teams: ReportOption[];
    statuses: string[];
    priorities: string[];
    sources: string[];
  };
  summary: {
    totalTickets: number;
    activeTickets: number;
    closedTickets: number;
    resolvedTickets: number;
    unassignedTickets: number;
    highPriorityTickets: number;
    withAttachments: number;
    withoutAttachments: number;
    estimatedTotal: number | null;
  };
  activity: Array<{ period: string; label: string; created: number; closed: number; resolved: number }>;
  byStatus: Array<{ label: string; count: number }>;
  byPriority: Array<{ label: string; count: number }>;
  bySource: Array<{ label: string; count: number }>;
  byClient: Array<{ label: string; count: number }>;
  byTechnician: Array<{ label: string; count: number }>;
  byTeam: Array<{ label: string; count: number }>;
  detail: Array<{
    ticketNumber: string;
    subject: string;
    clientName: string;
    requester: string;
    status: string;
    priority: string;
    source: string;
    assignedTo: string;
    team: string;
    createdAt: string;
    updatedAt: string;
    closedAt: string | null;
    attachmentCount: number;
    estimatedValue: number | null;
  }>;
  detailLimit: number;
  totalMatched: number;
}

const chartColors = ["#4f7cff", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#64748b", "#ec4899"];

function defaultStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - 29);
  return date.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" });
}

function currency(value: number | null) {
  if (value === null) return "-";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
}

function SummaryCard({ title, value, note }: { title: string; value: string | number; note: string }) {
  return (
    <div className="dashboard-kpi-card report-kpi-card">
      <span className="muted">{title}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function ActivityChart({ items }: { items: ReportSummary["activity"] }) {
  const maxValue = Math.max(1, ...items.flatMap((item) => [item.created, item.closed, item.resolved]));
  return (
    <div className="panel dashboard-chart-card dashboard-wide-card">
      <div>
        <h2>Ticket Activity</h2>
        <p className="muted">Created, resolved, and closed tickets in the selected period.</p>
      </div>
      <div className="report-activity-chart">
        {items.map((item, index) => (
          <div className="report-activity-day" key={item.period} title={`${item.period}: ${item.created} created, ${item.resolved} resolved, ${item.closed} closed`}>
            <div className="report-activity-bars">
              <span className="created" style={{ height: `${Math.max(5, (item.created / maxValue) * 100)}%` }} />
              <span className="resolved" style={{ height: `${Math.max(5, (item.resolved / maxValue) * 100)}%` }} />
              <span className="closed" style={{ height: `${Math.max(5, (item.closed / maxValue) * 100)}%` }} />
            </div>
            {index % 4 === 0 || index === items.length - 1 ? <small>{item.label}</small> : <small />}
          </div>
        ))}
      </div>
      <div className="dashboard-chart-legend">
        <span><i className="created" /> Created</span>
        <span><i className="resolved" /> Resolved</span>
        <span><i className="closed" /> Closed</span>
      </div>
    </div>
  );
}

function HorizontalBars({ title, subtitle, items }: { title: string; subtitle: string; items: Array<{ label: string; count: number }> }) {
  const maxValue = Math.max(1, ...items.map((item) => item.count));
  return (
    <div className="panel dashboard-chart-card">
      <div>
        <h2>{title}</h2>
        <p className="muted">{subtitle}</p>
      </div>
      <div className="dashboard-horizontal-bars">
        {items.length ? items.map((item, index) => (
          <div className="dashboard-horizontal-row" key={item.label}>
            <span>{label(item.label)}</span>
            <strong>{item.count}</strong>
            <i style={{ width: `${Math.max(8, (item.count / maxValue) * 100)}%`, backgroundColor: chartColors[index % chartColors.length] }} />
          </div>
        )) : <p className="muted">No data for this range.</p>}
      </div>
    </div>
  );
}

export function ReportsWorkspace() {
  const [startDate, setStartDate] = useState(defaultStartDate());
  const [endDate, setEndDate] = useState(today());
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month" | "year">("day");
  const [clientId, setClientId] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [assignedTeamId, setAssignedTeamId] = useState("");
  const [priority, setPriority] = useState("");
  const [source, setSource] = useState("");
  const [attachments, setAttachments] = useState<"all" | "with" | "without">("all");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [estimateMode, setEstimateMode] = useState<"none" | "perTicket">("none");
  const [valuePerTicket, setValuePerTicket] = useState("0");
  const [data, setData] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("startDate", startDate);
    params.set("endDate", endDate);
    params.set("groupBy", groupBy);
    if (clientId) params.set("clientId", clientId);
    if (assignedUserId) params.set("assignedUserId", assignedUserId);
    if (assignedTeamId) params.set("assignedTeamId", assignedTeamId);
    if (statuses.length) params.set("statuses", statuses.join(","));
    if (priority) params.set("priority", priority);
    if (source) params.set("source", source);
    if (attachments !== "all") params.set("attachments", attachments);
    if (estimateMode === "perTicket") {
      params.set("estimateMode", estimateMode);
      params.set("valuePerTicket", valuePerTicket || "0");
    }
    return params;
  }, [assignedTeamId, assignedUserId, attachments, clientId, endDate, estimateMode, groupBy, priority, source, startDate, statuses, valuePerTicket]);

  async function loadReport() {
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<ReportSummary>(`/reports/tickets/summary?${query.toString()}`);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load report.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function toggleStatus(status: string) {
    setStatuses((current) => current.includes(status) ? current.filter((item) => item !== status) : [...current, status]);
  }

  function exportCsv() {
    window.location.href = `${apiBaseUrl}/reports/tickets/export?${query.toString()}&format=csv`;
  }

  const options = data?.options;

  return (
    <div className="reports-workspace">
      {error ? <div className="error-banner">{error}</div> : null}
      <section className="panel reports-filter-panel">
        <div className="section-heading compact-heading">
          <div>
            <h2>Ticket Report Filters</h2>
            <p className="muted">Build operational ticket reports by period, client, technician, team, status, and estimated value.</p>
          </div>
          <div className="form-actions">
            <button className="button secondary" type="button" onClick={() => void loadReport()}>
              <RefreshCw size={16} aria-hidden="true" />
              <span>Refresh</span>
            </button>
            <button className="button" type="button" onClick={exportCsv} disabled={!data}>
              <Download size={16} aria-hidden="true" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>
        <div className="reports-filter-grid">
          <input className="input" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <input className="input" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          <select className="input" value={groupBy} onChange={(event) => setGroupBy(event.target.value as typeof groupBy)}>
            <option value="day">By day</option>
            <option value="week">By week</option>
            <option value="month">By month</option>
            <option value="year">By year</option>
          </select>
          <select className="input" value={clientId} onChange={(event) => setClientId(event.target.value)}>
            <option value="">All clients</option>
            {options?.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
          <select className="input" value={assignedUserId} onChange={(event) => setAssignedUserId(event.target.value)}>
            <option value="">All technicians</option>
            {options?.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
          <select className="input" value={assignedTeamId} onChange={(event) => setAssignedTeamId(event.target.value)}>
            <option value="">All teams</option>
            {options?.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
          <select className="input" value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option value="">All priorities</option>
            {options?.priorities.map((item) => <option key={item} value={item}>{label(item)}</option>)}
          </select>
          <select className="input" value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="">All sources</option>
            {options?.sources.map((item) => <option key={item} value={item}>{label(item)}</option>)}
          </select>
          <select className="input" value={attachments} onChange={(event) => setAttachments(event.target.value as typeof attachments)}>
            <option value="all">All attachments</option>
            <option value="with">With attachments</option>
            <option value="without">Without attachments</option>
          </select>
          <select className="input" value={estimateMode} onChange={(event) => setEstimateMode(event.target.value as typeof estimateMode)}>
            <option value="none">No estimate</option>
            <option value="perTicket">Value per ticket</option>
          </select>
          <input className="input" type="number" min="0" step="0.01" value={valuePerTicket} onChange={(event) => setValuePerTicket(event.target.value)} disabled={estimateMode === "none"} placeholder="Value per ticket" />
        </div>
        <div className="reports-status-filter">
          <span><Filter size={14} aria-hidden="true" /> Status</span>
          <div>
            {options?.statuses.map((item) => (
              <label className="checkbox-row" key={item}>
                <input type="checkbox" checked={statuses.includes(item)} onChange={() => toggleStatus(item)} />
                {label(item)}
              </label>
            ))}
          </div>
        </div>
      </section>

      {loading ? <div className="panel dashboard-loading">Loading report...</div> : null}

      {data && !loading ? (
        <>
          <section className="dashboard-kpi-grid reports-kpi-grid">
            <SummaryCard title="Total tickets" value={data.summary.totalTickets} note="Created in range" />
            <SummaryCard title="Active tickets" value={data.summary.activeTickets} note="Current active workload" />
            <SummaryCard title="Closed tickets" value={data.summary.closedTickets} note="Closed in result set" />
            <SummaryCard title="Resolved tickets" value={data.summary.resolvedTickets} note="Resolved in result set" />
            <SummaryCard title="Unassigned" value={data.summary.unassignedTickets} note="No owner" />
            <SummaryCard title="High priority" value={data.summary.highPriorityTickets} note="High, urgent, critical" />
            <SummaryCard title="With attachments" value={data.summary.withAttachments} note={`${data.summary.withoutAttachments} without files`} />
            <SummaryCard title="Estimated total" value={currency(data.summary.estimatedTotal)} note="Optional estimate" />
          </section>

          <section className="dashboard-main-grid">
            <ActivityChart items={data.activity} />
            <HorizontalBars title="Tickets by Status" subtitle="Distribution by current ticket state." items={data.byStatus} />
            <HorizontalBars title="Tickets by Client" subtitle="Top clients in the selected period." items={data.byClient} />
            <HorizontalBars title="Technician Workload" subtitle="Assigned ticket distribution." items={data.byTechnician} />
            <HorizontalBars title="Tickets by Team" subtitle="Operational team distribution." items={data.byTeam} />
            <HorizontalBars title="Tickets by Priority" subtitle="Urgency distribution." items={data.byPriority} />
            <HorizontalBars title="Tickets by Source" subtitle="Where tickets entered the system." items={data.bySource} />
          </section>

          <section className="panel">
            <div className="section-heading compact-heading">
              <div>
                <h2>Report Detail</h2>
                <p className="muted">Showing {data.detail.length} of {data.totalMatched} tickets. Export CSV for the report table.</p>
              </div>
            </div>
            <div className="table-scroll">
              <table className="tickets-table">
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Subject</th>
                    <th>Client</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Assigned</th>
                    <th>Created</th>
                    <th>Files</th>
                    <th>Estimate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.detail.map((ticket) => (
                    <tr key={ticket.ticketNumber}>
                      <td>{ticket.ticketNumber}</td>
                      <td><strong>{ticket.subject}</strong><span className="muted">{ticket.requester}</span></td>
                      <td>{ticket.clientName}</td>
                      <td><span className={`status-pill ticket-status-${ticket.status.toLowerCase().replaceAll("_", "-")}`}>{label(ticket.status)}</span></td>
                      <td>{label(ticket.priority)}</td>
                      <td>{ticket.assignedTo}<span className="muted">{ticket.team}</span></td>
                      <td>{formatDate(ticket.createdAt)}</td>
                      <td>{ticket.attachmentCount}</td>
                      <td>{currency(ticket.estimatedValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
