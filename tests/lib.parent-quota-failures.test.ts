import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createParentQuotaFailureNotifier } from "../src/lib/parent-quota-failures.js";

describe("parent quota failure notifier", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("groups children by parent and announces only those whose reset has passed", async () => {
    const notify = vi.fn(async () => {});
    const notifier = createParentQuotaFailureNotifier({ notify });
    const now = Date.now();
    notifier.record({
      parentSessionID: "parent",
      childSessionID: "child-one",
      providerID: "zai",
      modelID: "glm-5",
      availableAtMs: now + 1_000,
    });
    notifier.record({
      parentSessionID: "parent",
      childSessionID: "child-two",
      providerID: "zai",
      modelID: "glm-5",
      availableAtMs: now + 2_000,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(notify).toHaveBeenCalledWith(
      "parent",
      expect.arrayContaining([expect.objectContaining({ childSessionID: "child-one" })]),
    );
    expect(notify.mock.calls[0]?.[1]).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(notify).toHaveBeenLastCalledWith(
      "parent",
      expect.arrayContaining([expect.objectContaining({ childSessionID: "child-two" })]),
    );
  });

  it("coalesces children sharing a reset and clears timers on disposal", async () => {
    const notify = vi.fn(async () => {});
    const notifier = createParentQuotaFailureNotifier({ notify });
    const availableAtMs = Date.now() + 1_000;
    for (const childSessionID of ["child-one", "child-two"]) {
      notifier.record({
        parentSessionID: "parent",
        childSessionID,
        providerID: "zai",
        modelID: "glm-5",
        availableAtMs,
      });
    }

    await vi.advanceTimersByTimeAsync(1_000);
    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0]?.[1]).toHaveLength(2);

    notifier.record({
      parentSessionID: "parent",
      childSessionID: "child-three",
      providerID: "zai",
      modelID: "glm-5",
      availableAtMs: Date.now() + 1_000,
    });
    notifier.dispose();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(notify).toHaveBeenCalledOnce();
  });
});
