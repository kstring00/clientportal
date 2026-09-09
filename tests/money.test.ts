import assert from "node:assert/strict";
import test from "node:test";

import { splitTotal, toCents } from "../lib/stripe/money.ts";

test("deposit and final always sum to the agreed total", () => {
  for (const total of [0, 0.01, 1, 19.99, 2500, 2500.01, 99999.99]) {
    const { depositCents, finalCents } = splitTotal(total);
    assert.equal(depositCents + finalCents, toCents(total));
  }
});

test("odd cents go to the deposit, never the final", () => {
  const { depositCents, finalCents } = splitTotal(2500.01);
  assert.equal(depositCents, 125001);
  assert.equal(finalCents, 125000);
  assert.ok(depositCents - finalCents <= 1);
});

test("even totals split evenly", () => {
  assert.deepEqual(splitTotal(2000), {
    depositCents: 100000,
    finalCents: 100000,
  });
});
