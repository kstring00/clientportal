/**
 * Stripe webhook signature verification.
 *
 * Extracted from the route so it can be tested directly, without a running
 * server. It is the only thing standing between a public URL and the code that
 * marks invoices paid and opens the handoff gate.
 *
 * Three properties, all of which have their own test:
 *
 *   1. The HMAC is computed over `${timestamp}.${rawBody}` — the RAW bytes.
 *      Re-serialising the parsed JSON changes the bytes and breaks the match,
 *      which is why the route reads `request.text()` and never `request.json()`.
 *
 *   2. Comparison is timing-safe. A byte-by-byte early exit leaks how much of a
 *      guessed signature was right.
 *
 *   3. Signatures older than the tolerance are rejected, so a valid signature
 *      captured from an earlier delivery cannot be replayed indefinitely.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

function safeEqualHex(left: string, right: string) {
  try {
    const a = Buffer.from(left, "hex");
    const b = Buffer.from(right, "hex");
    // timingSafeEqual throws on a length mismatch, so the length is compared
    // first — that comparison leaks only the length, which is fixed for sha256.
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifyStripeSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
) {
  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestampPart = parts.find((part) => part.startsWith("t="));
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  if (!timestampPart || signatures.length === 0) return false;

  const timestamp = Number(timestampPart.slice(2));
  if (!Number.isFinite(timestamp)) return false;

  // Absolute difference, so a timestamp from the future is rejected too.
  const age = Math.abs(nowSeconds - timestamp);
  if (age > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");

  // Stripe may send several v1 signatures during a secret rotation.
  return signatures.some((signature) => safeEqualHex(expected, signature));
}
