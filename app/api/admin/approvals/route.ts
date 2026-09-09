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
        title?: string;
        detail?: string;
        previewUrl?: string;
        fileId?: string | null;
      }
    | null;

  const projectId = body?.projectId?.trim() ?? "";
  const title = body?.title?.trim() ?? "";
  const fileId = body?.fileId?.trim() || null;

  if (!UUID_RE.test(projectId) || !title || (fileId && !UUID_RE.test(fileId))) {
    return NextResponse.json({ error: "Invalid approval request." }, { status: 400 });
  }

  try {
    const project = await adminRest<{ id: string }[]>(
      `projects?id=eq.${encodeURIComponent(projectId)}&select=id&limit=1`,
    );
    if (!project[0]) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    if (fileId) {
      const file = await adminRest<{ id: string }[]>(
        `files?id=eq.${encodeURIComponent(fileId)}&project_id=eq.${encodeURIComponent(projectId)}&select=id&limit=1`,
      );
      if (!file[0]) {
        return NextResponse.json({ error: "File not found on this project." }, { status: 400 });
      }
    }

    const inserted = await adminRest<{ id: string; requested_at: string }[]>("approvals", {
      method: "POST",
      returnRepresentation: true,
      body: JSON.stringify({
        project_id: projectId,
        title,
        detail: body?.detail?.trim() || null,
        preview_url: body?.previewUrl?.trim() || null,
        file_id: fileId,
        status: "waiting",
      }),
    });

    const approval = inserted[0];
    if (!approval) throw new Error("Approval insert returned no row.");

    await adminRest("approval_events", {
      method: "POST",
      body: JSON.stringify({
        approval_id: approval.id,
        project_id: projectId,
        actor_id: session.profile.id,
        decision: "requested",
        comment: body?.detail?.trim() || null,
      }),
    });

    await Promise.all([
      adminRest("project_activity", {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          actor_id: session.profile.id,
          kind: "approval_requested",
          summary: `Approval requested: ${title}`,
        }),
      }).catch(() => undefined),
      adminRest("messages", {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          sender_id: null,
          kind: "system",
          body: `Approval requested: ${title}`,
        }),
      }).catch(() => undefined),
    ]);

    return NextResponse.json({ approval });
  } catch (error) {
    console.error("Admin approval request failed", error);
    return NextResponse.json({ error: "Could not create that approval." }, { status: 500 });
  }
}
