import assert from "node:assert/strict";
import test from "node:test";

import {
  expectedKeyPrefix,
  requireStripeKey,
  StripeModeMismatchError,
  StripeNotConfiguredError,
  toFormBody,
} from "../lib/stripe/client.ts";

function withEnv(
  values: Record<string, string | undefined>,
  run: () => void,
) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("test mode requires an sk_test key", () => {
  withEnv({ STRIPE_MODE: "test", STRIPE_SECRET_KEY: "sk_test_example" }, () => {
    assert.equal(expectedKeyPrefix(), "sk_test_");
    assert.equal(requireStripeKey(), "sk_test_example");
  });
});

test("live mode requires an sk_live key", () => {
  withEnv({ STRIPE_MODE: "live", STRIPE_SECRET_KEY: "sk_live_example" }, () => {
    assert.equal(expectedKeyPrefix(), "sk_live_");
    assert.equal(requireStripeKey(), "sk_live_example");
  });
});

test("a live key in test mode fails loudly", () => {
  withEnv({ STRIPE_MODE: "test", STRIPE_SECRET_KEY: "sk_live_example" }, () => {
    assert.throws(() => requireStripeKey(), StripeModeMismatchError);
  });
});

test("a test key in live mode fails loudly", () => {
  withEnv({ STRIPE_MODE: "live", STRIPE_SECRET_KEY: "sk_test_example" }, () => {
    assert.throws(() => requireStripeKey(), StripeModeMismatchError);
  });
});

test("restricted and publishable keys are refused", () => {
  for (const key of ["rk_test_example", "pk_test_example"]) {
    withEnv({ STRIPE_MODE: "test", STRIPE_SECRET_KEY: key }, () => {
      assert.throws(() => requireStripeKey(), StripeModeMismatchError);
    });
  }
});

test("missing Stripe key is a distinct configuration error", () => {
  withEnv({ STRIPE_MODE: "test", STRIPE_SECRET_KEY: undefined }, () => {
    assert.throws(() => requireStripeKey(), StripeNotConfiguredError);
  });
});

test("form encoder emits Stripe bracket notation", () => {
  const encoded = toFormBody({
    customer: "cus_123",
    metadata: { project_id: "project-1", invoice_kind: "deposit" },
    items: [{ price: "price_123" }],
    enabled: true,
    omitted: null,
  });

  assert.equal(encoded.get("customer"), "cus_123");
  assert.equal(encoded.get("metadata[project_id]"), "project-1");
  assert.equal(encoded.get("metadata[invoice_kind]"), "deposit");
  assert.equal(encoded.get("items[0][price]"), "price_123");
  assert.equal(encoded.get("enabled"), "true");
  assert.equal(encoded.has("omitted"), false);
});
