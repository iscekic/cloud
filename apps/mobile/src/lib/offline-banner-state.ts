import { type ConnectivityState, connectivityStatus } from '@/lib/connectivity-online';

/**
 * How long the connection must stay down before the banner appears. NetInfo
 * reports a false `offline` for a moment after a long background, so a short
 * window flashed the banner on every foreground. Hiding stays immediate: a
 * banner that is up when the connection works is the worse error.
 */
export const OFFLINE_BANNER_SHOW_DELAY_MS = 5000;

/** How long the reachability HEAD probe may run before it counts as down. */
export const OFFLINE_BANNER_PROBE_TIMEOUT_MS = 3000;

export type OfflineBannerTimer = {
  set(callback: () => void, delayMs: number): { cancel(): void };
};

export type ConnectivitySource = {
  subscribe(listener: (state: ConnectivityState) => void): () => void;
};

/**
 * One reachability check. Resolves `true` when the API answers and `false`
 * (or rejects) when it does not. Injected so the store never touches the
 * network in tests.
 */
export type OfflineBannerProbe = () => Promise<boolean>;

export type OfflineBannerStore = {
  subscribe: (listener: () => void) => () => void;
  isOffline: () => boolean;
  state: () => BannerState;
  destroy: () => void;
};

/** The banner's committed connectivity state. */
export type BannerState = 'online' | 'offline' | 'unknown';

export function createOfflineBannerStore(options: {
  source: ConnectivitySource;
  timer: OfflineBannerTimer;
  probe: OfflineBannerProbe;
  showDelayMs?: number;
}): OfflineBannerStore {
  const { source, timer, probe } = options;
  const showDelayMs = options.showDelayMs ?? OFFLINE_BANNER_SHOW_DELAY_MS;

  // Start unknown, not online: until NetInfo settles we cannot claim the
  // connection works, but we also must not show the offline banner.
  let state: BannerState = 'unknown';
  let pending: { cancel(): void } | null = null;
  // Each cancelPending call bumps the epoch, so a newer source state or
  // destroy() invalidates an in-flight probe: its answer no longer describes
  // the current attempt and must be discarded.
  let epoch = 0;
  const listeners = new Set<() => void>();

  function cancelPending(): void {
    epoch += 1;
    pending?.cancel();
    pending = null;
  }

  function commit(next: BannerState): void {
    if (state === next) {
      return;
    }
    state = next;
    // Notify on every committed state change. The banner's `getSnapshot`
    // (`isOffline`) is unchanged on an unknown → online edge, so it does not
    // re-render there; the tri-state hook's `getSnapshot` (`state`) does.
    for (const listener of listeners) {
      listener();
    }
  }

  async function runProbe(): Promise<void> {
    const attempt = epoch;
    let reachable = false;
    try {
      reachable = await probe();
    } catch {
      // A rejected probe counts as not reachable.
      reachable = false;
    }
    if (attempt !== epoch) {
      return;
    }
    commit(reachable ? 'online' : 'offline');
  }

  function handleSourceState(sourceState: ConnectivityState): void {
    const status = connectivityStatus(sourceState);
    cancelPending();
    if (status === 'unknown') {
      // Do not reveal the banner while connectivity is unknown, and do not
      // advance the committed state from its boot default.
      return;
    }
    if (status === 'online') {
      commit('online');
      return;
    }
    pending = timer.set(() => {
      pending = null;
      void runProbe();
    }, showDelayMs);
  }

  const unsubscribeSource = source.subscribe(handleSourceState);

  // Pre-bound closures: callers pass `subscribe` and `isOffline` as stable
  // references without losing `this` (they close over internal state).
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const isOffline = (): boolean => state === 'offline';

  const getState = (): BannerState => state;

  const destroy = (): void => {
    cancelPending();
    unsubscribeSource();
    listeners.clear();
  };

  return { subscribe, isOffline, state: getState, destroy };
}
