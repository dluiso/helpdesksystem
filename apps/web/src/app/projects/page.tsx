import { AppShell } from "@/components/layout/AppShell";
import { ProjectsWorkspace } from "@/components/projects/ProjectsWorkspace";
import { Suspense } from "react";

export default function ProjectsPage() {
  return (
    <AppShell>
      <header className="projects-page-heading">
        <span className="projects-page-eyebrow">Planning</span>
        <h1>Projects</h1>
      </header>
      <Suspense fallback={null}><ProjectsWorkspace /></Suspense>
    </AppShell>
  );
}
