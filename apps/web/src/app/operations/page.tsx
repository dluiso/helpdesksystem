import { AppShell } from "@/components/layout/AppShell";
import { OperationsWorkspace } from "@/components/operations/OperationsWorkspace";

export default function OperationsPage() {
  return (
    <AppShell>
      <div className="page-header operations-page-header">
        <div>
          <span className="operations-page-eyebrow">Service Operations</span>
          <h1>Operations Center</h1>
          <p className="muted">A read-only operational view of active tickets, event requests, and service tasks.</p>
        </div>
      </div>
      <OperationsWorkspace />
    </AppShell>
  );
}
