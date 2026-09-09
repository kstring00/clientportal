/**
 * Stripe webhook.
 *
 * The order of operations here is the whole design, and it is not arbitrary:
 *
 *   1. Reject without a configured secret (503) — an unverifiable endpoint must
 *      not pretend to work.
 *   2. Read the RAW body. Not `.json()`: re-serialising changes the bytes and
 *      the HMAC no longer matches.
 *   3. Verify the signature, including the replay window.
 *   4. Claim the event id BEFORE any state change.
 *   5. Only then apply the change.
 *
 * Answer codes matter as much as the logic: a 2xx tells Stripe the event is
 * settled and stops redelivery. Anything that did not actually get recorded must
 * therefore be a non-2xx, or the event is lost for good. See lib/stripe/events.ts.
 */

import { NextRequest, NextResponse } from "next/server";

import { verifyStripeSignature } from "@/lib/stripe/signature";
import {
  applyStripeEvent,
  claimEvent,
  closeEvent,
  HANDLED_EVENT_TYPES,
  readString,
  releaseClaim,
  type StripeObject,
} from "@/lib/stripe/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  // Must be the raw body.
  const rawBody = await request.text();
  if (!verifyStripeSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  let event: StripeObject;
  try {
    event = JSON.parse(rawBody) as StripeObject;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const eventId = readString(event, "id");
  const type = readString(event, "type") || "unknown";
  if (!eventId) {
    return NextResponse.json({ error: "Missing event id." }, { status: 400 });
  }

  const data = event.data as { object?: StripeObject } | undefined;
  const object = data?.object ?? {};

  if (!HANDLED_EVENT_TYPES.has(type)) {
    // Still claimed, so the ignore is recorded rather than invisible. An event
    // log with holes in it is hard to reason about during an incident.
    const claim = await claimEvent(eventId, type);
    if (claim === "unavailable") {
      // Nothing was recorded. 500 so Stripe redelivers and the ignore lands.
      return NextResponse.json({ error: "Event store unavailable." }, { status: 500 });
    }
    if (claim === "claimed") {
      await closeEvent(eventId, "ignored", `Unhandled event type ${type}.`);
    }
    return NextResponse.json({ received: true, handled: false });
  }

  // Claim before acting. A duplicate delivery stops here; an unreachable
  // datastore must NOT be reported as one, or the event is lost for good.
  const claim = await claimEvent(eventId, type);
  if (claim === "unavailable") {
    return NextResponse.json({ error: "Event store unavailable." }, { status: 500 });
  }
  if (claim === "duplicate") {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    const detail = await applyStripeEvent(type, object);
    await closeEvent(eventId, "handled", detail);
    return NextResponse.json({ received: true, handled: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown failure.";
    console.error("Stripe webhook handler failed", type, message);
    await closeEvent(eventId, "failed", message);

    // 500 so Stripe retries. The event row is already claimed, so the retry
    // would be dropped as a duplicate — release the claim first.
    await releaseClaim(eventId);

    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }
}
