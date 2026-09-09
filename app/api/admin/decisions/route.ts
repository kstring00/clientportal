import { NextRequest, NextResponse } from "next/server";

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
    | {
        projectId?: string;
        topic?: string;
        decision?: string;
        detail?: string;
        decidedOn?: string;
        approvalId?: string | null;
      }
    | null;

  const projectId = body?.projectId?.trim() ?? "";
  const topic = body?.topic?.trim() ?? "";
  const decision = body?.decision?.trim() ?? "";
  const approvalId = body?.approvalId?.trim() || null;

  if (!UUID_RE.test(projectId) || !topic || !decision || (approvalId && !UUID_RE.test(approvalId))) {
    return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
  }

  try {
    const inserted = await adminRest("project_decisions", {
      method: "POST",
      returnRepresentation: true,
      body: JSON.stringify({
        project_id: projectId,
        topic,
        decision,
        detail: body?.detail?.trim() || null,
        decided_on: body?.decidedOn?.trim() || undefined,
        approval_id: approvalId,
      }),
    });

    await adminRest("project_activity", {
      method: "POST",
      body: JSON.stringify({
        project_id: projectId,
        actor_id: session.profile.id,
        kind: "decision_recorded",
        summary: `${topic}: ${decision}`.slice(0, 500),
      }),
    }).catch(() => undefined);

    return NextResponse.json({ decision: Array.isArray(inserted) ? inserted[0] : inserted });
  } catch (error) {
    console.error("Admin decision create failed", error);
    return NextResponse.json({ error: "Could not record that decision." }, { status: 500 });
  }
}
