/**
 * Pure live-list status selector for the Agents session list.
 *
 * Encapsulates the "what does the live Agents list announce right now?"
 * question as one discriminated union, so the component only maps the result
 * onto the existing status UI. Every input is a boolean flag, the output is a
 * small union — there is no React or native dependency, so this module is
 * unit-testable in plain Node.
 *
 * Classification rules (priority order):
 *  1. Live rows are shown and not connected → connection-lost (when
 *     reconnecting gave up), else reconnecting (when we were connected
 *     before), else connecting.
 *  2. Live rows are shown and an update is in flight → updating.
 *  3. Live rows are shown and a refresh failed → refresh-failed.
 *  4. Otherwise → ready.
 *
 * This keeps offline, reconnecting, refreshing, empty, and error visibly
 * distinct in one testable place.
 */

export type LiveListStatus =
  | { kind: 'connecting' }
  | { kind: 'reconnecting' }
  | { kind: 'connection-lost' }
  | { kind: 'updating' }
  | { kind: 'refresh-failed' }
  | { kind: 'ready' };

export function selectLiveListStatus(input: {
  isConnected: boolean;
  reconnectExhausted: boolean;
  wasUp: boolean;
  hasLiveRows: boolean;
  updating: boolean;
  refreshFailed: boolean;
}): LiveListStatus {
  const { isConnected, reconnectExhausted, wasUp, hasLiveRows, updating, refreshFailed } = input;

  // Connection problems surface only while live rows are on screen: with no
  // rows, the body below already renders the terminal empty/error state, and a
  // progress hint directly above it would contradict it.
  if (!isConnected && hasLiveRows) {
    if (reconnectExhausted) {
      return { kind: 'connection-lost' };
    }
    if (wasUp) {
      return { kind: 'reconnecting' };
    }
    return { kind: 'connecting' };
  }

  // Connected: refresh state only matters while live rows are on screen.
  if (hasLiveRows) {
    if (updating) {
      return { kind: 'updating' };
    }
    if (refreshFailed) {
      return { kind: 'refresh-failed' };
    }
  }

  return { kind: 'ready' };
}
