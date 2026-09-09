import { NextRequest, NextResponse } from "next/server";

import { appUrl } from "@/lib/config/env";
import { portalConfig } from "@/lib/config";
import { adminRest } from "@/lib/supabase/rest";
import {
  ensurePortalUser,
  getAdminSession,
  sendPortalMagicLink,
} from "@/lib/supabase/session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        clientId?: string;
        projectId?: string;
        email?: string;
        name?: string;
        businessName?: string;
        phone?: string;
        projectName?: string;
        scopeSummary?: string;
        agreedTotal?: number | null;
      }
    | null;

  const email = body?.email?.trim().toLowerCase() ?? "";
  const name = body?.name?.trim() ?? "";
  const businessName = body?.businessName?.trim() ?? "";
  const projectName = body?.projectName?.trim() ?? "";
  const existingClientId = body?.clientId?.trim() ?? "";
  const existingProjectId = body?.projectId?.trim() ?? "";
  const agreedTotal =
    typeof body?.agreedTotal === "number" && Number.isFinite(body.agreedTotal)
      ? Math.max(0, body.agreedTotal)
      : null;

  if (!EMAIL_RE.test(email) || !name) {
    return NextResponse.json({ error: "Name and a valid email are required." }, { status: 400 });
  }

  if (!existingProjectId && (!businessName || !projectName)) {
    return NextResponse.json(
      { error: "Business and project name are required for a new project." },
      { status: 400 },
    );
  }

  if (existingClientId && !UUID_RE.test(existingClientId)) {
    return NextResponse.json({ error: "Invalid client." }, { status: 400 });
  }
  if (existingProjectId && !UUID_RE.test(existingProjectId)) {
    return NextResponse.json({ error: "Invalid project." }, { status: 400 });
  }

  let createdClientId: string | null = null;
  let createdProjectId: string | null = null;

  try {
    const profile = await ensurePortalUser(email, name, "client");

    let clientId = existingClientId;
    let projectId = existingProjectId;

    if (projectId) {
      const projects = await adminRest<{ id: string; client_id: string; name: string }[]>(
        `projects?id=eq.${encodeURIComponent(projectId)}&select=id,client_id,name&limit=1`,
      );
      const project = projects[0];
      if (!project) {
        return NextResponse.json({ error: "Project not found." }, { status: 404 });
      }
      clientId = project.client_id;
    } else {
      if (clientId) {
        const clients = await adminRest<{ id: string }[]>(
          `clients?id=eq.${encodeURIComponent(clientId)}&select=id&limit=1`,
        );
        if (!clients[0]) {
          return NextResponse.json({ error: "Client not found." }, { status: 404 });
        }
      } else {
        const insertedClients = await adminRest<{ id: string }[]>("clients", {
          method: "POST",
          returnRepresentation: true,
          body: JSON.stringify({
            business_name: businessName,
            contact_name: name,
            contact_email: email,
            phone: body?.phone?.trim() || null,
          }),
        });
        clientId = insertedClients[0]?.id ?? "";
        createdClientId = clientId || null;
      }

      if (!clientId) throw new Error("Client creation returned no id.");

      const insertedProjects = await adminRest<{ id: string; name: string }[]>("projects", {
        method: "POST",
        returnRepresentation: true,
        body: JSON.stringify({
          client_id: clientId,
          name: projectName,
          slug: slugify(projectName),
          status: "active",
          phase: portalConfig.phases[0]?.key ?? null,
          scope_summary: body?.scopeSummary?.trim() || null,
          agreed_total: agreedTotal,
        }),
      });

      projectId = insertedProjects[0]?.id ?? "";
      createdProjectId = projectId || null;
      if (!projectId) throw new Error("Project creation returned no id.");

      if (portalConfig.handoffChecklist.length > 0) {
        await adminRest("handoff_items", {
          method: "POST",
          body: JSON.stringify(
            portalConfig.handoffChecklist.map((item, index) => ({
              project_id: projectId,
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
          project_id: projectId,
          actor_id: session.profile.id,
          kind: "project_created",
          summary: `Project created: ${projectName}`,
        }),
      }).catch(() => undefined);
    }

    if (!clientId || !projectId) throw new Error("Invite target is incomplete.");

    // Add this person to the project if they are not already there. The unique
    // constraint makes repeated invites safe; use an explicit lookup so a
    // duplicate does not become an error that prevents the magic link.
    const memberships = await adminRest<{ id: string }[]>(
      `project_members?project_id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(profile.id)}&select=id&limit=1`,
    );

    if (!memberships[0]) {
      const ownerRows = await adminRest<{ id: string }[]>(
        `project_members?project_id=eq.${encodeURIComponent(projectId)}&member_role=eq.owner&select=id&limit=1`,
      );
      await adminRest("project_members", {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          user_id: profile.id,
          member_role: ownerRows[0] ? "collaborator" : "owner",
        }),
      });
    }

    // Keep the billing/contact address current for a newly invited owner.
    await adminRest(`clients?id=eq.${encodeURIComponent(clientId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        contact_name: name,
        contact_email: email,
        phone: body?.phone?.trim() || undefined,
      }),
    });

    try {
      await sendPortalMagicLink(email, `${appUrl()}/portal`);
    } catch (error) {
      // For a brand-new provisioning attempt, roll back the project/client we
      // created so pressing Invite again cannot silently make duplicates. A
      // resend against an existing project leaves that project untouched.
      if (createdProjectId) {
        await adminRest(`projects?id=eq.${encodeURIComponent(createdProjectId)}`, {
          method: "DELETE",
        }).catch(() => undefined);
      }
      if (createdClientId) {
        await adminRest(`clients?id=eq.${encodeURIComponent(createdClientId)}`, {
          method: "DELETE",
        }).catch(() => undefined);
      }
      throw error;
    }

    const sentAt = new Date().toISOString();
    const clients = await adminRest<{ invited_at: string | null }[]>(
      `clients?id=eq.${encodeURIComponent(clientId)}&select=invited_at&limit=1`,
    );
    await adminRest(`clients?id=eq.${encodeURIComponent(clientId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        invited_at: clients[0]?.invited_at ?? sentAt,
        invite_last_sent_at: sentAt,
      }),
    });

    return NextResponse.json({
      ok: true,
      clientId,
      projectId,
      message: `Invite sent to ${email}.`,
    });
  } catch (error) {
    console.error("Portal client invite failed", error);
    return NextResponse.json(
      { error: "The client could not be invited. Check the details and try again." },
      { status: 500 },
    );
  }
}
