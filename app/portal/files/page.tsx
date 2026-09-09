import { portalConfig } from "@/lib/config";
import { requirePortalView } from "@/lib/portal/page";
import PortalShell from "@/components/portal/PortalShell";
import FilesSection from "@/components/portal/FilesSection";

export const dynamic = "force-dynamic";

export default async function FilesPage() {
  const view = await requirePortalView("files");
  return (
    <PortalShell view={view}>
      <FilesSection view={view} categories={portalConfig.fileCategories} />
    </PortalShell>
  );
}
