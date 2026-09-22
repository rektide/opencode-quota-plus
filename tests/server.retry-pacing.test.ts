import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveRuntime: vi.fn(),
  resolvePlan: vi.fn(),
}));

vi.mock("../src/lib/quota-runtime-context.js", () => ({
  resolveQuotaRuntimeContext: mocks.resolveRuntime,
}));

vi.mock("../src/lib/retry-pacing.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/lib/retry-pacing.js")>();
  return { ...original, resolveCachedRetryPacingPlan: mocks.resolvePlan };
});

import serverPlugin from "../src/server.js";

type TestRetryEvent = {
  model: { providerID: string; id: string };
  error: { type: string; status?: number };
  decision: { retry: boolean; delay: number };
};

describe("V2 server retry pacing", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    mocks.resolveRuntime.mockReset().mockResolvedValue({ config: {} });
    mocks.resolvePlan.mockReset();
  });

  async function setup() {
    let retryHook: ((event: TestRetryEvent) => Promise<void>) | undefined;
    const dispose = vi.fn(async () => {});
    const get = vi.fn(async ({ sessionID }: { sessionID: string }) => ({ id: sessionID }));
    const synthetic = vi.fn(async () => ({}));
    const cleanup = await serverPlugin.setup({
      options: {},
      location: { directory: "/workspace" },
      provider: { list: async () => [] },
      session: {
        get,
        synthetic,
        hook: vi.fn(async (_name, callback) => {
          retryHook = callback as (event: TestRetryEvent) => Promise<void>;
          return { dispose };
        }),
      },
    });
    if (!retryHook) throw new Error("retry hook was not registered");
    return { retryHook, cleanup, dispose, get, synthetic };
  }

  it("extends a quota retry to the cached reset without shortening core policy", async () => {
    mocks.resolvePlan.mockResolvedValue({
      delayMs: 6 * 60 * 60_000,
      resetAtMs: Date.now() + 6 * 60 * 60_000,
      quotaProviderIds: ["zai"],
    });
    const { retryHook } = await setup();
    const event = {
      sessionID: "session",
      model: { providerID: "zai", id: "glm-5" },
      error: { type: "provider.quota", status: 429 },
      decision: { retry: true, delay: 15_000 },
    };

    await retryHook(event);

    expect(event.decision).toEqual({ retry: true, delay: 6 * 60 * 60_000 });
    expect(mocks.resolvePlan).toHaveBeenCalledWith(
      expect.objectContaining({ providerID: "zai", modelID: "glm-5" }),
    );
    expect(console.info).toHaveBeenCalledWith(
      "[opencode-quota] scheduled quota-aware retry",
      expect.objectContaining({ providerID: "zai", delayMs: 6 * 60 * 60_000 }),
    );
  });

  it("leaves unrelated failures and planner failures on OpenCode's policy", async () => {
    const { retryHook } = await setup();
    const unrelated = {
      sessionID: "session",
      model: { providerID: "zai", id: "glm-5" },
      error: { type: "provider.error", status: 500 },
      decision: { retry: true, delay: 2_000 },
    };
    await retryHook(unrelated);
    expect(unrelated.decision).toEqual({ retry: true, delay: 2_000 });
    expect(mocks.resolvePlan).not.toHaveBeenCalled();

    mocks.resolvePlan.mockRejectedValue(new Error("broken cache"));
    const quota = {
      sessionID: "session",
      model: { providerID: "zai", id: "glm-5" },
      error: { type: "provider.quota", status: 429 },
      decision: { retry: true, delay: 15_000 },
    };
    await retryHook(quota);
    expect(quota.decision).toEqual({ retry: true, delay: 15_000 });
  });

  it("disposes the registered hook on unload", async () => {
    const { cleanup, dispose } = await setup();
    await cleanup?.();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("fails parented children promptly and notifies the parent after reset", async () => {
    vi.useFakeTimers();
    try {
      mocks.resolvePlan.mockResolvedValue({
        delayMs: 1_000,
        resetAtMs: Date.now() + 1_000,
        quotaProviderIds: ["zai"],
      });
      const { retryHook, get, synthetic } = await setup();
      get.mockResolvedValue({ id: "child", parentID: "parent" });
      const event = {
        sessionID: "child",
        model: { providerID: "zai", id: "glm-5" },
        error: { type: "provider.quota", status: 429 },
        decision: { retry: true, delay: 15_000 },
      };

      await retryHook(event);
      expect(event.decision).toEqual({ retry: false });
      expect(synthetic).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1_000);
      expect(synthetic).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionID: "parent",
          text: expect.stringContaining("child"),
          metadata: expect.objectContaining({ childIDs: ["child"], count: 1 }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps pacing forks even when lineage metadata is present", async () => {
    mocks.resolvePlan.mockResolvedValue({
      delayMs: 60_000,
      resetAtMs: Date.now() + 60_000,
      quotaProviderIds: ["zai"],
    });
    const { retryHook, get } = await setup();
    get.mockResolvedValue({
      id: "fork",
      parentID: "historical-parent",
      fork: { sessionID: "historical-parent", boundary: { type: "through" } },
    });
    const event = {
      sessionID: "fork",
      model: { providerID: "zai", id: "glm-5" },
      error: { type: "provider.quota", status: 429 },
      decision: { retry: true, delay: 2_000 },
    };

    await retryHook(event);
    expect(event.decision).toEqual({ retry: true, delay: 60_000 });
  });
});
