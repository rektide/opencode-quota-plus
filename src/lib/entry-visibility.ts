/**
 * Entry visibility rules.
 *
 * Config-driven per-row display control for quota surfaces. Patterns select
 * entries by canonical provider and either the quota window (5h, MCP,
 * Weekly, ...) or the accounting row type (balance, budget, spend, ...):
 *
 *   "zai"                every Z.ai row
 *   "zai:mcp"            Z.ai MCP window only
 *   "zai:5h"             Z.ai five-hour window (window aliases accepted)
 *   "deepseek:balance"   DeepSeek balance row (accounting type)
 *   "*:mcp"              MCP windows across all providers
 *
 * Rules are applied in the shared render pipeline after provider fetch and
 * before style projection, so hidden rows cannot win single-window
 * selection and quiet rows render subdued wherever surfaces support it.
 */

import type { AccountingResultType, QuotaToastEntry } from "./entries.js";
import { getQuotaProviderShape, normalizeQuotaProviderId } from "./provider-metadata.js";
import { classifyQuotaWindowText, type QuotaWindowKind } from "./quota-entry-display.js";

export type EntryVisibilitySelector =
  | { kind: "all" }
  | { kind: "window"; window: QuotaWindowKind }
  | { kind: "accounting"; resultType: AccountingResultType };

export interface EntryVisibilityRule {
  /** Canonical quota provider id, or null for the wildcard provider. */
  providerId: string | null;
  selector: EntryVisibilitySelector;
  /** Original pattern, kept for diagnostics. */
  pattern: string;
}

export type EntryVisibilityPolicy = {
  hidden: EntryVisibilityRule[];
  quiet: EntryVisibilityRule[];
};

export interface EntryVisibilityIssue {
  pattern: string;
  message: string;
}

const ACCOUNTING_SELECTOR_SYNONYMS: Readonly<Record<string, AccountingResultType>> = {
  quota: "quota",
  ratelimit: "rate_limit",
  "rate-limit": "rate_limit",
  rate_limit: "rate_limit",
  usage: "usage",
  spend: "spend",
  budget: "budget",
  balance: "balance",
  status: "status",
};

function parseAccountingSelector(token: string): AccountingResultType | null {
  return ACCOUNTING_SELECTOR_SYNONYMS[token.trim().toLowerCase()] ?? null;
}

/**
 * Resolves a provider token to its canonical quota provider id.
 *
 * Catalog synonyms run through `normalizeQuotaProviderId`; display aliases
 * like "z.ai" or "opencode go" are canonicalized by shape lookup. Unknown
 * tokens pass through unchanged so custom provider ids keep working.
 */
function parseProviderToken(token: string): string {
  const trimmed = token.trim().toLowerCase();
  const normalized = normalizeQuotaProviderId(trimmed);
  if (getQuotaProviderShape(normalized)) return normalized;

  const stripped = normalized.replace(/[._\s]+/gu, "");
  if (getQuotaProviderShape(stripped)) return stripped;

  const hyphenated = normalized.replace(/[.\s_]+/gu, "-");
  if (getQuotaProviderShape(hyphenated)) return hyphenated;

  return normalized;
}

export function parseEntryVisibilityRule(pattern: string): EntryVisibilityRule | { error: string } {
  const trimmed = pattern.trim();
  if (!trimmed) return { error: "empty pattern" };

  const separatorIndex = trimmed.indexOf(":");
  const providerToken = separatorIndex === -1 ? trimmed : trimmed.slice(0, separatorIndex);
  const selectorToken = separatorIndex === -1 ? undefined : trimmed.slice(separatorIndex + 1);

  if (!providerToken || providerToken === ":") {
    return { error: "expected a provider before ':'" };
  }

  let providerId: string | null;
  if (providerToken === "*") {
    providerId = null;
  } else {
    providerId = parseProviderToken(providerToken);
  }

  if (selectorToken === undefined || selectorToken === "*" || selectorToken === "") {
    return { providerId, selector: { kind: "all" }, pattern: trimmed };
  }

  const window = classifyQuotaWindowText(selectorToken);
  if (window) {
    return { providerId, selector: { kind: "window", window }, pattern: trimmed };
  }

  const resultType = parseAccountingSelector(selectorToken);
  if (resultType) {
    return { providerId, selector: { kind: "accounting", resultType }, pattern: trimmed };
  }

  return {
    error: `unknown selector "${selectorToken}"; expected a quota window (5h, mcp, weekly, ...) or accounting type (quota, balance, budget, spend, usage, status)`,
  };
}

export function resolveEntryVisibilityPolicy(params: {
  hidden?: readonly string[];
  quiet?: readonly string[];
}): { policy: EntryVisibilityPolicy; issues: EntryVisibilityIssue[] } {
  const issues: EntryVisibilityIssue[] = [];

  const parseList = (patterns: readonly string[] | undefined): EntryVisibilityRule[] => {
    if (!patterns) return [];
    const rules: EntryVisibilityRule[] = [];
    for (const pattern of patterns) {
      const parsed = parseEntryVisibilityRule(pattern);
      if ("error" in parsed) {
        issues.push({ pattern, message: parsed.error });
        continue;
      }
      rules.push(parsed);
    }
    return rules;
  };

  return {
    policy: {
      hidden: parseList(params.hidden),
      quiet: parseList(params.quiet),
    },
    issues,
  };
}

function entryWindowKind(entry: QuotaToastEntry): QuotaWindowKind | null {
  return (
    classifyQuotaWindowText(entry.label ?? "") ??
    classifyQuotaWindowText(entry.metricLabel ?? "") ??
    classifyQuotaWindowText(entry.name)
  );
}

export function matchEntryVisibilityRule(
  rule: EntryVisibilityRule,
  providerId: string,
  entry: QuotaToastEntry,
): boolean {
  if (rule.providerId !== null && rule.providerId !== providerId) return false;

  switch (rule.selector.kind) {
    case "all":
      return true;
    case "window":
      return entryWindowKind(entry) === rule.selector.window;
    case "accounting":
      return entry.accounting.resultType === rule.selector.resultType;
  }
}

/**
 * Applies a policy to one provider's entries: hidden entries are dropped,
 * surviving entries matched by a quiet rule are flagged `quiet` for
 * subdued rendering. Hidden wins when a pattern appears in both lists.
 */
export function applyEntryVisibilityToEntries(params: {
  providerId: string;
  entries: QuotaToastEntry[];
  policy: EntryVisibilityPolicy;
}): { entries: QuotaToastEntry[]; hiddenCount: number } {
  const { providerId, policy } = params;
  const visible: QuotaToastEntry[] = [];
  let hiddenCount = 0;

  for (const entry of params.entries) {
    if (policy.hidden.some((rule) => matchEntryVisibilityRule(rule, providerId, entry))) {
      hiddenCount += 1;
      continue;
    }
    if (policy.quiet.some((rule) => matchEntryVisibilityRule(rule, providerId, entry))) {
      visible.push({ ...entry, quiet: true });
      continue;
    }
    visible.push(entry);
  }

  return { entries: visible, hiddenCount };
}
