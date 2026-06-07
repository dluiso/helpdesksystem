import { AppShell } from "@/components/layout/AppShell";
import { DashboardWorkspace } from "@/components/dashboard/DashboardWorkspace";

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="compact-page-header">
        <div>
          <h1>Dashboard</h1>
        </div>
      </div>
      <DashboardWorkspace />
    </AppShell>
  );
}
