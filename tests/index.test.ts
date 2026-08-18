import { describe, expect, it, vi } from "vitest";

const pluginMocks = vi.hoisted(() => ({
  QuotaToastPlugin: vi.fn(),
}));

vi.mock("../src/plugin.js", () => ({
  QuotaToastPlugin: pluginMocks.QuotaToastPlugin,
}));

describe("package entrypoint", () => {
  it("retains the V1 server plugin on the default export", async () => {
    const mod = await import("../src/index.js");

    expect(mod.default).toEqual({
      id: "@slkiser/opencode-quota",
      server: pluginMocks.QuotaToastPlugin,
      setup: expect.any(Function),
    });
    expect(mod.QuotaToastPlugin).toBe(pluginMocks.QuotaToastPlugin);
  });
});
