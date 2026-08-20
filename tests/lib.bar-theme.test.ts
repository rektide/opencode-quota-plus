import { describe, expect, it } from "vitest";

import {
  BAR_THEMES,
  DEFAULT_BAR_THEME_ID,
  getBarTheme,
  isBarThemeId,
} from "../src/lib/bar-theme.js";
import { bar } from "../src/lib/format-utils.js";
import { formatQuotaRowsGrouped } from "../src/lib/toast-format-grouped.js";

const WIDTH = 20;

function legacyBar(p: number, width: number): string {
  const filled = Math.round((p / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

describe("bar themes", () => {
  it("keeps the default byte-identical to the historical bar", () => {
    for (let p = 0; p <= 100; p += 3) {
      expect(bar(p, WIDTH)).toBe(legacyBar(p, WIDTH));
    }
    expect(bar(-5, WIDTH)).toBe(legacyBar(0, WIDTH));
    expect(bar(150, WIDTH)).toBe(legacyBar(100, WIDTH));
  });

  it("renders each theme's glyphs", () => {
    expect(bar(50, 4, { theme: getBarTheme("rings") })).toBe("●●○○");
    expect(bar(50, 4, { theme: getBarTheme("solid") })).toBe("██  ");
    expect(bar(25, 4, { theme: getBarTheme("shade") })).toBe("▓░░░");
    expect(bar(0, 3, { theme: getBarTheme("heavy") })).toBe("┄┄┄");
  });

  it("uses the quieter filled glyph for quiet rows", () => {
    expect(bar(50, 4, { theme: getBarTheme("classic"), quiet: true })).toBe("▓▓░░");
    expect(bar(50, 4, { theme: getBarTheme("rings"), quiet: true })).toBe("◐◐○○");
  });

  it("spends the trailing cell on partial blocks only for partial themes", () => {
    // 42% of 20 cells = 8.4 -> 8 whole + 3/8 sliver.
    expect(bar(42, WIDTH, { theme: getBarTheme("smooth") })).toBe(
      "█".repeat(8) + "▍" + "░".repeat(11),
    );
    // Exact cells stay whole.
    expect(bar(50, WIDTH, { theme: getBarTheme("smooth") })).toBe(legacyBar(50, WIDTH));
    // 43.75% of 8 cells = 3.5 -> 3 whole + half-cell sliver.
    expect(bar(43.75, 8, { theme: getBarTheme("smooth") })).toBe("███▌░░░░");
    // 44.375% of 20 = 8.875 -> 8 whole + 7/8 block. Partial themes keep
    // fractional percents (no integer truncation).
    expect(bar(44.375, WIDTH, { theme: getBarTheme("smooth") })).toBe(
      "█".repeat(8) + "▉" + "░".repeat(11),
    );
    // Fractions above 7/8 round to a whole cell: 44.75% of 20 = 8.95.
    expect(bar(44.75, WIDTH, { theme: getBarTheme("smooth") })).toBe(
      "█".repeat(9) + "░".repeat(11),
    );
    // Classic ignores partial config entirely.
    expect(bar(42, WIDTH, { theme: getBarTheme("classic") })).toBe(legacyBar(42, WIDTH));
  });

  it("never exceeds the requested width", () => {
    for (const id of Object.keys(BAR_THEMES) as Array<keyof typeof BAR_THEMES>) {
      for (let p = 0; p <= 100; p += 7) {
        const rendered = bar(p, WIDTH, { theme: BAR_THEMES[id] });
        expect([...rendered].length).toBe(WIDTH);
      }
    }
  });

  it("validates ids", () => {
    expect(isBarThemeId("classic")).toBe(true);
    expect(isBarThemeId("nope")).toBe(false);
    expect(isBarThemeId(42)).toBe(false);
    expect(getBarTheme("nope" as never).id).toBe(DEFAULT_BAR_THEME_ID);
  });

  it("threads barTheme through the grouped formatter", () => {
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
      percentRemaining: 40,
    };

    const output = formatQuotaRowsGrouped({
      entries: [entry],
      barTheme: "rings",
    });
    expect(output).toContain("●".repeat(6));
    expect(output).not.toContain("█");

    const quietOutput = formatQuotaRowsGrouped({
      entries: [{ ...entry, quiet: true }],
      barTheme: "classic",
    });
    expect(quietOutput).toContain("▓".repeat(6));
    expect(quietOutput).not.toContain("█");
  });
});
