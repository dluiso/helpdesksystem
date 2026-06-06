import { AppShell } from "@/components/layout/AppShell";
import { KnowledgeBaseWorkspace } from "@/components/knowledge-base/KnowledgeBaseWorkspace";
import { Suspense } from "react";

export default function KnowledgeBasePage() {
  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1>Knowledge Base</h1>
          <p className="muted">Internal procedures, troubleshooting notes, credentials review drafts, and reusable ticket resolutions.</p>
        </div>
      </div>
      <Suspense fallback={<section className="panel">Loading Knowledge Base...</section>}>
        <KnowledgeBaseWorkspace />
      </Suspense>
    </AppShell>
  );
}
