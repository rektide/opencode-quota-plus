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

import { CSS_NAMED_COLORS, HOST_THEME_TOKEN_NAMES } from "./theme-colors.js";

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
  /** Theme stack applied when the rule matches: names, inline bags, or both. */
  theme?: BarThemeStackValue;
  /** Pro-rata burn-rate delta in percentage points. */
  prorata?: number;
  /** Quota used, in percent (0-100). */
  used?: number;
  /** Quota remaining, in percent (0-100). */
  percent?: number;
  /** Hours until the window resets. */
  hours?: number;
}

/** One stack element: a preset name, a nested stack, or an inline bag. */
export type BarThemeStackValue = string | string[] | BarThemeBag | BarThemeStackElement[];

export type BarThemeStackElement = string | string[] | BarThemeBag;

/**
 * A bar theme spec: any stack of preset names and inline bags, optionally
 * with conditional rules. Objects whose keys are all bag keys are bags;
 * objects with rule keys are rules (whose `theme` is itself a stack). In a
 * list containing at least one rule, every element acts as a rule and the
 * last match wins per property; a list of only bags/names composes directly.
 */
export type BarThemeSpec =
  | BarThemeStackValue
  | BarThemeRule
  | Array<BarThemeStackElement | BarThemeRule>;

/**
 * The theme property bag. Every theme name maps to a (partial) bag; stacking
 * spreads bags left to right and the last value per key wins. There is no
 * shape/color distinction in the model: `squares` is a bag that happens to
 * define glyphs, `red` is a bag that happens to define a color, and a
 * compound preset would set both.
 */
export interface BarThemeBag {
  filled?: string;
  empty?: string;
  quietFilled?: string;
  partial?: boolean;
  /** Color name (host token, CSS name, or hex literal), resolved at render. */
  color?: string;
}

export interface ComposedBarTheme {
  /** Character set the bar renders with. */
  chars: BarThemeDefinition;
  /** Color layer name; resolved by the rendering surface if it can. */
  color?: string;
}

/** Registry of preset bags: character themes plus every accepted color name. */
export const BAR_THEME_PRESETS: Readonly<Record<string, BarThemeBag>> = {
  // Character presets are total over their glyph keys so stacking is
  // unambiguous per key (e.g. "classic" after "smooth" clears `partial`).
  ...Object.fromEntries(
    Object.entries(BAR_THEMES).map(([id, def]) => [
      id,
      {
        filled: def.filled,
        empty: def.empty,
        quietFilled: def.quietFilled,
        partial: def.partial === true,
      },
    ]),
  ),
  // Color presets: one-key bags. Host tokens and CSS names alike.
  ...Object.fromEntries(HOST_THEME_TOKEN_NAMES.map((token) => [token, { color: token }])),
  ...Object.fromEntries(Object.keys(CSS_NAMED_COLORS).map((name) => [name, { color: name }])),
  quiet: { color: "quiet" },
};

/**
 * Looks up a preset bag by name. A `#rrggbb`/`#rgb` literal is not a registry
 * entry but a color value, and as a value it defines the color property.
 * Returns undefined for unknown names.
 */
export function presetFor(name: string): BarThemeBag | undefined {
  const preset = BAR_THEME_PRESETS[name];
  if (preset) return preset;
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(name)) return { color: name };
  return undefined;
}

const GLYPH_KEYS = ["filled", "empty", "quietFilled", "partial"] as const;
const BAG_KEYS = [...GLYPH_KEYS, "color"] as const;

type AccumulatedBag = BarThemeBag & { glyphSource?: string };

/** True when a plain object's keys are all theme bag keys (an inline bag). */
function isInlineBag(value: unknown): value is Record<string, unknown> {
  if (!isRecordValue(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => (BAG_KEYS as readonly string[]).includes(key));
}

/** Validates an inline bag; reports per-key issues and keeps valid keys. */
function validateBag(value: Record<string, unknown>, issues: BarThemeSpecIssue[]): BarThemeBag {
  const bag: BarThemeBag = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!(BAG_KEYS as readonly string[]).includes(key)) {
      issues.push({
        message: `unknown theme bag key "${key}"; expected one of: ${BAG_KEYS.join(", ")}`,
      });
      continue;
    }
    if (key === "partial") {
      if (typeof raw === "boolean") {
        bag.partial = raw;
      } else {
        issues.push({ message: `theme bag key "partial" must be a boolean` });
      }
      continue;
    }
    if (typeof raw === "string") {
      (bag as Record<string, unknown>)[key] = raw;
    } else {
      issues.push({ message: `theme bag key "${key}" must be a string` });
    }
  }
  return bag;
}

/** Applies one stack element (name, nested stack, or inline bag). */
function applyStackElement(
  element: BarThemeStackElement,
  issues: BarThemeSpecIssue[],
  accumulated: AccumulatedBag,
): AccumulatedBag {
  if (typeof element === "string") {
    return applyName(element, issues, accumulated);
  }
  if (Array.isArray(element)) {
    let next = accumulated;
    for (const inner of element) {
      next = applyStackElement(inner, issues, next);
    }
    return next;
  }
  // Inline bag: spread as-is. It overrides only the keys it defines.
  return { ...accumulated, ...element };
}

function applyStack(
  elements: readonly BarThemeStackElement[],
  issues: BarThemeSpecIssue[],
): AccumulatedBag {
  let accumulated: AccumulatedBag = {};
  for (const element of elements) {
    accumulated = applyStackElement(element, issues, accumulated);
  }
  return accumulated;
}

/** Applies one preset name onto an accumulated bag. Unknown names report. */
function applyName(
  name: string,
  issues: BarThemeSpecIssue[],
  accumulated: AccumulatedBag,
): AccumulatedBag {
  const preset = presetFor(name);
  if (!preset) {
    issues.push({
      message: `unknown theme name "${name}"; expected a preset (character themes, host tokens, CSS color names) or a #rrggbb literal`,
    });
    return accumulated;
  }
  const definesGlyphs = GLYPH_KEYS.some((key) => preset[key] !== undefined);
  return {
    ...accumulated,
    ...preset,
    ...(definesGlyphs ? { glyphSource: name } : {}),
  };
}

/** Materializes the public resolved theme from an accumulated bag. */
function finalizeBag(bag: AccumulatedBag): ComposedBarTheme {
  return {
    chars: definitionFromBag(bag),
    ...(bag.color !== undefined ? { color: bag.color } : {}),
  };
}

/** Materializes the glyph definition from an accumulated bag. */
function definitionFromBag(bag: AccumulatedBag): BarThemeDefinition {
  const base: BarThemeDefinition = {
    ...BAR_THEMES[DEFAULT_BAR_THEME_ID],
    partial: BAR_THEMES[DEFAULT_BAR_THEME_ID].partial === true,
  };
  const glyphs = Object.fromEntries(GLYPH_KEYS.map((key) => [key, bag[key] ?? base[key]])) as Pick<
    BarThemeDefinition,
    "filled" | "empty" | "quietFilled" | "partial"
  >;
  const source = bag.glyphSource ? BAR_THEMES[bag.glyphSource as BarThemeId] : undefined;
  return {
    id: source?.id ?? DEFAULT_BAR_THEME_ID,
    label: source?.label ?? base.label,
    ...glyphs,
  };
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

const RULE_CONDITION_KEYS = ["theme", "prorata", "used", "percent", "hours"] as const;

function parseRule(
  value: Record<string, unknown>,
  issues: BarThemeSpecIssue[],
): BarThemeRule | null {
  // Bag keys on a rule are shorthand for its theme: they stack after an
  // explicit `theme` value so both apply.
  const bagKeys: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    if ((BAG_KEYS as readonly string[]).includes(key)) {
      bagKeys[key] = value[key];
      continue;
    }
    if (!(RULE_CONDITION_KEYS as readonly string[]).includes(key)) {
      issues.push({ message: `unknown rule key "${key}"` });
    }
  }
  const shorthandBag = validateBag(bagKeys, issues);

  const rule: BarThemeRule = {};
  if (value.theme !== undefined) {
    if (typeof value.theme === "string") {
      rule.theme = value.theme;
    } else if (Array.isArray(value.theme)) {
      rule.theme = value.theme as BarThemeStackElement[];
    } else if (isRecordValue(value.theme)) {
      rule.theme = validateBag(value.theme, issues);
    } else {
      issues.push({ message: "rule theme must be a name, [stack], or inline bag" });
      return null;
    }
  }
  const shorthandKeys = Object.keys(shorthandBag);
  if (shorthandKeys.length > 0) {
    rule.theme =
      rule.theme === undefined ? shorthandBag : [rule.theme as BarThemeStackElement, shorthandBag];
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
      composed: AccumulatedBag;
    }
  | {
      kind: "rules";
      rules: Array<{ composed: AccumulatedBag; rule: BarThemeRule }>;
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
    const preset = presetFor(value);
    if (!preset) {
      issues.push({
        message: `unknown theme name "${value}"; expected a preset (character themes, host tokens, CSS color names) or a #rrggbb literal`,
      });
      return { spec: undefined, issues };
    }
    return { spec: value, issues };
  }

  if (isInlineBag(value)) {
    validateBag(value, issues);
    return { spec: value as BarThemeBag, issues };
  }

  if (isRecordValue(value)) {
    // Top-level rule object.
    const rule = parseRule(value, issues);
    if (rule) {
      if (rule.theme !== undefined && rule.theme !== null) {
        applyStackElement(rule.theme as BarThemeStackElement, issues, {});
      }
      return { spec: value as BarThemeRule, issues };
    }
    return { spec: undefined, issues };
  }

  if (!Array.isArray(value) || value.length === 0) {
    issues.push({
      message: "expected a theme name, [stack], an inline bag, a rule, or a non-empty rule list",
    });
    return { spec: undefined, issues };
  }

  const items = value.filter((item) => item !== undefined);
  const hasRule = items.some((item) => isRecordValue(item) && !isInlineBag(item));
  if (!hasRule) {
    applyStack(items as BarThemeStackElement[], issues);
    return { spec: items as BarThemeStackElement[], issues };
  }

  let ruleCount = 0;
  for (const item of items) {
    if (isRecordValue(item) && !isInlineBag(item)) {
      const rule = parseRule(item, issues);
      if (rule) {
        ruleCount += 1;
        if (rule.theme !== undefined && rule.theme !== null) {
          applyStackElement(rule.theme as BarThemeStackElement, issues, {});
        }
      }
      continue;
    }
    if (typeof item === "string" || Array.isArray(item) || isInlineBag(item)) {
      ruleCount += 1;
      applyStackElement(item as BarThemeStackElement, issues, {});
      continue;
    }
    issues.push({ message: "rule list entries must be a name, [stack], an inline bag, or a rule" });
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

function composeFromThemeValue(theme: BarThemeStackValue | undefined): AccumulatedBag {
  if (theme === undefined) return {};
  if (typeof theme === "string") return applyStack([theme], []);
  if (Array.isArray(theme)) return applyStack(theme, []);
  return { ...(theme as BarThemeBag) };
}

function normalizeSpec(spec: BarThemeSpec | undefined): NormalizedThemeSpec {
  if (spec === undefined) return { kind: "composed", composed: {} };
  if (typeof spec === "string") {
    return { kind: "composed", composed: applyStack([spec], []) };
  }
  if (isInlineBag(spec)) {
    return { kind: "composed", composed: { ...(spec as BarThemeBag) } };
  }
  if (Array.isArray(spec)) {
    const items = spec.filter((item) => item !== undefined);
    if (items.some((item) => isRecordValue(item) && !isInlineBag(item))) {
      return {
        kind: "rules",
        rules: items.map((item) => {
          if (isRecordValue(item) && !isInlineBag(item)) {
            const rule = parseRule(item, []) ?? {};
            return { composed: composeFromThemeValue(rule.theme), rule };
          }
          return { composed: applyStackElement(item as BarThemeStackElement, [], {}), rule: {} };
        }),
      };
    }
    return { kind: "composed", composed: applyStack(items as BarThemeStackElement[], []) };
  }
  // Remaining object shape is a rule (bags returned above).
  const rule = spec as BarThemeRule;
  return { kind: "rules", rules: [{ composed: composeFromThemeValue(rule.theme), rule }] };
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
    return finalizeBag(normalized.composed);
  }

  let resolved: AccumulatedBag = {};
  for (const { composed, rule } of normalized.rules) {
    if (matchesRule(rule, metrics)) {
      resolved = {
        ...resolved,
        ...Object.fromEntries(Object.entries(composed).filter(([, value]) => value !== undefined)),
      };
    }
  }

  return finalizeBag(resolved);
}
