import { AppShell } from "@/components/layout/AppShell";

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Operational snapshot for tickets, response health, and client workload.</p>
        </div>
      </div>
      <section className="grid columns-3">
        <div className="panel metric">
          <span className="muted">Open Tickets</span>
          <strong>0</strong>
          <span className="status-pill">MVP placeholder</span>
        </div>
        <div className="panel metric">
          <span className="muted">Waiting on Customer</span>
          <strong>0</strong>
          <span className="status-pill">Tracked soon</span>
        </div>
        <div className="panel metric">
          <span className="muted">Attachments Pending Scan</span>
          <strong>0</strong>
          <span className="status-pill">Prepared</span>
        </div>
      </section>
    </AppShell>
  );
}
