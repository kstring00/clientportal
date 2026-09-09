import assert from "node:assert/strict";
import test from "node:test";

import {
  shouldAutoOpen,
  TOUR_VERSION,
  tourSteps,
} from "../lib/portal/tour.ts";
import type { PortalTourState } from "../lib/portal/types.ts";

function state(overrides: Partial<PortalTourState> = {}): PortalTourState {
  return {
    completedAt: null,
    dismissedAt: null,
    tourVersion: TOUR_VERSION,
    lastStep: 0,
    replayCount: 0,
    ...overrides,
  };
}

test("walkthrough auto-opens on first visit", () => {
  assert.equal(shouldAutoOpen(state()), true);
});

test("walkthrough does not auto-open after dismiss", () => {
  assert.equal(shouldAutoOpen(state({ dismissedAt: "2026-09-08T00:00:00Z" })), false);
});

test("walkthrough does not auto-open after completion", () => {
  assert.equal(shouldAutoOpen(state({ completedAt: "2026-09-08T00:00:00Z" })), false);
});

test("version bump offers walkthrough again", () => {
  assert.equal(
    shouldAutoOpen(
      state({
        tourVersion: TOUR_VERSION,
        completedAt: "2026-09-08T00:00:00Z",
      }),
      TOUR_VERSION + 1,
    ),
    true,
  );
});

test("steps for disabled sections are omitted", () => {
  const steps = tourSteps(["overview", "project", "help"]);
  const sections = steps.map((step) => step.section).filter(Boolean);

  assert.ok(sections.includes("overview"));
  assert.ok(sections.includes("project"));
  assert.ok(sections.includes("help"));
  assert.equal(sections.includes("files"), false);
  assert.equal(sections.includes("approvals"), false);
  assert.ok(steps.some((step) => step.section === null));
});
