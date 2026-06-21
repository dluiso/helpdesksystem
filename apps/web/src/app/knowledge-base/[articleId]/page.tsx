import { AppShell } from "@/components/layout/AppShell";
import { KnowledgeBaseWorkspace } from "@/components/knowledge-base/KnowledgeBaseWorkspace";
import { Suspense } from "react";

interface KnowledgeArticlePageProps {
  params: Promise<{ articleId: string }>;
}

export default async function KnowledgeArticlePage({ params }: KnowledgeArticlePageProps) {
  const { articleId } = await params;

  return (
    <AppShell>
      <div className="compact-page-header knowledge-page-header">
        <div>
          <span className="page-eyebrow">Knowledge Base</span>
          <h1>Knowledge Base</h1>
          <p className="muted">Review article pages, attachments, and publishing status.</p>
        </div>
      </div>
      <Suspense fallback={<section className="panel">Loading article...</section>}>
        <KnowledgeBaseWorkspace articleId={articleId} />
      </Suspense>
    </AppShell>
  );
}
