/**
 * Assembles a `PortalView` for the signed-in client.
 *
 * Two properties this module must preserve:
 *
 *   1. EVERY query uses `userRest` with the caller's own access token, so RLS
 *      applies to all of it. There is no `adminRest` in this file and there
 *      should never be one — a loader that bypasses RLS to "just fetch the
 *      project" is how one client ends up seeing another's data.
 *
 *   2. Disabled modules are not queried at all. That is not only a performance
 *      matter: a portal with `messages: false` should make no request that could
 *      return a message.
 */

import "server-only";

import { fileCategoryLabel, isFeatureEnabled, portalConfig } from "@/lib/config";
import { isDemoMode } from "@/lib/config/env";
import { eq, userRest } from "@/lib/supabase/rest";
import type { PortalSession } from "@/lib/supabase/session";
import { buildDemoView } from "@/lib/demo/dataset";
import { buildAttention } from "./attention";
import type {
  PortalApproval,
  PortalCarePlan,
  PortalPhase,
  PortalView,
} from "./types";

type Row = Record<string, unknown>;

const str = (row: Row, key: string) =>
  typeof row[key] === "string" ? (row[key] as string) : null;
const num = (row: Row, key: string) => {
  const value = row[key];
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** PostgREST embeds a to-one relation as a nested object. */
function embeddedName(row: Row, key: string, fallback: string) {
  const nested = row[key];
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const name = (nested as Row).name;
    if (typeof name === "string" && name.trim()) return name;
  }
  return fallback;
}

/**
 * The project this session should see.
 *
 * RLS already restricts `projects` to the caller's memberships, so this returns
 * their project without needing a membership filter of its own. A client with no
 * membership gets null and is shown the "no project yet" screen.
 */
async function loadProject(session: PortalSession, slug?: string) {
  const filter = slug ? `&slug=eq.${eq(slug)}` : "";
  const rows = await userRest<Row[]>(
    `projects?select=*,clients(business_name)${filter}&order=created_at.desc&limit=1`,
    session.accessToken,
  ).catch(() => []);
  return rows[0] ?? null;
}

function buildPhases(projectPhase: string | null, rows: Row[]): PortalPhase[] {
  const byKey = new Map(rows.map((row) => [str(row, "phase_key") ?? "", row]));
  const currentIndex = portalConfig.phases.findIndex((p) => p.key === projectPhase);

  return portalConfig.phases.map((phase, index) => {
    const row = byKey.get(phase.key);

    // A stored status wins; otherwise position relative to the project's current
    // phase decides. This means a project works correctly with no phase rows at
    // all, which is the state every project starts in.
    const stored = row ? str(row, "status") : null;
    const derived =
      currentIndex < 0
        ? "upcoming"
        : index < currentIndex
          ? "complete"
          : index === currentIndex
            ? "current"
            : "upcoming";

    return {
      key: phase.key,
      ordinal: phase.ordinal,
      label: phase.label,
      blurb: phase.blurb,
      status: (stored as PortalPhase["status"]) ?? derived,
      note: row ? str(row, "note") : null,
      startedAt: row ? str(row, "started_at") : null,
      completedAt: row ? str(row, "completed_at") : null,
    };
  });
}

export async function loadPortalView(
  session: PortalSession,
  slug?: string,
): Promise<PortalView | null> {
  // Demo mode never reads the database, so it cannot show or alter real data.
  if (isDemoMode()) return buildDemoView();

  const token = session.accessToken;
  const projectRow = await loadProject(session, slug);
  if (!projectRow) return null;

  const projectId = str(projectRow, "id");
  if (!projectId) return null;

  const scoped = (resource: string) =>
    `${resource}&project_id=eq.${eq(projectId)}`;

  // Only fetch what this deployment actually shows.
  const [
    phaseRows,
    fileRows,
    fileRequestRows,
    approvalRows,
    approvalEventRows,
    messageRows,
    readRows,
    decisionRows,
    activityRows,
    invoiceRows,
    carePlanRows,
    handoffRows,
    timeRows,
    tourRows,
  ] = await Promise.all([
    userRest<Row[]>(scoped("project_phases?select=*"), token).catch(() => []),
    isFeatureEnabled("files")
      ? userRest<Row[]>(
          scoped("files?select=id,filename,category,size,version,created_at,users!files_uploaded_by_fkey(name)&order=created_at.desc"),
          token,
        ).catch(() => [])
      : Promise.resolve([]),
    isFeatureEnabled("files")
      ? userRest<Row[]>(
          scoped("file_requests?select=*&order=position.asc,created_at.asc"),
          token,
        ).catch(() => [])
      : Promise.resolve([]),
    isFeatureEnabled("approvals")
      ? userRest<Row[]>(
          scoped("approvals?select=*,users!approvals_decided_by_fkey(name)&order=created_at.desc"),
          token,
        ).catch(() => [])
      : Promise.resolve([]),
    isFeatureEnabled("approvals")
      ? userRest<Row[]>(
          scoped("approval_events?select=*,users!approval_events_actor_id_fkey(name)&order=created_at.asc"),
          token,
        ).catch(() => [])
      : Promise.resolve([]),
    isFeatureEnabled("messages")
      ? userRest<Row[]>(
          scoped("messages?select=*,users!messages_sender_id_fkey(name,role)&order=created_at.asc"),
          token,
        ).catch(() => [])
      : Promise.resolve([]),
    isFeatureEnabled("messages")
      ? userRest<Row[]>(
          `message_reads?select=message_id&user_id=eq.${eq(session.profile.id)}`,
          token,
        ).catch(() => [])
      : Promise.resolve([]),
    isFeatureEnabled("decisions")
      ? userRest<Row[]>(
          scoped("project_decisions?select=*&order=decided_on.desc,created_at.desc"),
          token,
        ).catch(() => [])
      : Promise.resolve([]),
    userRest<Row[]>(
      scoped("project_activity?select=*,users(name)&order=created_at.desc&limit=12"),
      token,
    ).catch(() => []),
    isFeatureEnabled("invoices")
      ? userRest<Row[]>(scoped("invoices?select=*&order=created_at.asc"), token).catch(
          () => [],
        )
      : Promise.resolve([]),
    isFeatureEnabled("carePlan")
      ? userRest<Row[]>(scoped("care_plans?select=*&limit=1"), token).catch(() => [])
      : Promise.resolve([]),
    isFeatureEnabled("handoff")
      ? userRest<Row[]>(
          scoped("handoff_items?select=*&order=position.asc"),
          token,
        ).catch(() => [])
      : Promise.resolve([]),
    isFeatureEnabled("timeLog")
      ? userRest<Row[]>(
          scoped("time_entries?select=*&order=entry_date.desc&limit=50"),
          token,
        ).catch(() => [])
      : Promise.resolve([]),
    userRest<Row[]>(
      `portal_tour_state?select=*&user_id=eq.${eq(session.profile.id)}&limit=1`,
      token,
    ).catch(() => []),
  ]);

  const eventsByApproval = new Map<string, Row[]>();
  for (const row of approvalEventRows) {
    const key = str(row, "approval_id") ?? "";
    const list = eventsByApproval.get(key) ?? [];
    list.push(row);
    eventsByApproval.set(key, list);
  }

  const approvals: PortalApproval[] = approvalRows.map((row) => {
    const id = str(row, "id") ?? "";
    return {
      id,
      title: str(row, "title") ?? "Approval",
      detail: str(row, "detail"),
      previewUrl: str(row, "preview_url"),
      fileId: str(row, "file_id"),
      status: (str(row, "status") ?? "waiting") as PortalApproval["status"],
      requestedAt: str(row, "requested_at") ?? str(row, "created_at") ?? "",
      decidedAt: str(row, "decided_at"),
      decidedByName: embeddedName(row, "users", "") || null,
      history: (eventsByApproval.get(id) ?? []).map((event) => ({
        id: str(event, "id") ?? "",
        decision: (str(event, "decision") ?? "requested") as
          PortalApproval["history"][number]["decision"],
        actorName: embeddedName(event, "users", "Someone"),
        comment: str(event, "comment"),
        createdAt: str(event, "created_at") ?? "",
      })),
    };
  });

  const readIds = new Set(readRows.map((row) => str(row, "message_id")));

  const messages = messageRows.map((row) => {
    const senderId = str(row, "sender_id");
    const nested = row.users as Row | null;
    const senderRole =
      nested && typeof nested === "object"
        ? ((nested as Row).role as "admin" | "client" | undefined) ?? null
        : null;

    return {
      id: str(row, "id") ?? "",
      kind: (str(row, "kind") ?? "message") as "message" | "system",
      body: str(row, "body") ?? "",
      senderName: senderId ? embeddedName(row, "users", "Someone") : null,
      senderRole,
      isMine: senderId === session.profile.id,
      fileId: str(row, "file_id"),
      createdAt: str(row, "created_at") ?? "",
      read: readIds.has(str(row, "id")),
    };
  });

  const files = fileRows.map((row) => {
    const category = str(row, "category") ?? "other";
    return {
      id: str(row, "id") ?? "",
      filename: str(row, "filename") ?? "file",
      category,
      categoryLabel: fileCategoryLabel(category),
      size: num(row, "size") ?? 0,
      version: str(row, "version"),
      uploadedByName: embeddedName(row, "users", "Someone"),
      createdAt: str(row, "created_at") ?? "",
    };
  });

  const fileRequests = fileRequestRows.map((row) => ({
    id: str(row, "id") ?? "",
    label: str(row, "label") ?? "",
    detail: str(row, "detail"),
    category: str(row, "category") ?? "other",
    status: (str(row, "status") ?? "waiting") as
      PortalView["fileRequests"][number]["status"],
    receivedAt: str(row, "received_at"),
  }));

  const invoices = invoiceRows.map((row) => ({
    id: str(row, "id") ?? "",
    kind: (str(row, "kind") ?? "other") as PortalView["invoices"][number]["kind"],
    amount: num(row, "amount") ?? 0,
    currency: str(row, "currency") ?? "usd",
    status: (str(row, "status") ?? "draft") as
      PortalView["invoices"][number]["status"],
    hostedUrl: str(row, "stripe_hosted_url"),
    issuedAt: str(row, "issued_at"),
    dueAt: str(row, "due_at"),
    paidAt: str(row, "paid_at"),
  }));

  // Care invoices bill maintenance, not the build. Mixing them into the project
  // balance would tell a client they owe money on a project they have paid off.
  const projectInvoices = invoices.filter((invoice) => invoice.kind !== "care");

  const attention = buildAttention({
    approvals,
    fileRequests,
    invoices: projectInvoices,
    messages,
  });

  const configuredHandoff = new Map(
    portalConfig.handoffChecklist.map((item) => [item.key, item]),
  );

  const tourRow = tourRows[0];

  return {
    isDemo: false,
    viewer: {
      id: session.profile.id,
      name: session.profile.name,
      email: session.profile.email,
      role: session.profile.role,
    },
    project: {
      id: projectId,
      name: str(projectRow, "name") ?? "Project",
      slug: str(projectRow, "slug") ?? "",
      status: (str(projectRow, "status") ?? "active") as PortalView["project"]["status"],
      phase: str(projectRow, "phase"),
      summary: str(projectRow, "summary"),
      scopeSummary: str(projectRow, "scope_summary"),
      currentFocus: str(projectRow, "current_focus"),
      nextAction: str(projectRow, "next_action"),
      nextActionDue: str(projectRow, "next_action_due"),
      nextMilestone: str(projectRow, "next_milestone"),
      nextMilestoneAt: str(projectRow, "next_milestone_at"),
      agreedTotal: num(projectRow, "agreed_total"),
      startedAt: str(projectRow, "started_at"),
      launchedAt: str(projectRow, "launched_at"),
      finalPaymentClearedAt: str(projectRow, "final_payment_cleared_at"),
      ownershipTransferredAt: str(projectRow, "ownership_transferred_at"),
      clientName: embeddedName(projectRow, "clients", "") ||
        ((projectRow.clients as Row | null)?.business_name as string) ||
        "",
    },
    phases: buildPhases(str(projectRow, "phase"), phaseRows),
    files,
    fileRequests,
    approvals,
    messages,
    decisions: decisionRows.map((row) => ({
      id: str(row, "id") ?? "",
      topic: str(row, "topic") ?? "",
      decision: str(row, "decision") ?? "",
      detail: str(row, "detail"),
      decidedOn: str(row, "decided_on") ?? "",
    })),
    activity: activityRows.map((row) => ({
      id: str(row, "id") ?? "",
      kind: str(row, "kind") ?? "",
      summary: str(row, "summary") ?? "",
      actorName: embeddedName(row, "users", "") || null,
      createdAt: str(row, "created_at") ?? "",
    })),
    invoices: projectInvoices,
    carePlan: carePlanRows[0]
      ? {
          status: (str(carePlanRows[0], "status") ??
            "inactive") as PortalCarePlan["status"],
          startedAt: str(carePlanRows[0], "started_at"),
          currentPeriodEnd: str(carePlanRows[0], "current_period_end"),
          cancelAtPeriodEnd: carePlanRows[0].cancel_at_period_end === true,
        }
      : null,
    handoff: handoffRows.map((row) => {
      const key = str(row, "item_key") ?? "";
      return {
        id: str(row, "id") ?? "",
        key,
        label: str(row, "label") ?? configuredHandoff.get(key)?.label ?? key,
        blurb: configuredHandoff.get(key)?.blurb ?? "",
        status: (str(row, "status") ?? "not_ready") as
          PortalView["handoff"][number]["status"],
        note: str(row, "note"),
        transferredAt: str(row, "transferred_at"),
      };
    }),
    timeEntries: timeRows.map((row) => ({
      id: str(row, "id") ?? "",
      entryDate: str(row, "entry_date") ?? "",
      phaseKey: str(row, "phase_key"),
      description: str(row, "description") ?? "",
      hours: num(row, "hours") ?? 0,
    })),
    attention,
    tour: {
      completedAt: tourRow ? str(tourRow, "completed_at") : null,
      dismissedAt: tourRow ? str(tourRow, "dismissed_at") : null,
      tourVersion: tourRow ? (num(tourRow, "tour_version") ?? 1) : 1,
      lastStep: tourRow ? (num(tourRow, "last_step") ?? 0) : 0,
      replayCount: tourRow ? (num(tourRow, "replay_count") ?? 0) : 0,
    },
  };
}
