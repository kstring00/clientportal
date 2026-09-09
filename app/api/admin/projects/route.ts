import { NextRequest, NextResponse } from "next/server";

import { portalConfig } from "@/lib/config";
import { adminRest } from "@/lib/supabase/rest";
import { getAdminSession } from "@/lib/supabase/session";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function slugify(value: string) {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 52);
  return `${base || "project"}-${crypto.randomUUID().slice(0, 6)}`;
}

export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const projectId = request.nextUrl.searchParams.get("projectId");
  const resource = projectId && UUID_RE.test(projectId)
    ? `projects?id=eq.${encodeURIComponent(projectId)}&select=*,clients(business_name,contact_name,contact_email)&limit=1`
    : "projects?select=*,clients(business_name,contact_name,contact_email)&order=created_at.desc";

  const projects = await adminRest(resource);
  return NextResponse.json({ projects });
}

export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        clientId?: string;
        name?: string;
        scopeSummary?: string;
        agreedTotal?: number | null;
      }
    | null;

  const clientId = body?.clientId?.trim() ?? "";
  const name = body?.name?.trim() ?? "";
  const agreedTotal =
    typeof body?.agreedTotal === "number" && Number.isFinite(body.agreedTotal)
      ? Math.max(0, body.agreedTotal)
      : null;

  if (!UUID_RE.test(clientId) || !name) {
    return NextResponse.json({ error: "Client and project name are required." }, { status: 400 });
  }

  try {
    const client = await adminRest<{ id: string }[]>(
      `clients?id=eq.${encodeURIComponent(clientId)}&select=id&limit=1`,
    );
    if (!client[0]) {
      return NextResponse.json({ error: "Client not found." }, { status: 404 });
    }

    const inserted = await adminRest<{ id: string }[]>("projects", {
      method: "POST",
      returnRepresentation: true,
      body: JSON.stringify({
        client_id: clientId,
        name,
        slug: slugify(name),
        status: "active",
        phase: portalConfig.phases[0]?.key ?? null,
        scope_summary: body?.scopeSummary?.trim() || null,
        agreed_total: agreedTotal,
      }),
    });

    const project = inserted[0];
    if (!project) throw new Error("Project insert returned no row.");

    if (portalConfig.handoffChecklist.length > 0) {
      await adminRest("handoff_items", {
        method: "POST",
        body: JSON.stringify(
          portalConfig.handoffChecklist.map((item, index) => ({
            project_id: project.id,
            item_key: item.key,
            label: item.label,
            status: "not_ready",
            position: index,
          })),
        ),
      });
    }

    await adminRest("project_activity", {
      method: "POST",
      body: JSON.stringify({
        project_id: project.id,
        actor_id: session.profile.id,
        kind: "project_created",
        summary: `Project created: ${name}`,
      }),
    }).catch(() => undefined);

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Admin project create failed", error);
    return NextResponse.json({ error: "Could not create that project." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        projectId?: string;
        status?: string;
        phase?: string | null;
        summary?: string | null;
        scopeSummary?: string | null;
        currentFocus?: string | null;
        nextAction?: string | null;
        nextActionDue?: string | null;
        nextMilestone?: string | null;
        nextMilestoneAt?: string | null;
        agreedTotal?: number | null;
      }
    | null;

  const projectId = body?.projectId?.trim() ?? "";
  if (!UUID_RE.test(projectId)) {
    return NextResponse.json({ error: "Invalid project." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  const requestedPhase = body?.phase;

  if (typeof body?.status === "string") {
    if (!["active", "paused", "complete", "archived"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid project status." }, { status: 400 });
    }
    patch.status = body.status;
  }

  if (requestedPhase !== undefined) {
    if (
      requestedPhase !== null &&
      !portalConfig.phases.some((phase) => phase.key === requestedPhase)
    ) {
      return NextResponse.json({ error: "Invalid project phase." }, { status: 400 });
    }
    patch.phase = requestedPhase;
  }

  const textFields = [
    ["summary", "summary"],
    ["scopeSummary", "scope_summary"],
    ["currentFocus", "current_focus"],
    ["nextAction", "next_action"],
    ["nextActionDue", "next_action_due"],
    ["nextMilestone", "next_milestone"],
    ["nextMilestoneAt", "next_milestone_at"],
  ] as const;

  for (const [input, column] of textFields) {
    const value = body?.[input];
    if (value !== undefined) {
      patch[column] = typeof value === "string" ? value.trim() || null : null;
    }
  }

  if (body?.agreedTotal !== undefined) {
    if (body.agreedTotal === null) patch.agreed_total = null;
    else if (
      typeof body.agreedTotal === "number" &&
      Number.isFinite(body.agreedTotal) &&
      body.agreedTotal >= 0
    ) {
      patch.agreed_total = body.agreedTotal;
    } else {
      return NextResponse.json({ error: "Invalid agreed total." }, { status: 400 });
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  try {
    const updated = await adminRest(
      `projects?id=eq.${encodeURIComponent(projectId)}`,
      {
        method: "PATCH",
        returnRepresentation: true,
        body: JSON.stringify(patch),
      },
    );

    if (requestedPhase !== undefined) {
      const phaseLabel = requestedPhase
        ? portalConfig.phases.find((phase) => phase.key === requestedPhase)?.label ?? requestedPhase
        : null;
      await adminRest("project_activity", {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          actor_id: session.profile.id,
          kind: "phase_changed",
          summary: phaseLabel
            ? `Project phase changed to ${phaseLabel}`
            : "Project phase cleared",
        }),
      }).catch(() => undefined);
    }

    return NextResponse.json({ project: Array.isArray(updated) ? updated[0] : updated });
  } catch (error) {
    console.error("Admin project update failed", error);
    return NextResponse.json({ error: "Could not update that project." }, { status: 500 });
  }
}
