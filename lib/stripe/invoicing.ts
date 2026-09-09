/**
 * Stripe Invoicing for project work.
 *
 * Invoicing, not Checkout. A build has an agreed scope and a negotiated total,
 * so it gets an invoice the client can pay on their own terms — not a
 * fixed-price product in a shopping cart. Do not convert this to Checkout.
 *
 * THE AMOUNT RULE: every figure sent to Stripe is derived from
 * `projects.agreed_total`, read from the database on the server, inside this
 * module. No caller passes an amount, and no route accepts one from a request
 * body. If you find yourself adding an `amount` parameter here, something has
 * gone wrong upstream.
 *
 * Money split: 50% deposit to start, 50% on approval before handoff. The final
 * invoice being paid is what releases ownership transfer, and that rule is
 * enforced by a database trigger, not here.
 *
 * Care plans are separate monthly subscriptions and are deliberately never
 * mixed into a project invoice.
 */

import { adminRest, eq } from "@/lib/supabase/rest";
import { fromCents, splitTotal } from "./money";
import {
  type StripeInvoice,
  type StripeSubscription,
  stripeRequest,
} from "./client";

export type InvoiceKind = "deposit" | "final" | "care" | "other";

/** Days a project invoice stays open before it is past due. */
const DEFAULT_NET_DAYS = 14;

type ProjectBillingRow = {
  id: string;
  name: string;
  agreed_total: string | number | null;
  scope_summary: string | null;
  client_id: string;
};

type ClientRow = {
  id: string;
  business_name: string;
  contact_name: string;
  contact_email: string | null;
};

async function findOrCreateCustomer(email: string, name: string) {
  const existing = await stripeRequest<{ data: { id: string }[] }>("/customers", {
    method: "GET",
    body: { email, limit: 1 },
  });

  if (existing.data[0]) return existing.data[0].id;

  const created = await stripeRequest<{ id: string }>("/customers", {
    body: { email, name },
    idempotencyKey: `customer:${email}`,
  });

  return created.id;
}

/**
 * Loads the billing facts for a project from the database.
 *
 * This is the function that makes the amount rule true. It reads the agreed
 * total and the billing contact from trusted rows; nothing it returns came from
 * a browser.
 */
async function loadProjectBilling(projectId: string) {
  const projects = await adminRest<ProjectBillingRow[]>(
    `projects?id=eq.${eq(projectId)}&select=id,name,agreed_total,scope_summary,client_id&limit=1`,
  );
  const project = projects[0];
  if (!project) throw new Error("Project not found.");

  const total = Number(project.agreed_total ?? 0);
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error(
      "This project has no agreed total. Set it on the project before invoicing.",
    );
  }

  const clients = await adminRest<ClientRow[]>(
    `clients?id=eq.${eq(project.client_id)}&select=id,business_name,contact_name,contact_email&limit=1`,
  );
  const client = clients[0];
  if (!client) throw new Error("Client not found.");

  // The billing address falls back to the project owner's login, so a client
  // record without an explicit contact_email still invoices correctly.
  let email = client.contact_email?.trim() ?? "";
  if (!email) {
    const owners = await adminRest<{ users: { email: string } | null }[]>(
      `project_members?project_id=eq.${eq(projectId)}&member_role=eq.owner&select=users(email)&limit=1`,
    );
    email = owners[0]?.users?.email ?? "";
  }

  if (!email) {
    throw new Error(
      "No billing email for this client. Add a contact email or invite the project owner first.",
    );
  }

  return { project, client, total, email };
}

export type IssueInvoiceResult = {
  stripeInvoiceId: string;
  hostedUrl: string | null;
  amount: number;
  kind: "deposit" | "final";
};

/**
 * Raises one half of a project invoice and sends it.
 *
 * Idempotent three times over: Stripe's own idempotency key stops a retry
 * raising a second invoice, a unique index on (project_id, kind) stops a second
 * deposit or final ever being recorded, and an existing row carrying a
 * stripe_invoice_id short-circuits before anything is called.
 */
export async function issueProjectInvoice(
  projectId: string,
  kind: "deposit" | "final",
): Promise<IssueInvoiceResult> {
  const { project, client, total, email } = await loadProjectBilling(projectId);

  const { depositCents, finalCents } = splitTotal(total);
  const amountCents = kind === "deposit" ? depositCents : finalCents;

  const existing = await adminRest<{ id: string; stripe_invoice_id: string | null }[]>(
    `invoices?project_id=eq.${eq(projectId)}&kind=eq.${kind}&select=id,stripe_invoice_id&limit=1`,
  );

  if (existing[0]?.stripe_invoice_id) {
    throw new Error(`A ${kind} invoice already exists for this project.`);
  }

  const customerId = await findOrCreateCustomer(email, client.business_name);

  const half = kind === "deposit" ? "50% deposit" : "50% final payment";
  const description = `${project.name} — ${half}. ${project.scope_summary ?? ""}`
    .trim()
    .slice(0, 500);

  // Draft first so the line item can be attached, then finalise and send.
  const invoice = await stripeRequest<StripeInvoice>("/invoices", {
    body: {
      customer: customerId,
      collection_method: "send_invoice",
      days_until_due: DEFAULT_NET_DAYS,
      auto_advance: false,
      description,
      metadata: { project_id: projectId, invoice_kind: kind },
    },
    idempotencyKey: `invoice:${projectId}:${kind}`,
  });

  await stripeRequest("/invoiceitems", {
    body: {
      customer: customerId,
      invoice: invoice.id,
      currency: "usd",
      amount: amountCents,
      description,
    },
    idempotencyKey: `invoiceitem:${projectId}:${kind}`,
  });

  const finalized = await stripeRequest<StripeInvoice>(
    `/invoices/${invoice.id}/finalize`,
    { idempotencyKey: `finalize:${projectId}:${kind}` },
  );

  const sent = await stripeRequest<StripeInvoice>(`/invoices/${finalized.id}/send`, {
    idempotencyKey: `send:${projectId}:${kind}`,
  });

  const dueAt = new Date(
    Date.now() + DEFAULT_NET_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const row = {
    project_id: projectId,
    kind,
    amount: fromCents(amountCents).toFixed(2),
    status: "open",
    stripe_invoice_id: sent.id,
    stripe_customer_id: customerId,
    stripe_hosted_url: sent.hosted_invoice_url,
    issued_at: new Date().toISOString(),
    due_at: dueAt,
  };

  if (existing[0]) {
    await adminRest(`invoices?id=eq.${eq(existing[0].id)}`, {
      method: "PATCH",
      body: JSON.stringify(row),
    });
  } else {
    await adminRest("invoices", { method: "POST", body: JSON.stringify(row) });
  }

  return {
    stripeInvoiceId: sent.id,
    hostedUrl: sent.hosted_invoice_url,
    amount: fromCents(amountCents),
    kind,
  };
}

/**
 * Starts a monthly care-plan subscription.
 *
 * Deliberately separate from project invoices: a client can cancel care without
 * touching anything owed on the build, and cancelling the build does not
 * silently cancel their maintenance. Care status must never be consulted when
 * deciding whether the build is paid.
 */
export async function startCarePlan(projectId: string, priceIdInput?: string) {
  const priceId = priceIdInput?.trim() || process.env.STRIPE_CARE_PRICE_ID?.trim();
  if (!priceId) {
    throw new Error(
      "No care plan price id. Pass one, or set STRIPE_CARE_PRICE_ID.",
    );
  }

  const { client, email } = await loadProjectBilling(projectId);
  const customerId = await findOrCreateCustomer(email, client.business_name);

  const subscription = await stripeRequest<StripeSubscription>("/subscriptions", {
    body: {
      customer: customerId,
      items: [{ price: priceId }],
      collection_method: "send_invoice",
      days_until_due: DEFAULT_NET_DAYS,
      metadata: { project_id: projectId },
    },
    idempotencyKey: `care:${projectId}`,
  });

  await adminRest("care_plans", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      project_id: projectId,
      status: subscription.status === "active" ? "active" : "inactive",
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customerId,
      started_at: new Date().toISOString(),
      current_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
    }),
  });

  return { subscriptionId: subscription.id, status: subscription.status };
}

/**
 * Cancels at the end of the paid period rather than immediately: they have paid
 * for this month, so they keep this month. The local status becomes
 * `cancelling` until Stripe confirms the period actually ended.
 */
export async function cancelCarePlan(projectId: string) {
  const rows = await adminRest<{ stripe_subscription_id: string | null }[]>(
    `care_plans?project_id=eq.${eq(projectId)}&select=stripe_subscription_id&limit=1`,
  );

  const subscriptionId = rows[0]?.stripe_subscription_id;
  if (!subscriptionId) throw new Error("No care plan on this project.");

  await stripeRequest<StripeSubscription>(`/subscriptions/${subscriptionId}`, {
    body: { cancel_at_period_end: true },
  });

  await adminRest(`care_plans?project_id=eq.${eq(projectId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "cancelling",
      cancel_at_period_end: true,
      cancelled_at: new Date().toISOString(),
    }),
  });

  return { subscriptionId, cancelAtPeriodEnd: true };
}
