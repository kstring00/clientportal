import { NextRequest, NextResponse } from "next/server";

import type { PortalApproval } from "@/lib/portal/types";
import { PortalRestError, userRest } from "@/lib/supabase/rest";
import { getPortalSession } from "@/lib/supabase/session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Row = Record<string, unknown>;

function str(row: Row, key: string) {
  return typeof row[key] === "string" ? (row[key] as string) : null;
}

function embeddedName(row: Row, fallback: string) {
  const nested = row.users;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const name = (nested as Row).name;
    if (typeof name === "string" && name.trim()) return name;
  }
  return fallback;
}

async function shapeApproval(approvalId: string, accessToken: string): Promise<PortalApproval | null> {
  const approvals = await userRest<Row[]>(
    `approvals?id=eq.${encodeURIComponent(approvalId)}&select=*,users!approvals_decided_by_fkey(name)&limit=1`,
    accessToken,
  ).catch(() => []);
  const row = approvals[0];
  if (!row) return null;

  const events = await userRest<Row[]>(
    `approval_events?approval_id=eq.${encodeURIComponent(approvalId)}&select=*,users!approval_events_actor_id_fkey(name)&order=created_at.asc`,
    accessToken,
  ).catch(() => []);

  return {
    id: str(row, "id") ?? "",
    title: str(row, "title") ?? "Approval",
    detail: str(row, "detail"),
    previewUrl: str(row, "preview_url"),
    fileId: str(row, "file_id"),
    status: (str(row, "status") ?? "waiting") as PortalApproval["status"],
    requestedAt: str(row, "requested_at") ?? str(row, "created_at") ?? "",
    decidedAt: str(row, "decided_at"),
    decidedByName: embeddedName(row, "") || null,
    history: events.map((event) => ({
      id: str(event, "id") ?? "",
      decision: (str(event, "decision") ?? "requested") as PortalApproval["history"][number]["decision"],
      actorName: embeddedName(event, "Someone"),
      comment: str(event, "comment"),
      createdAt: str(event, "created_at") ?? "",
    })),
  };
}

export async function POST(request: NextRequest) {
  const session = await getPortalSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const payload = (await request.json().catch(() => null)) as
    | { approvalId?: unknown; decision?: unknown; comment?: unknown }
    | null;
  if (!payload) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const approvalId = typeof payload.approvalId === "string" ? payload.approvalId : "";
  const decision = payload.decision === "approved" || payload.decision === "changes_requested"
    ? payload.decision
    : null;
  const comment = typeof payload.comment === "string" ? payload.comment.trim() : "";

  if (!UUID_RE.test(approvalId) || !decision || comment.length > 4000) {
    return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
  }

  const visible = await userRest<Row[]>(
    `approvals?id=eq.${encodeURIComponent(approvalId)}&select=id,status&limit=1`,
    session.accessToken,
  ).catch(() => []);
  const current = visible[0];
  if (!current) return NextResponse.json({ error: "Approval not found." }, { status: 404 });
  if (str(current, "status") !== "waiting") {
    return NextResponse.json({ error: "That approval has already been decided." }, { status: 409 });
  }

  try {
    await userRest("rpc/portal_decide_approval", session.accessToken, {
      method: "POST",
      body: JSON.stringify({
        p_approval_id: approvalId,
        p_decision: decision,
        p_comment: comment || null,
      }),
    });

    const approval = await shapeApproval(approvalId, session.accessToken);
    if (!approval) throw new Error("Updated approval could not be reloaded.");
    return NextResponse.json({ approval });
  } catch (error) {
    console.error("Portal approval decision failed", error);
    if (error instanceof PortalRestError && /already been decided/i.test(error.detail)) {
      return NextResponse.json({ error: "That approval has already been decided." }, { status: 409 });
    }
    return NextResponse.json({ error: "That decision could not be recorded." }, { status: 500 });
  }
}
