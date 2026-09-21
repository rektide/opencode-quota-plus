import type { QuotaProvider, QuotaProviderContext, QuotaToastEntry } from "./entries.js";
import { isPercentEntry } from "./entries.js";
import { getQuotaProviderIdsForRuntimeId } from "./provider-metadata.js";
import { QUOTA_PROVIDERS_AGGREGATE_ID } from "./quota-providers.js";
import {
  createQuotaProviderRuntimeContext,
  type QuotaRuntimeContext,
} from "./quota-runtime-context.js";
import {
  readCachedProviderResult,
  type CachedProviderRead,
} from "./quota-state.js";

/** Let the provider finish opening its window before the next request arrives. */
export const RETRY_RESET_MARGIN_MS = 10_000;

export interface RetryPacingPlan {
  delayMs: number;
  resetAtMs: number;
  quotaProviderIds: string[];
}

export interface RetryPacingError {
  type: string;
  status?: number;
}

type ReadCachedProviderResult = (params: {
  provider: QuotaProvider;
  ctx: QuotaProviderContext;
  ttlMs: number;
}) => Promise<CachedProviderRead>;

export function isQuotaRetryError(error: RetryPacingError): boolean {
  return (
    error.status === 429 ||
    error.type === "provider.quota" ||
    error.type === "provider.rate-limit"
  );
}

function providerMatchesModel(params: {
  provider: QuotaProvider;
  providerID: string;
  modelID: string;
  runtime: QuotaRuntimeContext;
}): boolean {
  if (
    params.runtime.config.enabledProviders !== "auto" &&
    !params.runtime.config.enabledProviders.includes(params.provider.id)
  ) {
    return false;
  }

  const canonicalIds = getQuotaProviderIdsForRuntimeId(params.providerID);
  if (canonicalIds.includes(params.provider.id as (typeof canonicalIds)[number])) return true;

  try {
    return (
      params.provider.matchesCurrentModel?.(`${params.providerID}/${params.modelID}`, {
        enabledProviders: params.runtime.config.enabledProviders,
        quotaProviders: params.runtime.config.quotaProviders,
        currentProviderID: params.providerID,
      }) === true
    );
  } catch {
    return false;
  }
}

function matchingAggregateSourceIds(params: {
  runtime: QuotaRuntimeContext;
  providerID: string;
  modelID: string;
}): Set<string> {
  return new Set(
    params.runtime.config.quotaProviders
      .filter(
        (source) =>
          source.providerId === params.providerID &&
          (source.modelIds === undefined || source.modelIds.includes(params.modelID)),
      )
      .map((source) => source.id),
  );
}

function entryResetAtMs(entry: QuotaToastEntry, nowMs: number): number | undefined {
  if (!isPercentEntry(entry) || entry.percentRemaining > 0 || !entry.resetTimeIso) return;
  const resetAtMs = Date.parse(entry.resetTimeIso);
  return Number.isFinite(resetAtMs) && resetAtMs > nowMs ? resetAtMs : undefined;
}

/**
 * Finds an hours-ahead retry delay from fresh cached quota state.
 *
 * This function never fetches provider APIs. It only acts when the active
 * provider has an exhausted percentage row with a future reset, and waits for
 * the latest reset when multiple exhausted windows apply.
 */
export async function resolveCachedRetryPacingPlan(params: {
  runtime: QuotaRuntimeContext;
  providerID: string;
  modelID: string;
  nowMs?: number;
  readCached?: ReadCachedProviderResult;
}): Promise<RetryPacingPlan | undefined> {
  const { runtime } = params;
  if (!runtime.config.enabled || !runtime.config.retryPacing.enabled) return;

  const nowMs = params.nowMs ?? Date.now();
  const matchingSources = matchingAggregateSourceIds(params);
  const providers = runtime.providers.filter((provider) =>
    providerMatchesModel({
      provider,
      providerID: params.providerID,
      modelID: params.modelID,
      runtime,
    }),
  );
  if (providers.length === 0) return;

  // Match the shared cache key written by background quota refreshes rather
  // than a session-filtered key that may never have been populated.
  const ctx = createQuotaProviderRuntimeContext({
    ...runtime,
    config: {
      ...runtime.config,
      onlyCurrentModel: false,
      showSessionTokens: false,
    },
    session: {},
    configureTelemetry: false,
  });
  const readCached = params.readCached ?? readCachedProviderResult;
  const reads = await Promise.all(
    providers.map(async (provider) => ({
      provider,
      read: await readCached({ provider, ctx, ttlMs: runtime.config.minIntervalMs }),
    })),
  );

  let resetAtMs: number | undefined;
  const quotaProviderIds = new Set<string>();
  for (const { provider, read } of reads) {
    if (!read.hit || nowMs - read.timestamp > runtime.config.minIntervalMs) continue;

    for (const entry of read.result.entries) {
      if (
        provider.id === QUOTA_PROVIDERS_AGGREGATE_ID &&
        (!entry.accounting.sourceId || !matchingSources.has(entry.accounting.sourceId))
      ) {
        continue;
      }
      const candidate = entryResetAtMs(entry, nowMs);
      if (candidate === undefined) continue;
      resetAtMs = Math.max(resetAtMs ?? 0, candidate);
      quotaProviderIds.add(provider.id);
    }
  }

  if (resetAtMs === undefined) return;
  return {
    resetAtMs,
    delayMs: resetAtMs - nowMs + RETRY_RESET_MARGIN_MS,
    quotaProviderIds: [...quotaProviderIds],
  };
}
