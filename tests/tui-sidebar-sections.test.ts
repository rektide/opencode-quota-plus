import { describe, expect, it } from "vitest";

import type { QuotaRenderData } from "../src/lib/quota-render-data.js";
import { buildSidebarQuotaPanelLines } from "../src/lib/tui-sidebar-format.js";
import {
  buildSidebarQuotaSections,
  flattenSidebarQuotaSections,
} from "../src/lib/tui-sidebar-sections.js";
import { DEFAULT_CONFIG } from "../src/lib/types.js";

const accounting = (resultType: "quota" | "balance") => ({
  resultType,
  acquisitionMethod: "remote_api" as const,
  ownership: "maintained" as const,
  authority: "provider_reported" as const,
});

function allWindowsData(): QuotaRenderData {
  return {
    entries: [
      {
        accounting: accounting("quota"),
        name: "Z.ai",
        group: "Z.ai",
        label: "5h:",
        percentRemaining: 40,
      },
      {
        accounting: accounting("quota"),
        name: "Z.ai",
        group: "Z.ai",
        label: "MCP:",
        percentRemaining: 100,
        quiet: true,
      },
      {
        kind: "value",
        accounting: accounting("balance"),
        name: "DeepSeek Balance",
        group: "DeepSeek",
        label: "Balance:",
        value: "$12.54",
      },
    ],
    errors: [{ label: "OpenRouter", message: "Invalid openrouter-key-v1 response" }],
  };
}

const config = {
  formatStyle: "allWindows" as const,
  percentDisplayMode: DEFAULT_CONFIG.percentDisplayMode,
  resetTimeDecimals: DEFAULT_CONFIG.resetTimeDecimals,
  showProRataIndicator: false,
};

describe("buildSidebarQuotaSections", () => {
  it("composes one section per provider with one row per entry", () => {
    const sections = buildSidebarQuotaSections({ data: allWindowsData(), config });

    expect(sections.map((section) => section.key)).toEqual([
      "Z.ai",
      "DeepSeek",
      expect.stringMatching(/^error:/),
    ]);
    const zai = sections[0]!;
    expect(zai.headerLine).toBe("[Z.ai]");
    expect(zai.rows).toHaveLength(2);
    expect(zai.rows.map((row) => row.lines.length)).toEqual([2, 2]);
    expect(zai.rows[0]!.quiet).toBe(false);
    expect(zai.rows[1]!.quiet).toBe(true);
  });

  it("carries the quiet flag per row", () => {
    const sections = buildSidebarQuotaSections({ data: allWindowsData(), config });
    const mcpRow = sections[0]!.rows[1]!;
    expect(mcpRow.quiet).toBe(true);
  });

  it("renders error rows as a trailing error section", () => {
    const sections = buildSidebarQuotaSections({ data: allWindowsData(), config });
    const errorSection = sections.find((section) => section.error);
    expect(errorSection?.headerLine).toBeNull();
    expect(errorSection?.rows[0]!.lines).toEqual([
      "OpenRouter: Invalid openrouter-key-v1 response",
    ]);
  });

  it("flattens to the same content as the panel-lines formatter", () => {
    const sections = buildSidebarQuotaSections({ data: allWindowsData(), config });
    const flattened = flattenSidebarQuotaSections(sections)
      .map((entry) => entry.line)
      .join("\n");

    const panel = buildSidebarQuotaPanelLines({
      data: allWindowsData(),
      config: { ...config, showProRataIndicator: false },
    }).join("\n");

    expect(flattened).toBe(panel);
  });

  it("inserts blank separator lines between sections", () => {
    const sections = buildSidebarQuotaSections({ data: allWindowsData(), config });
    const lines = flattenSidebarQuotaSections(sections).map((entry) => entry.line);

    // Provider sections, the error section, and each later section are
    // separated by exactly one blank line, matching the grouped formatter.
    expect(lines).toEqual([
      "[Z.ai]",
      ...sections[0]!.rows.flatMap((row) => row.lines),
      "",
      "[DeepSeek]",
      ...sections[1]!.rows.flatMap((row) => row.lines),
      "",
      "OpenRouter: Invalid openrouter-key-v1 response",
    ]);
  });

  it("carries the quiet flag through flattening", () => {
    const sections = buildSidebarQuotaSections({ data: allWindowsData(), config });
    const flat = flattenSidebarQuotaSections(sections);
    // MCP is the quiet row in the fixture (second row of the Z.ai section).
    const mcpIndex = flat.findIndex((entry) => entry.line.includes("MCP"));
    expect(flat[mcpIndex]?.quiet).toBe(true);
    const fiveHourIndex = flat.findIndex((entry) => entry.line.includes("Five-hour"));
    expect(flat[fiveHourIndex]?.quiet).toBe(false);
  });

  it("emits no provider header in singleWindow style where names carry identity", () => {
    const data: QuotaRenderData = {
      entries: [
        {
          accounting: accounting("quota"),
          name: "[Z.ai] 5h",
          percentRemaining: 40,
        },
      ],
      errors: [],
    };
    const sections = buildSidebarQuotaSections({
      data,
      config: { ...config, formatStyle: "singleWindow" },
    });

    expect(sections).toHaveLength(1);
    expect(sections[0]!.headerLine).toBeNull();
    expect(sections[0]!.rows[0]!.lines.join("\n")).toContain("[Z.ai] 5h");
  });
});
