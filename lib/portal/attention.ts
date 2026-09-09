/**
 * The attention system.
 *
 * One rule governs this file: something appears here ONLY if the client can act
 * on it right now. Not "the project is in build" (information, not a task); not
 * "an invoice was paid" (already done). A portal that cries for attention over
 * things you cannot do anything about teaches people to ignore it, and then the
 * one item that mattered gets ignored too.
 *
 * The overview panel and the navigation badges are both derived from this single
 * list, so they can never disagree.
 */

import type {
  AttentionItem,
  PortalApproval,
  PortalFileRequest,
  PortalInvoice,
  PortalMessage,
} from "./types";

function daysUntil(iso: string | null) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.ceil((then - Date.now()) / (1000 * 60 * 60 * 24));
}

export function buildAttention(input: {
  approvals: PortalApproval[];
  fileRequests: PortalFileRequest[];
  invoices: PortalInvoice[];
  messages: PortalMessage[];
}): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const approval of input.approvals) {
    if (approval.status !== "waiting") continue;
    items.push({
      id: `approval:${approval.id}`,
      section: "approvals",
      label: approval.title,
      detail: "Waiting for your review",
      href: `/portal/approvals#approval-${approval.id}`,
      urgency: "now",
    });
  }

  for (const request of input.fileRequests) {
    if (request.status !== "waiting") continue;
    items.push({
      id: `file-request:${request.id}`,
      section: "files",
      label: request.label,
      detail: request.detail ?? "Still needed",
      href: `/portal/files#request-${request.id}`,
      urgency: "soon",
    });
  }

  for (const invoice of input.invoices) {
    // A draft invoice has not been sent, so there is nothing to pay yet.
    if (invoice.status !== "open" && invoice.status !== "past_due") continue;

    const days = daysUntil(invoice.dueAt);
    const overdue = invoice.status === "past_due" || (days !== null && days < 0);

    items.push({
      id: `invoice:${invoice.id}`,
      section: "invoices",
      label: overdue ? "Invoice past due" : "Invoice due",
      detail:
        days === null
          ? null
          : overdue
            ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`
            : `Due in ${days} day${days === 1 ? "" : "s"}`,
      href: "/portal/invoices",
      urgency: overdue || (days !== null && days <= 7) ? "now" : "soon",
    });
  }

  // Unread messages from the studio. A client's own message is not a task, and
  // neither is a system note — those are records of things already handled.
  const unread = input.messages.filter(
    (message) => !message.read && !message.isMine && message.kind === "message",
  );
  if (unread.length > 0) {
    items.push({
      id: "messages:unread",
      section: "messages",
      label: `${unread.length} unread message${unread.length === 1 ? "" : "s"}`,
      detail: null,
      href: "/portal/messages",
      urgency: "soon",
    });
  }

  // `now` first, original order preserved within each band.
  return items.sort((a, b) => {
    if (a.urgency === b.urgency) return 0;
    return a.urgency === "now" ? -1 : 1;
  });
}

/** Badge counts per section, for the navigation. */
export function attentionCounts(items: AttentionItem[]) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.section] = (counts[item.section] ?? 0) + 1;
  }
  return counts;
}

/**
 * The single most important sentence on the overview.
 *
 * An explicit `next_action` written by the admin always wins — a human sentence
 * beats anything derived. Only when there isn't one does this fall back to the
 * top attention item, and when there is nothing at all it says so plainly rather
 * than inventing work.
 */
export function resolveNextAction(
  explicit: string | null,
  attention: AttentionItem[],
) {
  if (explicit?.trim()) {
    return { text: explicit.trim(), href: null as string | null, derived: false };
  }

  const first = attention[0];
  if (first) {
    return { text: first.label, href: first.href, derived: true };
  }

  return { text: "No action needed from you.", href: null, derived: true };
}
