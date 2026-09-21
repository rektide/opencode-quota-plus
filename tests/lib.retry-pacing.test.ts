import { describe, expect, it, vi } from "vitest";
import type { QuotaProvider, QuotaToastEntry } from "../src/lib/entries.js";
import {
  isQuotaRetryError,
  resolveCachedRetryPacingPlan,
  RETRY_RESET_MARGIN_MS,
} from "../src/lib/retry-pacing.js";
import { DEFAULT_CONFIG } from "../src/lib/types.js";

const nowMs = Date.parse("2026-09-22T08:00:00.000Z");

function percentEntry(percentRemaining: number, resetTimeIso: string): QuotaToastEntry {
  return {
    name: "5h",
    percentRemaining,
    resetTimeIso,
    accounting: {
      resultType: "quota",
      acquisitionMethod: "remote_api",
      ownership: "maintained",
      authority: "provider_reported",
    },
  };
}

function runtime(provider: QuotaProvider) {
  return {
    client: {
      config: {
        get: async () => ({ data: {} }),
        providers: async () => ({ data: { providers: [{ id: "zai" }] } }),
      },
    },
    roots: {
      workspaceRoot: "/workspace",
      configRoot: "/config",
      fallbackDirectory: "/workspace",
    },
    config: {
      ...DEFAULT_CONFIG,
      retryPacing: { enabled: true },
      minIntervalMs: 300_000,
    },
    configMeta: { settingSources: {} },
    providers: [provider],
    resolveRuntimeProviderIds: async () => new Set(["zai"]),
    session: {},
  } as any;
}

describe("retry pacing", () => {
  it("recognizes only quota and rate-limit failures", () => {
    expect(isQuotaRetryError({ type: "provider.quota" })).toBe(true);
    expect(isQuotaRetryError({ type: "provider.rate-limit" })).toBe(true);
    expect(isQuotaRetryError({ type: "provider.error", status: 429 })).toBe(true);
    expect(isQuotaRetryError({ type: "provider.error", status: 500 })).toBe(false);
  });

  it("waits until the latest exhausted window reset plus a safety margin", async () => {
    const provider: QuotaProvider = {
      id: "zai",
      isAvailable: async () => true,
      fetch: async () => ({ attempted: true, entries: [], errors: [] }),
    };
    const firstReset = nowMs + 60 * 60_000;
    const secondReset = nowMs + 5 * 60 * 60_000;
    const readCached = vi.fn(async () => ({
      hit: true as const,
      timestamp: nowMs - 1_000,
      result: {
        attempted: true,
        entries: [
          percentEntry(0, new Date(firstReset).toISOString()),
          percentEntry(-0.1, new Date(secondReset).toISOString()),
          percentEntry(25, new Date(nowMs + 7 * 24 * 60 * 60_000).toISOString()),
        ],
        errors: [],
      },
    }));

    const plan = await resolveCachedRetryPacingPlan({
      runtime: runtime(provider),
      providerID: "zai",
      modelID: "glm-5",
      nowMs,
      readCached,
    });

    expect(plan).toEqual({
      resetAtMs: secondReset,
      delayMs: secondReset - nowMs + RETRY_RESET_MARGIN_MS,
      quotaProviderIds: ["zai"],
    });
  });

  it("does not pace from stale or non-exhausted cached values", async () => {
    const provider: QuotaProvider = {
      id: "zai",
      isAvailable: async () => true,
      fetch: async () => ({ attempted: true, entries: [], errors: [] }),
    };
    const stale = await resolveCachedRetryPacingPlan({
      runtime: runtime(provider),
      providerID: "zai",
      modelID: "glm-5",
      nowMs,
      readCached: async () => ({
        hit: true,
        timestamp: nowMs - 300_001,
        result: {
          attempted: true,
          entries: [percentEntry(0, new Date(nowMs + 60_000).toISOString())],
          errors: [],
        },
      }),
    });
    const available = await resolveCachedRetryPacingPlan({
      runtime: runtime(provider),
      providerID: "zai",
      modelID: "glm-5",
      nowMs,
      readCached: async () => ({
        hit: true,
        timestamp: nowMs,
        result: {
          attempted: true,
          entries: [percentEntry(0.01, new Date(nowMs + 60_000).toISOString())],
          errors: [],
        },
      }),
    });

    expect(stale).toBeUndefined();
    expect(available).toBeUndefined();
  });

  it("honors the default-on configuration switch", async () => {
    const provider: QuotaProvider = {
      id: "zai",
      isAvailable: async () => true,
      fetch: async () => ({ attempted: true, entries: [], errors: [] }),
    };
    const disabled = runtime(provider);
    disabled.config.retryPacing.enabled = false;
    const readCached = vi.fn();

    expect(
      await resolveCachedRetryPacingPlan({
        runtime: disabled,
        providerID: "zai",
        modelID: "glm-5",
        nowMs,
        readCached,
      }),
    ).toBeUndefined();
    expect(readCached).not.toHaveBeenCalled();
  });
});
