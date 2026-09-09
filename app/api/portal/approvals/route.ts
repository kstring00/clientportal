import { NextRequest, NextResponse } from "next/server";

import type { PortalApproval } from "@/lib/portal/types";
import { userRest } from "@/lib/supabase/rest";
import { getPortalSession } from "@/lib/supabase/session";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

async function shapeApproval(
  approvalId: string,
  accessToken: string,
): Promise<PortalApproval | null> {
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
      decision: (str(event, "decision") ?? "requested") as
        PortalApproval["history"][number]["decision"],
      actorName: embeddedName(event, "Someone"),
      comment: str(event, "comment"),
      createdAt: str(event, "created_at") ?? "",
    })),
  };
}

export async function POST(request: NextRequest) {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: {
    approvalId?: unknown;
    decision?: unknown;
    comment?: unknown;
  };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const approvalId =
    typeof payload.approvalId === "string" ? payload.approvalId : "";
  const decision =
    payload.decision === "approved" || payload.decision === "changes_requested"
      ? payload.decision
      : null;
  const comment = typeof payload.comment === "string" ? payload.comment.trim() : "";

  if (!UUID_RE.test(approvalId) || !decision || comment.length > 4000) {
    return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
  }

  // Resolve the approval under the user's token before writing. RLS hides every
  // approval outside their projects. Only a waiting approval can be decided from
  // the client UI; a second submission after it has already moved is a conflict,
  // not a fresh history event.
  const visible = await userRest<Row[]>(
    `approvals?id=eq.${encodeURIComponent(approvalId)}&select=id,project_id,status&limit=1`,
    session.accessToken,
  ).catch(() => []);

  const current = visible[0];
  if (!current) {
    return NextResponse.json({ error: "Approval not found." }, { status: 404 });
  }

  if (str(current, "status") !== "waiting") {
    return NextResponse.json(
      { error: "That approval has already been decided." },
      { status: 409 },
    );
  }

  const projectId = str(current, "project_id");
  if (!projectId) {
    return NextResponse.json({ error: "Approval not found." }, { status: 404 });
  }

  const decidedAt = new Date().toISOString();

  try {
    // The approval row is the cheap current-state summary; approval_events is
    // the permanent append-only record. Both writes use the caller's token, so
    // the database still enforces project membership and actor attribution.
    const updated = await userRest<Row[]>(
      `approvals?id=eq.${encodeURIComponent(approvalId)}&status=eq.waiting`,
      session.accessToken,
      {
        method: "PATCH",
        returnRepresentation: true,
        body: JSON.stringify({
          status: decision,
          decided_at: decidedAt,
          decided_by: session.profile.id,
        }),
      },
    );

    if (!updated[0]) {
      return NextResponse.json(
        { error: "That approval has already been decided." },
        { status: 409 },
      );
    }

    await userRest("approval_events", session.accessToken, {
      method: "POST",
      body: JSON.stringify({
        approval_id: approvalId,
        project_id: projectId,
        actor_id: session.profile.id,
        decision,
        comment: comment || null,
      }),
    });

    const approval = await shapeApproval(approvalId, session.accessToken);
    if (!approval) throw new Error("Updated approval could not be reloaded.");

    return NextResponse.json({ approval });
  } catch (error) {
    console.error("Portal approval decision failed", error);
    return NextResponse.json(
      { error: "That decision could not be recorded." },
      { status: 500 },
    );
  }
}
