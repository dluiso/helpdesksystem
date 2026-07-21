import { AppShell } from "@/components/layout/AppShell";
import { OperationsWorkspace } from "@/components/operations/OperationsWorkspace";

export default function OperationsPage() {
  return (
    <AppShell>
      <header className="operations-page-heading">
        <span className="operations-page-eyebrow">Service Operations</span>
        <h1>Operations Center</h1>
      </header>
      <OperationsWorkspace />
    </AppShell>
  );
}
