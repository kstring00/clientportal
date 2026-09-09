/**
 * The walkthrough's content and its "should it open?" rule.
 *
 * Pure functions with no React and no browser API, so the behaviour that
 * actually matters — when it appears, and that skipping never disables replay —
 * is unit tested rather than clicked through.
 */

import { portalConfig } from "@/lib/config";
import type { PortalTourState } from "./types";

/**
 * Bump when the walkthrough changes materially enough that people who have
 * already seen it should be offered the new one. Cosmetic edits do not count.
 */
export const TOUR_VERSION = 1;

export type TourStep = {
  /** Matches a nav section key where one exists, so a step can be skipped when
      that module is switched off. */
  section: string | null;
  eyebrow: string;
  title: string;
  body: string;
};

const STEPS: TourStep[] = [
  {
    section: "overview",
    eyebrow: "Step 1 — Overview",
    title: "This is your project dashboard.",
    body: "Start here whenever you want to know where things stand. It shows the current phase, what I'm working on, and anything waiting on you.",
  },
  {
    section: null,
    eyebrow: "Step 2 — Next action",
    title: "If I need something from you, it appears here.",
    body: "The top of the Overview always says what to do next — or tells you plainly that there is nothing to do. You do not have to hunt for it.",
  },
  {
    section: "project",
    eyebrow: "Step 3 — Project",
    title: "The phase, the scope, and the decisions.",
    body: "See what phase we're in, what I'm working on now, and every decision we've already made together — so you never have to ask whether something was settled.",
  },
  {
    section: "files",
    eyebrow: "Step 4 — Files",
    title: "Upload what I've asked for, find everything else.",
    body: "Anything I need from you is listed as a request. Everything connected to the project — designs, content, brand files — stays here.",
  },
  {
    section: "approvals",
    eyebrow: "Step 5 — Approvals",
    title: "Sign-off with a permanent record.",
    body: "When something needs your approval it appears here. Approve it or ask for changes, and the decision is kept with your name and the date on it.",
  },
  {
    section: "messages",
    eyebrow: "Step 6 — Messages",
    title: "Project conversation, in one place.",
    body: "Updates from me and questions from you live with the project instead of in an email thread nobody can find later.",
  },
  {
    section: "invoices",
    eyebrow: "Step 7 — Invoices",
    title: "See what's been issued and what's been paid.",
    body: "The deposit and the final payment, their status, and a secure link to pay — without searching your inbox.",
  },
  {
    section: "handoff",
    eyebrow: "Step 8 — Handoff",
    title: "When the project is finished, ownership moves to you.",
    body: "Once the final invoice clears, the transfer of your domain, hosting and accounts unlocks here, and you can watch each one move across.",
  },
  {
    section: "help",
    eyebrow: "Step 9 — Help",
    title: "You can replay this walkthrough any time.",
    body: "Help has this walkthrough, answers to common questions, and how to reach me. Nothing here is a one-time-only screen.",
  },
];

/** Steps whose section is switched off in this deployment are dropped. */
export function tourSteps(enabledSections: string[]): TourStep[] {
  const enabled = new Set(enabledSections);
  return STEPS.filter((step) => step.section === null || enabled.has(step.section));
}

export function tourWelcome() {
  return {
    title: portalConfig.content.tourIntroTitle,
    body: portalConfig.content.tourIntroBody,
  };
}

/**
 * Whether the walkthrough opens by itself.
 *
 * It opens on a first visit, and after a version bump for someone who finished
 * an older version. It does NOT reopen for somebody who skipped the current
 * version — being asked again every visit is how a helpful thing becomes an
 * irritation.
 *
 * Skipping never removes the ability to replay: that lives in Help and is always
 * available regardless of anything here.
 */
export function shouldAutoOpen(
  state: PortalTourState,
  currentVersion = TOUR_VERSION,
) {
  if (state.tourVersion < currentVersion) {
    // A newer walkthrough than the one they saw. Offer it again, unless they
    // dismissed this newer version already (which the version check rules out).
    return true;
  }
  return !state.completedAt && !state.dismissedAt;
}
