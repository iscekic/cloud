/* eslint-disable max-lines -- the show-delay, probe, and discard suites share one owned test file */
import { describe, expect, it, vi } from 'vitest';

import { type ConnectivityState } from '@/lib/connectivity-online';
import {
  type ConnectivitySource,
  createOfflineBannerStore,
  OFFLINE_BANNER_SHOW_DELAY_MS,
  type OfflineBannerProbe,
  type OfflineBannerStore,
  type OfflineBannerTimer,
} from '@/lib/offline-banner-state';

const offlineState: ConnectivityState = { isConnected: false, isInternetReachable: false };
const onlineState: ConnectivityState = { isConnected: true, isInternetReachable: true };
const unknownState: ConnectivityState = { isConnected: null, isInternetReachable: null };

function createFakeSource() {
  const listeners = new Set<(state: ConnectivityState) => void>();
  const unsubscribe = vi.fn(() => undefined);
  const source: ConnectivitySource = {
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        unsubscribe();
      };
    },
  };
  return {
    source,
    emit(state: ConnectivityState): void {
      for (const listener of listeners) {
        listener(state);
      }
    },
    unsubscribe,
  };
}

type ScheduledEntry = { callback: () => void; cancelled: boolean; delayMs: number };

function createFakeTimer() {
  const scheduled: ScheduledEntry[] = [];
  const timer: OfflineBannerTimer = {
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- the fake timer stores callbacks for manual firing
    set(callback, delayMs) {
      const entry: ScheduledEntry = { callback, cancelled: false, delayMs };
      scheduled.push(entry);
      return {
        cancel() {
          entry.cancelled = true;
        },
      };
    },
  };
  return {
    timer,
    scheduled,
    firePending(): void {
      while (scheduled.length > 0) {
        const entry = scheduled.shift();
        if (!entry) {
          return;
        }
        if (!entry.cancelled) {
          entry.callback();
          return;
        }
      }
    },
  };
}

// The default injected probe: no network, always unreachable.
function createUnreachableProbe(): OfflineBannerProbe {
  return vi.fn(async () => {
    await Promise.resolve();
    return false;
  });
}

// A probe whose outcome the test controls, so an in-flight probe can be held
// open while a newer source state or destroy() lands.
function createDeferredProbe(): {
  probe: OfflineBannerProbe;
  resolve: (reachable: boolean) => void;
  reject: () => void;
} {
  let storedResolve: ((value: boolean) => void) | undefined = undefined;
  let storedReject: ((reason?: unknown) => void) | undefined = undefined;
  const probe: OfflineBannerProbe = async () => {
    const reachable = await new Promise<boolean>((resolve, reject) => {
      storedResolve = resolve;
      storedReject = reject;
    });
    return reachable;
  };
  return {
    probe,
    resolve: (reachable: boolean) => {
      storedResolve?.(reachable);
    },
    reject: () => {
      storedReject?.(new Error('probe failed'));
    },
  };
}

// The fake timer fires synchronously; runProbe then awaits the injected
// probe, so the commit lands on the microtask queue. A macrotask tick runs
// after every queued microtask, draining the probe and its commit.
async function flushProbe(): Promise<void> {
  await new Promise<void>(resolve => {
    setTimeout(resolve, 0);
  });
}

function createStore(
  source = createFakeSource(),
  timer = createFakeTimer(),
  probe: OfflineBannerProbe = createUnreachableProbe()
): {
  store: OfflineBannerStore;
  source: ReturnType<typeof createFakeSource>;
  timer: ReturnType<typeof createFakeTimer>;
  probe: OfflineBannerProbe;
} {
  return {
    store: createOfflineBannerStore({ source: source.source, timer: timer.timer, probe }),
    source,
    timer,
    probe,
  };
}

describe('createOfflineBannerStore', () => {
  it('starts unknown, not offline', () => {
    const { store } = createStore();

    expect(store.isOffline()).toBe(false);
    expect(store.state()).toBe('unknown');
  });

  it('does not show the offline banner while connectivity is unknown', () => {
    const { store, source, timer } = createStore();
    const listener = vi.fn(() => undefined);
    store.subscribe(listener);

    source.emit(unknownState);
    timer.firePending();

    expect(store.isOffline()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies on unknown → online (the banner stays hidden)', () => {
    const { store, source } = createStore();
    const listener = vi.fn(() => undefined);
    store.subscribe(listener);

    source.emit(unknownState);
    source.emit(onlineState);

    expect(store.isOffline()).toBe(false);
    expect(store.state()).toBe('online');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('commits offline only after the show delay and notifies once', async () => {
    const { store, source, timer, probe } = createStore();
    const listener = vi.fn(() => undefined);
    store.subscribe(listener);

    source.emit(offlineState);

    expect(store.isOffline()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    expect(probe).not.toHaveBeenCalled();

    expect(timer.scheduled[0]?.delayMs).toBe(OFFLINE_BANNER_SHOW_DELAY_MS);

    timer.firePending();
    await flushProbe();

    expect(store.isOffline()).toBe(true);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending offline commit when the state returns online inside the window', () => {
    const { store, source, timer, probe } = createStore();
    const listener = vi.fn(() => undefined);
    store.subscribe(listener);

    source.emit(offlineState);
    source.emit(onlineState);

    timer.firePending();

    expect(store.isOffline()).toBe(false);
    expect(store.state()).toBe('online');
    expect(probe).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('hides immediately when the connection returns after a committed offline', async () => {
    const { store, source, timer } = createStore();
    const listener = vi.fn(() => undefined);
    store.subscribe(listener);

    source.emit(offlineState);
    timer.firePending();
    await flushProbe();
    expect(store.isOffline()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    source.emit(onlineState);

    expect(store.isOffline()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(timer.scheduled.filter(entry => !entry.cancelled)).toEqual([]);
  });

  it('commits exactly once for rapid alternation, matching the final quiet state', async () => {
    const { store, source, timer } = createStore();
    const listener = vi.fn(() => undefined);
    store.subscribe(listener);

    source.emit(offlineState);
    source.emit(onlineState);
    source.emit(offlineState);
    source.emit(onlineState);
    source.emit(offlineState);

    timer.firePending();
    await flushProbe();

    expect(store.isOffline()).toBe(true);
    // One notification for the unknown → online commit, one for the final
    // offline commit — the intermediate online commits are no-ops.
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('flapping unknown → offline → online → offline shows only after the debounce and hides immediately on online', async () => {
    const { store, source, timer } = createStore();
    const listener = vi.fn(() => undefined);
    store.subscribe(listener);

    source.emit(unknownState);
    timer.firePending();
    expect(store.isOffline()).toBe(false);
    expect(listener).not.toHaveBeenCalled();

    source.emit(offlineState);
    // Not committed yet: the banner waits out the show delay.
    expect(store.isOffline()).toBe(false);
    expect(timer.scheduled[0]?.delayMs).toBe(OFFLINE_BANNER_SHOW_DELAY_MS);

    source.emit(onlineState);
    // Hides immediately: the pending offline commit was cancelled.
    expect(store.isOffline()).toBe(false);
    expect(store.state()).toBe('online');

    source.emit(offlineState);
    timer.firePending();
    await flushProbe();
    expect(store.isOffline()).toBe(true);
    expect(store.state()).toBe('offline');

    // One notification for the unknown → online commit, one for the final
    // offline commit.
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps the banner hidden when the probe reaches the API and commits online', async () => {
    const reachableProbe: OfflineBannerProbe = vi.fn(async () => {
      await Promise.resolve();
      return true;
    });
    const { store, source, timer } = createStore(createFakeSource(), createFakeTimer(), reachableProbe);
    const listener = vi.fn(() => undefined);
    store.subscribe(listener);

    source.emit(offlineState);
    timer.firePending();
    await flushProbe();

    expect(store.isOffline()).toBe(false);
    expect(store.state()).toBe('online');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('commits offline when the probe rejects', async () => {
    const rejectingProbe: OfflineBannerProbe = vi.fn(async () => {
      await Promise.resolve();
      throw new Error('network down');
    });
    const { store, source, timer } = createStore(createFakeSource(), createFakeTimer(), rejectingProbe);
    const listener = vi.fn(() => undefined);
    store.subscribe(listener);

    source.emit(offlineState);
    timer.firePending();
    await flushProbe();

    expect(store.isOffline()).toBe(true);
    expect(store.state()).toBe('offline');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('discards an in-flight probe result when a newer source state arrives', async () => {
    const deferred = createDeferredProbe();
    const { store, source, timer } = createStore(createFakeSource(), createFakeTimer(), deferred.probe);
    const listener = vi.fn(() => undefined);
    store.subscribe(listener);

    source.emit(offlineState);
    timer.firePending();
    // The probe is now in flight; a newer online state invalidates it.
    source.emit(onlineState);
    expect(store.state()).toBe('online');
    expect(listener).toHaveBeenCalledTimes(1);

    deferred.resolve(true);
    await flushProbe();

    expect(store.state()).toBe('online');
    expect(store.isOffline()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('discards an in-flight probe result after destroy', async () => {
    const deferred = createDeferredProbe();
    const { store, source, timer } = createStore(createFakeSource(), createFakeTimer(), deferred.probe);
    const listener = vi.fn(() => undefined);
    store.subscribe(listener);

    source.emit(offlineState);
    timer.firePending();
    store.destroy();

    deferred.resolve(true);
    await flushProbe();

    expect(store.state()).toBe('unknown');
    expect(store.isOffline()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('destroy with a pending commit cancels the timer and unsubscribes the source', () => {
    const { store, source, timer } = createStore();
    const listener = vi.fn(() => undefined);
    store.subscribe(listener);

    source.emit(offlineState);
    store.destroy();

    timer.firePending();
    source.emit(onlineState);

    expect(store.isOffline()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    expect(source.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('does not notify after destroy when the source emits', () => {
    const { store, source, timer } = createStore();
    const listener = vi.fn(() => undefined);
    store.subscribe(listener);

    store.destroy();
    source.emit(offlineState);
    timer.firePending();

    expect(listener).not.toHaveBeenCalled();
    expect(source.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes a removed listener', () => {
    const { store, source } = createStore();
    const listener = vi.fn(() => undefined);
    const remove = store.subscribe(listener);

    remove();
    source.emit(offlineState);

    expect(listener).not.toHaveBeenCalled();
  });

  it('exposes the committed state via state()', async () => {
    const { store, source, timer } = createStore();

    expect(store.state()).toBe('unknown');

    source.emit(onlineState);
    expect(store.state()).toBe('online');

    source.emit(offlineState);
    timer.firePending();
    await flushProbe();
    expect(store.state()).toBe('offline');
  });
});
