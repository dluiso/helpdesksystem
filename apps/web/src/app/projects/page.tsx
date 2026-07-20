import { AppShell } from "@/components/layout/AppShell";
import { ProjectsWorkspace } from "@/components/projects/ProjectsWorkspace";

export default function ProjectsPage() {
  return (
    <AppShell>
      <div className="page-header projects-page-header">
        <div>
          <span className="projects-page-eyebrow">Planning</span>
          <h1>Projects</h1>
          <p className="muted">Coordinate operational initiatives without changing the ticket and event workflows that support them.</p>
        </div>
      </div>
      <ProjectsWorkspace />
    </AppShell>
  );
}
