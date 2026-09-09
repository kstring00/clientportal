import { requirePortalView } from "@/lib/portal/page";
import PortalShell from "@/components/portal/PortalShell";
import HelpSection from "@/components/portal/HelpSection";

export const dynamic = "force-dynamic";

export default async function HelpPage() {
  const view = await requirePortalView("help");
  return (
    <PortalShell view={view}>
      <HelpSection view={view} />
    </PortalShell>
  );
}
