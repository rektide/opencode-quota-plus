/**
 * Structured sidebar composition.
 *
 * The host slot tree places whole plugin surfaces; within the plugin's
 * sidebar slot this module composes one section per provider and one row
 * per quota entry, so display policy (quiet rows, per-section styling,
 * future collapse) has stable structure to attach to. Flattened output
 * stays consistent with the panel-lines formatter.
 */

import { sanitizeQuotaRenderData } from "./display-sanitize.js";
import { formatQuotaRows } from "./format.js";
import { groupQuotaEntries } from "./grouped-entry-normalization.js";
import { formatGroupedHeader } from "./grouped-header-format.js";
import { getQuotaFormatStyleDefinition, type QuotaFormatStyle } from "./quota-format-style.js";
import type { QuotaRenderData } from "./quota-render-data.js";
import {
  createGroupedRowLayoutParams,
  formatGroupedQuotaEntryLines,
} from "./toast-format-grouped.js";
import { TUI_SIDEBAR_LAYOUT } from "./tui-sidebar-format.js";
import type { QuotaToastConfig } from "./types.js";

export interface SidebarQuotaSectionRow {
  /** Formatted line(s) for one quota entry (tiny layouts collapse to one). */
  lines: string[];
  /** Entry-visibility quiet hint: render subdued where supported. */
  quiet: boolean;
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
};

/**
 * Flattens sections to display lines, inserting a blank separator line
 * between sections — matching the pre-sectioned panel output where
 * providers, error rows, and session tokens were visually grouped.
 */
export function flattenSidebarQuotaSections(
  sections: readonly SidebarQuotaSection[],
): SidebarQuotaFlatLine[] {
  const lines: SidebarQuotaFlatLine[] = [];
  for (const section of sections) {
    const body: SidebarQuotaFlatLine[] = [
      ...(section.headerLine ? [{ line: section.headerLine, quiet: false }] : []),
      ...section.rows.flatMap((row) => row.lines.map((line) => ({ line, quiet: row.quiet }))),
    ];
    if (body.length === 0) continue;
    if (lines.length > 0) lines.push({ line: "", quiet: false });
    lines.push(...body);
  }
  return lines;
}

export type SidebarQuotaSectionConfig = Pick<
  QuotaToastConfig,
  "formatStyle" | "percentDisplayMode" | "resetTimeDecimals" | "showProRataIndicator"
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
      headerLine: explicit ? formatGroupedHeader(group) : null,
      rows: entries.map((entry) => ({
        lines:
          renderer === "grouped"
            ? formatGroupedQuotaEntryLines(
                explicit ? { ...entry, group: undefined } : entry,
                rowParams,
              )
            : formatClassicEntryLines({ entry, config: params.config }),
        quiet: entry.quiet === true,
      })),
    });
  }

  for (const error of data.errors) {
    sections.push({
      key: `error:${error.label}:${error.message}`,
      headerLine: null,
      rows: [{ lines: [`${error.label}: ${error.message}`], quiet: false }],
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
