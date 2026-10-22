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

import type { RecoveryOverride } from "../src/lib/quota-recovery-contract.js";
import { DEFAULT_CONFIG } from "../src/lib/types.js";
import serverPlugin from "../src/server.js";

type TestRetryEvent = {
  model: { providerID: string; id: string };
  error: { type: string; status?: number };
  decision: { retry: boolean; delay: number };
};

describe("V2 server retry pacing", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    mocks.resolveRuntime.mockReset().mockResolvedValue({ config: DEFAULT_CONFIG });
    mocks.resolvePlan.mockReset();
  });

  async function setup(withRpc = true) {
    let retryHook: ((event: TestRetryEvent) => Promise<void>) | undefined;
    const dispose = vi.fn(async () => {});
    const get = vi.fn(async ({ sessionID }: { sessionID: string }) => ({ id: sessionID }));
    const synthetic = vi.fn(async () => ({}));
    const emit = vi.fn(async () => {});
    const disposeRpc = vi.fn(async () => {});
    let handlers!: {
      state(input: { sessionID: string }): Promise<unknown>;
      set(input: { sessionID: string; override: RecoveryOverride }): Promise<unknown>;
    };
    const cleanup = await serverPlugin.setup({
      options: {},
      location: { directory: "/workspace" },
      provider: { list: async () => [] },
      rpc: withRpc
        ? {
            register: vi.fn(async (_definition, registered) => {
              handlers = registered;
              return { events: { emit }, dispose: disposeRpc };
            }),
          }
        : undefined,
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
    return { retryHook, cleanup, dispose, get, synthetic, emit, handlers, disposeRpc };
  }

  it("fails a root session promptly and revives it after quota resets", async () => {
    vi.useFakeTimers();
    try {
      mocks.resolvePlan.mockResolvedValue({
        delayMs: 11_000,
        resetAtMs: Date.now() + 1_000,
        quotaProviderIds: ["zai"],
      });
      const { retryHook, synthetic } = await setup();
      const event = {
        sessionID: "root",
        model: { providerID: "zai", id: "glm-5" },
        error: { type: "provider.quota", status: 429 },
        decision: { retry: true, delay: 15_000 },
      };

      await retryHook(event);
      expect(event.decision).toEqual({ retry: false });
      expect(mocks.resolvePlan).toHaveBeenCalledWith(
        expect.objectContaining({ providerID: "zai", modelID: "glm-5" }),
      );

      await vi.advanceTimersByTimeAsync(11_000);
      expect(synthetic).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionID: "root",
          resume: true,
          text: expect.stringContaining("Continue its work"),
          metadata: expect.objectContaining({
            sessionWasStalled: true,
            childIDs: [],
          }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
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
    const { cleanup, dispose, disposeRpc } = await setup();
    await cleanup?.();
    expect(dispose).toHaveBeenCalledOnce();
    expect(disposeRpc).toHaveBeenCalledOnce();
  });

  it("fails parented children promptly and notifies the parent after reset", async () => {
    vi.useFakeTimers();
    try {
      mocks.resolvePlan.mockResolvedValue({
        delayMs: 11_000,
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

      await vi.advanceTimersByTimeAsync(11_000);
      expect(synthetic).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionID: "parent",
          text: expect.stringContaining("child"),
          metadata: expect.objectContaining({ childIDs: ["child"], childCount: 1 }),
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

  it("adds quota-failed children to the stalled parent's revival message", async () => {
    vi.useFakeTimers();
    try {
      mocks.resolvePlan.mockResolvedValue({
        delayMs: 11_000,
        resetAtMs: Date.now() + 1_000,
        quotaProviderIds: ["zai"],
      });
      const { retryHook, get, synthetic } = await setup();
      get.mockImplementation(async ({ sessionID }) =>
        sessionID === "child" ? { id: "child", parentID: "parent" } : { id: sessionID },
      );
      const failure = (sessionID: string) => ({
        sessionID,
        model: { providerID: "zai", id: "glm-5" },
        error: { type: "provider.quota", status: 429 },
        decision: { retry: true, delay: 15_000 },
      });

      await retryHook(failure("child"));
      await retryHook(failure("parent"));
      await vi.advanceTimersByTimeAsync(11_000);

      expect(synthetic).toHaveBeenCalledOnce();
      expect(synthetic).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionID: "parent",
          text: expect.stringMatching(
            /Continue its work[\s\S]*still-useful child work[\s\S]*child/,
          ),
          metadata: expect.objectContaining({
            sessionWasStalled: true,
            childIDs: ["child"],
          }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    "assistant",
    "human",
    "both",
    "off",
  ] as const)("routes configured %s recovery at delivery without changing root admission", async (destination) => {
    vi.useFakeTimers();
    mocks.resolveRuntime.mockResolvedValue({
      config: { ...DEFAULT_CONFIG, retryPacing: { enabled: true, recoveryNotice: destination } },
    });
    mocks.resolvePlan.mockResolvedValue({ delayMs: 11_000, resetAtMs: Date.now() + 1_000 });
    const test = await setup();
    const event = {
      sessionID: "root",
      model: { providerID: "zai", id: "glm-5" },
      error: { type: "provider.quota", status: 429 },
      decision: { retry: true, delay: 2_000 },
    };
    await test.retryHook(event);
    expect(event.decision).toEqual({ retry: false });
    await vi.advanceTimersByTimeAsync(11_000);
    expect(test.synthetic).toHaveBeenCalledTimes(
      destination === "assistant" || destination === "both" ? 1 : 0,
    );
    expect(test.emit).toHaveBeenCalledTimes(
      destination === "human" || destination === "both" ? 1 : 0,
    );
    if (destination === "human" || destination === "both") {
      expect(test.emit).toHaveBeenCalledWith("notice", {
        sessionID: "root",
        text: expect.stringContaining("Continue its work"),
        duration: DEFAULT_CONFIG.toastDurationMs,
      });
    }
    await test.cleanup();
  });

  it("applies session-specific overrides at delivery and inherit removes them", async () => {
    vi.useFakeTimers();
    mocks.resolvePlan.mockResolvedValue({ delayMs: 11_000, resetAtMs: Date.now() + 1_000 });
    const test = await setup();
    const failure = (sessionID: string) => ({
      sessionID,
      model: { providerID: "zai", id: "glm-5" },
      error: { type: "provider.quota", status: 429 },
      decision: { retry: true, delay: 2_000 },
    });
    await test.retryHook(failure("root"));
    await test.retryHook(failure("other"));
    expect(await test.handlers.set({ sessionID: "root", override: "human" })).toEqual({
      sessionID: "root",
      enabled: true,
      destination: "human",
      override: "human",
    });
    await vi.advanceTimersByTimeAsync(11_000);
    expect(test.synthetic).toHaveBeenCalledOnce();
    expect(test.synthetic).toHaveBeenCalledWith(
      expect.objectContaining({ sessionID: "other", resume: true }),
    );
    expect(test.emit).toHaveBeenCalledWith(
      "notice",
      expect.objectContaining({ sessionID: "root" }),
    );
    expect(await test.handlers.set({ sessionID: "root", override: "inherit" })).toEqual({
      sessionID: "root",
      enabled: true,
      destination: "assistant",
      override: "inherit",
    });
    await test.cleanup();
  });

  it("honors disabling recovery while a notice is pending", async () => {
    vi.useFakeTimers();
    mocks.resolvePlan.mockResolvedValue({ delayMs: 11_000, resetAtMs: Date.now() + 1_000 });
    const test = await setup();
    await test.retryHook({
      sessionID: "root",
      model: { providerID: "zai", id: "glm-5" },
      error: { type: "provider.quota" },
      decision: { retry: true, delay: 2_000 },
    });
    mocks.resolveRuntime.mockResolvedValue({
      config: { ...DEFAULT_CONFIG, retryPacing: { ...DEFAULT_CONFIG.retryPacing, enabled: false } },
    });
    await vi.advanceTimersByTimeAsync(11_000);
    expect(test.synthetic).not.toHaveBeenCalled();
    expect(test.emit).not.toHaveBeenCalled();
    await test.cleanup();
  });

  it("keeps default resumptive delivery usable on hosts without RPC or Composed", async () => {
    vi.useFakeTimers();
    mocks.resolvePlan.mockResolvedValue({ delayMs: 11_000, resetAtMs: Date.now() + 1_000 });
    const test = await setup(false);
    await test.retryHook({
      sessionID: "root",
      model: { providerID: "zai", id: "glm-5" },
      error: { type: "provider.quota" },
      decision: { retry: true, delay: 2_000 },
    });
    await vi.advanceTimersByTimeAsync(11_000);
    expect(test.synthetic).toHaveBeenCalledWith(
      expect.objectContaining({ sessionID: "root", resume: true }),
    );
    await test.cleanup();
  });

  it("respects enableToast=false in human mode without silently sending to the AI", async () => {
    vi.useFakeTimers();
    mocks.resolveRuntime.mockResolvedValue({
      config: {
        ...DEFAULT_CONFIG,
        enableToast: false,
        retryPacing: { enabled: true, recoveryNotice: "human" },
      },
    });
    mocks.resolvePlan.mockResolvedValue({ delayMs: 11_000, resetAtMs: Date.now() + 1_000 });
    const test = await setup();
    await test.retryHook({
      sessionID: "root",
      model: { providerID: "zai", id: "glm-5" },
      error: { type: "provider.quota" },
      decision: { retry: true, delay: 2_000 },
    });
    await vi.advanceTimersByTimeAsync(11_000);
    expect(test.synthetic).not.toHaveBeenCalled();
    expect(test.emit).not.toHaveBeenCalled();
    await test.cleanup();
  });

  it("uses the notified parent's override rather than the child's and retains child IDs in human output", async () => {
    vi.useFakeTimers();
    mocks.resolvePlan.mockResolvedValue({ delayMs: 11_000, resetAtMs: Date.now() + 1_000 });
    const test = await setup();
    test.get.mockImplementation(async ({ sessionID }) =>
      sessionID === "child" ? { id: sessionID, parentID: "parent" } : { id: sessionID },
    );
    await test.handlers.set({ sessionID: "parent", override: "human" });
    await test.handlers.set({ sessionID: "child", override: "off" });
    await test.retryHook({
      sessionID: "child",
      model: { providerID: "zai", id: "glm-5" },
      error: { type: "provider.quota" },
      decision: { retry: true, delay: 2_000 },
    });
    await vi.advanceTimersByTimeAsync(11_000);
    expect(test.synthetic).not.toHaveBeenCalled();
    expect(test.emit).toHaveBeenCalledWith(
      "notice",
      expect.objectContaining({
        sessionID: "parent",
        text: expect.stringContaining("- child"),
      }),
    );
    await test.cleanup();
  });

  it("does not replay an admitted AI notice when its supplementary UI event fails", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.resolveRuntime.mockResolvedValue({
      config: { ...DEFAULT_CONFIG, retryPacing: { enabled: true, recoveryNotice: "both" } },
    });
    mocks.resolvePlan.mockResolvedValue({ delayMs: 11_000, resetAtMs: Date.now() + 1_000 });
    const test = await setup();
    test.emit.mockRejectedValue(new Error("event failure"));
    await test.retryHook({
      sessionID: "root",
      model: { providerID: "zai", id: "glm-5" },
      error: { type: "provider.quota" },
      decision: { retry: true, delay: 2_000 },
    });
    await vi.advanceTimersByTimeAsync(71_000);
    expect(test.synthetic).toHaveBeenCalledOnce();
    expect(test.emit).toHaveBeenCalledOnce();
    await test.cleanup();
  });
});
