export type AdminProjectSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
  phase: string | null;
  clientName: string;
  contactName: string;
  contactEmail: string | null;
  currentFocus: string | null;
  nextAction: string | null;
  agreedTotal: number | null;
  finalPaymentClearedAt: string | null;
  ownershipTransferredAt: string | null;
  createdAt: string;
};

export type AdminProjectDetail = AdminProjectSummary & {
  clientId: string;
  summary: string | null;
  scopeSummary: string | null;
  nextActionDue: string | null;
  nextMilestone: string | null;
  nextMilestoneAt: string | null;
  approvals: Record<string, unknown>[];
  decisions: Record<string, unknown>[];
  fileRequests: Record<string, unknown>[];
  handoff: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  carePlan: Record<string, unknown> | null;
  members: Record<string, unknown>[];
};
