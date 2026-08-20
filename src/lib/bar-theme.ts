/**
 * Quota bar themes.
 *
 * Named character presets for the quota progress bar, so the filled/empty
 * glyphs (and a quieter filled glyph for quiet rows) can be tuned per taste
 * without touching layout logic. Themes are pure character data: any surface
 * that renders the bar (TUI sidebar, toasts, CLI show) picks them up
 * identically, including quiet rows on surfaces without per-row color
 * support.
 */

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
