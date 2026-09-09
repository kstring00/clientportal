import { NextRequest, NextResponse } from "next/server";

import { adminRest, PortalRestError } from "@/lib/supabase/rest";
import { getAdminSession } from "@/lib/supabase/session";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        projectId?: string;
        itemId?: string;
        status?: string;
        note?: string | null;
        transferOwnership?: boolean;
      }
    | null;

  const projectId = body?.projectId?.trim() ?? "";
  const itemId = body?.itemId?.trim() ?? "";

  if (!UUID_RE.test(projectId)) {
    return NextResponse.json({ error: "Invalid project." }, { status: 400 });
  }

  try {
    let item: unknown = null;

    if (itemId) {
      if (!UUID_RE.test(itemId)) {
        return NextResponse.json({ error: "Invalid handoff item." }, { status: 400 });
      }
      const status = body?.status?.trim() ?? "";
      if (!["not_ready", "ready", "transferred", "not_applicable"].includes(status)) {
        return NextResponse.json({ error: "Invalid handoff status." }, { status: 400 });
      }

      const transferredAt = status === "transferred" ? new Date().toISOString() : null;
      const updated = await adminRest(
        `handoff_items?id=eq.${encodeURIComponent(itemId)}&project_id=eq.${encodeURIComponent(projectId)}`,
        {
          method: "PATCH",
          returnRepresentation: true,
          body: JSON.stringify({
            status,
            note: typeof body?.note === "string" ? body.note.trim() || null : body?.note ?? null,
            transferred_at: transferredAt,
          }),
        },
      );
      item = Array.isArray(updated) ? updated[0] : updated;

      await adminRest("project_activity", {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          actor_id: session.profile.id,
          kind: "handoff_updated",
          summary: `Handoff item updated to ${status.replaceAll("_", " ")}`,
        }),
      }).catch(() => undefined);
    }

    let project: unknown = null;
    if (body?.transferOwnership === true) {
      const transferredAt = new Date().toISOString();
      // Do not pre-authorize this with application logic. The database trigger
      // is the authority and will reject this write if final payment has not
      // cleared or if the timestamp would violate the ordering rule.
      const updatedProject = await adminRest(
        `projects?id=eq.${encodeURIComponent(projectId)}`,
        {
          method: "PATCH",
          returnRepresentation: true,
          body: JSON.stringify({ ownership_transferred_at: transferredAt }),
        },
      );
      project = Array.isArray(updatedProject) ? updatedProject[0] : updatedProject;
    }

    return NextResponse.json({ item, project });
  } catch (error) {
    console.error("Admin handoff update failed", error);

    if (error instanceof PortalRestError && /Ownership/.test(error.detail)) {
      return NextResponse.json(
        { error: "Ownership cannot transfer until the final invoice has cleared." },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: "Could not update handoff." }, { status: 500 });
  }
}
