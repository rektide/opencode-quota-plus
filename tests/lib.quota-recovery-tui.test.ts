import { describe, expect, it, vi } from "vitest";
import type {
  RecoveryLocation,
  RecoveryNotice,
  RecoveryRpcClient,
  RecoveryState,
} from "../src/lib/quota-recovery-contract.js";
import {
  createRecoveryControl,
  getRecoveryRpc,
  recoveryControlLabel,
  subscribeRecoveryNotices,
} from "../src/lib/quota-recovery-tui.js";

const location = { directory: "/workspace" };
const initial: RecoveryState = {
  sessionID: "root",
  enabled: true,
  destination: "assistant",
  override: "inherit",
};

function fixture() {
  const state = vi.fn(async () => initial);
  const set = vi.fn(async () => initial);
  const stops = [vi.fn(), vi.fn()];
  const listeners: {
    changed?: (event: { location: RecoveryLocation; data: RecoveryState }) => void;
    notice?: (event: { location: RecoveryLocation; data: RecoveryNotice }) => void;
  } = {};
  const rpc: RecoveryRpcClient = {
    state,
    set,
    events: {
      on: vi.fn((name, handler) => {
        if (name === "changed")
          listeners.changed = handler as NonNullable<typeof listeners.changed>;
        if (name === "notice") listeners.notice = handler as NonNullable<typeof listeners.notice>;
        return stops[name === "changed" ? 0 : 1]!;
      }),
    },
  };
  return { rpc, state, set, stops, listeners };
}

describe("quota recovery control", () => {
  it("detects native RPC without requiring Composed or a host module import", () => {
    expect(getRecoveryRpc({})).toBeUndefined();
    expect(getRecoveryRpc(undefined)).toBeUndefined();
    const test = fixture();
    expect(getRecoveryRpc({ rpc: () => test.rpc })).toBe(test.rpc);
  });

  it("cycles explicit session overrides, routes to the session location and returns to inherit", async () => {
    const test = fixture();
    const update = vi.fn();
    const onError = vi.fn();
    const control = createRecoveryControl({
      rpc: test.rpc,
      sessionID: "root",
      location: () => location,
      update,
      onError,
    });
    await Promise.resolve();
    expect(update).toHaveBeenLastCalledWith(initial, false);
    for (const override of ["assistant", "human", "both", "off", "inherit"] as const) {
      const next = {
        ...initial,
        override,
        destination: override === "inherit" ? "assistant" : override,
      };
      test.state.mockResolvedValue(next);
      test.set.mockResolvedValue(next);
      await control.activate();
      expect(test.set).toHaveBeenLastCalledWith({ sessionID: "root", override }, { location });
      expect(update).toHaveBeenLastCalledWith(next, false);
    }
    expect(onError).not.toHaveBeenCalled();
    control.dispose();
    expect(test.stops[0]).toHaveBeenCalledOnce();
  });

  it("coalesces clicks during a write, refetches remote changes and reports write failures", async () => {
    const test = fixture();
    const update = vi.fn();
    const onError = vi.fn();
    const control = createRecoveryControl({
      rpc: test.rpc,
      sessionID: "root",
      location: () => location,
      update,
      onError,
    });
    await Promise.resolve();
    let reject!: (error: Error) => void;
    test.set.mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    const write = control.activate();
    await control.activate();
    expect(test.set).toHaveBeenCalledOnce();
    reject(new Error("unavailable"));
    await write;
    expect(onError).toHaveBeenCalledOnce();
    expect(update).toHaveBeenLastCalledWith(initial, false);
    test.listeners.changed?.({ location: { directory: "/other" }, data: initial });
    expect(test.state).toHaveBeenCalledTimes(2);
    test.listeners.changed?.({ location, data: initial });
    expect(test.state).toHaveBeenCalledTimes(3);
    control.dispose();
  });

  it("drops stale and post-disposal reads and does not write without session placement", async () => {
    const test = fixture();
    const update = vi.fn();
    let settle!: (state: RecoveryState) => void;
    test.state.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    );
    const control = createRecoveryControl({
      rpc: test.rpc,
      sessionID: "root",
      location: () => location,
      update,
      onError: vi.fn(),
    });
    control.refresh();
    await Promise.resolve();
    settle({ ...initial, destination: "off" });
    await Promise.resolve();
    expect(update).toHaveBeenCalledOnce();
    control.dispose();
    await control.activate();
    expect(test.set).not.toHaveBeenCalled();
    const unknown = createRecoveryControl({
      rpc: test.rpc,
      sessionID: "root",
      location: () => undefined,
      update,
      onError: vi.fn(),
    });
    await unknown.activate();
    expect(test.set).not.toHaveBeenCalled();
    expect(update).toHaveBeenLastCalledWith(undefined, false);
    unknown.dispose();
  });

  it("labels effective policy without claiming an override when inheriting", () => {
    expect(recoveryControlLabel(initial)).toBe("Quota reset: AI (config)");
    expect(recoveryControlLabel({ ...initial, enabled: false })).toBe(
      "Quota reset: disabled (config)",
    );
    expect(recoveryControlLabel({ ...initial, destination: "human", override: "human" })).toBe(
      "Quota reset: human",
    );
    expect(recoveryControlLabel(undefined)).toBe("Quota reset: unavailable");
  });

  it("displays human notices only in the matching location and stops its subscription", () => {
    const test = fixture();
    const showToast = vi.fn();
    const stop = subscribeRecoveryNotices({ rpc: test.rpc, location: () => location, showToast });
    const data = { sessionID: "root", text: "Quota reset", duration: 5000 };
    test.listeners.notice?.({ location: { ...location, workspaceID: "other" }, data });
    expect(showToast).not.toHaveBeenCalled();
    test.listeners.notice?.({ location, data });
    expect(showToast).toHaveBeenCalledWith({
      title: "Quota available · root",
      message: "Quota reset",
      duration: 5000,
      variant: "success",
    });
    stop();
    expect(test.stops[1]).toHaveBeenCalledOnce();
  });
});
