import { resolveQuotaRuntimeContext } from "./lib/quota-runtime-context.js";
import {
  isQuotaRetryError,
  type RetryPacingError,
  resolveCachedRetryPacingPlan,
} from "./lib/retry-pacing.js";
import { createTuiV2QuotaClient } from "./lib/tui-v2-client.js";

type RetryDecision = { retry: false } | { retry: true; delay: number };

interface RetryHookEvent {
  readonly model: { providerID: string; id: string };
  readonly error: RetryPacingError;
  decision: RetryDecision;
}

interface Registration {
  dispose(): Promise<void>;
}

interface ServerPluginContext {
  readonly options?: Record<string, unknown>;
  readonly location: { directory: string };
  readonly provider?: { list(input?: unknown): Promise<unknown> };
  readonly catalog?: { provider?: { list(input?: unknown): Promise<unknown> } };
  readonly session: {
    hook(name: "retry", callback: (event: RetryHookEvent) => Promise<void>): Promise<Registration>;
  };
}

const serverPlugin = {
  id: "opencode-quota.retry-pacing",
  async setup(context: ServerPluginContext) {
    const provider = context.provider ?? context.catalog?.provider;
    const client = createTuiV2QuotaClient(provider ? { provider } : undefined, {
      roots: { fallbackDirectory: context.location.directory },
    });

    const registration = await context.session.hook("retry", async (event) => {
      if (!isQuotaRetryError(event.error)) return;

      try {
        const runtime = await resolveQuotaRuntimeContext({
          client,
          roots: { fallbackDirectory: context.location.directory },
          configureTelemetry: false,
          pluginOptions: context.options,
        });
        const plan = await resolveCachedRetryPacingPlan({
          runtime,
          providerID: event.model.providerID,
          modelID: event.model.id,
        });
        if (!plan) return;

        const existingDelay = event.decision.retry ? event.decision.delay : 0;
        event.decision = { retry: true, delay: Math.max(existingDelay, plan.delayMs) };
        console.info("[opencode-quota] scheduled quota-aware retry", {
          providerID: event.model.providerID,
          modelID: event.model.id,
          quotaProviderIds: plan.quotaProviderIds,
          resetAt: new Date(plan.resetAtMs).toISOString(),
          delayMs: event.decision.delay,
        });
      } catch {
        // Cache/config failures must preserve OpenCode's proposed retry policy.
      }
    });

    return () => registration.dispose();
  },
};

export default serverPlugin;
