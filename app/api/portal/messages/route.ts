import { NextRequest, NextResponse } from "next/server";

import type { PortalMessage } from "@/lib/portal/types";
import { userRest } from "@/lib/supabase/rest";
import { getPortalSession } from "@/lib/supabase/session";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MessageRow = {
  id: string;
  project_id: string;
  sender_id: string | null;
  kind: "message" | "system";
  body: string;
  file_id: string | null;
  created_at: string;
};

export async function POST(request: NextRequest) {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: { projectId?: unknown; body?: unknown };
  try {
    payload = (await request.json()) as { projectId?: unknown; body?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const projectId = typeof payload.projectId === "string" ? payload.projectId : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";

  if (!UUID_RE.test(projectId) || body.length < 1 || body.length > 10000) {
    return NextResponse.json({ error: "Invalid message." }, { status: 400 });
  }

  // RLS on projects is the first authorization boundary, and the messages
  // insert policy repeats the same membership check. This explicit lookup lets
  // us return a useful 404 instead of turning a filtered insert into a vague
  // server error.
  const project = await userRest<{ id: string }[]>(
    `projects?id=eq.${encodeURIComponent(projectId)}&select=id&limit=1`,
    session.accessToken,
  ).catch(() => []);

  if (!project[0]) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  try {
    const inserted = await userRest<MessageRow[]>("messages", session.accessToken, {
      method: "POST",
      returnRepresentation: true,
      body: JSON.stringify({
        project_id: projectId,
        sender_id: session.profile.id,
        kind: "message",
        body,
      }),
    });

    const row = inserted[0];
    if (!row) throw new Error("Message insert returned no row.");

    const message: PortalMessage = {
      id: row.id,
      kind: row.kind,
      body: row.body,
      senderName: session.profile.name,
      senderRole: session.profile.role,
      isMine: true,
      fileId: row.file_id,
      createdAt: row.created_at,
      read: true,
    };

    return NextResponse.json({ message });
  } catch (error) {
    console.error("Portal message insert failed", error);
    return NextResponse.json(
      { error: "That message could not be sent." },
      { status: 500 },
    );
  }
}
