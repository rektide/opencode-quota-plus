export interface QuotaStall {
  /** Session that should be revived after reset. */
  notifySessionID: string;
  /** Session whose model request hit quota. */
  stalledSessionID: string;
  relation: "self" | "child";
  providerID: string;
  modelID: string;
  availableAtMs: number;
}

export interface QuotaStallNotifier {
  record(stall: QuotaStall): void;
  dispose(): void;
}

/** Groups quota stalls by the session that should be revived when work becomes possible. */
export function createQuotaStallNotifier(params: {
  notify(notifySessionID: string, stalls: readonly QuotaStall[]): Promise<void>;
  now?: () => number;
  onError?: (error: unknown, notifySessionID: string) => void;
}): QuotaStallNotifier {
  const now = params.now ?? Date.now;
  const pending = new Map<string, Map<string, QuotaStall>>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let disposed = false;

  function stallKey(stall: QuotaStall): string {
    return `${stall.relation}:${stall.stalledSessionID}`;
  }

  function arm(notifySessionID: string): void {
    const existing = timers.get(notifySessionID);
    if (existing) clearTimeout(existing);
    timers.delete(notifySessionID);
    if (disposed) return;

    const stalls = pending.get(notifySessionID);
    if (!stalls?.size) {
      pending.delete(notifySessionID);
      return;
    }
    const nextAt = Math.min(...[...stalls.values()].map((stall) => stall.availableAtMs));
    const timer = setTimeout(() => void deliver(notifySessionID), Math.max(0, nextAt - now()));
    timer.unref?.();
    timers.set(notifySessionID, timer);
  }

  async function deliver(notifySessionID: string): Promise<void> {
    timers.delete(notifySessionID);
    if (disposed) return;
    const stalls = pending.get(notifySessionID);
    if (!stalls) return;

    const observedAt = now();
    const ready = [...stalls.values()].filter((stall) => stall.availableAtMs <= observedAt);
    if (ready.length === 0) {
      arm(notifySessionID);
      return;
    }
    for (const stall of ready) stalls.delete(stallKey(stall));

    try {
      await params.notify(notifySessionID, ready);
    } catch (error) {
      // Preserve the records and try delivery again without re-running work.
      const retryAt = now() + 60_000;
      for (const stall of ready) {
        const retry = { ...stall, availableAtMs: retryAt };
        stalls.set(stallKey(retry), retry);
      }
      params.onError?.(error, notifySessionID);
    }
    arm(notifySessionID);
  }

  return {
    record(stall) {
      if (disposed) return;
      const stalls = pending.get(stall.notifySessionID) ?? new Map();
      stalls.set(stallKey(stall), stall);
      pending.set(stall.notifySessionID, stalls);
      arm(stall.notifySessionID);
    },
    dispose() {
      disposed = true;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      pending.clear();
    },
  };
}
