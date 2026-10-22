import { sanitizeDisplayText } from "./display-sanitize.js";
import {
  quotaRecoveryRpc,
  type RecoveryLocation,
  type RecoveryOverride,
  type RecoveryRpcClient,
  type RecoveryState,
} from "./quota-recovery-contract.js";

export function getRecoveryRpc(client: unknown): RecoveryRpcClient | undefined {
  const host = client as
    | { rpc?: (definition: typeof quotaRecoveryRpc) => RecoveryRpcClient }
    | undefined;
  return typeof host?.rpc === "function" ? host.rpc(quotaRecoveryRpc) : undefined;
}

export function sameRecoveryLocation(
  a: RecoveryLocation | undefined,
  b: RecoveryLocation,
): boolean {
  return a?.directory === b.directory && a?.workspaceID === b.workspaceID;
}

const OVERRIDES: readonly RecoveryOverride[] = ["inherit", "assistant", "human", "both", "off"];

export function recoveryControlLabel(state: RecoveryState | undefined): string {
  if (!state) return "Quota reset: unavailable";
  const label = state.destination === "assistant" ? "AI" : state.destination;
  return `Quota reset: ${state.enabled ? label : "disabled"}${state.override === "inherit" ? " (config)" : ""}`;
}

/** One mounted control owns its calls/subscriptions; it never edits config. */
export function createRecoveryControl(params: {
  rpc: RecoveryRpcClient;
  sessionID: string;
  location: () => RecoveryLocation | undefined;
  update: (state: RecoveryState | undefined, pending: boolean) => void;
  onError: (error: unknown) => void;
}) {
  let state: RecoveryState | undefined;
  let disposed = false;
  let writing = false;
  let sequence = 0;
  const apply = (next: RecoveryState | undefined) => {
    state = next;
    params.update(state, writing);
  };
  const refresh = () => {
    if (disposed) return;
    const location = params.location();
    const request = ++sequence;
    if (!location) return apply(undefined);
    void params.rpc.state({ sessionID: params.sessionID }, { location }).then(
      (next) => {
        if (!disposed && request === sequence && sameRecoveryLocation(params.location(), location))
          apply(next);
      },
      () => {
        if (!disposed && request === sequence) apply(undefined);
      },
    );
  };
  const stop = params.rpc.events.on("changed", (event) => {
    if (
      event.data.sessionID === params.sessionID &&
      sameRecoveryLocation(params.location(), event.location)
    )
      refresh();
  });
  refresh();
  return {
    refresh,
    async activate() {
      const location = params.location();
      if (disposed || writing || !state || !location) return;
      const override = OVERRIDES[(OVERRIDES.indexOf(state.override) + 1) % OVERRIDES.length];
      writing = true;
      params.update(state, true);
      try {
        await params.rpc.set({ sessionID: params.sessionID, override }, { location });
      } catch (error) {
        if (!disposed) params.onError(error);
      } finally {
        writing = false;
        if (!disposed) {
          params.update(state, false);
          refresh();
        }
      }
    },
    dispose() {
      disposed = true;
      sequence += 1;
      stop();
    },
  };
}

export function subscribeRecoveryNotices(params: {
  rpc: RecoveryRpcClient;
  location: (sessionID: string) => RecoveryLocation | undefined;
  showToast: (body: {
    title: string;
    message: string;
    duration: number;
    variant: "success";
  }) => void;
}) {
  return params.rpc.events.on("notice", (event) => {
    if (!sameRecoveryLocation(params.location(event.data.sessionID), event.location)) return;
    params.showToast({
      title: `Quota available · ${event.data.sessionID}`,
      message: sanitizeDisplayText(event.data.text),
      duration: event.data.duration,
      variant: "success",
    });
  });
}
