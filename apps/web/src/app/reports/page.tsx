import { AppShell } from "@/components/layout/AppShell";

export default function ReportsPage() {
  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1>Reports</h1>
          <p className="muted">CSV exports and ticket performance metrics are reserved for the reporting milestone.</p>
        </div>
      </div>
      <section className="grid columns-2">
        <div className="panel">
          <h2>Ticket Volume</h2>
          <p className="muted">Date range filters will drive created and closed ticket counts.</p>
        </div>
        <div className="panel">
          <h2>Response Metrics</h2>
          <p className="muted">First response and resolution time calculations will appear here.</p>
        </div>
      </section>
    </AppShell>
  );
}
