import { AppShell } from "@/components/layout/AppShell";
import { ProjectCreateWorkspace } from "@/components/projects/ProjectCreateWorkspace";

export default function NewProjectPage() {
  return (
    <AppShell>
      <header className="projects-page-heading">
        <span className="projects-page-eyebrow">Planning</span>
        <h1>New Project</h1>
      </header>
      <ProjectCreateWorkspace />
    </AppShell>
  );
}
