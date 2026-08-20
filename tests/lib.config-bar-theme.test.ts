import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ConfigLoaderWorkspace,
  createConfigLoaderWorkspace,
  createEmptyRuntimeDirCandidates,
} from "./helpers/config-loader-test-harness.js";

const runtimeDirs = vi.hoisted(() => ({
  value: {
    dataDirs: [] as string[],
    configDirs: [] as string[],
    cacheDirs: [] as string[],
    stateDirs: [] as string[],
  },
}));

vi.mock("../src/lib/opencode-runtime-paths.js", () => ({
  getOpencodeRuntimeDirCandidates: () => runtimeDirs.value,
}));

import { createLoadConfigMeta, loadConfig } from "../src/lib/config.js";

describe("barTheme config", () => {
  let workspace: ConfigLoaderWorkspace;
  let isolatedCwd: string;
  let savedConfigDir: string | undefined;

  beforeEach(() => {
    savedConfigDir = process.env.OPENCODE_CONFIG_DIR;
    delete process.env.OPENCODE_CONFIG_DIR;
    workspace = createConfigLoaderWorkspace("opencode-quota-bar-theme-");
    isolatedCwd = workspace.workspaceDir;
    runtimeDirs.value = createEmptyRuntimeDirCandidates();
  });

  afterEach(() => {
    if (savedConfigDir !== undefined) process.env.OPENCODE_CONFIG_DIR = savedConfigDir;
    else delete process.env.OPENCODE_CONFIG_DIR;
    workspace.cleanup();
  });

  async function loadSdkConfig(quotaToast: Record<string, unknown>) {
    const meta = createLoadConfigMeta();
    const config = await loadConfig(
      {
        config: {
          get: async () => ({ data: { experimental: { quotaToast } } }),
        },
      },
      meta,
      { cwd: isolatedCwd },
    );
    return { config, meta };
  }

  it("defaults to classic", async () => {
    const { config } = await loadSdkConfig({});
    expect(config.barTheme).toBe("classic");
  });

  it("accepts every registered theme id", async () => {
    for (const id of [
      "classic",
      "solid",
      "shade",
      "soft",
      "smooth",
      "dots",
      "rings",
      "squares",
      "smol",
      "heavy",
      "light",
      "halves",
    ]) {
      const { config } = await loadSdkConfig({ barTheme: id });
      expect(config.barTheme).toBe(id);
    }
  });

  it("reports unknown ids and keeps the default", async () => {
    const { config, meta } = await loadSdkConfig({ barTheme: "sparkles" });

    expect(config.barTheme).toBe("classic");
    expect(meta.configIssues).toEqual([
      expect.objectContaining({
        path: "client.config.get",
        key: "barTheme",
        message: expect.stringContaining("classic"),
      }),
    ]);
  });
});
