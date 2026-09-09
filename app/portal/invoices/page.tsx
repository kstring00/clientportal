import { requirePortalView } from "@/lib/portal/page";
import PortalShell from "@/components/portal/PortalShell";
import InvoicesSection from "@/components/portal/InvoicesSection";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const view = await requirePortalView("invoices");
  return (
    <PortalShell view={view}>
      <InvoicesSection view={view} />
    </PortalShell>
  );
}
