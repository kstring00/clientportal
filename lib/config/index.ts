/**
 * Reading the deployment config.
 *
 * Import `portalConfig` from here rather than reaching for `portal.config.ts`
 * directly — this module is where validation, defaults and the feature-flag
 * helpers live, and where a future "config from the database" change would go.
 */

import rawConfig from "@/portal.config";
import { contrastRatio } from "./contrast";
import type {
  PhaseDefinition,
  PortalConfig,
  PortalFeature,
  ThemeTokens,
} from "./types";

export type { PortalConfig, PortalFeature, PhaseDefinition } from "./types";

export const portalConfig: PortalConfig = rawConfig;

/** True when a module is switched on for this deployment. */
export function isFeatureEnabled(feature: PortalFeature) {
  return portalConfig.features[feature] === true;
}

export function phaseByKey(key: string | null | undefined) {
  if (!key) return null;
  return portalConfig.phases.find((phase) => phase.key === key) ?? null;
}

/** Index of a phase in the configured order, or -1 when the key is unknown. */
export function phaseIndex(key: string | null | undefined) {
  if (!key) return -1;
  return portalConfig.phases.findIndex((phase) => phase.key === key);
}

export function fileCategoryLabel(key: string) {
  return (
    portalConfig.fileCategories.find((category) => category.key === key)?.label ??
    "Other"
  );
}

export function brandDisplayName() {
  return portalConfig.brand.shortName || portalConfig.brand.name;
}

/**
 * The theme tokens as CSS custom properties.
 *
 * Rendered into a <style> element on the portal shell rather than compiled into
 * the stylesheet, so rebranding is a config edit and not a build-time concern.
 */
export function themeCssVariables(theme: ThemeTokens = portalConfig.theme) {
  const entries: [string, string][] = [
    ["--ground", theme.ground],
    ["--surface", theme.surface],
    ["--surface-sunken", theme.surfaceSunken],
    ["--ink", theme.ink],
    ["--ink-muted", theme.inkMuted],
    ["--ink-deep", theme.inkDeep],
    ["--on-deep", theme.onDeep],
    ["--accent", theme.accent],
    ["--accent-ink", theme.accentInk],
    ["--accent-on-deep", theme.accentOnDeep],
    ["--line", theme.line],
    ["--line-strong", theme.lineStrong],
    ["--positive", theme.positive],
    ["--attention", theme.attention],
    ["--critical", theme.critical],
  ];

  return entries.map(([name, value]) => `${name}: ${value};`).join(" ");
}

/**
 * Pairs that must clear WCAG AA for normal text. `accent` is deliberately absent:
 * it is only ever used for rules, marks and large text, and `accentInk` is the
 * value used wherever accent-coloured words appear at body size.
 */
const REQUIRED_CONTRAST: [keyof ThemeTokens, keyof ThemeTokens, number][] = [
  ["ink", "ground", 4.5],
  ["ink", "surface", 4.5],
  ["ink", "surfaceSunken", 4.5],
  ["inkMuted", "ground", 4.5],
  ["inkMuted", "surface", 4.5],
  ["accentInk", "ground", 4.5],
  ["accentInk", "surface", 4.5],
  ["onDeep", "inkDeep", 4.5],
  ["accentOnDeep", "inkDeep", 4.5],
  ["positive", "ground", 4.5],
  ["attention", "ground", 4.5],
  ["critical", "ground", 4.5],
];

export type ConfigProblem = { path: string; message: string };

/**
 * Checks the config for the mistakes that are easy to make and expensive to
 * ship: an empty phase list, a duplicated key, a logo with no alt text, a colour
 * that fails contrast. Returns every problem rather than throwing on the first,
 * so one run of the test fixes them all.
 */
export function validateConfig(config: PortalConfig = portalConfig) {
  const problems: ConfigProblem[] = [];
  const add = (path: string, message: string) => problems.push({ path, message });

  if (!config.brand.name.trim()) add("brand.name", "must not be empty");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.brand.supportEmail)) {
    add("brand.supportEmail", "must be a valid email address");
  }

  if (config.brand.logo && !config.brand.logoAlt?.trim()) {
    add(
      "brand.logoAlt",
      "is required whenever brand.logo is set — a logo with no alt text is unreadable to a screen reader",
    );
  }

  if (config.phases.length === 0) {
    add("phases", "must define at least one phase");
  }

  const phaseKeys = new Set<string>();
  config.phases.forEach((phase: PhaseDefinition, index) => {
    if (!phase.key.trim()) add(`phases[${index}].key`, "must not be empty");
    if (phaseKeys.has(phase.key)) {
      add(`phases[${index}].key`, `duplicates an earlier phase key "${phase.key}"`);
    }
    phaseKeys.add(phase.key);
    if (!phase.label.trim()) add(`phases[${index}].label`, "must not be empty");
  });

  const categoryKeys = new Set<string>();
  config.fileCategories.forEach((category, index) => {
    if (categoryKeys.has(category.key)) {
      add(
        `fileCategories[${index}].key`,
        `duplicates an earlier category key "${category.key}"`,
      );
    }
    categoryKeys.add(category.key);
  });

  const handoffKeys = new Set<string>();
  config.handoffChecklist.forEach((item, index) => {
    if (handoffKeys.has(item.key)) {
      add(
        `handoffChecklist[${index}].key`,
        `duplicates an earlier handoff key "${item.key}"`,
      );
    }
    handoffKeys.add(item.key);
  });

  for (const [foreground, background, minimum] of REQUIRED_CONTRAST) {
    const ratio = contrastRatio(
      config.theme[foreground],
      config.theme[background],
    );
    if (ratio < minimum) {
      add(
        `theme.${foreground}`,
        `is ${ratio.toFixed(2)}:1 on theme.${background}, below the required ${minimum}:1`,
      );
    }
  }

  return problems;
}
