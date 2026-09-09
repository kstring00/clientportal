import assert from "node:assert/strict";
import test from "node:test";

import { portalConfig, validateConfig } from "../lib/config/index.ts";

test("shipped portal config validates cleanly", () => {
  assert.deepEqual(validateConfig(), []);
});

test("phase, category and handoff keys are unique", () => {
  const phaseKeys = portalConfig.phases.map((item) => item.key);
  const categoryKeys = portalConfig.fileCategories.map((item) => item.key);
  const handoffKeys = portalConfig.handoffChecklist.map((item) => item.key);

  assert.equal(new Set(phaseKeys).size, phaseKeys.length);
  assert.equal(new Set(categoryKeys).size, categoryKeys.length);
  assert.equal(new Set(handoffKeys).size, handoffKeys.length);
});

test("a configured logo always has alt text", () => {
  if (portalConfig.brand.logo) {
    assert.ok(portalConfig.brand.logoAlt?.trim());
  }
});
