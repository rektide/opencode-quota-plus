/**
 * Structured sidebar composition.
 *
 * The host slot tree places whole plugin surfaces; within the plugin's
 * sidebar slot this module composes one section per provider and one row
 * per quota entry, so display policy (quiet rows, per-section styling,
 * future collapse) has stable structure to attach to. Flattened output
 * stays consistent with the panel-lines formatter.
 */

import { resolveBarTheme } from "./bar-theme.js";
import { sanitizeQuotaRenderData } from "./display-sanitize.js";
import { formatQuotaRows } from "./format.js";
import { barThemeMetricsForEntry, formatQuotaErrorSection } from "./format-utils.js";
import { groupQuotaEntries } from "./grouped-entry-normalization.js";
import { getQuotaFormatStyleDefinition, type QuotaFormatStyle } from "./quota-format-style.js";
import type { QuotaRenderData } from "./quota-render-data.js";
import {
  createGroupedRowLayoutParams,
  formatGroupedProviderHeaderLine,
  formatGroupedQuotaEntryLines,
} from "./toast-format-grouped.js";
import { TUI_SIDEBAR_LAYOUT, TUI_SIDEBAR_MAX_WIDTH } from "./tui-sidebar-format.js";
import type { QuotaToastConfig } from "./types.js";

export interface SidebarQuotaSectionRow {
  /** Formatted line(s) for one quota entry (tiny layouts collapse to one). */
  lines: string[];
  /** Expandable error detail lines, revealed on demand where supported. */
  detailLines?: string[];
  /** Entry-visibility quiet hint: render subdued where supported. */
  quiet: boolean;
  /** Color layer name from the entry's resolved bar theme, if any. */
  color?: string;
}

export interface SidebarQuotaSection {
  /** Stable section identity: provider group or trailing meta key. */
  key: string;
  /** Provider header line, or null when row names carry identity. */
  headerLine: string | null;
  rows: SidebarQuotaSectionRow[];
  /** True for trailing error rows. */
  error?: boolean;
  /** True for trailing non-provider sections (session tokens). */
  meta?: boolean;
}

export type SidebarQuotaFlatLine = {
  line: string;
  quiet: boolean;
  color?: string;
  /** Error detail lines shown when this row is expanded. */
  detailLines?: string[];
  /** Stable identity for interactive expansion of this row. */
  toggleKey?: string;
};

/**
 * Flattens sections to display lines, inserting a blank separator line
 * between sections — matching the pre-sectioned panel output where
 * providers, error rows, and session tokens were visually grouped.
 * Detail lines ride along on their row; callers decide whether to show
 * them, so the flattened collapsed stream stays identical to the
 * panel-lines formatter.
 */
export function flattenSidebarQuotaSections(
  sections: readonly SidebarQuotaSection[],
): SidebarQuotaFlatLine[] {
  const lines: SidebarQuotaFlatLine[] = [];
  let previousWasError = false;
  for (const section of sections) {
    const body: SidebarQuotaFlatLine[] = [
      ...(section.headerLine ? [{ line: section.headerLine, quiet: false }] : []),
      ...section.rows.flatMap((row) =>
        row.lines.map((line, index) => ({
          line,
          quiet: row.quiet,
          ...(row.color ? { color: row.color } : {}),
          ...(row.detailLines && index === 0 ? { detailLines: row.detailLines } : {}),
          ...(row.detailLines && index === 0 && section.key ? { toggleKey: section.key } : {}),
        })),
      ),
    ];
    if (body.length === 0) continue;
    // Error sections pack together without separator blanks; the blank
    // before the first error still sets the block off from quota rows.
    if (lines.length > 0 && !(section.error && previousWasError)) {
      lines.push({ line: "", quiet: false });
    }
    lines.push(...body);
    previousWasError = section.error === true;
  }
  return lines;
}

export type SidebarQuotaSectionConfig = Pick<
  QuotaToastConfig,
  "formatStyle" | "percentDisplayMode" | "resetTimeDecimals" | "showProRataIndicator" | "barTheme"
>;

function formatClassicEntryLines(params: {
  entry: QuotaRenderData["entries"][number];
  config: SidebarQuotaSectionConfig;
}): string[] {
  return formatQuotaRows({
    version: "1.0.0",
    layout: TUI_SIDEBAR_LAYOUT,
    entries: [params.entry],
    style: params.config.formatStyle,
    percentDisplayMode: params.config.percentDisplayMode,
    resetTimeDecimals: params.config.resetTimeDecimals,
    showProRataIndicator: params.config.showProRataIndicator,
    barTheme: params.config.barTheme,
  })
    .split("\n")
    .filter((line) => line.trim().length > 0);
}

export function buildSidebarQuotaSections(params: {
  data: QuotaRenderData;
  config: SidebarQuotaSectionConfig;
}): SidebarQuotaSection[] {
  const data = sanitizeQuotaRenderData(params.data);
  const sections: SidebarQuotaSection[] = [];

  const renderer = getQuotaFormatStyleDefinition(
    params.config.formatStyle as QuotaFormatStyle,
  ).renderer;
  const rowParams = createGroupedRowLayoutParams({
    entries: data.entries,
    layout: TUI_SIDEBAR_LAYOUT,
    percentDisplayMode: params.config.percentDisplayMode,
    resetTimeDecimals: params.config.resetTimeDecimals,
    showProRataIndicator: params.config.showProRataIndicator,
    barTheme: params.config.barTheme,
  });

  // Groups carrying explicit group metadata render a provider header;
  // single-window rows fold identity into their names, so no header.
  const explicitGroups = new Set(
    data.entries.map((entry) => entry.group?.trim()).filter((group): group is string => !!group),
  );

  for (const { group, entries } of groupQuotaEntries(data.entries, "toast")) {
    const explicit = explicitGroups.has(group);
    sections.push({
      key: group,
      headerLine: explicit ? formatGroupedProviderHeaderLine({ group, entries, rowParams }) : null,
      rows: entries.map((entry) => {
        const composed = resolveBarTheme(
          params.config.barTheme,
          barThemeMetricsForEntry(
            "percentRemaining" in entry
              ? entry
              : { ...entry, percentRemaining: 100, label: entry.label, name: entry.name },
          ),
        );
        return {
          lines:
            renderer === "grouped"
              ? formatGroupedQuotaEntryLines(
                  explicit ? { ...entry, group: undefined } : entry,
                  rowParams,
                )
              : formatClassicEntryLines({ entry, config: params.config }),
          quiet: entry.quiet === true,
          ...(composed.color ? { color: composed.color } : {}),
        };
      }),
    });
  }

  for (const error of data.errors) {
    // Error rows render dimmed with their detail hidden until expanded.
    const section = formatQuotaErrorSection({
      label: error.label,
      message: error.message,
      maxWidth: TUI_SIDEBAR_MAX_WIDTH,
    });
    sections.push({
      key: `error:${error.label}:${error.message}`,
      headerLine: null,
      rows: [
        {
          lines: [section.collapsed],
          ...(section.detail.length > 0 ? { detailLines: section.detail } : {}),
          quiet: true,
        },
      ],
      error: true,
    });
  }

  if (data.sessionTokens) {
    const tokenLines = formatQuotaRows({
      version: "1.0.0",
      layout: TUI_SIDEBAR_LAYOUT,
      entries: [],
      style: params.config.formatStyle,
      percentDisplayMode: params.config.percentDisplayMode,
      resetTimeDecimals: params.config.resetTimeDecimals,
      showProRataIndicator: params.config.showProRataIndicator,
      sessionTokens: data.sessionTokens,
    })
      .split("\n")
      .filter((line) => line.trim().length > 0);
    if (tokenLines.length > 0) {
      sections.push({
        key: "session-tokens",
        headerLine: null,
        rows: tokenLines.map((line) => ({ lines: [line], quiet: false })),
        meta: true,
      });
    }
  }

  return sections;
}
