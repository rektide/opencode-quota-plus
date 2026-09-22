export interface ParentedQuotaFailure {
  parentSessionID: string;
  childSessionID: string;
  providerID: string;
  modelID: string;
  availableAtMs: number;
}

export interface ParentQuotaFailureNotifier {
  record(failure: ParentedQuotaFailure): void;
  dispose(): void;
}

/** Groups quota-blocked child sessions by parent and announces them when resumable. */
export function createParentQuotaFailureNotifier(params: {
  notify(parentSessionID: string, failures: readonly ParentedQuotaFailure[]): Promise<void>;
  now?: () => number;
  onError?: (error: unknown, parentSessionID: string) => void;
}): ParentQuotaFailureNotifier {
  const now = params.now ?? Date.now;
  const pending = new Map<string, Map<string, ParentedQuotaFailure>>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let disposed = false;

  function arm(parentSessionID: string): void {
    const existing = timers.get(parentSessionID);
    if (existing) clearTimeout(existing);
    timers.delete(parentSessionID);
    if (disposed) return;

    const failures = pending.get(parentSessionID);
    if (!failures?.size) {
      pending.delete(parentSessionID);
      return;
    }
    const nextAt = Math.min(...[...failures.values()].map((failure) => failure.availableAtMs));
    const timer = setTimeout(() => void deliver(parentSessionID), Math.max(0, nextAt - now()));
    timer.unref?.();
    timers.set(parentSessionID, timer);
  }

  async function deliver(parentSessionID: string): Promise<void> {
    timers.delete(parentSessionID);
    if (disposed) return;
    const failures = pending.get(parentSessionID);
    if (!failures) return;

    const observedAt = now();
    const ready = [...failures.values()].filter((failure) => failure.availableAtMs <= observedAt);
    if (ready.length === 0) {
      arm(parentSessionID);
      return;
    }
    for (const failure of ready) failures.delete(failure.childSessionID);

    try {
      await params.notify(parentSessionID, ready);
    } catch (error) {
      // Preserve the records and try delivery again without re-running children.
      const retryAt = now() + 60_000;
      for (const failure of ready) {
        failures.set(failure.childSessionID, { ...failure, availableAtMs: retryAt });
      }
      params.onError?.(error, parentSessionID);
    }
    arm(parentSessionID);
  }

  return {
    record(failure) {
      if (disposed) return;
      const failures = pending.get(failure.parentSessionID) ?? new Map();
      failures.set(failure.childSessionID, failure);
      pending.set(failure.parentSessionID, failures);
      arm(failure.parentSessionID);
    },
    dispose() {
      disposed = true;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      pending.clear();
    },
  };
}
