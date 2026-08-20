/**
 * Color name resolution for quota rows.
 *
 * A color layer in a composed bar theme names a color; this module resolves
 * that name to a concrete color at render time, in priority order:
 *
 * 1. host theme tokens (`text`, `textMuted`, `success`, `warning`, `error`,
 *    `primary`, `syntaxKeyword`, `diffAdded`, ...) — looked up dynamically so
 *    any token the host theme defines works,
 * 2. common CSS color names (see CSS_NAMED_COLORS),
 * 3. `#rrggbb` / `#rgb` hex literals.
 *
 * `"quiet"` is just a name: it resolves to the host's `textMuted` token,
 * which is what entry-visibility quiet rows use. Surfaces without per-row
 * color support (toasts, terminal show) ignore color layers entirely.
 */

export type HostThemeTokenSource = Readonly<Record<string, unknown>>;

/**
 * Color tokens OpenCode's TUI theme defines (v1 token set). These resolve
 * dynamically against the live host theme at render time; listing them
 * statically lets spec validation accept them without the theme in hand.
 */
export const HOST_THEME_TOKEN_NAMES: readonly string[] = [
  "primary",
  "secondary",
  "accent",
  "error",
  "warning",
  "success",
  "info",
  "text",
  "textMuted",
  "selectedListItemText",
  "background",
  "backgroundPanel",
  "backgroundElement",
  "backgroundMenu",
  "border",
  "borderActive",
  "borderSubtle",
  "diffAdded",
  "diffRemoved",
  "diffContext",
  "diffHunkHeader",
  "diffHighlightAdded",
  "diffHighlightRemoved",
  "diffAddedBg",
  "diffRemovedBg",
  "diffContextBg",
  "diffLineNumber",
  "diffAddedLineNumberBg",
  "diffRemovedLineNumberBg",
  "markdownText",
  "markdownHeading",
  "markdownLink",
  "markdownLinkText",
  "markdownCode",
  "markdownBlockQuote",
  "markdownEmph",
  "markdownStrong",
  "markdownHorizontalRule",
  "markdownListItem",
  "markdownListEnumeration",
  "markdownImage",
  "markdownImageText",
  "markdownCodeBlock",
  "syntaxComment",
  "syntaxKeyword",
  "syntaxFunction",
  "syntaxVariable",
  "syntaxString",
  "syntaxNumber",
  "syntaxType",
  "syntaxOperator",
  "syntaxPunctuation",
];

/** Common CSS color names with exact RGB values. */
export const CSS_NAMED_COLORS: Readonly<Record<string, string>> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  maroon: "#800000",
  navy: "#000080",
  olive: "#808000",
  purple: "#800080",
  teal: "#008080",
  orange: "#ffa500",
  pink: "#ffc0cb",
  brown: "#a52a2a",
  gold: "#ffd700",
  crimson: "#dc143c",
  salmon: "#fa8072",
  coral: "#ff7f50",
  tomato: "#ff6347",
  indigo: "#4b0082",
  violet: "#ee82ee",
  turquoise: "#40e0d0",
  skyblue: "#87ceeb",
  lightblue: "#add8e6",
  lightgray: "#d3d3d3",
  lightgrey: "#d3d3d3",
  darkgray: "#a9a9a9",
  darkgrey: "#a9a9a9",
  dimgray: "#696969",
  dimgrey: "#696969",
  lime: "#00ff00",
  limegreen: "#32cd32",
  seagreen: "#2e8b57",
  forestgreen: "#228b22",
  darkgreen: "#006400",
  khaki: "#f0e68c",
  beige: "#f5f5dc",
  ivory: "#fffff0",
  hotpink: "#ff69b4",
  orchid: "#da70d6",
  plum: "#dda0dd",
  tan: "#d2b48c",
  sienna: "#a0522d",
  chocolate: "#d2691e",
  steelblue: "#4682b4",
  royalblue: "#4169e1",
  slategray: "#708090",
  slate: "#708090",
};

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const HOST_THEME_TOKEN_NAME_SET: ReadonlySet<string> = new Set(HOST_THEME_TOKEN_NAMES);

export function isThemeColorName(name: string): boolean {
  if (!name) return false;
  if (name === "quiet") return true;
  if (HOST_THEME_TOKEN_NAME_SET.has(name)) return true;
  if (HEX_COLOR_PATTERN.test(name)) return true;
  return Object.hasOwn(CSS_NAMED_COLORS, name.toLowerCase());
}

/**
 * Resolves a color name to an RGB triplet, without depending on the host
 * theme. Returns null for host-token names — those need `resolveThemeColor`
 * with the live theme (or a token map).
 */
export function resolveStaticColorTriplet(name: string): readonly [number, number, number] | null {
  if (name === "quiet") return null;
  const hex = CSS_NAMED_COLORS[name.toLowerCase()];
  return hex ? hexTriplet(hex) : HEX_COLOR_PATTERN.test(name) ? hexTriplet(name) : null;
}

function hexTriplet(hex: string): [number, number, number] | null {
  const normalized =
    hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  if (![r, g, b].every((value) => Number.isFinite(value))) return null;
  return [r, g, b];
}

/**
 * Resolves a color name against the host theme plus the static tables.
 *
 * `toRgba` converts an RGB triplet to the surface's color representation
 * (e.g. opentui's RGBA); returning undefined means "no color found".
 */
export function resolveThemeColor<Color>(
  name: string | undefined,
  hostTheme: HostThemeTokenSource | undefined,
  toRgba: (triplet: readonly [number, number, number]) => Color,
): Color | undefined {
  if (!name) return undefined;

  // Host theme tokens first: dynamic lookup keeps every token the host
  // defines addressable (text, textMuted, success, syntaxKeyword, ...).
  // "quiet" is the canonical muted-token alias.
  const token = name === "quiet" ? "textMuted" : name;
  const hostValue = hostTheme?.[token];
  if (hostValue != null && !Array.isArray(hostValue) && typeof hostValue !== "number") {
    return hostValue as Color;
  }

  const triplet = resolveStaticColorTriplet(name);
  return triplet ? toRgba(triplet) : undefined;
}
