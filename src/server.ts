import {
  createParentQuotaFailureNotifier,
  type ParentedQuotaFailure,
} from "./lib/parent-quota-failures.js";
import { resolveQuotaRuntimeContext } from "./lib/quota-runtime-context.js";
import {
  isQuotaRetryError,
  type RetryPacingError,
  resolveCachedRetryPacingPlan,
} from "./lib/retry-pacing.js";
import { createTuiV2QuotaClient } from "./lib/tui-v2-client.js";

type RetryDecision = { retry: false } | { retry: true; delay: number };

interface RetryHookEvent {
  readonly sessionID: string;
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
    get(input: { sessionID: string }): Promise<{
      id: string;
      parentID?: string;
      fork?: { sessionID: string; boundary: unknown };
    }>;
    synthetic(input: {
      sessionID: string;
      text: string;
      description?: string;
      metadata?: Record<string, unknown>;
      resume?: boolean;
    }): Promise<unknown>;
  };
}

function parentQuotaResetMessage(failures: readonly ParentedQuotaFailure[]): string {
  const children = failures.map((failure) => `- ${failure.childSessionID}`).join("\n");
  const noun = failures.length === 1 ? "child session was" : "child sessions were";
  return [
    `<subagent-quota-reset state="available" count="${failures.length}">`,
    `${failures.length} ${noun} stopped after provider quota was exhausted.`,
    "The relevant quota reset has now passed. Resume any of these sessions if their work is still useful:",
    children,
    "</subagent-quota-reset>",
  ].join("\n");
}

const serverPlugin = {
  id: "@slkiser/opencode-quota",
  async setup(context: ServerPluginContext) {
    const provider = context.provider ?? context.catalog?.provider;
    const client = createTuiV2QuotaClient(provider ? { provider } : undefined, {
      roots: { fallbackDirectory: context.location.directory },
    });

    const parentFailures = createParentQuotaFailureNotifier({
      notify: async (parentSessionID, failures) => {
        await context.session.synthetic({
          sessionID: parentSessionID,
          resume: true,
          description: "Quota-blocked subagents can be resumed",
          text: parentQuotaResetMessage(failures),
          metadata: {
            source: "opencode-quota",
            state: "quota-reset",
            childIDs: failures.map((failure) => failure.childSessionID),
            count: failures.length,
          },
        });
      },
      onError: (error, parentSessionID) => {
        console.warn("[opencode-quota] failed to notify parent about resumable children", {
          parentSessionID,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    });

    const registration = await context.session.hook("retry", async (event) => {
      if (!isQuotaRetryError(event.error)) return;

      try {
        const session = await context.session.get({ sessionID: event.sessionID });
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

        // Long sleeps make an ordinary subagent look active but unproductive to
        // its parent. Fail it promptly, then notify the parent after reset so it
        // can decide whether resuming the child is still useful. Forks are
        // independent sessions (`fork`, no parentID) and retain normal pacing.
        if (session.parentID && !session.fork) {
          event.decision = { retry: false };
          parentFailures.record({
            parentSessionID: session.parentID,
            childSessionID: event.sessionID,
            providerID: event.model.providerID,
            modelID: event.model.id,
            availableAtMs: Date.now() + plan.delayMs,
          });
          console.info("[opencode-quota] deferred quota-blocked child for parent review", {
            parentSessionID: session.parentID,
            childSessionID: event.sessionID,
            providerID: event.model.providerID,
            resetAt: new Date(plan.resetAtMs).toISOString(),
          });
          return;
        }

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

    return async () => {
      parentFailures.dispose();
      await registration.dispose();
    };
  },
};

export default serverPlugin;
