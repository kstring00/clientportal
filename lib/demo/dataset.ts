/**
 * Demo data — a portal you can show a prospect without touching a real client.
 *
 * This module is the ONLY place demo content exists. Components never branch on
 * demo mode; they receive a `PortalView` and render it. The loader chooses which
 * view to build, so a demo cannot leak into a real client's screen and a real
 * client's data cannot leak into a demo.
 *
 * Everything here is obviously invented. Cedar Path Behavioral is not a real
 * practice, the invoice ids are not Stripe ids, and the hosted-invoice links go
 * nowhere. Keep it that way: if a screenshot of this ever escapes, it should be
 * impossible to mistake for somebody's actual project.
 */

import { portalConfig } from "@/lib/config";
import { buildAttention } from "@/lib/portal/attention";
import type {
  PortalApproval,
  PortalPhase,
  PortalView,
} from "@/lib/portal/types";

/** Dates are relative so the demo never looks stale. */
function daysAgo(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString();
}
function daysAhead(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString();
}
function dateOnly(iso: string) {
  return iso.slice(0, 10);
}

const DEMO_PHASE = "build";

function demoPhases(): PortalPhase[] {
  const currentIndex = portalConfig.phases.findIndex((p) => p.key === DEMO_PHASE);

  return portalConfig.phases.map((phase, index) => {
    const status =
      index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";

    const notes: Record<string, string> = {
      discovery: "Two calls, a content audit, and a written brief you signed off on.",
      design: "Homepage and interior templates, approved 12 September.",
      build: "Building the approved design as a working site, page by page.",
      review: "Your read-through, then revisions.",
      launch: "Going live, then moving the accounts across to you.",
    };

    return {
      key: phase.key,
      ordinal: phase.ordinal,
      label: phase.label,
      blurb: phase.blurb,
      status,
      note: notes[phase.key] ?? null,
      startedAt: index <= currentIndex ? daysAgo(40 - index * 9) : null,
      completedAt: index < currentIndex ? daysAgo(36 - index * 9) : null,
    };
  });
}

const demoApprovals: PortalApproval[] = [
  {
    id: "demo-approval-1",
    title: "Homepage design",
    detail:
      "The full homepage at desktop and mobile width. Look at the order of the sections and the wording of the opening paragraph.",
    previewUrl: "https://example.com/preview/cedar-path-homepage",
    fileId: null,
    status: "approved",
    requestedAt: daysAgo(21),
    decidedAt: daysAgo(18),
    decidedByName: "Dana Whitfield",
    history: [
      {
        id: "demo-ae-1",
        decision: "requested",
        actorName: "Studio",
        comment: null,
        createdAt: daysAgo(21),
      },
      {
        id: "demo-ae-2",
        decision: "changes_requested",
        actorName: "Dana Whitfield",
        comment: "Can we shorten the headline? It wraps to three lines on my phone.",
        createdAt: daysAgo(20),
      },
      {
        id: "demo-ae-3",
        decision: "approved",
        actorName: "Dana Whitfield",
        comment: "That reads much better. Happy to move ahead.",
        createdAt: daysAgo(18),
      },
    ],
  },
  {
    id: "demo-approval-2",
    title: "Website copy — services pages",
    detail:
      "Four service pages. Check the clinical language especially; I would rather be corrected now than after launch.",
    previewUrl: null,
    fileId: "demo-file-2",
    status: "waiting",
    requestedAt: daysAgo(3),
    decidedAt: null,
    decidedByName: null,
    history: [
      {
        id: "demo-ae-4",
        decision: "requested",
        actorName: "Studio",
        comment: null,
        createdAt: daysAgo(3),
      },
    ],
  },
];

export function buildDemoView(): PortalView {
  const files = [
    {
      id: "demo-file-1",
      filename: "cedar-path-logo.svg",
      category: "brand",
      categoryLabel: "Brand",
      size: 24_518,
      version: null,
      uploadedByName: "Dana Whitfield",
      createdAt: daysAgo(34),
    },
    {
      id: "demo-file-2",
      filename: "services-copy-v3.docx",
      category: "content",
      categoryLabel: "Content",
      size: 48_902,
      version: "v3",
      uploadedByName: "Studio",
      createdAt: daysAgo(3),
    },
    {
      id: "demo-file-3",
      filename: "homepage-design-approved.pdf",
      category: "design",
      categoryLabel: "Design",
      size: 2_204_118,
      version: "v2",
      uploadedByName: "Studio",
      createdAt: daysAgo(18),
    },
    {
      id: "demo-file-4",
      filename: "brand-guidelines.pdf",
      category: "brand",
      categoryLabel: "Brand",
      size: 1_102_400,
      version: null,
      uploadedByName: "Dana Whitfield",
      createdAt: daysAgo(33),
    },
  ];

  const fileRequests = [
    {
      id: "demo-req-1",
      label: "Logo — SVG",
      detail: "Vector, so it stays sharp at any size.",
      category: "brand",
      status: "accepted" as const,
      receivedAt: daysAgo(34),
    },
    {
      id: "demo-req-2",
      label: "Staff photographs",
      detail: "Headshots for the six clinicians on the team page.",
      category: "images",
      status: "waiting" as const,
      receivedAt: null,
    },
    {
      id: "demo-req-3",
      label: "Privacy policy",
      detail: "Your current version, or confirmation you would like one drafted.",
      category: "legal",
      status: "waiting" as const,
      receivedAt: null,
    },
  ];

  const invoices = [
    {
      id: "demo-invoice-1",
      kind: "deposit" as const,
      amount: 3200,
      currency: "usd",
      status: "paid" as const,
      hostedUrl: null,
      issuedAt: daysAgo(41),
      dueAt: daysAgo(27),
      paidAt: daysAgo(38),
    },
    {
      id: "demo-invoice-2",
      kind: "final" as const,
      amount: 3200,
      currency: "usd",
      status: "draft" as const,
      hostedUrl: null,
      issuedAt: null,
      dueAt: null,
      paidAt: null,
    },
  ];

  const messages = [
    {
      id: "demo-msg-1",
      kind: "message" as const,
      body: "Deposit received — thank you. Starting on discovery this week.",
      senderName: "Studio",
      senderRole: "admin" as const,
      isMine: false,
      fileId: null,
      createdAt: daysAgo(38),
      read: true,
    },
    {
      id: "demo-msg-2",
      kind: "system" as const,
      body: "Homepage design approval requested.",
      senderName: null,
      senderRole: null,
      isMine: false,
      fileId: null,
      createdAt: daysAgo(21),
      read: true,
    },
    {
      id: "demo-msg-3",
      kind: "message" as const,
      body: "Can we make the headline slightly shorter? It wraps to three lines on my phone.",
      senderName: "Dana Whitfield",
      senderRole: "client" as const,
      isMine: true,
      fileId: null,
      createdAt: daysAgo(20),
      read: true,
    },
    {
      id: "demo-msg-4",
      kind: "message" as const,
      body: "Shortened and re-uploaded. Have a look when you get a moment.",
      senderName: "Studio",
      senderRole: "admin" as const,
      isMine: false,
      fileId: "demo-file-3",
      createdAt: daysAgo(19),
      read: true,
    },
    {
      id: "demo-msg-5",
      kind: "message" as const,
      body: "Services copy is ready for your read-through. No rush — end of the week is fine.",
      senderName: "Studio",
      senderRole: "admin" as const,
      isMine: false,
      fileId: "demo-file-2",
      createdAt: daysAgo(3),
      read: false,
    },
  ];

  const attention = buildAttention({
    approvals: demoApprovals,
    fileRequests,
    invoices,
    messages,
  });

  return {
    isDemo: true,
    viewer: {
      id: "demo-user",
      name: "Dana Whitfield",
      email: "dana@cedarpath.example",
      role: "client",
    },
    project: {
      id: "demo-project",
      name: "Website Redesign",
      slug: "cedar-path-website-redesign",
      status: "active",
      phase: DEMO_PHASE,
      summary:
        "A new site for Cedar Path Behavioral: clearer service pages, a team page that introduces the clinicians, and a referral form that reaches the front desk.",
      scopeSummary:
        "Eight pages, a referral form, and a team directory. Content written from your existing material with two rounds of revisions. Launch on your current domain.",
      currentFocus:
        "Building the approved homepage and starting on the four service pages.",
      nextAction: "Review the services copy",
      nextActionDue: dateOnly(daysAhead(4)),
      nextMilestone: "First full draft of the site to review",
      nextMilestoneAt: dateOnly(daysAhead(11)),
      agreedTotal: 6400,
      startedAt: daysAgo(38),
      launchedAt: null,
      finalPaymentClearedAt: null,
      ownershipTransferredAt: null,
      clientName: "Cedar Path Behavioral",
    },
    phases: demoPhases(),
    files,
    fileRequests,
    approvals: demoApprovals,
    messages,
    decisions: [
      {
        id: "demo-dec-1",
        topic: "Homepage direction",
        decision: "Option B",
        detail: "The version leading with the referral path rather than the practice history.",
        decidedOn: dateOnly(daysAgo(18)),
      },
      {
        id: "demo-dec-2",
        topic: "Photography",
        decision: "Use existing photography for launch",
        detail: "New headshots to be swapped in after launch, once scheduling allows.",
        decidedOn: dateOnly(daysAgo(15)),
      },
      {
        id: "demo-dec-3",
        topic: "Referral form",
        decision: "Email only, no portal integration",
        detail: "Submissions go to the front desk inbox. Revisit after the first quarter.",
        decidedOn: dateOnly(daysAgo(9)),
      },
    ],
    activity: [
      {
        id: "demo-act-1",
        kind: "approval_requested",
        summary: "Services copy sent for approval",
        actorName: "Studio",
        createdAt: daysAgo(3),
      },
      {
        id: "demo-act-2",
        kind: "file_added",
        summary: "services-copy-v3.docx added",
        actorName: "Studio",
        createdAt: daysAgo(3),
      },
      {
        id: "demo-act-3",
        kind: "decision_recorded",
        summary: "Decision recorded: Referral form — email only",
        actorName: "Studio",
        createdAt: daysAgo(9),
      },
      {
        id: "demo-act-4",
        kind: "phase_changed",
        summary: "Project moved into Build",
        actorName: "Studio",
        createdAt: daysAgo(13),
      },
      {
        id: "demo-act-5",
        kind: "approval_decided",
        summary: "Homepage design approved by Dana Whitfield",
        actorName: "Dana Whitfield",
        createdAt: daysAgo(18),
      },
      {
        id: "demo-act-6",
        kind: "invoice_paid",
        summary: "Deposit received. Work is underway.",
        actorName: null,
        createdAt: daysAgo(38),
      },
    ],
    invoices,
    carePlan: null,
    handoff: portalConfig.handoffChecklist.map((item, index) => ({
      id: `demo-handoff-${item.key}`,
      key: item.key,
      label: item.label,
      blurb: item.blurb,
      // Nothing is transferred: the demo sits before final payment on purpose,
      // so the payment gate is what a prospect sees.
      status: index < 2 ? ("ready" as const) : ("not_ready" as const),
      note: null,
      transferredAt: null,
    })),
    timeEntries: [],
    attention,
    tour: {
      completedAt: null,
      dismissedAt: null,
      tourVersion: 1,
      lastStep: 0,
      replayCount: 0,
    },
  };
}
