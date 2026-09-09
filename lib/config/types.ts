/**
 * The shape of a deployment's configuration.
 *
 * Everything in here is true for the WHOLE deployment: the studio's brand, which
 * modules are switched on, the vocabulary of the process, the help copy. None of
 * it is about one client or one project — that all lives in the database, so a
 * second client never means a second code change.
 *
 * The dividing line, when you are unsure where something belongs:
 *
 *   Would every client of this deployment see the same value?   -> config
 *   Does it change as one project progresses?                   -> database
 *
 * "Design" is config (the phase is called BUILD). "This project is in BUILD" is
 * data. "We name our phases 01..05" is config. "Phase 03 started on the 8th" is
 * data.
 */

/** A module that can be switched off. Nav hides, routes 404, data is not loaded. */
export type PortalFeature =
  | "project"
  | "files"
  | "approvals"
  | "messages"
  | "invoices"
  | "timeLog"
  | "carePlan"
  | "handoff"
  | "decisions"
  | "help";

export type FeatureFlags = Record<PortalFeature, boolean>;

/**
 * Colour tokens. These are written into a <style> tag on the portal shell as CSS
 * custom properties, so a rebrand is this object and nothing else.
 *
 * Contrast is a product requirement here, not a preference: `ink` on `ground`
 * and `ink` on `surface` must both clear 4.5:1, and `accent` is only ever used
 * for large text or non-text affordances unless `accentInk` is supplied.
 */
export type ThemeTokens = {
  /** Page background. */
  ground: string;
  /** Raised panel background. */
  surface: string;
  /** Deeper surface, for inset areas. */
  surfaceSunken: string;
  /** Primary text. Must clear 4.5:1 on both `ground` and `surface`. */
  ink: string;
  /** Secondary text. Must clear 4.5:1 on `ground`. */
  inkMuted: string;
  /** Dark ground, e.g. the masthead. */
  inkDeep: string;
  /** Text sitting on `inkDeep`. */
  onDeep: string;
  /** The restrained accent. Rules, marks, active states. */
  accent: string;
  /** A darkened accent that clears 4.5:1 on `ground`, for small accent text. */
  accentInk: string;
  /** Accent legible on `inkDeep`. */
  accentOnDeep: string;
  /** Hairline. */
  line: string;
  /** Stronger hairline. */
  lineStrong: string;
  /** Status hues. Never the sole carrier of meaning — always paired with text. */
  positive: string;
  attention: string;
  critical: string;
};

export type BrandConfig = {
  /** The studio's name. Appears in the masthead and the document title. */
  name: string;
  /** Optional short form for tight spaces. Falls back to `name`. */
  shortName?: string;
  /**
   * Path to a logo in /public, or null for a typographic monogram built from
   * `name`. Kept as a path rather than an import so swapping it is a config edit.
   */
  logo: string | null;
  /** Alt text for the logo. Required whenever `logo` is set. */
  logoAlt?: string;
  /** Where "contact support" goes. */
  supportEmail: string;
  supportPhone?: string;
  /** Optional link back to the studio's public site. */
  website?: string;
};

export type PhaseDefinition = {
  /** Stable key stored in the database. Never rename after a project exists. */
  key: string;
  /** Two-digit ordinal shown in the timeline. */
  ordinal: string;
  label: string;
  /** One plain sentence about what happens here. Shown under the phase. */
  blurb: string;
};

export type FileCategory = {
  key: string;
  label: string;
};

/** A default handoff checklist row. Per-project status lives in the database. */
export type HandoffItemDefinition = {
  key: string;
  label: string;
  blurb: string;
};

export type FaqEntry = {
  question: string;
  answer: string;
};

export type CustomLink = {
  label: string;
  href: string;
  description?: string;
};

export type ContentConfig = {
  /** Shown on the overview above everything else. */
  welcomeTitle: string;
  welcomeBody: string;
  /** The first screen of the walkthrough. */
  tourIntroTitle: string;
  tourIntroBody: string;
  /** Help page: how the engagement runs. */
  processExplanation: string[];
  faq: FaqEntry[];
  /** Optional extra links in the help panel — style guide, meeting link, etc. */
  links: CustomLink[];
};

export type PortalConfig = {
  brand: BrandConfig;
  theme: ThemeTokens;
  features: FeatureFlags;
  phases: PhaseDefinition[];
  fileCategories: FileCategory[];
  handoffChecklist: HandoffItemDefinition[];
  content: ContentConfig;
};
