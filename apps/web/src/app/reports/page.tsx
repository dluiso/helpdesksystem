import { AppShell } from "@/components/layout/AppShell";
import { ReportsWorkspace } from "@/components/reports/ReportsWorkspace";

export default function ReportsPage() {
  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1>Reports</h1>
          <p className="muted">Ticket performance, client workload, operational trends, estimates, and exports.</p>
        </div>
      </div>
      <ReportsWorkspace />
    </AppShell>
  );
}
