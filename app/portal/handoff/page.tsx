import { requirePortalView } from "@/lib/portal/page";
import PortalShell from "@/components/portal/PortalShell";
import HandoffSection from "@/components/portal/HandoffSection";

export const dynamic = "force-dynamic";

export default async function HandoffPage() {
  const view = await requirePortalView("handoff");
  return (
    <PortalShell view={view}>
      <HandoffSection view={view} />
    </PortalShell>
  );
}
