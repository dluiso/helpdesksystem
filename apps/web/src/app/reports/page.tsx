import { AppShell } from "@/components/layout/AppShell";
import { ReportsWorkspace } from "@/components/reports/ReportsWorkspace";

export default function ReportsPage() {
  return (
    <AppShell>
      <div className="page-header reports-page-header">
        <div className="reports-page-title-block">
          <span className="reports-page-eyebrow">Analytics</span>
          <h1>Reports</h1>
          <p className="muted">Ticket performance, client workload, operational trends, estimates, and exports.</p>
        </div>
      </div>
      <ReportsWorkspace />
    </AppShell>
  );
}
