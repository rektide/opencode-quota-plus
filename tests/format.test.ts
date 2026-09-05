import { afterEach, describe, expect, it, vi } from "vitest";

import { formatQuotaRows } from "../src/lib/format.js";
import {
  formatProRataIndicator,
  formatWindowElapsedLabel,
  inferWindowDurationMs,
  windowElapsedPercent,
} from "../src/lib/format-utils.js";
import { buildSingleWindowPercentEntryDisplayName } from "../src/lib/quota-entry-display.js";
import { SESSION_TOKEN_SECTION_HEADING } from "../src/lib/session-tokens-format.js";

describe("formatQuotaRows", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a Copilot row", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      layout: { maxWidth: 50, narrowAt: 42, tinyAt: 32 },
      entries: [
        {
          name: "Copilot",
          percentRemaining: 75,
          resetTimeIso: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    expect(out).toContain("Copilot");
    expect(out).toContain("75% left");
    expect(out).not.toContain("Quota (remaining)");
    expect(out).not.toContain("Quota (used)");
  });

  it("uses tiny layout when maxWidth is small", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      layout: { maxWidth: 28, narrowAt: 42, tinyAt: 32 },
      entries: [
        {
          name: "Copilot",
          percentRemaining: 100,
          resetTimeIso: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    // Tiny layout is single-line per entry (no bar characters)
    expect(out).toContain("Copilot");
    expect(out).not.toContain("█");
  });

  it("renders classic percent rows as used when percentDisplayMode is used", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      layout: { maxWidth: 24, narrowAt: 16, tinyAt: 10 },
      percentDisplayMode: "used",
      entries: [
        {
          name: "Copilot",
          percentRemaining: 81,
          resetTimeIso: "2099-01-01T00:00:00.000Z",
        },
      ],
    });

    const lines = out.split("\n");
    const barLine = lines[1] ?? "";
    expect(barLine).toContain("19% used");
    expect(barLine).not.toContain("81% left");
    expect(out).not.toContain("Quota (remaining)");
    expect(out).not.toContain("Quota (used)");
    expect(barLine.match(/█/g) ?? []).toHaveLength(2);
  });

  it("renders over-quota percentages above 100 in used mode", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      layout: { maxWidth: 32, narrowAt: 24, tinyAt: 16 },
      percentDisplayMode: "used",
      entries: [
        {
          name: "Copilot",
          percentRemaining: -25,
          resetTimeIso: "2099-01-01T00:00:00.000Z",
        },
      ],
    });

    const lines = out.split("\n");
    const barLine = lines[1] ?? "";
    expect(barLine).toContain("125% used");
    expect(barLine.match(/░/g) ?? []).toHaveLength(0);
  });

  it("floors over-quota remaining labels at 0% left", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      layout: { maxWidth: 32, narrowAt: 24, tinyAt: 16 },
      percentDisplayMode: "remaining",
      entries: [
        {
          name: "Copilot",
          percentRemaining: -25,
          resetTimeIso: "2099-01-01T00:00:00.000Z",
        },
      ],
    });

    const lines = out.split("\n");
    const barLine = lines[1] ?? "";
    expect(barLine).toContain("0% left");
    expect(barLine.match(/█/g) ?? []).toHaveLength(0);
  });

  it("renders percent-row usage summaries in classic output when providers supply them", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      layout: { maxWidth: 50, narrowAt: 42, tinyAt: 32 },
      entries: [
        {
          name: "Synthetic",
          right: "0/135",
          percentRemaining: 100,
        },
        {
          name: "Qwen RPM",
          right: "5/60",
          percentRemaining: 92,
          resetTimeIso: "2099-01-01T00:00:00.000Z",
        },
      ],
    });

    expect(out).toContain("Synthetic");
    expect(out).toContain("0/135");
    expect(out).toContain("Qwen RPM");
    expect(out).toContain("5/60");
    expect(out).toContain("92% left");
  });

  it("shows reset countdown when quota is partially used", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      layout: { maxWidth: 50, narrowAt: 42, tinyAt: 32 },
      entries: [
        {
          name: "Copilot",
          percentRemaining: 75,
          resetTimeIso: "2099-01-01T00:00:00.000Z",
        },
      ],
    });

    // We don't assert exact time math; just that some countdown marker appears.
    expect(out).toMatch(/([\d.]+[dhms]|reset)/);
  });

  it("does not show reset countdown when quota is fully available", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      layout: { maxWidth: 50, narrowAt: 42, tinyAt: 32 },
      entries: [
        {
          name: "Copilot",
          percentRemaining: 100,
          resetTimeIso: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    expect(out).not.toMatch(/\d+[dhms]/);
  });

  it("uses compact rounded reset labels for single-window rows", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:00:00.000Z"));

    const out = formatQuotaRows({
      version: "1.0.0",
      layout: { maxWidth: 50, narrowAt: 42, tinyAt: 32 },
      entries: [
        {
          name: "[Copilot] Monthly",
          percentRemaining: 56,
          resetTimeIso: "2026-01-15T12:14:00.000Z",
        },
      ],
    });

    expect(out).toContain("2.5h");
    expect(out).not.toContain("2h 14m");
  });

  it("uses compact rounded reset labels for grouped rows", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:00:00.000Z"));

    const out = formatQuotaRows({
      version: "1.0.0",
      style: "allWindows",
      layout: { maxWidth: 50, narrowAt: 42, tinyAt: 32 },
      entries: [
        {
          name: "OpenAI 5h",
          group: "OpenAI",
          label: "5h:",
          percentRemaining: 56,
          resetTimeIso: "2026-01-15T10:14:00.000Z",
        },
      ],
    });

    expect(out).toContain("0.5h");
    expect(out).not.toContain("0h 14m");
  });

  it("renders fractional reset countdowns when resetTimeDecimals is set (single-window)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:00:00.000Z"));

    const out = formatQuotaRows({
      version: "1.0.0",
      layout: { maxWidth: 50, narrowAt: 42, tinyAt: 32 },
      resetTimeDecimals: 1,
      entries: [
        {
          name: "Copilot Monthly",
          percentRemaining: 50,
          resetTimeIso: "2026-01-21T02:48:00.000Z",
        },
        {
          name: "OpenAI 5h",
          percentRemaining: 50,
          resetTimeIso: "2026-01-15T11:24:00.000Z",
        },
      ],
    });

    expect(out).toContain("5.7d");
    expect(out).toContain("1.4h");
    expect(out).not.toContain("0.5h");
  });

  it("renders fractional reset countdowns when resetTimeDecimals is set (grouped)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:00:00.000Z"));

    const out = formatQuotaRows({
      version: "1.0.0",
      style: "allWindows",
      layout: { maxWidth: 50, narrowAt: 42, tinyAt: 32 },
      resetTimeDecimals: 1,
      entries: [
        {
          name: "OpenAI 5h",
          group: "OpenAI",
          label: "5h:",
          percentRemaining: 56,
          resetTimeIso: "2026-01-15T10:14:00.000Z",
        },
      ],
    });

    expect(out).toContain("0.2h");
    expect(out).not.toContain("0.5h");
  });

  it("uses minutes instead of textual zero for configured sub-hour boundaries", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:00:00.000Z"));

    const decimalsZero = formatQuotaRows({
      version: "1.0.0",
      resetTimeDecimals: 0,
      entries: [
        {
          name: "Short reset",
          percentRemaining: 50,
          resetTimeIso: "2026-01-15T10:14:00.000Z",
        },
      ],
    });
    const decimalsOne = formatQuotaRows({
      version: "1.0.0",
      resetTimeDecimals: 1,
      entries: [
        {
          name: "Very short reset",
          percentRemaining: 50,
          resetTimeIso: "2026-01-15T10:02:00.000Z",
        },
      ],
    });

    expect(decimalsZero).toContain("14m");
    expect(decimalsZero).not.toContain("0h");
    expect(decimalsOne).toContain("2m");
    expect(decimalsOne).not.toContain("0.0h");
  });

  it("preserves the leading reset value at decimals 4 in tiny layouts", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:00:00.000Z"));
    const resetTimeIso = "2026-01-15T11:24:00.000Z";
    const layout = { maxWidth: 32, narrowAt: 42, tinyAt: 32 };

    const outputs = [
      formatQuotaRows({
        version: "1.0.0",
        layout,
        resetTimeDecimals: 4,
        entries: [{ name: "Quota", percentRemaining: 50, resetTimeIso }],
      }),
      formatQuotaRows({
        version: "1.0.0",
        layout,
        resetTimeDecimals: 4,
        entries: [{ kind: "value", name: "Balance", value: "$1", resetTimeIso }],
      }),
      formatQuotaRows({
        version: "1.0.0",
        style: "allWindows",
        layout,
        resetTimeDecimals: 4,
        entries: [{ name: "Quota", group: "Provider", percentRemaining: 50, resetTimeIso }],
      }),
      formatQuotaRows({
        version: "1.0.0",
        style: "allWindows",
        layout,
        resetTimeDecimals: 4,
        entries: [
          {
            kind: "value",
            name: "Balance",
            group: "Provider",
            value: "$1",
            resetTimeIso,
          },
        ],
      }),
    ];

    for (const output of outputs) {
      expect(output).toContain("1.4000h");
      expect(output).not.toMatch(/(?:^|\s)\.4000h/u);
    }
  });

  it("keeps the default compact rounding when resetTimeDecimals is unset", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:00:00.000Z"));

    const out = formatQuotaRows({
      version: "1.0.0",
      layout: { maxWidth: 50, narrowAt: 42, tinyAt: 32 },
      entries: [
        {
          name: "Copilot Monthly",
          percentRemaining: 50,
          resetTimeIso: "2026-01-21T02:48:00.000Z",
        },
      ],
    });

    expect(out).toContain("5d");
    expect(out).not.toContain("5.7d");
  });

  describe("pro-rata burn-rate indicator", () => {
    it("inferWindowDurationMs maps common window labels to durations", () => {
      expect(inferWindowDurationMs({ label: "RPM:" })).toBe(60_000);
      expect(inferWindowDurationMs({ label: "5h:" })).toBe(5 * 3_600_000);
      expect(inferWindowDurationMs({ name: "rolling" })).toBe(5 * 3_600_000);
      expect(inferWindowDurationMs({ label: "Hourly:" })).toBe(3_600_000);
      expect(inferWindowDurationMs({ label: "Daily:" })).toBe(86_400_000);
      expect(inferWindowDurationMs({ label: "7d:" })).toBe(7 * 86_400_000);
      expect(inferWindowDurationMs({ name: "Copilot Weekly" })).toBe(7 * 86_400_000);
      expect(inferWindowDurationMs({ label: "Monthly:" })).toBe(30 * 86_400_000);
      expect(inferWindowDurationMs({ label: "Yearly:" })).toBe(365 * 86_400_000);
      expect(inferWindowDurationMs({ label: "MCP:" })).toBeNull();
      expect(inferWindowDurationMs({ label: "Code Review:" })).toBeNull();
      expect(inferWindowDurationMs({})).toBeNull();
    });

    it("prefers 5h over generic hour when both could match", () => {
      // "5 hour" contains "hour"; the 5h pattern must win.
      expect(inferWindowDurationMs({ label: "5 hour" })).toBe(5 * 3_600_000);
      // "1h" matches the hourly pattern but not the 5h pattern.
      expect(inferWindowDurationMs({ label: "1h" })).toBe(3_600_000);
    });

    it("formatProRataIndicator returns empty when disabled or missing data", () => {
      expect(
        formatProRataIndicator(
          { percentRemaining: 50, resetTimeIso: "2026-01-01T00:00:00Z", name: "Weekly" },
          { enabled: false },
        ),
      ).toBe("");
      // Missing resetTimeIso
      expect(formatProRataIndicator({ percentRemaining: 50, name: "Weekly" })).toBe("");
      // Unknown window kind
      expect(
        formatProRataIndicator(
          { percentRemaining: 50, resetTimeIso: "2026-01-01T00:00:00Z", name: "MCP" },
          { nowMs: new Date("2025-12-25T00:00:00Z").getTime() },
        ),
      ).toBe("");
      // Reset already in the past
      expect(
        formatProRataIndicator(
          { percentRemaining: 50, resetTimeIso: "2020-01-01T00:00:00Z", name: "Weekly" },
          { nowMs: new Date("2026-01-01T00:00:00Z").getTime() },
        ),
      ).toBe("");
    });

    it("returns +25% for the README example (weekly window, 25% elapsed, 50% usage)", () => {
      // Window: weekly (7d). Started 7d ago, reset is in 75% of 7d.
      // elapsed = 25%, expected usage = 25%, actual usage = 50%, diff = +25%.
      const now = new Date("2026-01-15T12:00:00Z").getTime();
      const weekMs = 7 * 86_400_000;
      const resetTime = new Date(now + 0.75 * weekMs).toISOString();
      expect(
        formatProRataIndicator(
          { percentRemaining: 50, resetTimeIso: resetTime, name: "Weekly" },
          { nowMs: now },
        ),
      ).toBe("+25%");
    });

    it("returns negative when actual usage lags pro-rata pace", () => {
      // Weekly window, 75% elapsed (reset in 25% of 7d), only 10% used.
      // expected = 75%, actual = 10%, diff = -65%.
      const now = new Date("2026-01-15T12:00:00Z").getTime();
      const weekMs = 7 * 86_400_000;
      const resetTime = new Date(now + 0.25 * weekMs).toISOString();
      expect(
        formatProRataIndicator(
          { percentRemaining: 90, resetTimeIso: resetTime, name: "7d:" },
          { nowMs: now },
        ),
      ).toBe("-65%");
    });

    it("returns +0% when actual matches pro-rata pace", () => {
      // Weekly window, 50% elapsed, 50% used.
      const now = new Date("2026-01-15T12:00:00Z").getTime();
      const weekMs = 7 * 86_400_000;
      const resetTime = new Date(now + 0.5 * weekMs).toISOString();
      expect(
        formatProRataIndicator(
          { percentRemaining: 50, resetTimeIso: resetTime, name: "Weekly" },
          { nowMs: now },
        ),
      ).toBe("+0%");
    });

    it("can exceed 100% when actual usage far outpaces pro-rata", () => {
      // Weekly window, 10% elapsed, 80% used. expected=10, actual=80, diff=+70%.
      const now = new Date("2026-01-15T12:00:00Z").getTime();
      const weekMs = 7 * 86_400_000;
      const resetTime = new Date(now + 0.9 * weekMs).toISOString();
      expect(
        formatProRataIndicator(
          { percentRemaining: 20, resetTimeIso: resetTime, name: "Weekly" },
          { nowMs: now },
        ),
      ).toBe("+70%");
    });
  });

  describe("window elapsed pace annotation", () => {
    const now = new Date("2026-01-15T12:00:00Z").getTime();
    const weekMs = 7 * 86_400_000;

    it("windowElapsedPercent returns the elapsed share of the window", () => {
      // Reset in 81% of the week -> 19% elapsed.
      const resetTime = new Date(now + 0.81 * weekMs).toISOString();
      expect(
        windowElapsedPercent(
          { percentRemaining: 73, resetTimeIso: resetTime, name: "Weekly" },
          now,
        ),
      ).toBeCloseTo(19, 0);
    });

    it("windowElapsedPercent is undefined under the same conditions as the indicator", () => {
      expect(windowElapsedPercent({ percentRemaining: 50, name: "Weekly" }, now)).toBeUndefined();
      expect(
        windowElapsedPercent(
          { percentRemaining: 50, resetTimeIso: "2026-01-16T00:00:00Z", name: "MCP" },
          now,
        ),
      ).toBeUndefined();
      expect(
        windowElapsedPercent(
          { percentRemaining: 50, resetTimeIso: "2020-01-01T00:00:00Z", name: "Weekly" },
          now,
        ),
      ).toBeUndefined();
    });

    it("formatWindowElapsedLabel renders rounded and decimal forms", () => {
      const resetTime = new Date(now + 0.814 * weekMs).toISOString();
      const entry = { percentRemaining: 73, resetTimeIso: resetTime, name: "Weekly" };
      expect(formatWindowElapsedLabel(entry, { nowMs: now })).toBe("19% done");
      expect(formatWindowElapsedLabel(entry, { nowMs: now, decimals: 1 })).toBe("18.6% done");
    });

    it("formatWindowElapsedLabel returns empty without computable pacing", () => {
      expect(formatWindowElapsedLabel({ percentRemaining: 73, name: "Weekly" }, now)).toBe("");
    });
  });

  it("renders pro-rata indicator before reset countdown when showProRataIndicator is true", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));

    // Weekly entry: 25% elapsed, 50% used -> "+25%".
    // reset is 0.75 * 7d away -> 5.25d -> "5d" with legacy rounding.
    const resetIso = new Date(
      new Date("2026-01-15T12:00:00.000Z").getTime() + 0.75 * 7 * 86_400_000,
    ).toISOString();

    const out = formatQuotaRows({
      version: "1.0.0",
      layout: { maxWidth: 50, narrowAt: 42, tinyAt: 32 },
      showProRataIndicator: true,
      entries: [
        {
          name: "Copilot",
          group: "Copilot",
          label: "Weekly:",
          percentRemaining: 50,
          resetTimeIso: resetIso,
        },
      ],
    });

    expect(out).toContain("+25%");
    expect(out).toMatch(/\+25%\s+5d/);
  });

  it("renders decimal percent labels without the used/left suffix", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      layout: { maxWidth: 50, narrowAt: 42, tinyAt: 32 },
      percentDecimals: 1,
      percentDisplayMode: "remaining",
      entries: [
        {
          name: "Copilot",
          group: "Copilot",
          label: "Weekly:",
          percentRemaining: 74.4,
          resetTimeIso: "2099-01-01T00:00:00.000Z",
        },
      ],
    });

    const barLine = out.split("\n")[1] ?? "";
    expect(barLine).toContain("74.4%");
    expect(out).not.toContain("% left");
    expect(out).not.toContain("% used");
  });

  it("applies decimal resolution to the pro-rata indicator", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));

    // Weekly entry: 25% elapsed, 50% used -> delta exactly 25.0 -> "+25.0%".
    const resetIso = new Date(
      new Date("2026-01-15T12:00:00.000Z").getTime() + 0.75 * 7 * 86_400_000,
    ).toISOString();

    const out = formatQuotaRows({
      version: "1.0.0",
      layout: { maxWidth: 50, narrowAt: 42, tinyAt: 32 },
      percentDecimals: 1,
      showProRataIndicator: true,
      entries: [
        {
          name: "Copilot",
          group: "Copilot",
          label: "Weekly:",
          percentRemaining: 50,
          resetTimeIso: resetIso,
        },
      ],
    });

    expect(out).toContain("+25.0%");
    expect(out).toContain("50.0%");
  });

  it("hides pro-rata indicator when showProRataIndicator is false", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));

    const resetIso = new Date(
      new Date("2026-01-15T12:00:00.000Z").getTime() + 0.75 * 7 * 86_400_000,
    ).toISOString();

    const out = formatQuotaRows({
      version: "1.0.0",
      layout: { maxWidth: 50, narrowAt: 42, tinyAt: 32 },
      showProRataIndicator: false,
      entries: [
        {
          name: "Copilot",
          group: "Copilot",
          label: "Weekly:",
          percentRemaining: 50,
          resetTimeIso: resetIso,
        },
      ],
    });

    expect(out).not.toContain("+25%");
    expect(out).toContain("5d");
  });

  it("shows pro-rata indicator in narrow sidebar layout when label is short enough to fit", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));

    // 5h window: 50% elapsed (2.5h), 30% actual usage -> -20% (under pace).
    // Reset 2.5h away -> "2.5h" with legacy rounding.
    const resetIso = new Date(
      new Date("2026-01-15T12:00:00.000Z").getTime() + 0.5 * 5 * 3_600_000,
    ).toISOString();

    const out = formatQuotaRows({
      version: "1.0.0",
      // Sidebar-equivalent width: 36 chars, narrow throughout.
      layout: { maxWidth: 36, narrowAt: 36, tinyAt: 20 },
      showProRataIndicator: true,
      style: "allWindows",
      entries: [
        {
          name: "Provider",
          group: "Provider",
          label: "5h:",
          percentRemaining: 70,
          resetTimeIso: resetIso,
        },
      ],
    });

    // Short label "5h window" leaves plenty of room; the indicator hoists
    // onto the provider header at the right edge, while the row carries
    // the countdown plus window-elapsed "50% done".
    const lines = out.split("\n");
    expect(lines[0]).toMatch(/^\[Provider\]\s+-20%$/u);
    expect(lines[1]).toMatch(/^\s*5h\s+2\.5h 50% done$/u);
    expect(lines[2]).toMatch(/70% left$/u);
    expect(lines.every((line) => line.length <= 36)).toBe(true);
  });

  it("hoists one parenthesized pro-rata indicator per window onto the grouped header, top-most row right-most", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));

    const resetIso = new Date(
      new Date("2026-01-15T12:00:00.000Z").getTime() + 0.5 * 5 * 3_600_000,
    ).toISOString();

    const out = formatQuotaRows({
      version: "1.0.0",
      layout: { maxWidth: 36, narrowAt: 36, tinyAt: 20 },
      showProRataIndicator: true,
      style: "allWindows",
      entries: [
        {
          name: "Provider",
          group: "Provider",
          label: "5h:",
          percentRemaining: 70,
          resetTimeIso: resetIso,
        },
        {
          name: "Provider",
          group: "Provider",
          label: "Weekly:",
          percentRemaining: 50,
          resetTimeIso: new Date(
            new Date("2026-01-15T12:00:00.000Z").getTime() + 0.75 * 7 * 86_400_000,
          ).toISOString(),
        },
      ],
    });

    // Rows sort shortest-window-first, so 5h renders above Weekly and its
    // indicator sits right-most on the header.
    const header = out.split("\n")[0]!;
    expect(header).toMatch(/^\[Provider\]\s+\+25%\s+-20%$/u);
    expect(header).toHaveLength(36);
    expect(out).not.toMatch(/\n[^\n]*[+-]\d+%\s+\d/u);
  });

  it("drops pro-rata indicator in narrow sidebar layout when label would truncate", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));

    // 30-char label + "  +X% 2h" exceeds 36-char width.
    const resetIso = "2026-01-15T14:00:00.000Z";

    const out = formatQuotaRows({
      version: "1.0.0",
      layout: { maxWidth: 36, narrowAt: 36, tinyAt: 20 },
      showProRataIndicator: true,
      entries: [
        {
          name: "[Copilot] (personal) Monthly",
          percentRemaining: 50,
          resetTimeIso: resetIso,
        },
      ],
    });

    // Indicator would force truncation; should be dropped to preserve label.
    expect(out).not.toMatch(/[+-]\d+%/);
    expect(out).toContain("[Copilot] (personal) Monthly");
  });

  it("normalizes grouped headers in all-window toast output", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));

    const out = formatQuotaRows({
      version: "1.0.0",
      style: "allWindows",
      layout: { maxWidth: 80, narrowAt: 42, tinyAt: 32 },
      entries: [
        {
          name: "Copilot",
          group: "Copilot (business)",
          label: "Usage:",
          kind: "value",
          value: "9 used | 2026-01 | org=acme-corp",
          resetTimeIso: "2026-01-16T00:00:00.000Z",
        },
      ],
    });

    expect(out).toContain("[Copilot] (business)");
    expect(out).not.toContain("→ ");
  });

  it("renders a structured quantity as an atomic value row without a bar", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      style: "allWindows",
      layout: { maxWidth: 50, narrowAt: 42, tinyAt: 32 },
      entries: [
        {
          kind: "quantity",
          name: "zen-balance",
          group: "OpenCode Zen",
          accounting: {
            resultType: "balance",
            acquisitionMethod: "dashboard_scrape",
            ownership: "maintained",
            authority: "provider_reported",
          },
          semantic: {
            metric: { kind: "component", component: "current_balance" },
            prominence: "primary",
          },
          quantity: { decimal: "42.5", unit: { kind: "currency", code: "USD" } },
        },
      ],
    });

    expect(out).toContain("[OpenCode Zen]");
    expect(out).toContain("Current balance");
    expect(out).toContain("USD 42.50");
    expect(out).not.toMatch(/[█░]/u);
    expect(out.split("\n").every((line) => line.length <= 50)).toBe(true);
  });

  it("keeps an overwide structured quantity visible in classic output", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      style: "singleWindow",
      layout: { maxWidth: 24, narrowAt: 20, tinyAt: 16 },
      entries: [
        {
          kind: "quantity",
          name: "huge-balance",
          accounting: {
            resultType: "balance",
            acquisitionMethod: "remote_api",
            ownership: "maintained",
            authority: "provider_reported",
          },
          semantic: {
            metric: { kind: "component", component: "current_balance" },
            prominence: "primary",
          },
          quantity: {
            decimal: "123456789012345678901234567890.12",
            unit: { kind: "currency", code: "USD" },
          },
        },
      ],
    });

    expect(out).toContain("…");
    expect(out).toContain("567,890.12");
    expect(out.split("\n").every((line) => line.length <= 24)).toBe(true);
  });

  it("keeps provider identity on structured classic value rows", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      style: "singleWindow",
      layout: { maxWidth: 50, narrowAt: 42, tinyAt: 32 },
      entries: [
        {
          kind: "quantity",
          name: "OpenCode Zen",
          accounting: {
            resultType: "balance",
            acquisitionMethod: "dashboard_scrape",
            ownership: "maintained",
            authority: "provider_reported",
          },
          semantic: {
            metric: { kind: "component", component: "current_balance" },
            prominence: "primary",
          },
          quantity: { decimal: "42.5", unit: { kind: "currency", code: "USD" } },
        },
      ],
    });

    expect(out).toContain("OpenCode Zen Current balance");
    expect(out).toContain("USD 42.50");
    expect(out).not.toMatch(/[█░]/u);
  });

  it("justifies a two-segment label-less percent row to the edges (grouped)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));

    const out = formatQuotaRows({
      version: "1.0.0",
      style: "allWindows",
      layout: { maxWidth: 50, narrowAt: 42, tinyAt: 32 },
      entries: [
        {
          name: "",
          group: "OpenCode Zen",
          right: "Limit $100.00  Auto $20/5",
          percentRemaining: 94,
        },
      ],
    });

    const lines = out.split("\n");
    const line1 = lines[1] ?? "";
    expect(line1.startsWith("Limit $100.00")).toBe(true);
    expect(line1.endsWith("Auto $20/5")).toBe(true);
    expect(lines.every((line) => line.length <= 50)).toBe(true);
  });

  it("renders a structured boolean in tiny grouped output without a bar", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      style: "allWindows",
      layout: { maxWidth: 32, narrowAt: 42, tinyAt: 32 },
      entries: [
        {
          kind: "boolean",
          name: "zen-auto-reload",
          group: "OpenCode Zen",
          accounting: {
            resultType: "status",
            acquisitionMethod: "dashboard_scrape",
            ownership: "maintained",
            authority: "provider_reported",
          },
          semantic: {
            metric: { kind: "component", component: "auto_reload" },
            prominence: "primary",
          },
          value: true,
        },
      ],
    });

    expect(out).toContain("Auto-reload");
    expect(out).toContain("Enabled");
    expect(out).not.toMatch(/[█░]/u);
    expect(out.split("\n").every((line) => line.length <= 32)).toBe(true);
  });

  it("preserves grouped value-row labels and values", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));

    const out = formatQuotaRows({
      version: "1.0.0",
      style: "allWindows",
      layout: { maxWidth: 80, narrowAt: 42, tinyAt: 32 },
      entries: [
        {
          name: "Copilot",
          group: "Copilot (business)",
          label: "Usage:",
          kind: "value",
          value: "9 used | 2026-01 | org=acme-corp",
          resetTimeIso: "2026-01-16T00:00:00.000Z",
        },
      ],
    });

    expect(out).toContain("Usage:");
    expect(out).toContain("9 used | 2026-01 | org=acme-corp");
    expect(out).not.toContain("Quota window");
  });

  it("preserves explicit non-duration grouped percent labels", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      style: "allWindows",
      layout: { maxWidth: 80, narrowAt: 42, tinyAt: 32 },
      entries: [
        { name: "Copilot", group: "Copilot", label: "Quota:", percentRemaining: 75 },
        {
          name: "Synthetic Requests",
          group: "Synthetic",
          label: "Requests:",
          percentRemaining: 50,
        },
        { name: "Cursor API", group: "Cursor", label: "API:", percentRemaining: 25 },
      ],
    });

    expect(out).toContain("\nQuota ");
    expect(out).toContain("\nRequests ");
    expect(out).toContain("\nAPI ");
    expect(out).not.toContain("Quota window");
  });

  it("uses metricLabel for grouped percent rows without a visible compact label", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      style: "allWindows",
      layout: { maxWidth: 80, narrowAt: 42, tinyAt: 32 },
      entries: [
        {
          name: "Antigravity (ali…)",
          group: "[Antigravity (ali…)]",
          metricLabel: "Quota",
          percentRemaining: 75,
        },
      ],
    });

    expect(out).toContain("[Antigravity (ali…)]");
    expect(out).toContain("\nQuota ");
    expect(out).not.toContain("Quota window");
  });

  it("uses Quota window only for unlabeled grouped percent rows", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      style: "allWindows",
      layout: { maxWidth: 80, narrowAt: 42, tinyAt: 32 },
      entries: [{ name: "Unlabeled Provider", group: "Unlabeled Provider", percentRemaining: 75 }],
    });

    expect(out).toContain("[Unlabeled Provider]");
  });

  it("shares single-window provider/window display labels with classic formatting", () => {
    expect(
      buildSingleWindowPercentEntryDisplayName({
        name: "Copilot",
        group: "Copilot (personal)",
        label: "Monthly:",
        percentRemaining: 86,
      }),
    ).toBe("[Copilot] (personal) Monthly");

    expect(
      buildSingleWindowPercentEntryDisplayName({
        name: "[Copilot] (personal) Monthly",
        label: "Monthly:",
        percentRemaining: 86,
      }),
    ).toBe("[Copilot] (personal) Monthly");
  });

  it("renders grouped-header provider + window label in direct single-window formatter calls", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      layout: { maxWidth: 50, narrowAt: 42, tinyAt: 32 },
      entries: [
        {
          name: "Copilot",
          group: "Copilot (personal)",
          label: "Monthly:",
          percentRemaining: 86,
          resetTimeIso: "2099-01-01T00:00:00.000Z",
        },
      ],
    });

    expect(out).toContain("[Copilot] (personal) Monthly");
  });

  it("preserves classic provider/account labels at sidebar width when they fit", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:00:00.000Z"));

    const out = formatQuotaRows({
      version: "1.0.0",
      layout: { maxWidth: 36, narrowAt: 36, tinyAt: 20 },
      entries: [
        {
          name: "[Copilot] (personal)",
          percentRemaining: 75,
          resetTimeIso: "2026-01-15T12:00:00.000Z",
        },
      ],
    });

    const lines = out.split("\n");
    expect(lines[0]).toContain("[Copilot] (personal)");
    expect(lines[1]).toContain("75% left");
    expect(lines.every((line) => line.length <= 36)).toBe(true);
  });

  it("preserves classic provider/account/window labels by shrinking reset padding", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:00:00.000Z"));

    const out = formatQuotaRows({
      version: "1.0.0",
      layout: { maxWidth: 36, narrowAt: 36, tinyAt: 20 },
      entries: [
        {
          name: "[Copilot] (personal) Monthly",
          percentRemaining: 75,
          resetTimeIso: "2026-01-15T12:00:00.000Z",
        },
      ],
    });

    const lines = out.split("\n");
    expect(lines[0]).toContain("[Copilot] (personal) Monthly");
    expect(lines.every((line) => line.length <= 36)).toBe(true);
  });

  it("preserves classic value-row provider/account labels when they fit", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:00:00.000Z"));

    const out = formatQuotaRows({
      version: "1.0.0",
      layout: { maxWidth: 36, narrowAt: 36, tinyAt: 20 },
      entries: [
        {
          name: "[Copilot] (personal)",
          kind: "value",
          value: "Unlimited",
          resetTimeIso: "2026-01-15T12:00:00.000Z",
        },
      ],
    });

    const lines = out.split("\n");
    expect(lines[0]).toContain("[Copilot] (personal)");
    expect(lines[0]).toContain("Unlimited");
    expect(lines.every((line) => line.length <= 36)).toBe(true);
  });

  it("does not double-append window labels when single-window names are already preformatted", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      layout: { maxWidth: 50, narrowAt: 42, tinyAt: 32 },
      entries: [
        {
          name: "[Copilot] (personal) Monthly",
          label: "Monthly:",
          percentRemaining: 86,
          resetTimeIso: "2099-01-01T00:00:00.000Z",
        },
      ],
    });

    expect(out).toContain("[Copilot] (personal) Monthly");
    expect(out).not.toContain("Monthly Monthly");
  });

  it("renders all-window quota entries from shortest to longest within a provider group", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      style: "allWindows",
      layout: { maxWidth: 50, narrowAt: 42, tinyAt: 32 },
      entries: [
        {
          name: "OpenAI Weekly",
          group: "OpenAI (Pro)",
          label: "Weekly:",
          percentRemaining: 88,
        },
        {
          name: "OpenAI 5h",
          group: "OpenAI (Pro)",
          label: "5h:",
          percentRemaining: 92,
        },
      ],
    });

    expect(out.indexOf("5h")).toBeGreaterThanOrEqual(0);
    expect(out.indexOf("Weekly")).toBeGreaterThanOrEqual(0);
    expect(out.indexOf("5h")).toBeLessThan(out.indexOf("Weekly"));
  });

  it("renders all-window percent rows as used when percentDisplayMode is used", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      style: "allWindows",
      layout: { maxWidth: 24, narrowAt: 16, tinyAt: 10 },
      percentDisplayMode: "used",
      entries: [
        {
          name: "OpenAI Weekly",
          group: "OpenAI (Pro)",
          label: "Weekly:",
          percentRemaining: 81,
          resetTimeIso: "2099-01-01T00:00:00.000Z",
        },
      ],
    });

    const barLine = out.split("\n").find((line) => line.includes("█"));
    expect(barLine).toContain("19% used");
    expect(barLine).not.toContain("81% left");
    expect(out).not.toContain("Quota (remaining)");
    expect(out).not.toContain("Quota (used)");
    expect(barLine?.match(/█/g) ?? []).toHaveLength(2);
  });

  it("renders all-window percent-row usage summaries when providers supply them", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      style: "allWindows",
      layout: { maxWidth: 50, narrowAt: 42, tinyAt: 32 },
      entries: [
        {
          name: "Synthetic 5h",
          group: "Synthetic",
          label: "5h:",
          right: "0/135",
          percentRemaining: 100,
        },
      ],
    });

    expect(out).toContain("5h");
    expect(out).not.toContain("0/135");
    expect(out).toContain("100% left");
  });

  it("locks rendered all-window toast ordering for Qwen and OpenAI provider groups", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      style: "allWindows",
      layout: { maxWidth: 50, narrowAt: 42, tinyAt: 32 },
      entries: [
        {
          name: "Qwen Free Daily",
          group: "Qwen (free)",
          label: "Daily:",
          percentRemaining: 90,
        },
        {
          name: "OpenAI Weekly",
          group: "OpenAI (Pro)",
          label: "Weekly:",
          percentRemaining: 81,
        },
        {
          name: "Qwen Free RPM",
          group: "Qwen (free)",
          label: "RPM:",
          percentRemaining: 60,
        },
        {
          name: "OpenAI 5h",
          group: "OpenAI (Pro)",
          label: "5h:",
          percentRemaining: 42,
        },
      ],
    });

    expect(out.indexOf("[Qwen] (free)")).toBeGreaterThanOrEqual(0);
    expect(out.indexOf("[OpenAI] (Pro)")).toBeGreaterThanOrEqual(0);
    expect(out.indexOf("[Qwen] (free)")).toBeLessThan(out.indexOf("[OpenAI] (Pro)"));

    expect(out.indexOf("RPM")).toBeLessThan(out.indexOf("Daily"));
    expect(out.indexOf("5h")).toBeLessThan(out.indexOf("Weekly"));
  });

  it("preserves explicit legacy Google-style labels and only falls back for unlabeled rows", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));

    const out = formatQuotaRows({
      version: "1.0.0",
      style: "allWindows",
      layout: { maxWidth: 50, narrowAt: 42, tinyAt: 32 },
      entries: [
        {
          name: "Claude (acct)",
          label: "Claude:",
          percentRemaining: 67,
          resetTimeIso: "2026-01-15T15:00:00.000Z",
        },
        {
          name: "G3Pro (acct)",
          percentRemaining: 67,
          resetTimeIso: "2026-01-15T15:00:00.000Z",
        },
      ],
    });

    expect(out).toContain("[Antigravity (acct)]");
    expect(out).toContain("\nClaude ");
    expect(out.match(/\[Antigravity \(acct\)\]/gu)).toHaveLength(2);
    expect(out).not.toContain("[Claude] (acct)");
    expect(out).not.toContain("[G3Pro] (acct)");
  });

  it("renders single-window session tokens as a one-line total summary", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      style: "singleWindow",
      layout: { maxWidth: 36, narrowAt: 32, tinyAt: 20 },
      entries: [],
      sessionTokens: {
        totalInput: 372,
        totalOutput: 41,
        models: [{ modelID: "openai/gpt-5.4-mini", input: 372, output: 41 }],
      },
    });

    expect(out.split("\n")).toEqual([SESSION_TOKEN_SECTION_HEADING, "  372 in  41 out"]);
    expect(out).not.toContain("openai/gpt-5.4-mini");
  });

  it("renders single-window session tokens with new and cached input totals when available", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      style: "singleWindow",
      layout: { maxWidth: 80, narrowAt: 32, tinyAt: 20 },
      entries: [],
      sessionTokens: {
        totalInput: 372,
        totalCachedInput: 120,
        totalCombinedInput: 492,
        totalOutput: 41,
        models: [
          {
            modelID: "openai/gpt-5.4-mini",
            input: 372,
            cachedInput: 120,
            totalInput: 492,
            output: 41,
          },
        ],
      },
    });

    expect(out.split("\n")).toEqual([SESSION_TOKEN_SECTION_HEADING, "  372 (120) in  41 out"]);
  });

  it("renders all-window session tokens with detailed per-model rows", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      style: "allWindows",
      layout: { maxWidth: 36, narrowAt: 32, tinyAt: 20 },
      entries: [],
      sessionTokens: {
        totalInput: 372,
        totalOutput: 41,
        models: [{ modelID: "openai/gpt-5.4-mini", input: 372, output: 41 }],
      },
    });

    expect(out.split("\n")).toEqual([
      SESSION_TOKEN_SECTION_HEADING,
      "  openai/gpt-5.4-mini",
      "    372 in  41 out",
    ]);
  });

  it("renders all-window session tokens with separate new and cached input when available", () => {
    const out = formatQuotaRows({
      version: "1.0.0",
      style: "allWindows",
      layout: { maxWidth: 80, narrowAt: 32, tinyAt: 20 },
      entries: [],
      sessionTokens: {
        totalInput: 372,
        totalCachedInput: 120,
        totalCombinedInput: 492,
        totalOutput: 41,
        models: [
          {
            modelID: "openai/gpt-5.4-mini",
            input: 372,
            cachedInput: 120,
            totalInput: 492,
            output: 41,
          },
        ],
      },
    });

    expect(out.split("\n")).toEqual([
      SESSION_TOKEN_SECTION_HEADING,
      "  openai/gpt-5.4-mini   372 (120) in      41 out",
    ]);
  });

  it("keeps legacy style aliases working for direct formatter calls", () => {
    const aliasOutput = formatQuotaRows({
      version: "1.0.0",
      style: "grouped",
      layout: { maxWidth: 36, narrowAt: 32, tinyAt: 20 },
      entries: [],
      sessionTokens: {
        totalInput: 372,
        totalOutput: 41,
        models: [{ modelID: "openai/gpt-5.4-mini", input: 372, output: 41 }],
      },
    });

    const canonicalOutput = formatQuotaRows({
      version: "1.0.0",
      style: "allWindows",
      layout: { maxWidth: 36, narrowAt: 32, tinyAt: 20 },
      entries: [],
      sessionTokens: {
        totalInput: 372,
        totalOutput: 41,
        models: [{ modelID: "openai/gpt-5.4-mini", input: 372, output: 41 }],
      },
    });

    expect(aliasOutput).toBe(canonicalOutput);
  });

  it("does not change value-only rows when percentDisplayMode changes", () => {
    const params = {
      version: "1.0.0",
      layout: { maxWidth: 40, narrowAt: 32, tinyAt: 20 },
      entries: [
        {
          name: "Cursor API",
          kind: "value" as const,
          value: "$2.40 / $20.00",
          resetTimeIso: "2099-01-01T00:00:00.000Z",
        },
      ],
    };

    const remaining = formatQuotaRows({
      ...params,
      percentDisplayMode: "remaining",
    });
    const used = formatQuotaRows({
      ...params,
      percentDisplayMode: "used",
    });

    expect(used).toBe(remaining);
    expect(used).toContain("$2.40 / $20.00");
    expect(used).not.toContain("% left");
    expect(used).not.toContain("% used");
  });
});
