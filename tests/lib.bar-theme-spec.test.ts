import { describe, expect, it } from "vitest";

import {
  type BarThemeRule,
  type BarThemeSpec,
  resolveBarTheme,
  validateBarThemeSpec,
} from "../src/lib/bar-theme.js";
import {
  CSS_NAMED_COLORS,
  isThemeColorName,
  resolveStaticColorTriplet,
  resolveThemeColor,
} from "../src/lib/theme-colors.js";

const metrics = (overrides: Partial<Parameters<typeof resolveBarTheme>[1]> = {}) => ({
  percentRemaining: 40,
  usedPercent: 60,
  ...overrides,
});

describe("validateBarThemeSpec", () => {
  it("accepts a bare character theme", () => {
    const { spec, issues } = validateBarThemeSpec("squares");
    expect(spec).toBe("squares");
    expect(issues).toEqual([]);
  });

  it("accepts a composite of chars + color", () => {
    const { spec, issues } = validateBarThemeSpec(["squares", "quiet"]);
    expect(spec).toEqual(["squares", "quiet"]);
    expect(issues).toEqual([]);
  });

  it("accepts a color-only theme, hex colors, and rule lists", () => {
    expect(validateBarThemeSpec("quiet").issues).toEqual([]);
    expect(validateBarThemeSpec("#ff8800").issues).toEqual([]);
    const rules: unknown = [
      "classic",
      { theme: ["dots", "red"], prorata: 10 },
      { theme: ["shade", "quiet"], prorata: -10 },
    ];
    const { spec, issues } = validateBarThemeSpec(rules);
    expect(spec).toEqual(rules);
    expect(issues).toEqual([]);
  });

  it("reports unknown names without rejecting the valid parts", () => {
    const { issues } = validateBarThemeSpec(["squares", "sparkles"]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain("sparkles");
  });

  it("rejects malformed rules and empty arrays", () => {
    expect(validateBarThemeSpec([]).issues[0]?.message).toContain("non-empty");
    expect(validateBarThemeSpec([{ theme: "dots", tempo: 5 }]).issues[0]?.message).toContain(
      "tempo",
    );
    expect(validateBarThemeSpec([{ prorata: "fast" }]).issues[0]?.message).toContain(
      "finite number",
    );
  });
});

describe("resolveBarTheme", () => {
  it("composes chars with a color layer", () => {
    const resolved = resolveBarTheme(["squares", "quiet"], metrics());
    expect(resolved.chars.id).toBe("squares");
    expect(resolved.color).toBe("quiet");
  });

  it("supports bare colors over default chars", () => {
    const resolved = resolveBarTheme("quiet", metrics());
    expect(resolved.chars.id).toBe("classic");
    expect(resolved.color).toBe("quiet");
  });

  it("applies sign semantics: positive >=, negative <=", () => {
    const spec: BarThemeSpec = [
      "classic",
      { theme: ["dots", "red"], prorata: 10 },
      { theme: ["shade", "quiet"], prorata: -10 },
    ];

    expect(resolveBarTheme(spec, metrics({ proRataDeltaPct: 25 })).chars.id).toBe("dots");
    expect(resolveBarTheme(spec, metrics({ proRataDeltaPct: 25 })).color).toBe("red");
    expect(resolveBarTheme(spec, metrics({ proRataDeltaPct: -25 })).chars.id).toBe("shade");
    expect(resolveBarTheme(spec, metrics({ proRataDeltaPct: -25 })).color).toBe("quiet");
    // Between the thresholds: base theme, no color.
    expect(resolveBarTheme(spec, metrics({ proRataDeltaPct: 3 })).chars.id).toBe("classic");
    expect(resolveBarTheme(spec, metrics({ proRataDeltaPct: 3 })).color).toBeUndefined();
    // No pro-rata data: conditional rules never match.
    expect(resolveBarTheme(spec, metrics()).chars.id).toBe("classic");
  });

  it("last matching rule wins", () => {
    const spec: BarThemeSpec = [
      "classic",
      { theme: "dots", prorata: 10 },
      { theme: "squares", prorata: 20 },
    ];
    // delta 30 matches both; the later rule wins.
    expect(resolveBarTheme(spec, metrics({ proRataDeltaPct: 30 })).chars.id).toBe("squares");
    // delta 15 matches only the first override.
    expect(resolveBarTheme(spec, metrics({ proRataDeltaPct: 15 })).chars.id).toBe("dots");
  });

  it("combines conditions with AND and supports used/percent/hours", () => {
    const rule: BarThemeRule = { theme: ["dots", "red"], used: 90, percent: -15 };
    expect(resolveBarTheme([rule], metrics({ usedPercent: 95, percentRemaining: 5 })).color).toBe(
      "red",
    );
    expect(
      resolveBarTheme([rule], metrics({ usedPercent: 95, percentRemaining: 30 })).color,
    ).toBeUndefined();
    expect(
      resolveBarTheme([{ theme: "dots", hours: 1 }], metrics({ hoursRemaining: 2 })).chars.id,
    ).toBe("dots");
    // hours: -1 means "an hour or less remaining".
    expect(
      resolveBarTheme([{ theme: "dots", hours: -1 }], metrics({ hoursRemaining: 0.5 })).chars.id,
    ).toBe("dots");
    expect(
      resolveBarTheme([{ theme: "dots", hours: -1 }], metrics({ hoursRemaining: 2 })).chars.id,
    ).toBe("classic");
    // percent: -20 means remaining <= 20.
    expect(
      resolveBarTheme([{ theme: "dots", percent: -20 }], metrics({ percentRemaining: 15 })).chars
        .id,
    ).toBe("dots");
    // hours data missing -> no match
    expect(resolveBarTheme([{ theme: "dots", hours: 1 }], metrics()).chars.id).toBe("classic");
  });

  it("layers colors across matching rules (last value per field wins)", () => {
    const spec: BarThemeSpec = ["squares", { theme: "red", used: 90 }];
    const resolved = resolveBarTheme(spec, metrics({ usedPercent: 95 }));
    expect(resolved.chars.id).toBe("squares");
    expect(resolved.color).toBe("red");
  });

  it("resolves conditionally through the grouped formatter with a frozen clock", async () => {
    const { formatQuotaRowsGrouped } = await import("../src/lib/toast-format-grouped.js");
    const now = Date.UTC(2026, 7, 20, 12, 0, 0);
    // 5h window with 1h left: elapsed 4h of 5h -> expected usage 80%.
    // remaining 60% -> actual usage 40% -> pro-rata delta -40 (slower burn).
    const entry = {
      accounting: {
        resultType: "quota" as const,
        acquisitionMethod: "remote_api" as const,
        ownership: "maintained" as const,
        authority: "provider_reported" as const,
      },
      name: "Z.ai",
      group: "Z.ai",
      label: "5h:",
      percentRemaining: 60,
      resetTimeIso: new Date(now + 3_600_000).toISOString(),
    };

    const calm = formatQuotaRowsGrouped({
      entries: [entry],
      barTheme: [
        "classic",
        { theme: ["dots", "quiet"], prorata: -10 },
        { theme: ["rings", "red"], prorata: 10 },
      ],
      nowMs: now,
    });
    expect(calm).toContain("●"); // dots won: delta -40 <= -10
    expect(calm).not.toContain("█");

    // Window started 4h before `now` (reset - 5h). At clock now-3h, 1h has
    // elapsed: expected usage 20%, actual 40% -> delta +20 >= 10 -> rings.
    const hot = formatQuotaRowsGrouped({
      entries: [entry],
      barTheme: [
        "classic",
        { theme: ["dots", "quiet"], prorata: -10 },
        { theme: ["rings", "red"], prorata: 10 },
      ],
      nowMs: now - 3 * 3_600_000,
    });
    expect(hot).toContain("○"); // rings won
    expect(hot).not.toContain("·");
  });

  it("carries the resolved color onto sidebar section rows", async () => {
    const { buildSidebarQuotaSections } = await import("../src/lib/tui-sidebar-sections.js");
    const sections = buildSidebarQuotaSections({
      data: {
        entries: [
          {
            accounting: {
              resultType: "quota" as const,
              acquisitionMethod: "remote_api" as const,
              ownership: "maintained" as const,
              authority: "provider_reported" as const,
            },
            name: "Z.ai",
            group: "Z.ai",
            label: "5h:",
            percentRemaining: 40,
          },
        ],
        errors: [],
      },
      config: {
        formatStyle: "allWindows" as const,
        percentDisplayMode: "remaining" as const,
        resetTimeDecimals: 1,
        showProRataIndicator: false,
        barTheme: ["classic", { theme: "warning", used: 50 }],
      },
    });
    expect(sections[0]?.rows[0]?.color).toBe("warning");
  });
});

describe("theme spec stack semantics", () => {
  it("stacks repeated colors: last wins", () => {
    const resolved = resolveBarTheme(["red", "orange", "teal", "teal"], metrics());
    expect(resolved.color).toBe("teal");
    expect(resolved.chars.id).toBe("classic");
  });

  it("stacks repeated shapes: last wins", () => {
    const resolved = resolveBarTheme(["squares", "dots", "rings"], metrics());
    expect(resolved.chars.id).toBe("rings");
    expect(resolved.color).toBeUndefined();
  });

  it("merges properties independently: a later shape does not clobber an earlier color", () => {
    const resolved = resolveBarTheme(["red", "squares", "teal", "dots"], metrics());
    expect(resolved.chars.id).toBe("dots");
    expect(resolved.color).toBe("teal");
  });

  it("stacks per property across matching rules, not wholesale", () => {
    // Rule 1 contributes only chars; rule 2 contributes only color. Both
    // match, so the result carries both — neither replaces the other.
    const resolved = resolveBarTheme(
      [{ theme: "squares" }, { theme: "red" }],
      metrics(),
    );
    expect(resolved.chars.id).toBe("squares");
    expect(resolved.color).toBe("red");
  });

  it("keeps stacking across unconditional strings and conditional rules", () => {
    const resolved = resolveBarTheme(
      ["squares", "red", { used: 90 }, "teal"],
      metrics({ usedPercent: 95 }),
    );
    expect(resolved.chars.id).toBe("squares");
    expect(resolved.color).toBe("teal");
  });

  it("accepts color-only and shape-only composites in validation", () => {
    expect(validateBarThemeSpec(["red", "orange", "teal"]).issues).toEqual([]);
    expect(validateBarThemeSpec(["squares", "dots"]).issues).toEqual([]);
  });
});

describe("theme colors", () => {
  it("knows CSS names and hex but not arbitrary strings", () => {
    expect(isThemeColorName("red")).toBe(true);
    expect(isThemeColorName("Quiet")).toBe(false);
    expect(isThemeColorName("#abc")).toBe(true);
    expect(isThemeColorName("sparkles")).toBe(false);
  });

  it("resolves static triplets", () => {
    expect(resolveStaticColorTriplet("red")).toEqual([255, 0, 0]);
    expect(resolveStaticColorTriplet("#00ff88")).toEqual([0, 255, 136]);
    expect(resolveStaticColorTriplet("quiet")).toBeNull();
    expect(resolveStaticColorTriplet("nope")).toBeNull();
  });

  it("resolves host tokens first, then static names", () => {
    const token = { marker: "token" };
    const resolved = resolveThemeColor("success", { success: token }, (t) => t);
    expect(resolved).toBe(token);

    const named = resolveThemeColor("red", {}, (t) => t);
    expect(named).toEqual([255, 0, 0]);

    expect(resolveThemeColor("quiet", { textMuted: token }, (t) => t)).toBe(token);
    expect(resolveThemeColor(undefined, {}, (t) => t)).toBeUndefined();
    expect(resolveThemeColor("nope", {}, (t) => t)).toBeUndefined();
  });

  it("keeps every CSS name resolvable", () => {
    for (const name of Object.keys(CSS_NAMED_COLORS)) {
      expect(resolveStaticColorTriplet(name), name).not.toBeNull();
    }
  });
});
