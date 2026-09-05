/**
 * Shared formatting utilities for quota display.
 *
 * These primitives are used by:
 * - format.ts (classic toast)
 * - toast-format-grouped.ts (grouped toast)
 * - quota-command-format.ts (/quota command)
 */

import { type BarThemeDefinition, type BarThemeMetrics, getBarTheme } from "./bar-theme.js";
import type { PercentDisplayMode } from "./types.js";

/** Left partial blocks by filled eighths (index 1-7; 0 and 8 are whole cells). */
const PARTIAL_LEFT_BLOCKS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉", ""] as const;

/**
 * Clamp a number to an integer within [min, max].
 */
export function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

/**
 * Clamp a value to a percentage [0..100], rounding to the nearest integer.
 * Returns 0 for non-finite inputs.
 */
export function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Pad string to width, truncating if too long, adding spaces on right if too short.
 */
export function padRight(str: string, width: number): string {
  if (str.length >= width) return str.slice(0, width);
  return str + " ".repeat(width - str.length);
}

/**
 * Pad string to width, truncating from start if too long, adding spaces on left if too short.
 */
export function padLeft(str: string, width: number): string {
  if (str.length >= width) return str.slice(str.length - width);
  return " ".repeat(width - str.length) + str;
}

/**
 * Render a progress bar of filled/empty blocks.
 *
 * The default theme (full block on light shade, whole-cell rounding) is
 * byte-identical to the historical bar. Themes may swap glyphs and, with
 * `partial`, spend the trailing filled cell on left partial blocks for
 * sub-cell precision. Quiet rows render the theme's quieter filled glyph,
 * which reads dimmed even where color is unavailable.
 */
export function bar(
  percentRemaining: number,
  width: number,
  options?: { theme?: BarThemeDefinition; quiet?: boolean },
): string {
  const theme = options?.theme ?? getBarTheme();
  const fillGlyph = options?.quiet ? theme.quietFilled : theme.filled;

  if (!theme.partial) {
    // Whole-cell rounding over the integer percent, byte-identical to the
    // historical bar.
    const p = clampInt(percentRemaining, 0, 100);
    const filled = Math.round((p / 100) * width);
    return fillGlyph.repeat(filled) + theme.empty.repeat(width - filled);
  }

  // Partial themes keep fractional percents: truncating to an integer
  // would discard the sub-cell precision the partial blocks exist to show.
  const p = Number.isFinite(percentRemaining) ? Math.max(0, Math.min(100, percentRemaining)) : 0;
  const exact = (p / 100) * width;
  const whole = Math.floor(exact);
  const eighths = Math.round((exact - whole) * 8);
  const fullCells = whole + (eighths === 8 ? 1 : 0);
  const partial = eighths === 0 || eighths === 8 ? "" : PARTIAL_LEFT_BLOCKS[eighths]!;
  const partialCells = partial ? 1 : 0;
  const empty = Math.max(0, width - fullCells - partialCells);
  return fillGlyph.repeat(Math.min(fullCells, width)) + partial + theme.empty.repeat(empty);
}

/**
 * Resolve the displayed percent for toast/sidebar percent rows without
 * changing the underlying provider-normalized percentRemaining value.
 */
export function resolveDisplayedPercent(
  percentRemaining: number,
  mode: PercentDisplayMode = "remaining",
): number {
  const remaining = Math.max(0, Math.round(percentRemaining));
  const used = Math.max(0, Math.round(100 - percentRemaining));
  return mode === "used" ? used : remaining;
}

export function formatDisplayedPercentLabel(
  percentRemaining: number,
  mode: PercentDisplayMode = "remaining",
  decimals = 0,
): string {
  const raw = mode === "used" ? 100 - percentRemaining : percentRemaining;
  const displayed = Math.max(0, raw);
  // Finer resolution drops the "used"/"left" suffix: the decimal value reads
  // as a numeric gauge and the suffix costs width on every surface.
  if (decimals > 0) return `${displayed.toFixed(decimals)}%`;
  return `${Math.round(displayed)}% ${mode === "used" ? "used" : "left"}`;
}

export const DISPLAYED_PERCENT_LABEL_WIDTH = "100% used".length;

export const MAX_PERCENT_DECIMALS = 2;

export function isPercentDecimals(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_PERCENT_DECIMALS
  );
}

/** Column width of the widest percent label for a given decimal resolution. */
export function displayedPercentLabelWidth(decimals = 0): number {
  if (decimals === 0) return DISPLAYED_PERCENT_LABEL_WIDTH;
  return `100.${"0".repeat(decimals)}%`.length;
}

/**
 * Format a token count with K/M suffix for compactness.
 *
 * Examples:
 * - 500 -> "500"
 * - 1500 -> "1.5K"
 * - 15000 -> "15K"
 * - 1500000 -> "1.5M"
 */
export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 10_000) {
    return `${(count / 1_000).toFixed(0)}K`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return String(count);
}

/**
 * Shorten model name for compact display.
 *
 * Removes common prefixes/suffixes before truncating with ellipsis.
 */
export function fmtUsdAmount(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

function pad2(n: number): string {
  return String(Math.trunc(n)).padStart(2, "0");
}

export function formatLocalCallTimestamp(atMs?: number): string {
  const safeMs = typeof atMs === "number" && Number.isFinite(atMs) ? atMs : Date.now();
  const d = new Date(safeMs);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function renderCommandHeading(params: { title: string; generatedAtMs?: number }): string {
  return `# ${params.title} ${formatLocalCallTimestamp(params.generatedAtMs)}`;
}

export function abbreviateDisplayedModelName(name: string): string {
  return name.replace(/antigravity/gi, "agy");
}

export function shortenModelName(name: string, maxLen: number): string {
  const abbreviated = abbreviateDisplayedModelName(name);
  if (abbreviated.length <= maxLen) return abbreviated;
  // Remove common suffixes before truncating.
  const s = abbreviated.replace(/-thinking$/i, "").replace(/-preview$/i, "");
  if (s.length <= maxLen) return s;
  // Truncate with ellipsis
  return s.slice(0, maxLen - 1) + "\u2026";
}

export interface FormatResetCountdownOptions {
  /**
   * String to return when ISO timestamp is missing/undefined.
   * - Classic toast uses "-"
   * - Grouped toast uses ""
   */
  missing?: string;
  /**
   * When true, rounds down to the largest active unit.
   * - 13d 5h -> 13d
   * - 2h 14m -> 2h
   * - 14m -> 14m
   */
  compactRounded?: boolean;
  /**
   * When set with compactRounded, render the largest active unit with this
   * many decimal places instead of the default integer-day / half-hour steps.
   */
  decimals?: number;
}

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

/**
 * Format a reset countdown for toast display.
 *
 * Returns human-readable time like "2d 5h" or "3h 45m".
 * When reset time is in the past or invalid, returns "reset".
 */
export function formatResetCountdown(iso?: string, opts?: FormatResetCountdownOptions): string {
  if (!iso) return opts?.missing ?? "";
  const resetDate = new Date(iso);
  const now = new Date();
  const diffMs = resetDate.getTime() - now.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return "reset";

  const diffMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(diffMinutes / 1440);
  const hours = Math.floor((diffMinutes % 1440) / 60);
  const minutes = diffMinutes % 60;

  if (opts?.compactRounded) {
    const decimals = opts.decimals;
    if (isResetTimeDecimals(decimals)) {
      if (days > 0) return `${(diffMs / MS_PER_DAY).toFixed(decimals)}d`;
      const formattedHours = (diffMs / MS_PER_HOUR).toFixed(decimals);
      if (Number(formattedHours) > 0) return `${formattedHours}h`;
      return `${Math.max(1, Math.ceil(diffMs / 60_000))}m`;
    }

    if (days > 0) return `${days}d`;
    const halfHours = Math.ceil(diffMinutes / 30);
    const h = Math.floor(halfHours / 2);
    if (h > 0) return halfHours % 2 === 1 ? `${h}.5h` : `${h}h`;
    return `0.5h`;
  }

  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${minutes}m`;
}

export const MAX_RESET_TIME_DECIMALS = 4;

export function isResetTimeDecimals(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_RESET_TIME_DECIMALS
  );
}

// =============================================================================
// Pro-rata burn-rate indicator
// =============================================================================
//
// Renders a signed percentage that compares actual usage against the linear
// pro-rata expectation for the elapsed fraction of a quota window. The
// grouped renderer hoists the indicator onto the provider header line
// (e.g. "[OpenAI] (Pro)*        (+25%)") so users can see at a glance
// whether they are burning quota faster or slower than the pace implied by
// the window's remaining time. The same pacing math feeds the "% done"
// window-elapsed annotation on grouped rows.

const MS_PER_MINUTE = 60_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const MS_PER_MONTH_APPROX = 30 * MS_PER_DAY;
const MS_PER_YEAR_APPROX = 365 * MS_PER_DAY;

/**
 * Options for `formatProRataIndicator`.
 */
export interface FormatProRataIndicatorOptions {
  /**
   * Master toggle. When false, always returns "".
   * Default: true (matches DEFAULT_CONFIG.showProRataIndicator).
   */
  enabled?: boolean;
  /**
   * Override the "now" timestamp for deterministic tests.
   * Default: Date.now().
   */
  nowMs?: number;
  /**
   * Decimal resolution of the signed delta, matching `percentDecimals`.
   * Default: 0 (integer, e.g. "+25%").
   */
  decimals?: number;
}

/**
 * Infer the total duration of a quota window in milliseconds from the
 * entry's label/name text. Returns null when the window kind cannot be
 * inferred (e.g. "MCP", "Code Review", or unrecognized strings).
 *
 * Order matters: more specific patterns (5h, rolling) are tested before
 * generic ones (hourly, hour) to avoid mis-classification.
 *
 * Monthly and yearly durations are approximations (30 / 365 days). Most
 * providers align resets to calendar boundaries, but the linear pro-rata
 * math is close enough for an at-a-glance burn-rate indicator.
 */
export function inferWindowDurationMs(params: { label?: string; name?: string }): number | null {
  const label = params.label?.trim().replace(/:+$/u, "").trim() ?? "";
  const name = params.name?.trim() ?? "";
  const text = `${label} ${name}`.toLowerCase();

  if (/\b(?:rpm|per minute|minute|minutes)\b/u.test(text)) return MS_PER_MINUTE;
  if (/\b(?:rolling|5h|5 h|5-hour|5 hour|five-hour|five hour)\b/u.test(text))
    return 5 * MS_PER_HOUR;
  if (/\b(?:hourly|1h|1 h|1-hour|1 hour|hour)\b/u.test(text)) return MS_PER_HOUR;
  if (/\b(?:daily|1d|1 d|1-day|1 day|day)\b/u.test(text)) return MS_PER_DAY;
  if (/\b(?:7d|7 d|7-day|7 day|weekly|week)\b/u.test(text)) return MS_PER_WEEK;
  if (/\b(?:monthly|month)\b/u.test(text)) return MS_PER_MONTH_APPROX;
  if (/\b(?:yearly|annual|annually|year)\b/u.test(text)) return MS_PER_YEAR_APPROX;

  return null;
}

/**
 * Signed pro-rata burn-rate delta in percentage points: actual usage minus
 * the linear-pace expected usage at the current elapsed fraction of the
 * window. Positive means burning faster than pace. Undefined when the
 * window duration is unknown or the reset time is missing/past/invalid —
 * the same conditions that suppress the textual indicator.
 */
export function computeProRataDeltaPct(
  entry: { percentRemaining?: number; resetTimeIso?: string; label?: string; name?: string },
  nowMs?: number,
): number | undefined {
  return resolveWindowPacing(entry, nowMs)?.deltaPct;
}

/**
 * Percent of a quota window's time that has elapsed (the linear pace the
 * pro-rata delta compares actual usage against). Rendered as the "% done"
 * annotation on grouped rows, stacked over the bar's "% used"/"% left"
 * suffix so time progress and quota progress compare vertically.
 * Undefined when the window duration is unknown or the reset time is
 * missing/past/invalid.
 */
export function windowElapsedPercent(
  entry: { percentRemaining?: number; resetTimeIso?: string; label?: string; name?: string },
  nowMs?: number,
): number | undefined {
  return resolveWindowPacing(entry, nowMs)?.expectedUsagePct;
}

/** Resolved linear pacing facts for one quota window, or undefined. */
function resolveWindowPacing(
  entry: { percentRemaining?: number; resetTimeIso?: string; label?: string; name?: string },
  nowMs?: number,
): { expectedUsagePct: number; deltaPct: number } | undefined {
  if (!entry.resetTimeIso) return undefined;
  if (entry.percentRemaining === undefined) return undefined;

  const durationMs = inferWindowDurationMs({ label: entry.label, name: entry.name });
  if (durationMs === null) return undefined;

  const resetMs = new Date(entry.resetTimeIso).getTime();
  if (!Number.isFinite(resetMs)) return undefined;

  const now = typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now();
  const remainingMs = resetMs - now;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return undefined;

  const elapsedMs = Math.max(0, Math.min(durationMs, durationMs - remainingMs));
  const expectedUsagePct = (elapsedMs / durationMs) * 100;
  const actualUsagePct = 100 - entry.percentRemaining;
  const deltaPct = actualUsagePct - expectedUsagePct;

  return Number.isFinite(deltaPct) ? { expectedUsagePct, deltaPct } : undefined;
}

/**
 * Hours until a reset time; undefined when missing, invalid, or past.
 */
export function hoursUntilReset(
  resetTimeIso: string | undefined,
  nowMs?: number,
): number | undefined {
  if (!resetTimeIso) return undefined;
  const resetMs = new Date(resetTimeIso).getTime();
  if (!Number.isFinite(resetMs)) return undefined;
  const now = typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now();
  const remainingMs = resetMs - now;
  return Number.isFinite(remainingMs) && remainingMs > 0 ? remainingMs / 3_600_000 : undefined;
}

/**
 * Metrics a bar theme spec's conditions evaluate against, derived from one
 * quota entry.
 */
export function barThemeMetricsForEntry(
  entry: { percentRemaining?: number; resetTimeIso?: string; label?: string; name?: string },
  nowMs?: number,
): BarThemeMetrics {
  return {
    ...(entry.percentRemaining !== undefined
      ? {
          percentRemaining: entry.percentRemaining,
          usedPercent: 100 - entry.percentRemaining,
        }
      : {}),
    ...(computeProRataDeltaPct(entry, nowMs) !== undefined
      ? { proRataDeltaPct: computeProRataDeltaPct(entry, nowMs) }
      : {}),
    ...(hoursUntilReset(entry.resetTimeIso, nowMs) !== undefined
      ? { hoursRemaining: hoursUntilReset(entry.resetTimeIso, nowMs) }
      : {}),
  };
}

/**
 * Compute and format the pro-rata burn-rate indicator for a quota entry.
 *
 * Returns a string like "+25%" / "-10%" / "+0%", or "" when the indicator
 * is disabled, the window duration is unknown, or the reset time is
 * missing/invalid.
 *
 * The value is always signed ("+" for non-negative, "-" for negative) and
 * rounded to the requested decimal resolution.
 */
export function formatProRataIndicator(
  entry: { percentRemaining?: number; resetTimeIso?: string; label?: string; name?: string },
  opts?: FormatProRataIndicatorOptions,
): string {
  if (opts?.enabled === false) return "";
  const deltaPct = computeProRataDeltaPct(entry, opts?.nowMs);
  if (deltaPct === undefined) return "";

  const decimals = opts?.decimals ?? 0;
  if (decimals > 0) {
    return `${deltaPct >= 0 ? "+" : "-"}${Math.abs(deltaPct).toFixed(decimals)}%`;
  }
  const rounded = Math.round(deltaPct);
  const sign = rounded >= 0 ? "+" : "-";
  return `${sign}${Math.abs(rounded)}%`;
}

/**
 * Format the window-elapsed pace annotation ("19% done") for a grouped
 * row's label line. Returns "" when the elapsed fraction cannot be
 * computed, matching the conditions that suppress the pro-rata indicator.
 */
export function formatWindowElapsedLabel(
  entry: { percentRemaining?: number; resetTimeIso?: string; label?: string; name?: string },
  opts?: { nowMs?: number; decimals?: number },
): string {
  const elapsed = windowElapsedPercent(entry, opts?.nowMs);
  if (elapsed === undefined) return "";
  const decimals = opts?.decimals ?? 0;
  const displayed = decimals > 0 ? elapsed.toFixed(decimals) : String(Math.round(elapsed));
  return `${displayed}% done`;
}
