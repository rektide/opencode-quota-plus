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

describe("entry visibility config", () => {
  let workspace: ConfigLoaderWorkspace;
  let isolatedCwd: string;
  let savedConfigDir: string | undefined;

  beforeEach(() => {
    savedConfigDir = process.env.OPENCODE_CONFIG_DIR;
    delete process.env.OPENCODE_CONFIG_DIR;
    workspace = createConfigLoaderWorkspace("opencode-quota-entry-visibility-");
    isolatedCwd = workspace.workspaceDir;
    runtimeDirs.value = createEmptyRuntimeDirCandidates();
  });

  afterEach(() => {
    if (savedConfigDir !== undefined) process.env.OPENCODE_CONFIG_DIR = savedConfigDir;
    else delete process.env.OPENCODE_CONFIG_DIR;
    workspace.cleanup();
  });

  async function loadSdkConfig(
    quotaToast: Record<string, unknown>,
    options: { pluginOptions?: Record<string, unknown> } = {},
  ) {
    const meta = createLoadConfigMeta();
    const config = await loadConfig(
      {
        config: {
          get: async () => ({
            data: {
              experimental: {
                quotaToast,
              },
            },
          }),
        },
      },
      meta,
      { cwd: isolatedCwd, pluginOptions: options.pluginOptions },
    );
    return { config, meta };
  }

  it("accepts valid patterns from experimental.quotaToast", async () => {
    const { config, meta } = await loadSdkConfig({
      hiddenEntries: ["zai:mcp", "deepseek:balance"],
      quietEntries: ["openai:weekly"],
    });

    expect(config.hiddenEntries).toEqual(["zai:mcp", "deepseek:balance"]);
    expect(config.quietEntries).toEqual(["openai:weekly"]);
    expect(meta.settingSources?.hiddenEntries).toBe("client.config.get");
    expect(meta.settingSources?.quietEntries).toBe("client.config.get");
    expect(meta.configIssues).toEqual([]);
  });

  it("reports per-index issues for invalid patterns without dropping valid ones", async () => {
    const { config, meta } = await loadSdkConfig({
      hiddenEntries: ["zai:mcp", 42, "zai:bogus"],
    });

    expect(config.hiddenEntries).toEqual(["zai:mcp"]);
    expect(meta.configIssues).toEqual([
      expect.objectContaining({ path: "client.config.get", key: "hiddenEntries[1]" }),
      expect.objectContaining({ path: "client.config.get", key: "hiddenEntries[2]" }),
    ]);
  });

  it("ignores non-array values", async () => {
    const { config, meta } = await loadSdkConfig({ hiddenEntries: "zai:mcp" });

    expect(config.hiddenEntries).toEqual([]);
    expect(meta.configIssues).toEqual([expect.objectContaining({ key: "hiddenEntries" })]);
  });

  it("applies plugin options with the highest precedence", async () => {
    const { config, meta } = await loadSdkConfig(
      { hiddenEntries: ["deepseek:balance"] },
      { pluginOptions: { hiddenEntries: ["zai:mcp", "deepseek:balance"] } },
    );

    expect(config.hiddenEntries).toEqual(["zai:mcp", "deepseek:balance"]);
    expect(meta.settingSources?.hiddenEntries).toBe("plugin.options");
  });

  it("surfaces plugin option issues under the plugin.options path", async () => {
    const { meta } = await loadSdkConfig({}, { pluginOptions: { quietEntries: ["zai:bogus"] } });

    expect(meta.configIssues).toEqual([
      expect.objectContaining({ path: "plugin.options", key: "quietEntries[0]" }),
    ]);
  });
});
