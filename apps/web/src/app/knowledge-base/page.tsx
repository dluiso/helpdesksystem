import { AppShell } from "@/components/layout/AppShell";
import { KnowledgeBaseWorkspace } from "@/components/knowledge-base/KnowledgeBaseWorkspace";
import { Suspense } from "react";

export default function KnowledgeBasePage() {
  return (
    <AppShell>
      <div className="compact-page-header knowledge-page-header">
        <div>
          <span className="page-eyebrow">Knowledge Base</span>
          <h1>Knowledge Base</h1>
          <p className="muted">Search, publish, and import reusable support documentation.</p>
        </div>
      </div>
      <Suspense fallback={<section className="panel">Loading Knowledge Base...</section>}>
        <KnowledgeBaseWorkspace />
      </Suspense>
    </AppShell>
  );
}
