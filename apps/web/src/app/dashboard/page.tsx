import { AppShell } from "@/components/layout/AppShell";
import { DashboardWorkspace } from "@/components/dashboard/DashboardWorkspace";

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="compact-page-header dashboard-page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Operational overview for tickets, event services, workload, and aging queues.</p>
        </div>
      </div>
      <DashboardWorkspace />
    </AppShell>
  );
}
