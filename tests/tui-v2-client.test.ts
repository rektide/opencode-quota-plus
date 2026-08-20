import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createTuiV2QuotaClient } from "../src/lib/tui-v2-client.js";

const ORIGINAL_XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME;
const ORIGINAL_XDG_DATA_HOME = process.env.XDG_DATA_HOME;
const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

/**
 * Isolates the file-based resolution from this machine's real OpenCode
 * config, credentials, and provider env vars.
 */
async function withIsolatedFileResolution<T>(run: (base: string) => Promise<T>): Promise<T> {
  const base = await mkdtemp(join(tmpdir(), "quota-v2-client-"));
  const previous = {
    xdgConfig: process.env.XDG_CONFIG_HOME,
    xdgData: process.env.XDG_DATA_HOME,
    home: process.env.HOME,
    openrouter: process.env.OPENROUTER_API_KEY,
  };
  try {
    const configHome = join(base, "config");
    const dataHome = join(base, "data");
    await mkdir(join(configHome, "opencode"), { recursive: true });
    await mkdir(join(dataHome, "opencode"), { recursive: true });
    await writeFile(
      join(configHome, "opencode", "opencode.json"),
      JSON.stringify({ provider: { "zai-coding-plan": {} } }),
    );
    process.env.XDG_CONFIG_HOME = configHome;
    process.env.XDG_DATA_HOME = dataHome;
    process.env.HOME = join(base, "home");
    await mkdir(process.env.HOME, { recursive: true });
    delete process.env.OPENROUTER_API_KEY;
    return await run(base);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await rm(base, { recursive: true, force: true });
  }
}

async function providerIds(client: { config: { providers: () => Promise<unknown> } }) {
  const response = (await client.config.providers()) as {
    data?: { providers?: Array<{ id: string }> };
  };
  return (response.data?.providers ?? []).map((provider) => provider.id).sort();
}

afterEach(() => {
  if (ORIGINAL_XDG_CONFIG_HOME === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = ORIGINAL_XDG_CONFIG_HOME;
  }
  if (ORIGINAL_XDG_DATA_HOME === undefined) {
    delete process.env.XDG_DATA_HOME;
  } else {
    process.env.XDG_DATA_HOME = ORIGINAL_XDG_DATA_HOME;
  }
  if (ORIGINAL_HOME === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = ORIGINAL_HOME;
  }
  if (ORIGINAL_OPENROUTER_API_KEY === undefined) {
    delete process.env.OPENROUTER_API_KEY;
  } else {
    process.env.OPENROUTER_API_KEY = ORIGINAL_OPENROUTER_API_KEY;
  }
});

describe("createTuiV2QuotaClient", () => {
  it("resolves provider ids from the v2 provider.list() response", async () => {
    const host = {
      provider: {
        list: async () => ({
          location: { directory: "/tmp" },
          data: [{ id: "zai-coding-plan" }, { id: "openai" }, { id: "zai-coding-plan" }],
        }),
      },
    };

    const client = createTuiV2QuotaClient(host, { roots: { fallbackDirectory: tmpdir() } });
    await expect(providerIds(client)).resolves.toEqual(["openai", "zai-coding-plan"]);
  });

  it("accepts a bare array from provider.list()", async () => {
    const host = {
      provider: {
        list: async () => [{ id: "zai-coding-plan" }],
      },
    };

    const client = createTuiV2QuotaClient(host, { roots: { fallbackDirectory: tmpdir() } });
    await expect(providerIds(client)).resolves.toEqual(["zai-coding-plan"]);
  });

  it("falls back to the legacy v1 config.providers() surface", async () => {
    const host = {
      config: {
        providers: async () => ({
          data: { providers: [{ id: "zai-coding-plan" }, { id: "openai" }] },
        }),
        get: async () => ({ data: {} }),
      },
    };

    const client = createTuiV2QuotaClient(host, { roots: { fallbackDirectory: tmpdir() } });
    await expect(providerIds(client)).resolves.toEqual(["openai", "zai-coding-plan"]);
  });

  it("falls back to file-based resolution when host surfaces throw", async () => {
    await withIsolatedFileResolution(async (base) => {
      const host = {
        provider: {
          list: () => {
            throw new Error("provider.list unavailable");
          },
        },
        config: {
          providers: () => {
            throw new TypeError("client.config.providers is not a function");
          },
        },
      };

      const client = createTuiV2QuotaClient(host, {
        roots: { fallbackDirectory: join(base, "workspace") },
      });
      // The file fallback reuses the CLI resolution, which may also detect
      // locally available credentials (e.g. a Claude CLI install); assert the
      // configured provider resolves rather than an exact environment match.
      expect(await providerIds(client)).toContain("zai-coding-plan");
    });
  });

  it("falls back to file-based resolution for a missing host client", async () => {
    await withIsolatedFileResolution(async (base) => {
      const client = createTuiV2QuotaClient(undefined, {
        roots: { fallbackDirectory: join(base, "workspace") },
      });
      expect(await providerIds(client)).toContain("zai-coding-plan");
    });
  });

  it("normalizes the v2 config.get() envelope", async () => {
    const host = {
      config: {
        get: async () => ({
          location: { directory: "/tmp" },
          data: { experimental: { quotaToast: { enabled: false } } },
        }),
      },
    };

    const client = createTuiV2QuotaClient(host, { roots: { fallbackDirectory: tmpdir() } });
    await expect(client.config.get()).resolves.toEqual({
      data: { experimental: { quotaToast: { enabled: false } } },
    });
  });

  it("memoizes the adapter per host client", () => {
    const host = { provider: { list: async () => ({ data: [] }) } };
    const clientA = createTuiV2QuotaClient(host, { roots: { fallbackDirectory: tmpdir() } });
    const clientB = createTuiV2QuotaClient(host, { roots: { fallbackDirectory: tmpdir() } });
    expect(clientB).toBe(clientA);
  });
});
