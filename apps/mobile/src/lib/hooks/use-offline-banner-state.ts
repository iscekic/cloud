import { addEventListener } from '@react-native-community/netinfo';
import { useSyncExternalStore } from 'react';

import { API_BASE_URL } from '@/lib/config';
import {
  type BannerState,
  type ConnectivitySource,
  createOfflineBannerStore,
  OFFLINE_BANNER_PROBE_TIMEOUT_MS,
  type OfflineBannerProbe,
  type OfflineBannerStore,
  type OfflineBannerTimer,
} from '@/lib/offline-banner-state';

const netInfoSource: ConnectivitySource = {
  subscribe: listener => addEventListener(listener),
};

const defaultTimer: OfflineBannerTimer = {
  set(callback, delayMs) {
    const handle = setTimeout(callback, delayMs);
    return {
      cancel: () => {
        clearTimeout(handle);
      },
    };
  },
};

// One HEAD probe against the API confirms the connection after the show
// delay, so a false `offline` from NetInfo never surfaces a banner. The
// abort controller caps the wait; a throw or an abort both resolve false.
const probe: OfflineBannerProbe = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, OFFLINE_BANNER_PROBE_TIMEOUT_MS);
  try {
    await fetch(API_BASE_URL, { method: 'HEAD', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

// One store per app, created lazily on first use and never destroyed, so
// every caller of the two hooks below shares a single NetInfo subscription
// (the app must not grow a second connectivity system).
let store: OfflineBannerStore | null = null;

function getStore(): OfflineBannerStore {
  store ??= createOfflineBannerStore({ source: netInfoSource, timer: defaultTimer, probe });
  return store;
}

export function useOfflineBannerState(): boolean {
  return useSyncExternalStore(getStore().subscribe, getStore().isOffline);
}

export function useCommittedConnectivityStatus(): BannerState {
  return useSyncExternalStore(getStore().subscribe, getStore().state);
}
