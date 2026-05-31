import { AppShell } from "@/components/layout/AppShell";

export default function KnowledgeBasePage() {
  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1>Knowledge Base</h1>
          <p className="muted">Internal and public articles will use the same rich text safety rules as ticket messages.</p>
        </div>
      </div>
      <section className="panel">
        <h2>Articles</h2>
        <p className="muted">No articles have been drafted yet.</p>
      </section>
    </AppShell>
  );
}
