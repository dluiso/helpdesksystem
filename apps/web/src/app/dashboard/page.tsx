import { AppShell } from "@/components/layout/AppShell";
import { DashboardWorkspace } from "@/components/dashboard/DashboardWorkspace";

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Operational snapshot for tickets, response health, and client workload.</p>
        </div>
      </div>
      <DashboardWorkspace />
    </AppShell>
  );
}
