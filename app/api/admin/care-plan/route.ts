import { NextRequest, NextResponse } from "next/server";

import { cancelCarePlan, startCarePlan } from "@/lib/stripe/invoicing";
import { getAdminSession } from "@/lib/supabase/session";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { projectId?: string; priceId?: string }
    | null;
  const projectId = body?.projectId?.trim() ?? "";

  if (!UUID_RE.test(projectId)) {
    return NextResponse.json({ error: "Invalid project." }, { status: 400 });
  }

  try {
    const carePlan = await startCarePlan(projectId, body?.priceId?.trim());
    return NextResponse.json({ carePlan });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start care plan.";
    console.error("Admin care plan start failed", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { projectId?: string }
    | null;
  const projectId = body?.projectId?.trim() ?? "";

  if (!UUID_RE.test(projectId)) {
    return NextResponse.json({ error: "Invalid project." }, { status: 400 });
  }

  try {
    const carePlan = await cancelCarePlan(projectId);
    return NextResponse.json({ carePlan });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not cancel care plan.";
    console.error("Admin care plan cancel failed", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
