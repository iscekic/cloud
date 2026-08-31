import { afterEach, describe, expect, it, vi } from 'vitest';

import { type KiloSessionId } from '@kilocode/cloud-agent-sdk';

import type * as ChildSessionOpenTimingModule from './child-session-open-timing';

async function freshTiming(): Promise<typeof ChildSessionOpenTimingModule> {
  vi.resetModules();
  const mod = import('./child-session-open-timing');
  // satisfy require-await without return-await
  await Promise.resolve();
  return mod;
}

describe('child-session-open-timing', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports the fresh-open phase math: tap, network, storage, and render', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

    const { markChildOpenStart, markChildFirstContent, setChildOpenPhases, takeChildSessionOpenTiming } =
      await freshTiming();

    markChildOpenStart('child-1' as KiloSessionId);
    vi.advanceTimersByTime(50);
    setChildOpenPhases('child-1' as KiloSessionId, 50, 30);
    vi.advanceTimersByTime(100);
    markChildFirstContent('child-1' as KiloSessionId);

    const timing = takeChildSessionOpenTiming();
    expect(timing).toEqual({
      tapToFirstContentMs: 150,
      networkMs: 50,
      storageMs: 30,
      renderMs: 70,
      phase: 'fresh',
    });
  });

  it('reports a cached open with no network/storage and phase cached', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

    const { markChildOpenStart, markChildFirstContent, takeChildSessionOpenTiming } =
      await freshTiming();

    markChildOpenStart('child-2' as KiloSessionId);
    vi.advanceTimersByTime(200);
    markChildFirstContent('child-2' as KiloSessionId);

    expect(takeChildSessionOpenTiming()).toEqual({
      tapToFirstContentMs: 200,
      networkMs: 0,
      storageMs: 0,
      renderMs: 200,
      phase: 'cached',
    });
  });

  it('returns null before first content and is taken exactly once', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

    const { markChildOpenStart, markChildFirstContent, takeChildSessionOpenTiming } =
      await freshTiming();

    markChildOpenStart('child-3' as KiloSessionId);
    expect(takeChildSessionOpenTiming()).toBeNull();

    markChildFirstContent('child-3' as KiloSessionId);
    const first = takeChildSessionOpenTiming();
    expect(first).not.toBeNull();

    expect(takeChildSessionOpenTiming()).toBeNull();
  });

  it('ignores marks from a superseded open', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

    const { markChildOpenStart, markChildFirstContent, setChildOpenPhases, takeChildSessionOpenTiming } =
      await freshTiming();

    markChildOpenStart('child-a' as KiloSessionId);
    markChildOpenStart('child-b' as KiloSessionId);

    // Late marks for the superseded session must not corrupt the current open.
    setChildOpenPhases('child-a' as KiloSessionId, 999, 999);
    markChildFirstContent('child-a' as KiloSessionId);

    expect(takeChildSessionOpenTiming()).toBeNull();
  });
});
