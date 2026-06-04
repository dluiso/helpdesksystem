"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

interface DashboardStats {
  summary: {
    totalOpen: number;
    newTickets: number;
    closedTickets: number;
    unassignedTickets: number;
    highPriorityTickets: number;
    awaitingCustomer: number;
    noRecentUpdate: number;
  };
  byStatus: Array<{ status: string; count: number; filter: { statuses: string[] } }>;
  byPriority: Array<{ priority: string; count: number; filter: { priority: string } }>;
  byClient: Array<{ clientId: string | null; name: string; count: number; filter: { clientId?: string } }>;
  workload: Array<{ userId: string; name: string; count: number; filter: { assignedUserId: string } }>;
}

const activeStatuses = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "WAITING_ON_THIRD_PARTY", "REOPENED"];

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

function StatCard({ title, value, href, note }: { title: string; value: number; href: string; note?: string }) {
  return (
    <Link className="panel metric dashboard-stat-card" href={href}>
      <span className="muted">{title}</span>
      <strong>{value}</strong>
      {note ? <span className="status-pill muted-pill">{note}</span> : null}
    </Link>
  );
}

export function DashboardWorkspace() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    apiFetch<DashboardStats>("/tickets/statistics")
      .then((data) => {
        if (mounted) {
          setStats(data);
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

  const summaryCards = useMemo(() => {
    if (!stats) {
      return [];
    }

    return [
      { title: "Total open tickets", value: stats.summary.totalOpen, href: ticketHref({ statuses: activeStatuses }) },
      { title: "New tickets", value: stats.summary.newTickets, href: ticketHref({ statuses: ["NEW"] }) },
      { title: "Closed tickets", value: stats.summary.closedTickets, href: ticketHref({ statuses: ["CLOSED"] }) },
      { title: "Unassigned tickets", value: stats.summary.unassignedTickets, href: ticketHref({ scope: "unassigned", statuses: activeStatuses }) },
      { title: "High priority tickets", value: stats.summary.highPriorityTickets, href: ticketHref({ priority: "HIGH", statuses: activeStatuses }) },
      { title: "Awaiting customer response", value: stats.summary.awaitingCustomer, href: ticketHref({ statuses: ["WAITING_ON_CUSTOMER"] }) },
      { title: "No recent update", value: stats.summary.noRecentUpdate, href: ticketHref({ statuses: activeStatuses, sortBy: "updatedAt", sortDirection: "asc" }) }
    ];
  }, [stats]);

  return (
    <>
      {error ? <div className="error-banner">{error}</div> : null}
      {loading ? <div className="panel">Loading dashboard statistics...</div> : null}
      {!loading && stats ? (
        <>
          <section className="grid columns-4 dashboard-stat-grid">
            {summaryCards.map((card) => (
              <StatCard key={card.title} title={card.title} value={card.value} href={card.href} />
            ))}
          </section>

          <section className="grid columns-2 dashboard-section-grid">
            <div className="panel">
              <div className="section-heading">
                <div>
                  <h2>Tickets by Status</h2>
                  <p className="muted">Click a status to open filtered tickets.</p>
                </div>
              </div>
              <div className="dashboard-list">
                {stats.byStatus.length ? (
                  stats.byStatus.map((item) => (
                    <Link className="dashboard-list-row" href={ticketHref({ statuses: item.filter.statuses })} key={item.status}>
                      <span>{label(item.status)}</span>
                      <strong>{item.count}</strong>
                    </Link>
                  ))
                ) : (
                  <p className="muted">No ticket status data yet.</p>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="section-heading">
                <div>
                  <h2>Tickets by Priority</h2>
                  <p className="muted">Review workload by urgency.</p>
                </div>
              </div>
              <div className="dashboard-list">
                {stats.byPriority.length ? (
                  stats.byPriority.map((item) => (
                    <Link className="dashboard-list-row" href={ticketHref({ priority: item.filter.priority })} key={item.priority}>
                      <span>{label(item.priority)}</span>
                      <strong>{item.count}</strong>
                    </Link>
                  ))
                ) : (
                  <p className="muted">No priority data yet.</p>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="section-heading">
                <div>
                  <h2>Tickets by Client</h2>
                  <p className="muted">Top client workload.</p>
                </div>
              </div>
              <div className="dashboard-list">
                {stats.byClient.length ? (
                  stats.byClient.map((item) =>
                    item.clientId ? (
                      <Link className="dashboard-list-row" href={ticketHref({ clientId: item.clientId })} key={item.clientId}>
                        <span>{item.name}</span>
                        <strong>{item.count}</strong>
                      </Link>
                    ) : (
                      <div className="dashboard-list-row" key="no-client">
                        <span>{item.name}</span>
                        <strong>{item.count}</strong>
                      </div>
                    )
                  )
                ) : (
                  <p className="muted">No client workload yet.</p>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="section-heading">
                <div>
                  <h2>Technician Workload</h2>
                  <p className="muted">Active tickets by assigned technician.</p>
                </div>
              </div>
              <div className="dashboard-list">
                {stats.workload.length ? (
                  stats.workload.map((item) => (
                    <Link className="dashboard-list-row" href={ticketHref({ assignedUserId: item.filter.assignedUserId, statuses: activeStatuses })} key={item.userId}>
                      <span>{item.name}</span>
                      <strong>{item.count}</strong>
                    </Link>
                  ))
                ) : (
                  <p className="muted">No assigned technician workload yet.</p>
                )}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
