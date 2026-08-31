// One-shot child-session open timing, modelled on `startup-timing`. The tap
// (markChildOpenStart) opens the clock; markChildFirstContent closes it when
// the sheet first shows content; setChildOpenPhases records the SDK-reported
// network/storage cost when the hydrate completes. `takeChildSessionOpenTiming`
// returns the payload exactly once per open, or null when no content arrived
// yet or the payload was already taken.
//
// `phase` is `fresh` when the SDK completed a hydrate (setChildOpenPhases ran)
// and `cached` when content was already in the store and no fetch happened.

import { type KiloSessionId } from '@kilocode/cloud-agent-sdk';

export type ChildSessionOpenTiming = {
  /** Tap to first rendered content, in milliseconds. */
  tapToFirstContentMs: number;
  networkMs: number;
  storageMs: number;
  renderMs: number;
  phase: 'fresh' | 'cached';
};

type ChildOpenRecord = {
  sessionId: KiloSessionId;
  startMs: number;
  networkMs?: number;
  storageMs?: number;
  firstContentMs?: number;
};

// Only the open sheet is measured at a time; the last open wins.
let current: ChildOpenRecord | undefined = undefined;
let taken = false;

export function markChildOpenStart(sessionId: KiloSessionId): void {
  current = { sessionId, startMs: Date.now() };
  taken = false;
}

export function markChildFirstContent(sessionId: KiloSessionId): void {
  if (!current || current.sessionId !== sessionId || current.firstContentMs !== undefined) return;
  current.firstContentMs = Date.now();
}

export function setChildOpenPhases(
  sessionId: KiloSessionId,
  networkMs: number,
  storageMs: number
): void {
  if (!current || current.sessionId !== sessionId) return;
  current.networkMs = networkMs;
  current.storageMs = storageMs;
}

// Returns the event payload exactly once per open, and only after first
// content actually rendered. Null means "nothing to send" — never send a
// partial open, and never send twice. Callers may poll this freely.
export function takeChildSessionOpenTiming(): ChildSessionOpenTiming | null {
  if (taken || !current || current.firstContentMs === undefined) return null;
  taken = true;
  const { startMs, firstContentMs, networkMs, storageMs } = current;
  const tapToFirstContentMs = firstContentMs - startMs;
  const network = networkMs ?? 0;
  const storage = storageMs ?? 0;
  return {
    tapToFirstContentMs,
    networkMs: network,
    storageMs: storage,
    renderMs: Math.max(0, tapToFirstContentMs - network - storage),
    phase: networkMs === undefined ? 'cached' : 'fresh',
  };
}
