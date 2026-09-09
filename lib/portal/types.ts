/**
 * The portal's view model.
 *
 * Every page renders from a `PortalView`. Components take these types as props
 * and never query anything themselves, which is what makes demo mode possible:
 * the demo dataset produces the same shape, so no component knows or cares
 * whether it is showing real data.
 */

export type PhaseStatus = "upcoming" | "current" | "complete";
export type ApprovalStatus = "waiting" | "approved" | "changes_requested";
export type FileRequestStatus = "waiting" | "received" | "accepted" | "not_needed";
export type HandoffStatus = "not_ready" | "ready" | "transferred" | "not_applicable";
export type InvoiceStatus = "draft" | "open" | "paid" | "void" | "past_due";
export type InvoiceKind = "deposit" | "final" | "care" | "other";
export type CarePlanStatus =
  | "inactive"
  | "active"
  | "cancelling"
  | "past_due"
  | "cancelled";

export type PortalPerson = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "client";
};

export type PortalProject = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "paused" | "complete" | "archived";
  phase: string | null;
  summary: string | null;
  scopeSummary: string | null;
  currentFocus: string | null;
  nextAction: string | null;
  nextActionDue: string | null;
  nextMilestone: string | null;
  nextMilestoneAt: string | null;
  agreedTotal: number | null;
  startedAt: string | null;
  launchedAt: string | null;
  finalPaymentClearedAt: string | null;
  ownershipTransferredAt: string | null;
  clientName: string;
};

export type PortalPhase = {
  key: string;
  ordinal: string;
  label: string;
  blurb: string;
  status: PhaseStatus;
  note: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type PortalFile = {
  id: string;
  filename: string;
  category: string;
  categoryLabel: string;
  size: number;
  version: string | null;
  uploadedByName: string;
  createdAt: string;
};

export type PortalFileRequest = {
  id: string;
  label: string;
  detail: string | null;
  category: string;
  status: FileRequestStatus;
  receivedAt: string | null;
};

export type PortalApprovalEvent = {
  id: string;
  decision: "requested" | "approved" | "changes_requested" | "reopened";
  actorName: string;
  comment: string | null;
  createdAt: string;
};

export type PortalApproval = {
  id: string;
  title: string;
  detail: string | null;
  previewUrl: string | null;
  fileId: string | null;
  status: ApprovalStatus;
  requestedAt: string;
  decidedAt: string | null;
  decidedByName: string | null;
  history: PortalApprovalEvent[];
};

export type PortalMessage = {
  id: string;
  kind: "message" | "system";
  body: string;
  senderName: string | null;
  senderRole: "admin" | "client" | null;
  isMine: boolean;
  fileId: string | null;
  createdAt: string;
  read: boolean;
};

export type PortalDecision = {
  id: string;
  topic: string;
  decision: string;
  detail: string | null;
  decidedOn: string;
};

export type PortalActivity = {
  id: string;
  kind: string;
  summary: string;
  actorName: string | null;
  createdAt: string;
};

export type PortalInvoice = {
  id: string;
  kind: InvoiceKind;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  hostedUrl: string | null;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
};

export type PortalCarePlan = {
  status: CarePlanStatus;
  startedAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export type PortalHandoffItem = {
  id: string;
  key: string;
  label: string;
  blurb: string;
  status: HandoffStatus;
  note: string | null;
  transferredAt: string | null;
};

export type PortalTimeEntry = {
  id: string;
  entryDate: string;
  phaseKey: string | null;
  description: string;
  hours: number;
};

/**
 * One thing the client needs to do. The overview and the nav badges are both
 * built from this list, so an item can never appear in one and not the other.
 */
export type AttentionItem = {
  id: string;
  /** Which section it lives in — drives the nav badge. */
  section: "approvals" | "files" | "invoices" | "messages";
  label: string;
  detail: string | null;
  href: string;
  /** `now` sorts above `soon`. Nothing else is ranked. */
  urgency: "now" | "soon";
};

export type PortalTourState = {
  completedAt: string | null;
  dismissedAt: string | null;
  tourVersion: number;
  lastStep: number;
  replayCount: number;
};

export type PortalView = {
  viewer: PortalPerson;
  project: PortalProject;
  phases: PortalPhase[];
  files: PortalFile[];
  fileRequests: PortalFileRequest[];
  approvals: PortalApproval[];
  messages: PortalMessage[];
  decisions: PortalDecision[];
  activity: PortalActivity[];
  invoices: PortalInvoice[];
  carePlan: PortalCarePlan | null;
  handoff: PortalHandoffItem[];
  timeEntries: PortalTimeEntry[];
  attention: AttentionItem[];
  tour: PortalTourState;
  /** True when this view is the demo dataset, so the UI can say so. */
  isDemo: boolean;
};
