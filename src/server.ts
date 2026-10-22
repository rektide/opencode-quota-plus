import { createQuotaStallNotifier, type QuotaStall } from "./lib/parent-quota-failures.js";
import {
  quotaRecoveryRpc,
  type RecoveryOverride,
  type RecoveryRpcRegistration,
  type RecoveryRpcServer,
  type RecoveryState,
} from "./lib/quota-recovery-contract.js";
import { resolveQuotaRuntimeContext } from "./lib/quota-runtime-context.js";
import {
  isQuotaRetryError,
  RETRY_RESET_MARGIN_MS,
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
  readonly rpc?: RecoveryRpcServer;
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

function quotaResetMessage(stalls: readonly QuotaStall[]): string {
  const self = stalls.some((stall) => stall.relation === "self");
  const children = stalls.filter((stall) => stall.relation === "child");
  const lines = [
    `<quota-reset state="available" child-count="${children.length}">`,
    self
      ? "Provider quota is available again after this session was interrupted. Continue its work if it is still useful."
      : "Provider quota is available again.",
  ];
  if (children.length > 0) {
    const noun = children.length === 1 ? "child session was" : "child sessions were";
    lines.push(
      `${children.length} ${noun} also stopped after quota was exhausted. Resume any still-useful child work:`,
      ...children.map((stall) => `- ${stall.stalledSessionID}`),
    );
  }
  lines.push("</quota-reset>");
  return lines.join("\n");
}

const serverPlugin = {
  id: "@slkiser/opencode-quota",
  async setup(context: ServerPluginContext) {
    const provider = context.provider ?? context.catalog?.provider;
    const client = createTuiV2QuotaClient(provider ? { provider } : undefined, {
      roots: { fallbackDirectory: context.location.directory },
    });

    const overrides = new Map<string, Exclude<RecoveryOverride, "inherit">>();
    const runtimeContext = () =>
      resolveQuotaRuntimeContext({
        client,
        roots: { fallbackDirectory: context.location.directory },
        configureTelemetry: false,
        pluginOptions: context.options,
      });
    const recoveryState = async (sessionID: string): Promise<RecoveryState> => {
      const runtime = await runtimeContext();
      return {
        sessionID,
        enabled: runtime.config.enabled && runtime.config.retryPacing.enabled,
        destination: overrides.get(sessionID) ?? runtime.config.retryPacing.recoveryNotice,
        override: overrides.get(sessionID) ?? "inherit",
      };
    };
    let recoveryRpc: RecoveryRpcRegistration | undefined;
    recoveryRpc = await context.rpc?.register(quotaRecoveryRpc, {
      state: async ({ sessionID }) => {
        await context.session.get({ sessionID });
        return recoveryState(sessionID);
      },
      set: async ({ sessionID, override }) => {
        await context.session.get({ sessionID });
        if (override === "inherit") overrides.delete(sessionID);
        else overrides.set(sessionID, override);
        const state = await recoveryState(sessionID);
        await recoveryRpc?.events.emit("changed", state);
        return state;
      },
    });

    const quotaStalls = createQuotaStallNotifier({
      notify: async (notifySessionID, stalls) => {
        const state = await recoveryState(notifySessionID);
        if (!state.enabled || state.destination === "off") return;
        const children = stalls.filter((stall) => stall.relation === "child");
        const text = quotaResetMessage(stalls);
        if (state.destination === "assistant" || state.destination === "both") {
          await context.session.synthetic({
            sessionID: notifySessionID,
            resume: true,
            description: "Quota is available; interrupted work can resume",
            text,
            metadata: {
              source: "opencode-quota",
              state: "quota-reset",
              sessionWasStalled: stalls.some((stall) => stall.relation === "self"),
              childIDs: children.map((stall) => stall.stalledSessionID),
              childCount: children.length,
            },
          });
        }
        if (state.destination === "human" || state.destination === "both") {
          const emit = async () => {
            if (!recoveryRpc) throw new Error("Human recovery notices require native plugin RPC");
            const runtime = await runtimeContext();
            // Human-only means no synthetic admission at all: resume:false is
            // merely admit-only and would still pollute subsequent AI context.
            if (runtime.config.enableToast) {
              await recoveryRpc.events.emit("notice", {
                sessionID: notifySessionID,
                text,
                duration: runtime.config.toastDurationMs,
              });
            }
          };
          if (state.destination === "human") await emit();
          else {
            // Do not replay a successfully admitted resumptive message just
            // because the supplementary, ephemeral UI delivery failed.
            await emit().catch((error: unknown) => {
              console.warn("[opencode-quota] failed to emit human recovery notice", error);
            });
          }
        }
      },
      onError: (error, notifySessionID) => {
        console.warn("[opencode-quota] failed to revive quota-stalled session", {
          notifySessionID,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    });

    const registration = await context.session.hook("retry", async (event) => {
      if (!isQuotaRetryError(event.error)) return;

      try {
        const session = await context.session.get({ sessionID: event.sessionID });
        const runtime = await runtimeContext();
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
          quotaStalls.record({
            notifySessionID: session.parentID,
            stalledSessionID: event.sessionID,
            relation: "child",
            providerID: event.model.providerID,
            modelID: event.model.id,
            availableAtMs: plan.resetAtMs + RETRY_RESET_MARGIN_MS,
          });
          console.info("[opencode-quota] deferred quota-blocked child for parent review", {
            parentSessionID: session.parentID,
            childSessionID: event.sessionID,
            providerID: event.model.providerID,
            resetAt: new Date(plan.resetAtMs).toISOString(),
          });
          return;
        }

        if (!session.fork) {
          event.decision = { retry: false };
          quotaStalls.record({
            notifySessionID: event.sessionID,
            stalledSessionID: event.sessionID,
            relation: "self",
            providerID: event.model.providerID,
            modelID: event.model.id,
            availableAtMs: plan.resetAtMs + RETRY_RESET_MARGIN_MS,
          });
          console.info("[opencode-quota] scheduled quota-stalled session revival", {
            sessionID: event.sessionID,
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
      quotaStalls.dispose();
      overrides.clear();
      await recoveryRpc?.dispose();
      await registration.dispose();
    };
  },
};

export default serverPlugin;
