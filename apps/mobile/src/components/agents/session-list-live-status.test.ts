import { describe, expect, it } from 'vitest';

import { selectLiveListStatus } from './session-list-live-status';

function status(overrides: Partial<Parameters<typeof selectLiveListStatus>[0]> = {}) {
  return selectLiveListStatus({
    isConnected: true,
    reconnectExhausted: false,
    wasUp: false,
    hasLiveRows: true,
    updating: false,
    refreshFailed: false,
    ...overrides,
  });
}

describe('selectLiveListStatus', () => {
  describe('not connected', () => {
    it('returns connection-lost when reconnecting gave up', () => {
      expect(
        status({ isConnected: false, reconnectExhausted: true, wasUp: true })
      ).toEqual({ kind: 'connection-lost' });
    });

    it('returns reconnecting when we were connected before', () => {
      expect(
        status({ isConnected: false, reconnectExhausted: false, wasUp: true })
      ).toEqual({ kind: 'reconnecting' });
    });

    it('returns connecting when we were never connected', () => {
      expect(
        status({ isConnected: false, reconnectExhausted: false, wasUp: false })
      ).toEqual({ kind: 'connecting' });
    });

    it('beats refresh state: updating live rows stay offline while disconnected', () => {
      expect(
        status({ isConnected: false, wasUp: false, updating: true })
      ).toEqual({ kind: 'connecting' });
    });
  });

  describe('connected refresh state (gated on live rows)', () => {
    it('returns updating when live rows are shown and an update is in flight', () => {
      expect(status({ hasLiveRows: true, updating: true })).toEqual({
        kind: 'updating',
      });
    });

    it('returns refresh-failed when live rows are shown and a refresh failed', () => {
      expect(status({ hasLiveRows: true, refreshFailed: true })).toEqual({
        kind: 'refresh-failed',
      });
    });

    it('prefers updating over refresh-failed when both flags are set', () => {
      expect(status({ hasLiveRows: true, updating: true, refreshFailed: true })).toEqual({
        kind: 'updating',
      });
    });

    it('ignores updating and refresh-failed when no live rows are on screen', () => {
      expect(
        status({ hasLiveRows: false, updating: true, refreshFailed: true })
      ).toEqual({ kind: 'ready' });
    });
  });

  describe('ready', () => {
    it('returns ready when connected with live rows and nothing in flight', () => {
      expect(status({ hasLiveRows: true })).toEqual({ kind: 'ready' });
    });

    it('returns ready when connected with no live rows', () => {
      expect(status({ hasLiveRows: false })).toEqual({ kind: 'ready' });
    });
  });
});
