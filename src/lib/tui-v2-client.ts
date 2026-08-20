/**
 * OpenCode v2 TUI plugin client adapter.
 *
 * OpenCode v2 replaced the SDK's `client.config.providers()` with
 * `client.provider.list()` (`GET /api/provider`, response shaped
 * `{ location, data: Provider.Info[] }`). Quota providers that gate on the
 * runtime provider list (Z.ai, Zhipu, MiniMax, ...) were silently disabled
 * under v2 because the legacy call threw before it could resolve any ids,
 * leaving only providers whose availability does not depend on the runtime
 * list (for example OpenRouter) to render, alongside their errors.
 *
 * This adapter normalizes the host client into the shape the quota runtime
 * expects, resolving the provider id set through, in order:
 *
 * 1. the v2 SDK `provider.list()` response,
 * 2. the legacy v1 SDK `config.providers()` response,
 * 3. the same file-based resolution the CLI uses (config + credential stores).
 *
 * Every step is failure-tolerant: a broken or missing host surface falls
 * through instead of throwing, so providers that can be resolved keep
 * rendering and only genuinely failing providers surface as error rows
 * after the working entries.
 */

import { createCliQuotaClient } from "./cli-show.js";
import type { RuntimeContextRootHints } from "./config-file-utils.js";
import { resolveRuntimeContextRoots } from "./config-file-utils.js";
import type { QuotaRuntimeClient } from "./quota-runtime-context.js";

type V2ProviderListResponse = {
  location?: unknown;
  data?: unknown;
};

type HostClient = {
  provider?: { list?: (input?: unknown) => Promise<V2ProviderListResponse | unknown[]> };
  config?: {
    providers?: () => Promise<unknown>;
    get?: () => Promise<unknown>;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractProviderIds(value: unknown): string[] {
  // Accept the known response shapes:
  // - v2 `provider.list()`: `{ location, data: Provider.Info[] }`
  // - v2/legacy arrays passed through directly
  // - v1 `config.providers()`: `{ data: { providers: [{ id }] } }`
  let list: unknown = value;
  if (isRecord(value) && "data" in value) {
    const data = value.data;
    list = Array.isArray(data)
      ? data
      : isRecord(data) && Array.isArray(data.providers)
        ? data.providers
        : [];
  }

  if (!Array.isArray(list)) return [];

  const ids: string[] = [];
  for (const item of list) {
    if (isRecord(item) && typeof item.id === "string" && item.id.trim()) {
      ids.push(item.id);
    }
  }
  return [...new Set(ids)];
}

function toProvidersResponse(ids: string[]): { data: { providers: Array<{ id: string }> } } {
  return { data: { providers: ids.map((id) => ({ id })) } };
}

const clientCache = new WeakMap<object, QuotaRuntimeClient>();
const primitiveClientCache = new Map<unknown, QuotaRuntimeClient>();

export function createTuiV2QuotaClient(
  rawClient: unknown,
  params?: { roots?: RuntimeContextRootHints },
): QuotaRuntimeClient {
  const useWeakCache = typeof rawClient === "object" && rawClient !== null;
  const cacheKey = useWeakCache ? rawClient : String(rawClient);
  const existing = useWeakCache
    ? clientCache.get(cacheKey as object)
    : primitiveClientCache.get(cacheKey);
  if (existing) return existing;

  const host = (rawClient ?? {}) as HostClient;
  const configRoot = resolveRuntimeContextRoots(
    params?.roots ?? { fallbackDirectory: process.cwd() },
  ).configRoot;
  const fileClient = createCliQuotaClient({ configRootDir: configRoot });

  const client: QuotaRuntimeClient = {
    config: {
      providers: async () => {
        // 1. v2 SDK: client.provider.list() -> { location, data: [...] }
        try {
          const list = host.provider?.list;
          if (typeof list === "function") {
            const ids = extractProviderIds(await list.call(host.provider));
            if (ids.length > 0) return toProvidersResponse(ids);
          }
        } catch {
          // Fall through to the legacy SDK surface.
        }

        // 2. v1 SDK: client.config.providers() -> { data: { providers: [...] } }
        try {
          const legacy = host.config?.providers;
          if (typeof legacy === "function") {
            const ids = extractProviderIds(await legacy.call(host.config));
            if (ids.length > 0) return toProvidersResponse(ids);
          }
        } catch {
          // Fall through to file-based resolution.
        }

        // 3. File-based resolution, matching the CLI behavior.
        return await fileClient.config.providers();
      },
      get: async () => {
        try {
          const get = host.config?.get;
          if (typeof get === "function") {
            const response = await get.call(host.config);
            if (isRecord(response) && "data" in response) {
              return { data: isRecord(response.data) ? response.data : {} };
            }
          }
        } catch {
          // Fall through to file-based resolution.
        }

        return await fileClient.config.get();
      },
    },
  };

  if (useWeakCache) {
    clientCache.set(cacheKey as object, client);
  } else {
    primitiveClientCache.set(cacheKey, client);
  }
  return client;
}
