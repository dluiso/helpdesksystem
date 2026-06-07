"use client";

import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, ClipboardList, Inbox, Ticket, UsersRound, UserX, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

interface DashboardTicket {
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  clientName: string;
  assignedTo: string;
  createdAt: string;
  updatedAt: string;
  href: string;
}

interface DashboardStats {
  summary: {
    totalOpen: number;
    newTickets: number;
    closedTickets: number;
    unassignedTickets: number;
    highPriorityTickets: number;
    awaitingCustomer: number;
    awaitingTechnician: number;
    noRecentUpdate: number;
  };
  byStatus: Array<{ status: string; count: number; filter: { statuses: string[] } }>;
  byPriority: Array<{ priority: string; count: number; filter: { priority: string } }>;
  bySource: Array<{ source: string; count: number; filter: { source: string } }>;
  byClient: Array<{ clientId: string | null; name: string; count: number; filter: { clientId?: string } }>;
  workload: Array<{ userId: string; name: string; count: number; filter: { assignedUserId: string } }>;
  activityByDay: Array<{ date: string; label: string; created: number; closed: number }>;
  createdByHour: Array<{ hour: number; label: string; count: number }>;
  insightTickets: {
    critical: DashboardTicket[];
    unassigned: DashboardTicket[];
    stale: DashboardTicket[];
  };
}

type EventStatus = "NEW" | "UNDER_REVIEW" | "SCHEDULED" | "ASSIGNED" | "IN_PROGRESS" | "WAITING_ON_CLIENT" | "WAITING_ON_INTERNAL_TEAM" | "COMPLETED" | "CANCELLED" | "CONVERTED_TO_TICKET";

interface DashboardEventRequest {
  id: string;
  status: EventStatus;
}

const activeStatuses = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "WAITING_ON_TECHNICIAN", "WAITING_ON_THIRD_PARTY", "REOPENED"];
const activeEventStatuses: EventStatus[] = ["ASSIGNED", "IN_PROGRESS", "WAITING_ON_CLIENT", "WAITING_ON_INTERNAL_TEAM"];
const chartColors = ["#155eef", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#64748b", "#ec4899"];

function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ticketHref(filter: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (Array.isArray(value) && value.length > 0) {
      params.set(key, value.join(","));
    } else if (typeof value === "string" && value) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `/tickets?${query}` : "/tickets";
}

function eventHref(filter: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/event-services?${query}` : "/event-services";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" });
}

function KpiCard({ title, value, href, tone, icon: Icon, note }: { title: string; value: number; href: string; tone: string; icon: typeof Ticket; note: string }) {
  return (
    <Link className={`dashboard-kpi-card ${tone}`} href={href}>
      <span className="dashboard-kpi-icon">
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="muted">{title}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </Link>
  );
}

function DonutChart({ title, subtitle, items }: { title: string; subtitle: string; items: Array<{ label: string; count: number; href: string }> }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  let offset = 25;

  return (
    <div className="panel dashboard-chart-card">
      <div className="section-heading compact-heading">
        <div>
          <h2>{title}</h2>
          <p className="muted">{subtitle}</p>
        </div>
        <span className="count-pill">{total} total</span>
      </div>
      <div className="dashboard-donut-layout">
        <svg className="dashboard-donut" viewBox="0 0 42 42" role="img" aria-label={title}>
          <circle className="dashboard-donut-track" cx="21" cy="21" r="15.915" />
          {total > 0
            ? items.map((item, index) => {
                const value = (item.count / total) * 100;
                const segment = (
                  <circle
                    className="dashboard-donut-segment"
                    cx="21"
                    cy="21"
                    key={item.label}
                    r="15.915"
                    stroke={chartColors[index % chartColors.length]}
                    strokeDasharray={`${value} ${100 - value}`}
                    strokeDashoffset={offset}
                  />
                );
                offset -= value;
                return segment;
              })
            : null}
          <text x="21" y="20" textAnchor="middle" className="dashboard-donut-total">
            {total}
          </text>
          <text x="21" y="25" textAnchor="middle" className="dashboard-donut-caption">
            tickets
          </text>
        </svg>
        <div className="dashboard-legend">
          {items.length ? (
            items.map((item, index) => (
              <Link className="dashboard-legend-row" href={item.href} key={item.label}>
                <span className="dashboard-legend-color" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </Link>
            ))
          ) : (
            <p className="muted">No data yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityChart({ items }: { items: DashboardStats["activityByDay"] }) {
  const maxValue = Math.max(1, ...items.flatMap((item) => [item.created, item.closed]));

  return (
    <div className="panel dashboard-chart-card dashboard-wide-card">
      <div className="section-heading compact-heading">
        <div>
          <h2>Ticket Activity</h2>
          <p className="muted">Created and closed tickets over the last 30 days.</p>
        </div>
      </div>
      <div className="dashboard-activity-chart" role="img" aria-label="Tickets created and closed by day">
        {items.map((item, index) => (
          <div className="dashboard-activity-day" key={item.date} title={`${item.label}: ${item.created} created, ${item.closed} closed`}>
            <div className="dashboard-activity-bars">
              <span className="created" style={{ height: `${Math.max(4, (item.created / maxValue) * 100)}%` }} />
              <span className="closed" style={{ height: `${Math.max(4, (item.closed / maxValue) * 100)}%` }} />
            </div>
            {index % 5 === 0 || index === items.length - 1 ? <small>{item.label}</small> : <small aria-hidden="true" />}
          </div>
        ))}
      </div>
      <div className="dashboard-chart-legend">
        <span>
          <i className="created" /> Created
        </span>
        <span>
          <i className="closed" /> Closed
        </span>
      </div>
    </div>
  );
}

function HourChart({ items }: { items: DashboardStats["createdByHour"] }) {
  const maxValue = Math.max(1, ...items.map((item) => item.count));

  return (
    <div className="panel dashboard-chart-card">
      <div className="section-heading compact-heading">
        <div>
          <h2>Created by Hour</h2>
          <p className="muted">New ticket arrival pattern for the last 30 days.</p>
        </div>
      </div>
      <div className="dashboard-hour-chart" role="img" aria-label="Tickets created by hour">
        {items.map((item) => (
          <span key={item.hour} title={`${item.label}: ${item.count}`} style={{ height: `${Math.max(4, (item.count / maxValue) * 100)}%` }} />
        ))}
      </div>
      <div className="dashboard-hour-axis">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
    </div>
  );
}

function HorizontalBarList({ title, subtitle, items }: { title: string; subtitle: string; items: Array<{ label: string; count: number; href?: string }> }) {
  const maxValue = Math.max(1, ...items.map((item) => item.count));

  return (
    <div className="panel dashboard-chart-card">
      <div className="section-heading compact-heading">
        <div>
          <h2>{title}</h2>
          <p className="muted">{subtitle}</p>
        </div>
      </div>
      <div className="dashboard-horizontal-bars">
        {items.length ? (
          items.map((item, index) => {
            const content = (
              <>
                <span>{item.label}</span>
                <strong>{item.count}</strong>
                <i style={{ width: `${Math.max(8, (item.count / maxValue) * 100)}%`, backgroundColor: chartColors[index % chartColors.length] }} />
              </>
            );
            return item.href ? (
              <Link className="dashboard-horizontal-row" href={item.href} key={item.label}>
                {content}
              </Link>
            ) : (
              <div className="dashboard-horizontal-row" key={item.label}>
                {content}
              </div>
            );
          })
        ) : (
          <p className="muted">No data yet.</p>
        )}
      </div>
    </div>
  );
}

function InsightTable({ title, subtitle, tickets }: { title: string; subtitle: string; tickets: DashboardTicket[] }) {
  return (
    <div className="panel dashboard-insight-card">
      <div className="section-heading compact-heading">
        <div>
          <h2>{title}</h2>
          <p className="muted">{subtitle}</p>
        </div>
      </div>
      <div className="dashboard-insight-list">
        {tickets.length ? (
          tickets.map((ticket) => (
            <Link className="dashboard-insight-row" href={ticket.href} key={ticket.ticketNumber}>
              <span>
                <strong>{ticket.ticketNumber}</strong>
                <small>{ticket.subject}</small>
              </span>
              <span>
                <small>{ticket.clientName}</small>
                <small>Updated {formatDate(ticket.updatedAt)}</small>
              </span>
              <span className={`status-pill ticket-status-${ticket.status.toLowerCase().replaceAll("_", "-")}`}>{label(ticket.status)}</span>
            </Link>
          ))
        ) : (
          <p className="muted">No tickets in this group.</p>
        )}
      </div>
    </div>
  );
}

export function DashboardWorkspace() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [eventRequests, setEventRequests] = useState<DashboardEventRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([
      apiFetch<DashboardStats>("/tickets/statistics"),
      apiFetch<DashboardEventRequest[]>("/event-services").catch(() => [])
    ])
      .then(([data, events]) => {
        if (mounted) {
          setStats(data);
          setEventRequests(events);
          setError("");
        }
      })
      .catch(() => {
        if (mounted) {
          setError("Unable to load dashboard statistics.");
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const eventSummaryCards = useMemo(() => {
    const total = eventRequests.length;
    const newRequests = eventRequests.filter((item) => item.status === "NEW").length;
    const active = eventRequests.filter((item) => activeEventStatuses.includes(item.status)).length;
    const completed = eventRequests.filter((item) => item.status === "COMPLETED").length;

    return [
      { title: "Event Requests", value: total, href: eventHref({}), tone: "primary", icon: ClipboardList, note: "All event intake" },
      { title: "New Events", value: newRequests, href: eventHref({ status: "NEW" }), tone: "info", icon: CalendarDays, note: "Needs review" },
      { title: "Active Events", value: active, href: eventHref({ status: "IN_PROGRESS" }), tone: "warning", icon: UsersRound, note: "Team workload" },
      { title: "Completed Events", value: completed, href: eventHref({ status: "COMPLETED" }), tone: "success", icon: CheckCircle2, note: "Finished requests" }
    ];
  }, [eventRequests]);

  const summaryCards = useMemo(() => {
    if (!stats) {
      return [];
    }

    return [
      { title: "Open Tickets", value: stats.summary.totalOpen, href: ticketHref({ statuses: activeStatuses }), tone: "primary", icon: Ticket, note: "Active workload" },
      { title: "New Tickets", value: stats.summary.newTickets, href: ticketHref({ statuses: ["NEW"] }), tone: "info", icon: Inbox, note: "Needs triage" },
      { title: "Closed Tickets", value: stats.summary.closedTickets, href: ticketHref({ statuses: ["CLOSED"] }), tone: "success", icon: CheckCircle2, note: "Completed" },
      { title: "Unassigned", value: stats.summary.unassignedTickets, href: ticketHref({ scope: "unassigned", statuses: activeStatuses }), tone: "warning", icon: UserX, note: "Needs owner" },
      { title: "High Priority", value: stats.summary.highPriorityTickets, href: ticketHref({ priority: "HIGH", statuses: activeStatuses }), tone: "danger", icon: AlertTriangle, note: "Escalated" },
      { title: "Awaiting Customer", value: stats.summary.awaitingCustomer, href: ticketHref({ statuses: ["WAITING_ON_CUSTOMER"] }), tone: "neutral", icon: Clock3, note: "External wait" },
      { title: "Awaiting Technician", value: stats.summary.awaitingTechnician, href: ticketHref({ statuses: ["WAITING_ON_TECHNICIAN"] }), tone: "info", icon: Clock3, note: "Internal action" },
      { title: "No Recent Update", value: stats.summary.noRecentUpdate, href: ticketHref({ statuses: activeStatuses, sortBy: "updatedAt", sortDirection: "asc" }), tone: "muted", icon: Zap, note: "7+ days idle" }
    ];
  }, [stats]);

  if (loading) {
    return <div className="panel dashboard-loading">Loading dashboard statistics...</div>;
  }

  if (error) {
    return <div className="error-banner">{error}</div>;
  }

  if (!stats) {
    return null;
  }

  const statusItems = stats.byStatus.map((item) => ({ label: label(item.status), count: item.count, href: ticketHref({ statuses: item.filter.statuses }) }));
  const priorityItems = stats.byPriority.map((item) => ({ label: label(item.priority), count: item.count, href: ticketHref({ priority: item.filter.priority }) }));
  const sourceItems = stats.bySource.map((item) => ({ label: label(item.source), count: item.count, href: ticketHref({ source: item.filter.source }) }));
  const clientItems = stats.byClient.map((item) => ({ label: item.name, count: item.count, href: item.clientId ? ticketHref({ clientId: item.clientId }) : undefined }));
  const workloadItems = stats.workload.map((item) => ({ label: item.name, count: item.count, href: ticketHref({ assignedUserId: item.filter.assignedUserId, statuses: activeStatuses }) }));

  return (
    <div className="dashboard-page">
      <div className="dashboard-section-heading">
        <h2>Tickets</h2>
      </div>
      <section className="dashboard-kpi-grid">
        {summaryCards.map((card) => (
          <KpiCard key={card.title} {...card} />
        ))}
      </section>

      <div className="dashboard-section-heading">
        <h2>Event & Services</h2>
      </div>
      <section className="dashboard-kpi-grid dashboard-event-kpi-grid">
        {eventSummaryCards.map((card) => (
          <KpiCard key={card.title} {...card} />
        ))}
      </section>

      <section className="dashboard-main-grid">
        <ActivityChart items={stats.activityByDay} />
        <DonutChart title="Tickets by Status" subtitle="Click a segment label to filter tickets." items={statusItems} />
        <DonutChart title="Tickets by Priority" subtitle="Workload distribution by urgency." items={priorityItems} />
        <HourChart items={stats.createdByHour} />
        <HorizontalBarList title="Technician Workload" subtitle="Active tickets by assigned technician." items={workloadItems} />
        <HorizontalBarList title="Tickets by Client" subtitle="Top client workload across all active tickets." items={clientItems} />
        <DonutChart title="Tickets by Source" subtitle="Where tickets are entering the helpdesk." items={sourceItems} />
      </section>

      <section className="dashboard-insight-grid">
        <InsightTable title="Critical and High Priority" subtitle="Open tickets that need fast attention." tickets={stats.insightTickets.critical} />
        <InsightTable title="Unassigned Tickets" subtitle="Tickets waiting for ownership." tickets={stats.insightTickets.unassigned} />
        <InsightTable title="No Recent Update" subtitle="Active tickets idle for more than 7 days." tickets={stats.insightTickets.stale} />
      </section>
    </div>
  );
}
