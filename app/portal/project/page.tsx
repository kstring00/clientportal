import { requirePortalView } from "@/lib/portal/page";
import PortalShell from "@/components/portal/PortalShell";
import ProjectSection from "@/components/portal/ProjectSection";

export const dynamic = "force-dynamic";

export default async function ProjectPage() {
  const view = await requirePortalView("project");
  return (
    <PortalShell view={view}>
      <ProjectSection view={view} />
    </PortalShell>
  );
}
