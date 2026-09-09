import "server-only";

import { adminRest } from "@/lib/supabase/rest";
import type { AdminProjectDetail, AdminProjectSummary } from "./types";

type Row = Record<string, unknown>;

function str(row: Row, key: string) {
  return typeof row[key] === "string" ? (row[key] as string) : null;
}

function num(row: Row, key: string) {
  const value = row[key];
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clientFields(row: Row) {
  const client = row.clients && typeof row.clients === "object" && !Array.isArray(row.clients)
    ? (row.clients as Row)
    : {};
  return {
    clientName: str(client, "business_name") ?? "Client",
    contactName: str(client, "contact_name") ?? "",
    contactEmail: str(client, "contact_email"),
  };
}

function summary(row: Row): AdminProjectSummary {
  return {
    id: str(row, "id") ?? "",
    name: str(row, "name") ?? "Project",
    slug: str(row, "slug") ?? "",
    status: str(row, "status") ?? "active",
    phase: str(row, "phase"),
    ...clientFields(row),
    currentFocus: str(row, "current_focus"),
    nextAction: str(row, "next_action"),
    agreedTotal: num(row, "agreed_total"),
    finalPaymentClearedAt: str(row, "final_payment_cleared_at"),
    ownershipTransferredAt: str(row, "ownership_transferred_at"),
    createdAt: str(row, "created_at") ?? "",
  };
}

export async function loadAdminProjects(): Promise<AdminProjectSummary[]> {
  const rows = await adminRest<Row[]>(
    "projects?select=*,clients(business_name,contact_name,contact_email)&order=created_at.desc",
  );
  return rows.map(summary);
}

export async function loadAdminProject(projectId: string): Promise<AdminProjectDetail | null> {
  const rows = await adminRest<Row[]>(
    `projects?id=eq.${encodeURIComponent(projectId)}&select=*,clients(business_name,contact_name,contact_email)&limit=1`,
  );
  const row = rows[0];
  if (!row) return null;

  const [approvals, decisions, fileRequests, handoff, invoices, carePlans, members] =
    await Promise.all([
      adminRest<Row[]>(
        `approvals?project_id=eq.${encodeURIComponent(projectId)}&select=*&order=created_at.desc`,
      ),
      adminRest<Row[]>(
        `project_decisions?project_id=eq.${encodeURIComponent(projectId)}&select=*&order=decided_on.desc,created_at.desc`,
      ),
      adminRest<Row[]>(
        `file_requests?project_id=eq.${encodeURIComponent(projectId)}&select=*&order=position.asc,created_at.asc`,
      ),
      adminRest<Row[]>(
        `handoff_items?project_id=eq.${encodeURIComponent(projectId)}&select=*&order=position.asc`,
      ),
      adminRest<Row[]>(
        `invoices?project_id=eq.${encodeURIComponent(projectId)}&select=*&order=created_at.asc`,
      ),
      adminRest<Row[]>(
        `care_plans?project_id=eq.${encodeURIComponent(projectId)}&select=*&limit=1`,
      ),
      adminRest<Row[]>(
        `project_members?project_id=eq.${encodeURIComponent(projectId)}&select=*,users(name,email,role)&order=created_at.asc`,
      ),
    ]);

  return {
    ...summary(row),
    clientId: str(row, "client_id") ?? "",
    summary: str(row, "summary"),
    scopeSummary: str(row, "scope_summary"),
    nextActionDue: str(row, "next_action_due"),
    nextMilestone: str(row, "next_milestone"),
    nextMilestoneAt: str(row, "next_milestone_at"),
    approvals,
    decisions,
    fileRequests,
    handoff,
    invoices,
    carePlan: carePlans[0] ?? null,
    members,
  };
}
