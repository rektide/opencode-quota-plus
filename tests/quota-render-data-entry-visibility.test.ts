import { describe, expect, it } from "vitest";

import type {
  QuotaProvider,
  QuotaProviderContext,
  QuotaProviderResult,
} from "../src/lib/entries.js";
import { collectQuotaRenderData } from "../src/lib/quota-render-data.js";
import { DEFAULT_CONFIG } from "../src/lib/types.js";

function makeProvider(id: string, entries: QuotaProviderResult["entries"]): QuotaProvider {
  return {
    id,
    isAvailable: async () => true,
    async fetch(): Promise<QuotaProviderResult> {
      return { attempted: true, entries, errors: [] };
    },
  };
}

const accounting = (resultType: "quota" | "balance") => ({
  resultType,
  acquisitionMethod: "remote_api" as const,
  ownership: "maintained" as const,
  authority: "provider_reported" as const,
});

const zaiProvider = makeProvider("zai", [
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
    percentRemaining: 5,
  },
]);

const deepseekProvider = makeProvider("deepseek", [
  {
    kind: "value",
    accounting: accounting("balance"),
    name: "DeepSeek Balance",
    group: "DeepSeek",
    label: "Balance:",
    value: "$12.54",
  },
]);

const stubClient = {
  config: {
    providers: async () => ({
      data: { providers: [{ id: "zai-coding-plan" }, { id: "deepseek" }] },
    }),
    get: async () => ({ data: {} }),
  },
} satisfies QuotaProviderContext["client"];

const resolveRuntimeProviderIds = async () => new Set(["zai-coding-plan", "deepseek"]);

async function collect(configOverrides: Record<string, unknown>) {
  return await collectQuotaRenderData({
    client: stubClient,
    resolveRuntimeProviderIds,
    config: { ...DEFAULT_CONFIG, minIntervalMs: 0, ...configOverrides },
    surfaceExplicitProviderIssues: false,
    providers: [zaiProvider, deepseekProvider],
  });
}

describe("collectQuotaRenderData entry visibility", () => {
  it("removes hidden entries before projection", async () => {
    const result = await collect({ hiddenEntries: ["zai:mcp", "deepseek:balance"] });

    // Default singleWindow projection renames rows; identity carries in name.
    const names = (result.data?.entries ?? []).map((entry) => entry.name);
    expect(names).toEqual(["[Z.ai] 5h"]);
  });

  it("prevents hidden entries from winning single-window selection", async () => {
    // MCP at 5% would normally win the single-window pick for Z.ai.
    const result = await collect({ hiddenEntries: ["zai:mcp"] });

    const names = (result.data?.entries ?? []).map((entry) => entry.name);
    expect(names).toEqual(["[Z.ai] 5h", "[DeepSeek]"]);
  });

  it("keeps hidden entries out of providerResults probes for reset detection", async () => {
    const result = await collect({ hiddenEntries: ["zai:mcp"] });

    const zaiProbe = result.providerResults.find((probe) => probe.providerId === "zai");
    expect(zaiProbe?.result.entries.map((entry) => entry.label)).toEqual(["5h:"]);
  });

  it("flags quiet entries through projection", async () => {
    const result = await collect({ quietEntries: ["deepseek:balance"] });

    const deepseek = result.data?.entries.find((entry) => entry.name === "[DeepSeek]");
    expect(deepseek?.quiet).toBe(true);
    const fiveHour = result.data?.entries.find((entry) => entry.name === "[Z.ai] 5h");
    expect(fiveHour?.quiet).toBeUndefined();
  });

  it("keeps label identity when filtering in allWindows style", async () => {
    const result = await collect({
      hiddenEntries: ["zai:mcp"],
      formatStyle: "allWindows",
    });

    expect((result.data?.entries ?? []).map((entry) => entry.label)).toEqual(["5h:", "Balance:"]);
  });

  it("keeps all entries when no patterns are configured", async () => {
    const result = await collect({ formatStyle: "allWindows" });

    expect((result.data?.entries ?? []).map((entry) => entry.label)).toEqual([
      "5h:",
      "MCP:",
      "Balance:",
    ]);
  });
});
