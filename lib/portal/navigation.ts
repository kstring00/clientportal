/**
 * The navigation model.
 *
 * Built from the feature flags, so a disabled module leaves no trace: no link,
 * no badge, no empty section. `sectionsFor` is also what the route guards use,
 * so a disabled module's URL cannot be reached by typing it either.
 */

import { isFeatureEnabled, type PortalFeature } from "@/lib/config";

export type NavSection = {
  key: string;
  label: string;
  href: string;
  /** The flag that governs it. Overview is always on. */
  feature: PortalFeature | null;
  /** Key used to match attention items to this section's badge. */
  attentionKey?: "approvals" | "files" | "invoices" | "messages";
};

const ALL_SECTIONS: NavSection[] = [
  { key: "overview", label: "Overview", href: "/portal", feature: null },
  { key: "project", label: "Project", href: "/portal/project", feature: "project" },
  { key: "files", label: "Files", href: "/portal/files", feature: "files", attentionKey: "files" },
  {
    key: "approvals",
    label: "Approvals",
    href: "/portal/approvals",
    feature: "approvals",
    attentionKey: "approvals",
  },
  {
    key: "messages",
    label: "Messages",
    href: "/portal/messages",
    feature: "messages",
    attentionKey: "messages",
  },
  {
    key: "invoices",
    label: "Invoices",
    href: "/portal/invoices",
    feature: "invoices",
    attentionKey: "invoices",
  },
  { key: "handoff", label: "Handoff", href: "/portal/handoff", feature: "handoff" },
  { key: "help", label: "Help", href: "/portal/help", feature: "help" },
];

export function sectionsFor(): NavSection[] {
  return ALL_SECTIONS.filter(
    (section) => section.feature === null || isFeatureEnabled(section.feature),
  );
}

/** True when a section is reachable in this deployment. Used by route guards. */
export function isSectionEnabled(key: string) {
  return sectionsFor().some((section) => section.key === key);
}
