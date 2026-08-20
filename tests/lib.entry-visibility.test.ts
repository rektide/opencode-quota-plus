import { describe, expect, it } from "vitest";

import type { QuotaToastEntry } from "../src/lib/entries.js";
import {
  applyEntryVisibilityToEntries,
  matchEntryVisibilityRule,
  parseEntryVisibilityRule,
  resolveEntryVisibilityPolicy,
} from "../src/lib/entry-visibility.js";

function percentEntry(overrides: Partial<QuotaToastEntry> = {}): QuotaToastEntry {
  return {
    accounting: {
      resultType: "quota",
      acquisitionMethod: "remote_api",
      ownership: "maintained",
      authority: "provider_reported",
    },
    name: "Z.ai",
    group: "Z.ai",
    label: "5h:",
    percentRemaining: 42,
    ...overrides,
  };
}

describe("parseEntryVisibilityRule", () => {
  it("parses a whole-provider pattern", () => {
    expect(parseEntryVisibilityRule("deepseek")).toEqual({
      providerId: "deepseek",
      selector: { kind: "all" },
      pattern: "deepseek",
    });
  });

  it("parses provider:window patterns with aliases", () => {
    expect(parseEntryVisibilityRule("zai:mcp")).toEqual({
      providerId: "zai",
      selector: { kind: "window", window: "mcp" },
      pattern: "zai:mcp",
    });
    expect(parseEntryVisibilityRule("zai:5h")).toMatchObject({
      providerId: "zai",
      selector: { kind: "window", window: "five_hour" },
    });
    expect(parseEntryVisibilityRule("opencode-go:weekly")).toMatchObject({
      providerId: "opencode-go",
      selector: { kind: "window", window: "week" },
    });
  });

  it("parses accounting selectors", () => {
    expect(parseEntryVisibilityRule("deepseek:balance")).toEqual({
      providerId: "deepseek",
      selector: { kind: "accounting", resultType: "balance" },
      pattern: "deepseek:balance",
    });
    expect(parseEntryVisibilityRule("openrouter:spend")).toMatchObject({
      selector: { kind: "accounting", resultType: "spend" },
    });
  });

  it("normalizes display aliases like z.ai", () => {
    expect(parseEntryVisibilityRule("z.ai:mcp")).toMatchObject({ providerId: "zai" });
    expect(parseEntryVisibilityRule(" Z.Ai ")).toMatchObject({ providerId: "zai" });
  });

  it("supports provider wildcards", () => {
    expect(parseEntryVisibilityRule("*:mcp")).toMatchObject({
      providerId: null,
      selector: { kind: "window", window: "mcp" },
    });
  });

  it("treats provider:* as the whole provider", () => {
    expect(parseEntryVisibilityRule("zai:*")).toMatchObject({
      providerId: "zai",
      selector: { kind: "all" },
    });
  });

  it("rejects unknown selectors and empty patterns", () => {
    expect(parseEntryVisibilityRule("zai:bogus")).toHaveProperty("error");
    expect(parseEntryVisibilityRule("")).toHaveProperty("error");
    expect(parseEntryVisibilityRule(":mcp")).toHaveProperty("error");
  });
});

describe("matchEntryVisibilityRule", () => {
  const mcpEntry = percentEntry({ label: "MCP:", percentRemaining: 100 });
  const fiveHourEntry = percentEntry({ label: "5h:" });

  it("matches whole-provider rules", () => {
    const rule = parseEntryVisibilityRule("zai");
    if ("error" in rule) throw new Error("unexpected parse failure");
    expect(matchEntryVisibilityRule(rule, "zai", mcpEntry)).toBe(true);
    expect(matchEntryVisibilityRule(rule, "zhipu", mcpEntry)).toBe(false);
  });

  it("matches window selectors from entry labels", () => {
    const rule = parseEntryVisibilityRule("zai:mcp");
    if ("error" in rule) throw new Error("unexpected parse failure");
    expect(matchEntryVisibilityRule(rule, "zai", mcpEntry)).toBe(true);
    expect(matchEntryVisibilityRule(rule, "zai", fiveHourEntry)).toBe(false);
  });

  it("matches accounting selectors", () => {
    const balanceEntry: QuotaToastEntry = {
      kind: "value",
      accounting: {
        resultType: "balance",
        acquisitionMethod: "remote_api",
        ownership: "maintained",
        authority: "provider_reported",
      },
      name: "DeepSeek Balance",
      label: "Balance:",
      value: "$12.54",
    };
    const rule = parseEntryVisibilityRule("deepseek:balance");
    if ("error" in rule) throw new Error("unexpected parse failure");
    expect(matchEntryVisibilityRule(rule, "deepseek", balanceEntry)).toBe(true);
    expect(matchEntryVisibilityRule(rule, "zai", balanceEntry)).toBe(false);
  });

  it("matches wildcard providers", () => {
    const rule = parseEntryVisibilityRule("*:mcp");
    if ("error" in rule) throw new Error("unexpected parse failure");
    expect(matchEntryVisibilityRule(rule, "zai", mcpEntry)).toBe(true);
    expect(matchEntryVisibilityRule(rule, "zhipu", mcpEntry)).toBe(true);
    expect(matchEntryVisibilityRule(rule, "zai", fiveHourEntry)).toBe(false);
  });
});

describe("applyEntryVisibilityToEntries", () => {
  it("drops hidden entries and flags quiet entries", () => {
    const { policy } = resolveEntryVisibilityPolicy({
      hidden: ["zai:mcp"],
      quiet: ["zai:weekly"],
    });
    const entries = [
      percentEntry({ label: "5h:", percentRemaining: 40 }),
      percentEntry({ label: "MCP:", percentRemaining: 100 }),
      percentEntry({ label: "Weekly:", percentRemaining: 90 }),
    ];

    const result = applyEntryVisibilityToEntries({ providerId: "zai", entries, policy });

    expect(result.hiddenCount).toBe(1);
    expect(result.entries).toHaveLength(2);
    expect(result.entries.map((entry) => entry.label)).toEqual(["5h:", "Weekly:"]);
    expect(result.entries[0]?.quiet).toBeUndefined();
    expect(result.entries[1]?.quiet).toBe(true);
  });

  it("keeps entries when no rules match", () => {
    const { policy } = resolveEntryVisibilityPolicy({ hidden: ["openai"] });
    const entries = [percentEntry({ label: "5h:" })];

    const result = applyEntryVisibilityToEntries({ providerId: "zai", entries, policy });
    expect(result.entries).toEqual(entries);
    expect(result.hiddenCount).toBe(0);
  });
});

describe("resolveEntryVisibilityPolicy", () => {
  it("collects issues for invalid patterns without dropping valid ones", () => {
    const { policy, issues } = resolveEntryVisibilityPolicy({
      hidden: ["zai:mcp", ":mcp", "zai:bogus"],
      quiet: [],
    });

    expect(policy.hidden).toHaveLength(1);
    expect(policy.hidden[0]).toMatchObject({ providerId: "zai" });
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({ pattern: ":mcp" });
    expect(issues[1]).toMatchObject({ pattern: "zai:bogus" });
  });
});
