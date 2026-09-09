import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  SIGNATURE_TOLERANCE_SECONDS,
  verifyStripeSignature,
} from "../lib/stripe/signature.ts";

function header(payload: string, timestamp: number, secret: string, extra: string[] = []) {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");
  return [`t=${timestamp}`, ...extra.map((value) => `v1=${value}`), `v1=${signature}`].join(",");
}

const payload = JSON.stringify({ id: "evt_123", type: "invoice.paid" });
const secret = "whsec_test";
const now = 1_800_000_000;

test("valid signature is accepted", () => {
  assert.equal(verifyStripeSignature(payload, header(payload, now, secret), secret, now), true);
});

test("tampered payload is rejected", () => {
  const signature = header(payload, now, secret);
  assert.equal(verifyStripeSignature(`${payload} `, signature, secret, now), false);
});

test("wrong webhook secret is rejected", () => {
  assert.equal(
    verifyStripeSignature(payload, header(payload, now, secret), "whsec_wrong", now),
    false,
  );
});

test("stale timestamp is rejected", () => {
  const timestamp = now - SIGNATURE_TOLERANCE_SECONDS - 1;
  assert.equal(verifyStripeSignature(payload, header(payload, timestamp, secret), secret, now), false);
});

test("future timestamp outside tolerance is rejected", () => {
  const timestamp = now + SIGNATURE_TOLERANCE_SECONDS + 1;
  assert.equal(verifyStripeSignature(payload, header(payload, timestamp, secret), secret, now), false);
});

test("one valid v1 among several signatures is enough", () => {
  const signature = header(payload, now, secret, ["0".repeat(64), "f".repeat(64)]);
  assert.equal(verifyStripeSignature(payload, signature, secret, now), true);
});

test("missing timestamp or v1 signature is rejected", () => {
  assert.equal(verifyStripeSignature(payload, "v1=abc", secret, now), false);
  assert.equal(verifyStripeSignature(payload, `t=${now}`, secret, now), false);
});
