/**
 * Quota bar themes.
 *
 * Named character presets for the quota progress bar, so the filled/empty
 * glyphs (and a quieter filled glyph for quiet rows) can be tuned per taste
 * without touching layout logic. Themes are pure character data: any surface
 * that renders the bar (TUI sidebar, toasts, CLI show) picks them up
 * identically. Specs compose characters with a named color layer and can be
 * conditional on entry metrics (see BarThemeSpec).
 */

import { isThemeColorName } from "./theme-colors.js";

export interface BarThemeDefinition {
  id: BarThemeId;
  /** Display label for docs and diagnostics. */
  label: string;
  /** Glyph repeated for the filled portion. */
  filled: string;
  /** Glyph repeated for the empty portion. */
  empty: string;
  /**
   * Glyph for the filled portion of quiet rows. Character-level dimming
   * independent of terminal color support.
   */
  quietFilled: string;
  /**
   * When true the trailing filled cell uses left partial blocks
   * (▏▎▍▌▋▊▉) for sub-cell precision.
   */
  partial?: boolean;
}

export type BarThemeId =
  | "classic"
  | "solid"
  | "shade"
  | "soft"
  | "smooth"
  | "dots"
  | "rings"
  | "squares"
  | "smol"
  | "heavy"
  | "light"
  | "halves";

export const BAR_THEMES: Readonly<Record<BarThemeId, BarThemeDefinition>> = {
  classic: {
    id: "classic",
    label: "Full block on light shade",
    filled: "█",
    empty: "░",
    quietFilled: "▓",
  },
  solid: {
    id: "solid",
    label: "Full block on space",
    filled: "█",
    empty: " ",
    quietFilled: "▒",
  },
  shade: {
    id: "shade",
    label: "Dark shade on light shade",
    filled: "▓",
    empty: "░",
    quietFilled: "▒",
  },
  soft: {
    id: "soft",
    label: "Medium shade on light shade",
    filled: "▒",
    empty: "░",
    quietFilled: "░",
  },
  smooth: {
    id: "smooth",
    label: "Full block with sub-cell edge on light shade",
    filled: "█",
    empty: "░",
    quietFilled: "▓",
    partial: true,
  },
  dots: {
    id: "dots",
    label: "Filled circles on middle dots",
    filled: "●",
    empty: "·",
    quietFilled: "◐",
  },
  rings: {
    id: "rings",
    label: "Filled circles on open circles",
    filled: "●",
    empty: "○",
    quietFilled: "◐",
  },
  squares: {
    id: "squares",
    label: "Filled squares on open squares",
    filled: "■",
    empty: "□",
    quietFilled: "▪",
  },
  smol: {
    id: "smol",
    label: "Small filled squares on middle dots",
    filled: "▪",
    empty: "·",
    quietFilled: "▫",
  },
  heavy: {
    id: "heavy",
    label: "Heavy rule on dashed rule",
    filled: "━",
    empty: "┄",
    quietFilled: "─",
  },
  light: {
    id: "light",
    label: "Light rule on middle dots",
    filled: "─",
    empty: "·",
    quietFilled: "┄",
  },
  halves: {
    id: "halves",
    label: "Half-filled circles on middle dots",
    filled: "◐",
    empty: "·",
    quietFilled: "◑",
  },
};

export const DEFAULT_BAR_THEME_ID: BarThemeId = "classic";

export function isBarThemeId(value: unknown): value is BarThemeId {
  return typeof value === "string" && Object.hasOwn(BAR_THEMES, value);
}

export function getBarTheme(id?: BarThemeId): BarThemeDefinition {
  return BAR_THEMES[id ?? DEFAULT_BAR_THEME_ID] ?? BAR_THEMES[DEFAULT_BAR_THEME_ID];
}

// ---------------------------------------------------------------------------
// Composable specs: characters + color, with conditional rules.
// ---------------------------------------------------------------------------

/**
 * One conditional application of a theme. All present conditions must hold
 * (AND). Sign gives direction: `prorata: 10` matches delta >= +10,
 * `prorata: -10` matches delta <= -10. Conditions whose data is unavailable
 * for an entry (no pro-rata delta, no future reset time) never match.
 */
export interface BarThemeRule {
  /** Characters theme (id or composite) applied when the rule matches. */
  theme?: string | string[];
  /** Pro-rata burn-rate delta in percentage points. */
  prorata?: number;
  /** Quota used, in percent (0-100). */
  used?: number;
  /** Quota remaining, in percent (0-100). */
  percent?: number;
  /** Hours until the window resets. */
  hours?: number;
}

/**
 * A bar theme spec: a single theme id, a composite like
 * `["squares", "quiet"]` (characters + color), one rule, or a list mixing
 * any of those. In a list containing at least one rule object, plain
 * strings/composites act as unconditional rules and the last matching
 * entry wins; a list of only names composes a single theme.
 */
export type BarThemeSpec =
  | string
  | string[]
  | BarThemeRule
  | Array<string | string[] | BarThemeRule>;

export interface ComposedBarTheme {
  /** Character set the bar renders with. */
  chars: BarThemeDefinition;
  /** Color layer name; resolved by the rendering surface if it can. */
  color?: string;
}

export interface BarThemeMetrics {
  percentRemaining?: number;
  usedPercent?: number;
  /** Signed pro-rata burn-rate delta (percentage points vs linear pace). */
  proRataDeltaPct?: number;
  /** Hours until reset; only when a future reset time is known. */
  hoursRemaining?: number;
}

export interface BarThemeSpecIssue {
  message: string;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function classifyThemeName(
  name: string,
  issues: BarThemeSpecIssue[],
): { chars?: BarThemeId; color?: string } {
  if (isBarThemeId(name)) return { chars: name };
  if (isThemeColorName(name)) return { color: name };
  issues.push({
    message: `unknown theme name "${name}"; expected a character theme (${Object.keys(BAR_THEMES).join(", ")}) or a color (host token, CSS name, or #rrggbb)`,
  });
  return {};
}

function composeNames(
  names: readonly string[],
  issues: BarThemeSpecIssue[],
): { chars?: BarThemeId; color?: string } {
  let composed: { chars?: BarThemeId; color?: string } = {};
  for (const name of names) {
    composed = { ...composed, ...classifyThemeName(name, issues) };
  }
  return composed;
}

const RULE_CONDITION_KEYS = ["theme", "prorata", "used", "percent", "hours"] as const;

function parseRule(
  value: Record<string, unknown>,
  issues: BarThemeSpecIssue[],
): BarThemeRule | null {
  for (const key of Object.keys(value)) {
    if (!(RULE_CONDITION_KEYS as readonly string[]).includes(key)) {
      issues.push({ message: `unknown rule key "${key}"` });
    }
  }

  const rule: BarThemeRule = {};
  if (value.theme !== undefined) {
    if (typeof value.theme === "string") {
      rule.theme = value.theme;
    } else if (Array.isArray(value.theme) && value.theme.every((n) => typeof n === "string")) {
      rule.theme = value.theme as string[];
    } else {
      issues.push({ message: "rule theme must be a string or array of strings" });
      return null;
    }
  }

  for (const key of ["prorata", "used", "percent", "hours"] as const) {
    const raw = value[key];
    if (raw === undefined) continue;
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      issues.push({ message: `rule condition "${key}" must be a finite number` });
      continue;
    }
    rule[key] = raw;
  }

  return rule;
}

type NormalizedThemeSpec =
  | {
      kind: "composed";
      composed: { chars?: BarThemeId; color?: string };
    }
  | {
      kind: "rules";
      rules: Array<{ composed: { chars?: BarThemeId; color?: string }; rule: BarThemeRule }>;
    };

/**
 * Validates a raw config value as a bar theme spec, collecting issues
 * instead of throwing. Unknown names and malformed rules are reported;
 * valid parts still apply.
 */
export function validateBarThemeSpec(value: unknown): {
  spec: BarThemeSpec | undefined;
  issues: BarThemeSpecIssue[];
} {
  const issues: BarThemeSpecIssue[] = [];
  if (typeof value === "string") {
    const classified = classifyThemeName(value, issues);
    return { spec: classified.chars || classified.color ? value : undefined, issues };
  }

  if (!Array.isArray(value) || value.length === 0) {
    issues.push({ message: "expected a theme name, [names], a rule, or a non-empty rule list" });
    return { spec: undefined, issues };
  }

  const items = value.filter((item) => item !== undefined);
  const hasRule = items.some(isRecordValue);
  if (!hasRule) {
    if (!items.every((name) => typeof name === "string")) {
      issues.push({ message: "composite themes are arrays of name strings" });
      return { spec: undefined, issues };
    }
    composeNames(items as string[], issues);
    return { spec: items as string[], issues };
  }

  let ruleCount = 0;
  for (const item of items) {
    if (isRecordValue(item)) {
      const rule = parseRule(item, issues);
      if (rule) {
        ruleCount += 1;
        if (rule.theme !== undefined) {
          if (typeof rule.theme === "string") {
            classifyThemeName(rule.theme, issues);
          } else {
            composeNames(rule.theme, issues);
          }
        }
      }
      continue;
    }
    if (typeof item === "string") {
      ruleCount += 1;
      classifyThemeName(item, issues);
      continue;
    }
    if (Array.isArray(item) && item.every((n) => typeof n === "string")) {
      ruleCount += 1;
      composeNames(item as string[], issues);
      continue;
    }
    issues.push({ message: "rule list entries must be a name, [names], or a rule object" });
  }

  return { spec: ruleCount > 0 ? value : undefined, issues };
}

function matchesCondition(value: number | undefined, threshold: number, signed: boolean): boolean {
  if (value === undefined) return false;
  if (threshold >= 0) return value >= threshold;
  // Signed quantities (pro-rata delta) bound at the negative value itself:
  // prorata: -10 means delta <= -10. Unsigned quantities (used, percent,
  // hours) use the magnitude as a "below" bound: percent: -20 means
  // remaining <= 20.
  return signed ? value <= threshold : value <= -threshold;
}

function matchesRule(rule: BarThemeRule, metrics: BarThemeMetrics): boolean {
  if (
    rule.prorata !== undefined &&
    !matchesCondition(metrics.proRataDeltaPct, rule.prorata, true)
  ) {
    return false;
  }
  if (rule.used !== undefined && !matchesCondition(metrics.usedPercent, rule.used, false)) {
    return false;
  }
  if (
    rule.percent !== undefined &&
    !matchesCondition(metrics.percentRemaining, rule.percent, false)
  ) {
    return false;
  }
  if (rule.hours !== undefined && !matchesCondition(metrics.hoursRemaining, rule.hours, false)) {
    return false;
  }
  return true;
}

function composeFromThemeValue(theme: string | string[] | undefined): {
  chars?: BarThemeId;
  color?: string;
} {
  if (theme === undefined) return {};
  return typeof theme === "string" ? composeNames([theme], []) : composeNames(theme, []);
}

function normalizeSpec(spec: BarThemeSpec | undefined): NormalizedThemeSpec {
  if (spec === undefined) return { kind: "composed", composed: {} };
  if (typeof spec === "string") {
    return { kind: "composed", composed: composeNames([spec], []) };
  }
  if (Array.isArray(spec)) {
    const items = spec.filter((item) => item !== undefined);
    if (items.some(isRecordValue)) {
      return {
        kind: "rules",
        rules: items.map((item) => {
          if (isRecordValue(item)) {
            const rule = parseRule(item, []) ?? {};
            return { composed: composeFromThemeValue(rule.theme), rule };
          }
          if (Array.isArray(item)) {
            return { composed: composeNames(item as string[], []), rule: {} };
          }
          return { composed: composeNames([item as string], []), rule: {} };
        }),
      };
    }
    return { kind: "composed", composed: composeNames(spec as string[], []) };
  }
  return { kind: "rules", rules: [{ composed: composeFromThemeValue(spec.theme), rule: spec }] };
}

/**
 * Resolves a spec against one entry's metrics. In a rule list the last
 * matching rule wins, so specs read base-first, override-last.
 */
export function resolveBarTheme(
  spec: BarThemeSpec | undefined,
  metrics: BarThemeMetrics,
): ComposedBarTheme {
  const normalized = normalizeSpec(spec);

  if (normalized.kind === "composed") {
    return {
      chars: getBarTheme(normalized.composed.chars),
      ...(normalized.composed.color ? { color: normalized.composed.color } : {}),
    };
  }

  let resolved: { chars?: BarThemeId; color?: string } = {};
  for (const { composed, rule } of normalized.rules) {
    if (matchesRule(rule, metrics)) {
      resolved = {
        ...resolved,
        ...Object.fromEntries(Object.entries(composed).filter(([, value]) => value !== undefined)),
      };
    }
  }

  return {
    chars: getBarTheme(resolved.chars),
    ...(resolved.color ? { color: resolved.color } : {}),
  };
}
