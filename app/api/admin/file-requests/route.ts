import { NextRequest, NextResponse } from "next/server";

import { portalConfig } from "@/lib/config";
import { adminRest } from "@/lib/supabase/rest";
import { getAdminSession } from "@/lib/supabase/session";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_CATEGORIES = new Set(
  portalConfig.fileCategories.map((category) => category.key),
);

export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        projectId?: string;
        label?: string;
        detail?: string;
        category?: string;
        position?: number;
      }
    | null;

  const projectId = body?.projectId?.trim() ?? "";
  const label = body?.label?.trim() ?? "";
  const category = body?.category?.trim() || "other";

  if (!UUID_RE.test(projectId) || !label || !ALLOWED_CATEGORIES.has(category)) {
    return NextResponse.json({ error: "Invalid file request." }, { status: 400 });
  }

  try {
    const inserted = await adminRest("file_requests", {
      method: "POST",
      returnRepresentation: true,
      body: JSON.stringify({
        project_id: projectId,
        label,
        detail: body?.detail?.trim() || null,
        category,
        status: "waiting",
        position:
          typeof body?.position === "number" && Number.isInteger(body.position)
            ? Math.max(0, body.position)
            : 0,
      }),
    });

    await adminRest("project_activity", {
      method: "POST",
      body: JSON.stringify({
        project_id: projectId,
        actor_id: session.profile.id,
        kind: "file_requested",
        summary: `File requested: ${label}`,
      }),
    }).catch(() => undefined);

    return NextResponse.json({ request: Array.isArray(inserted) ? inserted[0] : inserted });
  } catch (error) {
    console.error("Admin file request create failed", error);
    return NextResponse.json({ error: "Could not request that file." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { requestId?: string; status?: string }
    | null;
  const requestId = body?.requestId?.trim() ?? "";
  const status = body?.status?.trim() ?? "";

  if (
    !UUID_RE.test(requestId) ||
    !["waiting", "received", "accepted", "not_needed"].includes(status)
  ) {
    return NextResponse.json({ error: "Invalid file-request update." }, { status: 400 });
  }

  try {
    const updated = await adminRest(
      `file_requests?id=eq.${encodeURIComponent(requestId)}`,
      {
        method: "PATCH",
        returnRepresentation: true,
        body: JSON.stringify({
          status,
          received_at: status === "received" || status === "accepted" ? new Date().toISOString() : null,
        }),
      },
    );
    return NextResponse.json({ request: Array.isArray(updated) ? updated[0] : updated });
  } catch (error) {
    console.error("Admin file request update failed", error);
    return NextResponse.json({ error: "Could not update that file request." }, { status: 500 });
  }
}
