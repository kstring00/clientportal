import { requirePortalView } from "@/lib/portal/page";
import PortalShell from "@/components/portal/PortalShell";
import ApprovalsSection from "@/components/portal/ApprovalsSection";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const view = await requirePortalView("approvals");
  return (
    <PortalShell view={view}>
      <ApprovalsSection view={view} />
    </PortalShell>
  );
}
