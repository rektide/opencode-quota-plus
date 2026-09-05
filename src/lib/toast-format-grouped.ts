/**
 * Grouped toast formatter.
 *
 * Renders quota entries grouped by provider/account with compact bars.
 * Designed to feel like a status dashboard while still respecting OpenCode toast width.
 */

import { interpretAccountingRow } from "./accounting-format.js";
import { type BarThemeSpec, resolveBarTheme } from "./bar-theme.js";
import type { QuotaToastEntry, QuotaToastError, SessionTokensData } from "./entries.js";
import { isPercentEntry } from "./entries.js";
import {
  bar,
  barThemeMetricsForEntry,
  displayedPercentLabelWidth,
  formatDisplayedPercentLabel,
  formatProRataIndicator,
  formatQuotaErrorSection,
  formatResetCountdown,
  formatWindowElapsedLabel,
  isResetTimeDecimals,
  padLeft,
  padRight,
  resolveDisplayedPercent,
} from "./format-utils.js";
import { normalizeGroupedQuotaEntries } from "./grouped-entry-normalization.js";
import { formatGroupedHeader } from "./grouped-header-format.js";
import { classifyQuotaWindowText, type QuotaWindowKind } from "./quota-entry-display.js";
import { renderSessionTokensLines } from "./session-tokens-format.js";
import type { QuotaToastConfig } from "./types.js";

function normalizeLabelText(value?: string): string {
  return value?.trim().replace(/:+$/u, "").trim() ?? "";
}

const GROUPED_WINDOW_LABELS: Readonly<Record<QuotaWindowKind, string>> = {
  rpm: "RPM",
  five_hour: "5h",
  hour: "Hourly",
  week: "Weekly",
  day: "Daily",
  month: "Monthly",
  year: "Yearly",
  mcp: "MCP",
  code_review: "Code Review",
};

function extractWindowLabel(text: string): string | null {
  const kind = classifyQuotaWindowText(text);
  return kind ? GROUPED_WINDOW_LABELS[kind] : null;
}

function resolveGroupedRowLabel(entry: QuotaToastEntry, semanticLabel: string): string {
  if (entry.semantic) return semanticLabel;

  const rawLabel = normalizeLabelText(entry.label);
  const fromLabel = extractWindowLabel(rawLabel);
  if (fromLabel) return fromLabel;
  if (rawLabel) return rawLabel;

  const metricLabel = normalizeLabelText(entry.metricLabel);
  const fromMetricLabel = extractWindowLabel(metricLabel);
  if (fromMetricLabel) return fromMetricLabel;
  if (metricLabel) return metricLabel;

  const fromName = extractWindowLabel(entry.name);
  if (fromName) return fromName;

  return normalizeLabelText(entry.group) || "Quota window";
}

/** Shared per-row layout inputs; compute once per render for aligned columns. */
export type GroupedRowLayoutParams = {
  maxWidth: number;
  isTiny: boolean;
  separator: string;
  percentCol: number;
  percentValueCol: number;
  barWidth: number;
  timeCol: number;
  percentDisplayMode?: QuotaToastConfig["percentDisplayMode"];
  accountingDetail?: QuotaToastConfig["accountingDetail"];
  resetTimeDecimals?: number;
  percentDecimals?: number;
  showProRataIndicator?: boolean;
  /** Raw bar theme spec; resolved per entry so conditionals can apply. */
  themeSpec?: BarThemeSpec;
  /** Frozen clock for deterministic conditional evaluation. */
  nowMs?: number;
};

export function createGroupedRowLayoutParams(params: {
  entries?: QuotaToastEntry[];
  layout: { maxWidth: number; narrowAt: number; tinyAt: number };
  percentDisplayMode?: QuotaToastConfig["percentDisplayMode"];
  accountingDetail?: QuotaToastConfig["accountingDetail"];
  resetTimeDecimals?: number;
  percentDecimals?: number;
  showProRataIndicator?: boolean;
  barTheme?: BarThemeSpec;
  nowMs?: number;
}): GroupedRowLayoutParams {
  const { maxWidth, narrowAt, tinyAt } = params.layout;
  const isTiny = maxWidth <= tinyAt;
  const isNarrow = !isTiny && maxWidth <= narrowAt;
  const separator = "  ";
  const percentCol = Math.max(
    displayedPercentLabelWidth(params.percentDecimals),
    ...(params.entries ?? [])
      .filter(isPercentEntry)
      .map(
        (entry) =>
          formatDisplayedPercentLabel(
            entry.percentRemaining,
            params.percentDisplayMode,
            params.percentDecimals,
          ).length,
      ),
  );

  return {
    maxWidth,
    isTiny,
    separator,
    percentCol,
    percentValueCol: percentCol,
    barWidth: Math.max(10, maxWidth - separator.length - percentCol),
    timeCol: isTiny ? 6 : isNarrow ? 7 : 7,
    percentDisplayMode: params.percentDisplayMode,
    accountingDetail: params.accountingDetail,
    resetTimeDecimals: params.resetTimeDecimals,
    percentDecimals: params.percentDecimals,
    showProRataIndicator: params.showProRataIndicator,
    themeSpec: params.barTheme,
    nowMs: params.nowMs,
  };
}

/** Formats one entry's row line(s) without any group header. */
export function formatGroupedQuotaEntryLines(
  entry: QuotaToastEntry,
  params: GroupedRowLayoutParams,
): string[] {
  const { isTiny, separator, percentCol, percentValueCol, barWidth, timeCol, maxWidth } = params;

  const interpretation = interpretAccountingRow(entry, {
    booleanWording: "semantic",
    ...(!isTiny
      ? {
          basis:
            (params.accountingDetail ?? "summary") === "detailed"
              ? ({ kind: "detailed" } as const)
              : ({
                  kind: "summary",
                  mode: params.percentDisplayMode ?? "remaining",
                } as const),
        }
      : {}),
  });
  const right = entry.right ? entry.right.trim() : "";

  if (interpretation.display.kind === "value") {
    const isAtomicValue = interpretation.display.entryKind !== "value";
    const label = entry.semantic ? interpretation.label : entry.label?.trim() || entry.name;
    const timeStr = entry.resetTimeIso
      ? formatResetCountdown(entry.resetTimeIso, {
          compactRounded: true,
          decimals: params.resetTimeDecimals,
        })
      : "";
    const value =
      interpretation.display.entryKind === "value"
        ? interpretation.display.text.trim()
        : interpretation.display.text;

    if (isAtomicValue) {
      const suffix = [value, timeStr].filter(Boolean).join(separator);
      if (suffix.length > maxWidth) {
        return value.length <= maxWidth ? [padLeft(value, maxWidth)] : [];
      }
      const availableLabelWidth = maxWidth - (suffix ? separator.length + suffix.length : 0);
      if (availableLabelWidth <= 0) {
        return [padLeft(suffix, maxWidth)];
      }
      const leftText = label.slice(0, availableLabelWidth).trimEnd();
      return [`${padRight(leftText, availableLabelWidth)}${suffix ? `${separator}${suffix}` : ""}`];
    }

    if (isTiny) {
      // Tiny: "label  time  value"
      const timeWidth = isResetTimeDecimals(params.resetTimeDecimals)
        ? Math.max(timeCol, timeStr.length)
        : timeCol;
      const valueCol = Math.min(value.length, Math.max(6, percentCol + 2));
      const tinyNameCol = Math.max(
        1,
        maxWidth - separator.length - timeWidth - separator.length - valueCol,
      );
      const leftText = right ? `${label} ${right}` : label;
      const line = [
        padRight(leftText, tinyNameCol),
        padLeft(timeStr, timeWidth),
        padLeft(value, valueCol),
      ].join(separator);
      return [line.slice(0, maxWidth)];
    }

    // Non-tiny: single line (no bar)
    const timeWidth = Math.max(timeStr.length, timeCol);
    const valueWidth = Math.max(value.length, 6);
    const leftMax = Math.max(
      1,
      barWidth - separator.length - valueWidth - separator.length - timeWidth,
    );
    const leftText = right ? `${label} ${right}` : label;
    return [
      (
        padRight(leftText, leftMax) +
        separator +
        padLeft(value, valueWidth) +
        separator +
        padLeft(timeStr, timeWidth)
      ).slice(0, maxWidth),
    ];
  }

  const label = resolveGroupedRowLabel(entry, interpretation.label);

  // A "value row" has no explicit label and carries a `right` summary to be
  // shown instead of a name. When present, the `right` is justified to the
  // edges of line 1 (left + right) and no reset countdown is shown.
  const isValueRow = !entry.label?.trim() && !entry.metricLabel?.trim() && !!entry.right?.trim();
  const displayedPercent = resolveDisplayedPercent(
    interpretation.display.percentRemaining,
    params.percentDisplayMode,
  );
  const percentLabel = formatDisplayedPercentLabel(
    interpretation.display.percentRemaining,
    params.percentDisplayMode,
    params.percentDecimals,
  );

  // Percent entries
  // Show reset countdown whenever quota is not fully available.
  // (i.e., any usage at all, or depleted)
  const countdown =
    interpretation.display.percentRemaining < 100
      ? formatResetCountdown(entry.resetTimeIso, {
          compactRounded: true,
          decimals: params.resetTimeDecimals,
        })
      : "";
  // The pro-rata burn-rate indicator lives on the provider header line
  // (see formatGroupedProviderHeaderLine); the row instead carries the
  // window-elapsed pace annotation ("19% done") after the countdown, so
  // time progress stacks directly over the bar line's "% used"/"% left".
  // The elapsed annotation is suppressed in tiny layouts and dropped
  // first when the line would overflow.
  const doneLabel = !isTiny
    ? formatWindowElapsedLabel(entry, {
        nowMs: params.nowMs,
        decimals: params.percentDecimals,
      })
    : "";
  const fullTimeStr = [countdown, doneLabel].filter(Boolean).join(" ");
  const compactLineWidth = label.length + separator.length + fullTimeStr.length;
  const timeStr = compactLineWidth <= maxWidth ? fullTimeStr : countdown;

  if (isTiny) {
    // Tiny: single line with name/time/percent (or just the right summary)
    const timeWidth = isResetTimeDecimals(params.resetTimeDecimals)
      ? Math.max(timeCol, timeStr.length)
      : timeCol;
    const visibleBarSuffix = percentLabel.slice(0, percentValueCol);
    const nameText = isValueRow ? entry.right!.trim() : label;
    const tinyNameCol = Math.max(
      1,
      maxWidth - separator.length - timeWidth - separator.length - percentValueCol,
    );
    const line = [
      padRight(nameText, tinyNameCol),
      padLeft(timeStr, timeWidth),
      padLeft(visibleBarSuffix, percentValueCol),
    ].join(separator);
    return [line.slice(0, maxWidth)];
  }

  const lines: string[] = [];
  if (isValueRow) {
    // Line 1: right summary. Two segments -> justified to the edges;
    // a single segment -> right-aligned. No name, no reset.
    const text = entry.right!.trim();
    const parts = text.split(/\s{2,}/u).filter(Boolean);
    if (parts.length >= 2) {
      const left = parts[0] ?? "";
      const rightText = parts.slice(1).join("  ");
      const sep = "  ";
      const leftWidth = Math.max(1, maxWidth - sep.length - rightText.length);
      lines.push((padRight(left, leftWidth) + sep + rightText).slice(0, maxWidth));
    } else {
      lines.push(padLeft(text, maxWidth));
    }
  } else {
    // Line 1: label + time at end
    const timeWidth = Math.max(timeStr.length, timeCol);
    const leftMax = Math.max(1, maxWidth - separator.length - timeWidth);
    lines.push(
      (padRight(label, leftMax) + separator + padLeft(timeStr, timeWidth)).slice(0, maxWidth),
    );
  }

  // Line 2: bar + percent
  // Line 2: bar + percent
  const barCell = bar(displayedPercent, barWidth, {
    theme: resolveBarTheme(params.themeSpec, barThemeMetricsForEntry(entry, params.nowMs)).chars,
    quiet: entry.quiet === true,
  });
  const suffixCell = padLeft(percentLabel.slice(0, percentValueCol), percentValueCol);
  lines.push([barCell, suffixCell].join(separator));

  if (interpretation.basis) {
    const candidates =
      interpretation.basis.kind === "detailed"
        ? interpretation.basis.facts.map((fact) => fact.text)
        : interpretation.basis.text
          ? [interpretation.basis.text]
          : [];
    let detailLine = "";
    for (const candidate of candidates) {
      const next = detailLine ? `${detailLine} | ${candidate}` : candidate;
      if (next.length > maxWidth) break;
      detailLine = next;
    }
    if (detailLine) lines.push(detailLine);
  }
  return lines;
}

/**
 * Provider header line with the group's pro-rata indicators hoisted to the
 * right edge, space-separated. With multiple windows the top-most row's
 * indicator sits right-most, so the header annotations map onto row order
 * reading right-to-left. Without computable indicators the header is the
 * plain normalized group title.
 */
export function formatGroupedProviderHeaderLine(params: {
  group: string;
  entries: readonly QuotaToastEntry[];
  rowParams: GroupedRowLayoutParams;
}): string {
  const { maxWidth } = params.rowParams;
  const header = formatGroupedHeader(params.group);
  const indicators = params.entries
    .map((entry) =>
      formatProRataIndicator(entry, {
        enabled: params.rowParams.showProRataIndicator,
        decimals: params.rowParams.percentDecimals,
        nowMs: params.rowParams.nowMs,
      }),
    )
    .filter((text) => text.length > 0);
  if (indicators.length === 0) return header.slice(0, maxWidth);

  const right = indicators.reverse().join(" ");
  const headerWidth = Math.max(1, maxWidth - right.length - 1);
  return (padRight(header, headerWidth) + " " + right).slice(0, maxWidth);
}

export function formatQuotaRowsGrouped(params: {
  layout?: {
    maxWidth: number;
    narrowAt: number;
    tinyAt: number;
  };
  entries?: QuotaToastEntry[];
  errors?: QuotaToastError[];
  percentDisplayMode?: QuotaToastConfig["percentDisplayMode"];
  accountingDetail?: QuotaToastConfig["accountingDetail"];
  resetTimeDecimals?: number;
  percentDecimals?: number;
  showProRataIndicator?: boolean;
  errorDetail?: boolean;
  barTheme?: BarThemeSpec;
  nowMs?: number;
  sessionTokens?: SessionTokensData;
}): string {
  const layout = params.layout ?? { maxWidth: 50, narrowAt: 42, tinyAt: 32 };
  const maxWidth = layout.maxWidth;

  const rowParams = createGroupedRowLayoutParams({
    entries: params.entries,
    layout,
    percentDisplayMode: params.percentDisplayMode,
    accountingDetail: params.accountingDetail,
    resetTimeDecimals: params.resetTimeDecimals,
    percentDecimals: params.percentDecimals,
    showProRataIndicator: params.showProRataIndicator,
    barTheme: params.barTheme,
    nowMs: params.nowMs,
  });

  const lines: string[] = [];

  // Group entries in stable order.
  const groupOrder: string[] = [];
  const groups = new Map<string, QuotaToastEntry[]>();
  for (const entry of normalizeGroupedQuotaEntries(params.entries ?? [], "toast")) {
    const list = groups.get(entry.group);
    if (list) list.push(entry);
    else {
      groupOrder.push(entry.group);
      groups.set(entry.group, [entry]);
    }
  }

  for (let gi = 0; gi < groupOrder.length; gi++) {
    const g = groupOrder[gi]!;
    const list = groups.get(g) ?? [];
    if (gi > 0) lines.push("");

    lines.push(formatGroupedProviderHeaderLine({ group: g, entries: list, rowParams }));

    for (const entry of list) {
      lines.push(...formatGroupedQuotaEntryLines(entry, rowParams));
    }
  }

  for (const err of params.errors ?? []) {
    if (lines.length > 0) lines.push("");
    const section = formatQuotaErrorSection({
      label: err.label,
      message: err.message,
      maxWidth,
    });
    lines.push(section.collapsed);
    if (params.errorDetail) lines.push(...section.detail);
  }

  // Add session token summary (if data available and non-empty)
  const tokenLines = renderSessionTokensLines(params.sessionTokens, { maxWidth });
  if (tokenLines.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(...tokenLines);
  }

  return lines.join("\n");
}
