/**
 * Stripe webhook state changes, and the idempotency claim that guards them.
 *
 * Kept out of the route handler so the branching can be tested directly.
 *
 * ── The claim, and why it returns three values ──────────────────────────────
 *
 * Stripe retries on every non-2xx and can deliver the same event twice even
 * after a success, so the handler must be idempotent. The primary key on
 * stripe_events provides that: claim the event id BEFORE any state change, and a
 * duplicate delivery loses the race and stops.
 *
 * The subtle part is what a FAILED claim means. In the reference implementation
 * the claim's catch treated every failure as "already claimed", and the caller
 * answered 200. A 200 tells Stripe the event is settled and stops redelivery —
 * so for as long as Supabase was unreachable, payments were being DROPPED
 * rather than deferred, silently, while the endpoint looked healthy.
 *
 * So: only a PostgREST 409 (SQLSTATE 23505, unique violation) is a duplicate.
 * Anything else — an outage, a bad key, a thrown config error carrying no status
 * — is `unavailable`, and the route must answer non-2xx so Stripe retries.
 *
 * That distinction is the single most important line of code in this file.
 */

import { adminRest, eq, PortalRestError } from "@/lib/supabase/rest";

export type ClaimResult = "claimed" | "duplicate" | "unavailable";

export type StripeObject = Record<string, unknown>;

export function readString(source: StripeObject, key: string) {
  const value = source[key];
  return typeof value === "string" ? value : "";
}

export function readMetadata(object: StripeObject): Record<string, string> {
  const metadata = object.metadata;
  return metadata && typeof metadata === "object"
    ? (metadata as Record<string, string>)
    : {};
}

/** The event types this portal acts on. Everything else is recorded and ignored. */
export const HANDLED_EVENT_TYPES = new Set([
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "invoice.marked_uncollectible",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

export async function claimEvent(eventId: string, type: string): Promise<ClaimResult> {
  try {
    await adminRest("stripe_events", {
      method: "POST",
      body: JSON.stringify({ event_id: eventId, type }),
    });
    return "claimed";
  } catch (error) {
    if (error instanceof PortalRestError && error.status === 409) return "duplicate";
    console.error("Could not claim Stripe event", eventId, type, error);
    return "unavailable";
  }
}

export async function closeEvent(
  eventId: string,
  status: "handled" | "ignored" | "failed",
  detail?: string,
) {
  try {
    await adminRest(`stripe_events?event_id=eq.${eq(eventId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status,
        handled_at: new Date().toISOString(),
        detail: detail ? detail.slice(0, 500) : null,
      }),
    });
  } catch (error) {
    // Best effort. The claim already exists, which is what protects correctness;
    // failing to annotate it is a reporting loss, not a state loss.
    console.error("Could not close Stripe event", eventId, error);
  }
}

/**
 * Releases a claim so Stripe's retry is not swallowed as a duplicate.
 *
 * Only called when the handler itself threw after claiming. Without this, a
 * transient failure mid-handler would permanently consume the event: the retry
 * would see the claim, call itself a duplicate, and answer 200.
 */
export async function releaseClaim(eventId: string) {
  await adminRest(`stripe_events?event_id=eq.${eq(eventId)}`, {
    method: "DELETE",
  }).catch(() => undefined);
}

async function recordActivity(
  projectId: string,
  kind: "invoice_paid" | "invoice_issued",
  summary: string,
) {
  await adminRest("project_activity", {
    method: "POST",
    body: JSON.stringify({ project_id: projectId, kind, summary }),
  }).catch((error) => {
    // The feed is a convenience; never fail a payment over it.
    console.error("Could not record activity", projectId, error);
  });
}

/**
 * Marks the invoice row paid, and opens the handoff gate on a final payment.
 *
 * Note what this does NOT do: it never sets `ownership_transferred_at`. It sets
 * `final_payment_cleared_at`, which is the precondition the database trigger
 * checks. Transfer remains a separate, deliberate admin action.
 */
export async function applyInvoicePaid(object: StripeObject) {
  const stripeInvoiceId = readString(object, "id");
  if (!stripeInvoiceId) return "No invoice id on event.";

  const paidAt = new Date().toISOString();

  const updated = await adminRest<
    { id: string; project_id: string; kind: string; amount: string }[]
  >(`invoices?stripe_invoice_id=eq.${eq(stripeInvoiceId)}`, {
    method: "PATCH",
    returnRepresentation: true,
    body: JSON.stringify({ status: "paid", paid_at: paidAt }),
  });

  const row = updated?.[0];
  if (!row) return `No invoice row for ${stripeInvoiceId}.`;

  if (row.kind === "final") {
    // This column, and only this column, is what the database trigger consults
    // before permitting an ownership transfer.
    await adminRest(`projects?id=eq.${eq(row.project_id)}`, {
      method: "PATCH",
      body: JSON.stringify({ final_payment_cleared_at: paidAt }),
    });
    await recordActivity(
      row.project_id,
      "invoice_paid",
      "Final payment received. Ownership transfer is now available.",
    );
    return `Final invoice paid; project ${row.project_id} cleared for handoff.`;
  }

  if (row.kind === "deposit") {
    await adminRest(`projects?id=eq.${eq(row.project_id)}`, {
      method: "PATCH",
      body: JSON.stringify({ started_at: paidAt }),
    });
    await recordActivity(row.project_id, "invoice_paid", "Deposit received. Work is underway.");
    return `Deposit paid; project ${row.project_id} started.`;
  }

  // A care invoice is paid maintenance. It must not touch the project's own
  // payment state — care and the build are separate ledgers on purpose.
  await recordActivity(row.project_id, "invoice_paid", "Payment received.");
  return `Invoice ${stripeInvoiceId} marked paid.`;
}

export async function applyInvoiceFailed(object: StripeObject) {
  const stripeInvoiceId = readString(object, "id");
  if (!stripeInvoiceId) return "No invoice id on event.";

  await adminRest(`invoices?stripe_invoice_id=eq.${eq(stripeInvoiceId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "past_due" }),
  });

  return `Invoice ${stripeInvoiceId} marked past due.`;
}

const SUBSCRIPTION_STATUS: Record<string, string> = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  unpaid: "past_due",
  canceled: "cancelled",
  incomplete_expired: "cancelled",
};

export async function applySubscriptionChange(object: StripeObject, type: string) {
  const subscriptionId = readString(object, "id");
  if (!subscriptionId) return "No subscription id on event.";

  const stripeStatus = readString(object, "status");
  const cancelAtPeriodEnd = object.cancel_at_period_end === true;

  let status =
    type === "customer.subscription.deleted"
      ? "cancelled"
      : (SUBSCRIPTION_STATUS[stripeStatus] ?? "inactive");

  // Still active but winding down: the client keeps the month they paid for.
  if (status === "active" && cancelAtPeriodEnd) status = "cancelling";

  const patch: Record<string, unknown> = {
    status,
    cancel_at_period_end: cancelAtPeriodEnd,
  };

  const periodEnd = object.current_period_end;
  if (typeof periodEnd === "number") {
    patch.current_period_end = new Date(periodEnd * 1000).toISOString();
  }

  if (status === "cancelled") patch.cancelled_at = new Date().toISOString();

  const updated = await adminRest<{ id: string }[]>(
    `care_plans?stripe_subscription_id=eq.${eq(subscriptionId)}`,
    {
      method: "PATCH",
      returnRepresentation: true,
      body: JSON.stringify(patch),
    },
  );

  if (!updated?.[0]) {
    const projectId = readMetadata(object).project_id;
    return projectId
      ? `No care plan row for subscription ${subscriptionId} (project ${projectId}).`
      : `No care plan row for subscription ${subscriptionId}.`;
  }

  return `Care plan ${subscriptionId} set to ${status}.`;
}

/** Dispatches a verified, claimed event to its handler. */
export async function applyStripeEvent(type: string, object: StripeObject) {
  switch (type) {
    case "invoice.paid":
    case "invoice.payment_succeeded":
      return applyInvoicePaid(object);
    case "invoice.payment_failed":
    case "invoice.marked_uncollectible":
      return applyInvoiceFailed(object);
    default:
      return applySubscriptionChange(object, type);
  }
}
