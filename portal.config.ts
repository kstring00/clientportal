/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE FILE YOU EDIT FOR A NEW CLIENT.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Everything a deployment needs to look and read like it was built for one
 * studio lives here. There is no client-specific copy anywhere in the
 * components — if you find yourself editing a component to change a word, that
 * word belongs in this file instead.
 *
 * What does NOT go here: anything about a specific project. The client's name,
 * their current phase, what you owe them, what they owe you — that is database
 * data, created through the admin screens. See docs/NEW_CLIENT.md.
 *
 * After editing, run `npm run test` — the config is validated by a test, so a
 * broken colour token or an empty phase list fails before it ships.
 */

import type { PortalConfig } from "./lib/config/types";

const config: PortalConfig = {
  brand: {
    name: "Your Studio",
    shortName: "Studio",
    // Drop a file in /public and point at it, e.g. "/logo.svg".
    // null renders a typographic monogram from `name` instead.
    logo: null,
    supportEmail: "hello@example.com",
    website: "https://example.com",
  },

  /**
   * The default theme: deep navy, warm cream, restrained gold.
   *
   * Every value has been checked for contrast. If you change them, keep the
   * ratios: `ink` on `ground` and on `surface` at 4.5:1 or better, `inkMuted` on
   * `ground` at 4.5:1, `accentInk` on `ground` at 4.5:1, `onDeep` and
   * `accentOnDeep` at 4.5:1 on `inkDeep`. `npm run test` checks these.
   */
  theme: {
    ground: "#f8f5ef",
    surface: "#ffffff",
    surfaceSunken: "#f2ede4",
    ink: "#182a3a",
    inkMuted: "#425b6f",
    inkDeep: "#05172f",
    onDeep: "#f2ede4",
    accent: "#a08348",
    accentInk: "#6f5620",
    accentOnDeep: "#e2c58a",
    line: "rgba(66, 91, 111, 0.22)",
    lineStrong: "rgba(66, 91, 111, 0.34)",
    positive: "#2f6b4f",
    attention: "#8a5a1c",
    critical: "#9b2c2c",
  },

  /**
   * Switch a module off and it disappears completely: no nav item, no route, no
   * query. Turning one back on needs no other change.
   */
  features: {
    project: true,
    files: true,
    approvals: true,
    messages: true,
    invoices: true,
    timeLog: false,
    carePlan: false,
    handoff: true,
    decisions: true,
    help: true,
  },

  /**
   * The phases of your engagement. `key` is written to the database, so treat
   * the keys as permanent once a project exists — rename the label freely, never
   * the key.
   */
  phases: [
    {
      key: "discovery",
      ordinal: "01",
      label: "Discovery",
      blurb: "Working out what the site needs to do, and for whom.",
    },
    {
      key: "design",
      ordinal: "02",
      label: "Design",
      blurb: "Deciding how it looks and reads, page by page.",
    },
    {
      key: "build",
      ordinal: "03",
      label: "Build",
      blurb: "Turning the approved design into a working site.",
    },
    {
      key: "review",
      ordinal: "04",
      label: "Review",
      blurb: "Your read-through, revisions, and final checks.",
    },
    {
      key: "launch",
      ordinal: "05",
      label: "Launch / Handoff",
      blurb: "Going live, then moving the accounts over to you.",
    },
  ],

  fileCategories: [
    { key: "content", label: "Content" },
    { key: "images", label: "Images" },
    { key: "brand", label: "Brand" },
    { key: "design", label: "Design" },
    { key: "deliverables", label: "Deliverables" },
    { key: "legal", label: "Legal" },
    { key: "other", label: "Other" },
  ],

  /**
   * The default handoff checklist. Each project gets its own copy of these rows
   * when it is created, so per-project status is data, not config.
   */
  handoffChecklist: [
    { key: "domain", label: "Domain", blurb: "Registrar access moved to your account." },
    { key: "hosting", label: "Hosting", blurb: "The account the site runs on." },
    { key: "code", label: "Code / repository", blurb: "The source, transferred to you." },
    { key: "analytics", label: "Analytics", blurb: "Traffic reporting, under your login." },
    { key: "cms", label: "CMS / admin", blurb: "Where you edit the site yourself." },
    { key: "email", label: "Email / forms", blurb: "Where form submissions arrive." },
    { key: "guide", label: "Owner guide", blurb: "Written instructions for running the site." },
    { key: "walkthrough", label: "Walkthrough video", blurb: "A recorded tour of your admin." },
  ],

  content: {
    welcomeTitle: "Your project",
    welcomeBody:
      "Everything about this project lives here — where it stands, what needs your input, and what happens next.",

    tourIntroTitle: "Welcome to your project portal.",
    tourIntroBody:
      "This is where your project lives — files, approvals, updates, invoices and handoff. Here's a quick walkthrough.",

    processExplanation: [
      "Every project moves through the same five phases, in order. You will always see which one you are in on the Project page.",
      "When something needs your input, it appears at the top of the Overview and in the navigation as a count. Nothing else asks for your attention.",
      "Approvals are permanent. Once you approve something, the record keeps who approved it and when, so nobody has to remember.",
      "Invoices are issued in two halves: a deposit to start, and a final payment before handoff. Both are paid through a secure link.",
    ],

    faq: [
      {
        question: "Do I need to check this every day?",
        answer:
          "No. You will be emailed when something needs you. The portal is here so you can find things without searching your inbox.",
      },
      {
        question: "What happens if I request changes on a design?",
        answer:
          "The request goes straight to me with your comment attached, and the item stays open until it is resolved. Nothing is lost.",
      },
      {
        question: "When do I own the site?",
        answer:
          "Once the final invoice clears, ownership transfer unlocks and the accounts move to you. Progress on that is on the Handoff page.",
      },
      {
        question: "Can I add someone else to this portal?",
        answer:
          "Yes — ask and I will send them their own sign-in link. They will see the same project.",
      },
    ],

    links: [],
  },
};

export default config;
