/* eslint-disable typescript-eslint/no-deprecated -- react-test-renderer is the DOM-free renderer used to mount React/RN trees under vitest (same pattern as session-connection-indicator.mounted.test.tsx) */
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionListConnectionStrip } from './session-list-connection-strip';

// A `UserWebConnection` stub. `useUserWebConnectionHealth` (the real hook) is
// left unmocked and binds to this stub through `useSyncExternalStore`, so the
// test drives state changes by flipping these flags and notifying listeners.
const connection = vi.hoisted(() => {
  const state = { connected: true, exhausted: false };
  const connectionListeners = new Set<() => void>();
  const exhaustionListeners = new Set<() => void>();
  return {
    state,
    reset() {
      state.connected = true;
      state.exhausted = false;
    },
    setConnected(value: boolean) {
      state.connected = value;
      for (const listener of connectionListeners) {
        listener();
      }
    },
    setExhausted(value: boolean) {
      state.exhausted = value;
      for (const listener of exhaustionListeners) {
        listener();
      }
    },
    isConnected: () => state.connected,
    onConnectionChange: (listener: () => void) => {
      connectionListeners.add(listener);
      return () => {
        connectionListeners.delete(listener);
      };
    },
    isReconnectExhausted: () => state.exhausted,
    onReconnectExhaustionChange: (listener: () => void) => {
      exhaustionListeners.add(listener);
      return () => {
        exhaustionListeners.delete(listener);
      };
    },
    retryConnection: vi.fn(),
  };
});

vi.mock('react-native', () => ({
  View: 'View',
  Pressable: 'Pressable',
}));
vi.mock('@/components/ui/icons', () => ({
  AlertCircle: 'AlertCircle',
  Loader2: 'Loader2',
  WifiOff: 'WifiOff',
}));
vi.mock('@/components/ui/spinning-icon', () => ({
  SpinningIcon: 'SpinningIcon',
}));
vi.mock('@/components/ui/text', () => ({
  Text: 'Text',
}));
vi.mock('@/lib/hooks/use-theme-colors', () => ({
  useThemeColors: () => ({ mutedForeground: '#666666' }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/components/agents/user-web-connection-provider', () => ({
  useUserWebConnection: () => connection,
}));

type StripProps = Parameters<typeof SessionListConnectionStrip>[0];

async function mount(props: StripProps): Promise<TestRenderer.ReactTestRenderer> {
  const rendererRef: { current: TestRenderer.ReactTestRenderer | undefined } = {
    current: undefined,
  };
  await act(async () => {
    await Promise.resolve();
    rendererRef.current = TestRenderer.create(createElement(SessionListConnectionStrip, props));
  });
  const renderer = rendererRef.current;
  if (!renderer) {
    throw new Error('renderer was not created');
  }
  return renderer;
}

function findHost(
  root: TestRenderer.ReactTestInstance,
  type: string
): TestRenderer.ReactTestInstance[] {
  return root.findAll(node => node.type === type);
}

function textContents(root: TestRenderer.ReactTestInstance): unknown[] {
  return findHost(root, 'Text').map(node => node.props.children);
}

const baseProps: StripProps = {
  hasLiveRows: true,
  updating: false,
  refreshFailed: false,
  onRetryRefresh: vi.fn(() => undefined),
};

describe('SessionListConnectionStrip mounted', () => {
  beforeEach(() => {
    connection.reset();
    connection.retryConnection.mockClear();
  });

  it('reserves strip height when ready', async () => {
    const renderer = await mount(baseProps);

    const views = findHost(renderer.root, 'View');
    expect(views).toHaveLength(1);
    expect(views[0]?.props.className).toContain('h-[18px]');
    expect(findHost(renderer.root, 'Text')).toHaveLength(0);
  });

  it('reads Connecting… on a cold start while disconnected', async () => {
    connection.setConnected(false);
    const renderer = await mount(baseProps);

    expect(findHost(renderer.root, 'WifiOff')).toHaveLength(1);
    expect(textContents(renderer.root)).toContain('agentChat.sessionConnection.connecting');
  });

  it('reads Reconnecting… after a drop from a committed up state', async () => {
    const renderer = await mount(baseProps);
    expect(findHost(renderer.root, 'Text')).toHaveLength(0);

    await act(async () => {
      await Promise.resolve();
      connection.setConnected(false);
    });

    expect(findHost(renderer.root, 'WifiOff')).toHaveLength(1);
    expect(textContents(renderer.root)).toContain('agentChat.sessionConnection.reconnecting');
    expect(textContents(renderer.root).join(' ').toLowerCase()).not.toMatch(/start/);
  });

  it('renders Connection lost with a Retry connection action when reconnects are exhausted', async () => {
    connection.setConnected(false);
    connection.setExhausted(true);
    const renderer = await mount(baseProps);

    expect(findHost(renderer.root, 'WifiOff')).toHaveLength(1);
    const texts = textContents(renderer.root);
    expect(texts).toContain('agentChat.sessionConnection.connectionLost');
    expect(texts).toContain('agentChat.sessionConnection.retryConnection');
    expect(findHost(renderer.root, 'Pressable')).toHaveLength(1);
  });

  it('calls retryConnection when the Retry connection action is pressed', async () => {
    connection.setConnected(false);
    connection.setExhausted(true);
    const renderer = await mount(baseProps);

    const pressables = findHost(renderer.root, 'Pressable');
    expect(pressables).toHaveLength(1);
    const pressable = pressables[0];
    expect(pressable).toBeDefined();
    if (!pressable) {
      throw new Error('pressable not found');
    }

    await act(async () => {
      await Promise.resolve();
      (pressable.props.onPress as () => void)();
    });

    expect(connection.retryConnection).toHaveBeenCalledTimes(1);
  });

  it('renders the Updating spinner while a live-row update is in flight', async () => {
    const renderer = await mount({ ...baseProps, updating: true });

    expect(findHost(renderer.root, 'SpinningIcon')).toHaveLength(1);
    expect(findHost(renderer.root, 'View')[0]?.props.className).toContain('h-[18px]');
    expect(textContents(renderer.root)).toContain('agents.sessionList.updating');
  });

  it('renders the refresh-failed label with a Retry action', async () => {
    const onRetryRefresh = vi.fn(() => undefined);
    const renderer = await mount({ ...baseProps, refreshFailed: true, onRetryRefresh });

    expect(findHost(renderer.root, 'AlertCircle')).toHaveLength(1);
    const texts = textContents(renderer.root);
    expect(texts).toContain('agents.sessionList.refreshFailed');
    expect(texts).toContain('common.retry');
    expect(findHost(renderer.root, 'Pressable')).toHaveLength(1);
  });

  it('calls onRetryRefresh when the refresh-failed Retry action is pressed', async () => {
    const onRetryRefresh = vi.fn(() => undefined);
    const renderer = await mount({ ...baseProps, refreshFailed: true, onRetryRefresh });

    const pressables = findHost(renderer.root, 'Pressable');
    expect(pressables).toHaveLength(1);
    const pressable = pressables[0];
    expect(pressable).toBeDefined();
    if (!pressable) {
      throw new Error('pressable not found');
    }

    await act(async () => {
      await Promise.resolve();
      (pressable.props.onPress as () => void)();
    });

    expect(onRetryRefresh).toHaveBeenCalledTimes(1);
  });
});
