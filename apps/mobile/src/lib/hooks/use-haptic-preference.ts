import { useSyncExternalStore } from 'react';

import { type HapticStrength, setHapticStrength } from '@/lib/haptics';
import { createSecureStorePreference } from '@/lib/hooks/secure-store-preference';
import { HAPTIC_STRENGTH_KEY } from '@/lib/storage-keys';

export type { HapticStrength };

const store = createSecureStorePreference<HapticStrength>({
  key: HAPTIC_STRENGTH_KEY,
  defaultValue: 'full',
  parse: raw => {
    if (raw === 'off' || raw === 'light' || raw === 'full') {
      return raw;
    }
    return 'full';
  },
  serialize: value => value,
});

// The mirror subscription is armed once: the store lives for the process
// lifetime, so one listener governs the gate for every later change.
let gateArmed = false;

/**
 * Start the haptic-strength disk read at module scope, before React mounts,
 * and mirror the stored value into the haptics gate so it governs feedback
 * from app start.
 */
export function preloadHapticPreference(): void {
  if (!gateArmed) {
    gateArmed = true;
    store.subscribe(() => {
      setHapticStrength(store.get());
    });
  }
  store.preload();
}

export function setHapticPreference(next: HapticStrength): void {
  store.set(next);
}

export function useHapticPreference() {
  const preference = useSyncExternalStore(store.subscribe, store.get);
  const hasLoaded = useSyncExternalStore(store.subscribe, store.getHasLoaded);
  return { preference, hasLoaded };
}
