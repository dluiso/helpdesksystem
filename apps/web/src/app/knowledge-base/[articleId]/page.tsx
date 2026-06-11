import { AppShell } from "@/components/layout/AppShell";
import { KnowledgeBaseWorkspace } from "@/components/knowledge-base/KnowledgeBaseWorkspace";
import { Suspense } from "react";

interface KnowledgeArticlePageProps {
  params: { articleId: string };
}

export default function KnowledgeArticlePage({ params }: KnowledgeArticlePageProps) {
  return (
    <AppShell>
      <div className="compact-page-header">
        <div>
          <h1>Knowledge Base</h1>
        </div>
      </div>
      <Suspense fallback={<section className="panel">Loading article...</section>}>
        <KnowledgeBaseWorkspace articleId={params.articleId} />
      </Suspense>
    </AppShell>
  );
}
