import { requirePortalView } from "@/lib/portal/page";
import PortalShell from "@/components/portal/PortalShell";
import MessagesSection from "@/components/portal/MessagesSection";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const view = await requirePortalView("messages");
  return (
    <PortalShell view={view}>
      <MessagesSection view={view} />
    </PortalShell>
  );
}
