import { NextRequest, NextResponse } from "next/server";

import { issueProjectInvoice } from "@/lib/stripe/invoicing";
import { adminRest } from "@/lib/supabase/rest";
import { getAdminSession } from "@/lib/supabase/session";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { projectId?: string; kind?: string }
    | null;

  const projectId = body?.projectId?.trim() ?? "";
  const kind = body?.kind === "deposit" || body?.kind === "final" ? body.kind : null;

  if (!UUID_RE.test(projectId) || !kind) {
    return NextResponse.json({ error: "Invalid invoice request." }, { status: 400 });
  }

  try {
    // The route accepts only identity + kind. The amount is derived from the
    // project's trusted agreed_total inside issueProjectInvoice().
    const invoice = await issueProjectInvoice(projectId, kind);

    await Promise.all([
      adminRest("project_activity", {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          actor_id: session.profile.id,
          kind: "invoice_issued",
          summary: `${kind === "deposit" ? "Deposit" : "Final"} invoice issued`,
        }),
      }).catch(() => undefined),
      adminRest("messages", {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          sender_id: null,
          kind: "system",
          body: `${kind === "deposit" ? "Deposit" : "Final"} invoice issued.`,
        }),
      }).catch(() => undefined),
    ]);

    return NextResponse.json({ invoice });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not issue invoice.";
    console.error("Admin invoice issue failed", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
