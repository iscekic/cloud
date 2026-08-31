/* eslint-disable typescript-eslint/no-deprecated -- react-test-renderer is the DOM-free renderer used to mount React/RN trees under vitest (same pattern as src/components/agents/fixed-part-row.mounted.test.tsx) */
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type BannerState, OFFLINE_BANNER_SHOW_DELAY_MS } from '@/lib/offline-banner-state';

type ConnectivityState = { isConnected: boolean | null; isInternetReachable: boolean | null };

const netinfo = vi.hoisted(() => {
  const listeners = new Set<(state: ConnectivityState) => void>();
  return {
    listeners,
    addEventListener: (listener: (state: ConnectivityState) => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit: (state: ConnectivityState): void => {
      for (const listener of listeners) {
        listener(state);
      }
    },
  };
});

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('@react-native-community/netinfo', () => ({
  addEventListener: netinfo.addEventListener,
}));

vi.mock('@/lib/config', () => ({ API_BASE_URL: 'https://gateway.test' }));

type Hooks = {
  useOfflineBannerState: () => boolean;
  useCommittedConnectivityStatus: () => BannerState;
};

async function loadHooks(): Promise<Hooks> {
  const hooks = await import('@/lib/hooks/use-offline-banner-state');
  return hooks;
}

function Probe({ hooks }: { hooks: Hooks }) {
  const isOffline = hooks.useOfflineBannerState();
  const status = hooks.useCommittedConnectivityStatus();
  return createElement('ProbeText', null, `${String(isOffline)}:${status}`);
}

function textChildren(renderer: TestRenderer.ReactTestRenderer): string[] | null {
  const json = renderer.toJSON();
  if (!json) {
    return null;
  }
  if (Array.isArray(json)) {
    return null;
  }
  return json.children?.filter((child): child is string => typeof child === 'string') ?? null;
}

async function renderProbe(hooks: Hooks): Promise<TestRenderer.ReactTestRenderer> {
  const rendererRef: { current: TestRenderer.ReactTestRenderer | undefined } = {
    current: undefined,
  };
  await act(async () => {
    await Promise.resolve();
    rendererRef.current = TestRenderer.create(createElement(Probe, { hooks }));
  });
  const renderer = rendererRef.current;
  if (!renderer) {
    throw new Error('renderer was not created');
  }
  return renderer;
}

// Fire the show-delay timer and drain the probe's fetch microtask inside act,
// so the async commit lands before the assertion.
async function advanceShowDelay(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(OFFLINE_BANNER_SHOW_DELAY_MS);
    await Promise.resolve();
  });
}

describe('useOfflineBannerState and useCommittedConnectivityStatus mounted', () => {
  beforeEach(() => {
    // React 19 requires the act environment flag before `act` supports
    // updates scheduled from effects and external stores.
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    // A fresh module per test gives a fresh module-level store singleton.
    vi.resetModules();
    netinfo.listeners.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    netinfo.listeners.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('subscribes once, shows after the delay, hides at once, and reports the tri-state', async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new Error('offline'));

    const hooks = await loadHooks();
    const renderer = await renderProbe(hooks);

    expect(netinfo.listeners.size).toBe(1);
    expect(textChildren(renderer)).toEqual(['false:unknown']);

    act(() => {
      netinfo.emit({ isConnected: false, isInternetReachable: false });
    });
    expect(textChildren(renderer)).toEqual(['false:unknown']);

    await advanceShowDelay();
    expect(textChildren(renderer)).toEqual(['true:offline']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gateway.test',
      expect.objectContaining({ method: 'HEAD' })
    );

    act(() => {
      netinfo.emit({ isConnected: true, isInternetReachable: true });
    });
    expect(textChildren(renderer)).toEqual(['false:online']);
  });

  it('keeps the banner hidden when the API probe answers (a false offline)', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue({ ok: true });

    const hooks = await loadHooks();
    const renderer = await renderProbe(hooks);

    act(() => {
      netinfo.emit({ isConnected: false, isInternetReachable: false });
    });
    expect(textChildren(renderer)).toEqual(['false:unknown']);

    await advanceShowDelay();
    expect(textChildren(renderer)).toEqual(['false:online']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports the unknown → online edge even though the banner stays hidden', async () => {
    vi.useFakeTimers();

    const hooks = await loadHooks();
    const renderer = await renderProbe(hooks);

    expect(textChildren(renderer)).toEqual(['false:unknown']);

    act(() => {
      netinfo.emit({ isConnected: true, isInternetReachable: true });
    });
    expect(textChildren(renderer)).toEqual(['false:online']);
  });

  it('shares one store and one NetInfo subscription across callers', async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new Error('offline'));

    const hooks = await loadHooks();
    const first = await renderProbe(hooks);
    const second = await renderProbe(hooks);

    expect(netinfo.listeners.size).toBe(1);

    act(() => {
      netinfo.emit({ isConnected: false, isInternetReachable: false });
    });
    await advanceShowDelay();

    expect(textChildren(first)).toEqual(['true:offline']);
    expect(textChildren(second)).toEqual(['true:offline']);
  });

  it('keeps the shared store alive after unmount (never destroyed)', async () => {
    vi.useFakeTimers();

    const hooks = await loadHooks();
    const renderer = await renderProbe(hooks);

    expect(netinfo.listeners.size).toBe(1);

    act(() => {
      renderer.unmount();
    });

    expect(netinfo.listeners.size).toBe(1);
  });
});
