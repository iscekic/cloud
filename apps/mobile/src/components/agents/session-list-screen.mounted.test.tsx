/* eslint-disable max-lines, typescript-eslint/no-deprecated -- DOM-free live-list matrix and focus/navigation regressions share one mounted fixture. */
import { createElement, Fragment, type ReactNode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '@/i18n';
import { AgentSessionListScreen } from './session-list-screen';
import { type ActiveSession, type useLiveAgentSessions } from '@/lib/hooks/use-agent-sessions';
import { type BannerState } from '@/lib/offline-banner-state';

type Org = { organizationId: string; organizationName: string };
const state = vi.hoisted(() => ({
  focused: true,
  focusCallbacks: [] as (() => void)[],
  listeners: new Set<(state: string) => void>(),
  auth: { token: 'account' as string | undefined, isLoading: false, isSigningOut: false },
  organization: { organizationId: null as string | null, isLoaded: true },
  boundary: { orgs: [] as Org[] | undefined, isResolving: false, isError: false },
  live: {
    activeSessions: [] as ActiveSession[],
    isLoading: false,
    isError: false,
    hasAcceptedSuccess: true,
    isFetching: false,
    isPaused: false,
    terminalError: null as ReturnType<typeof useLiveAgentSessions>['terminalError'],
  },
  internet: 'online' as BannerState,
  connection: { isConnected: true, reconnectExhausted: false },
  refetch: vi.fn<() => Promise<boolean>>(),
  boundaryRefetch: vi.fn(),
  socketRetry: vi.fn(),
  invalidate: vi.fn(),
  announcements: [] as string[],
  destination: '',
  sessionId: '',
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  RefreshControl: 'RefreshControl',
  View: 'View',
  ActivityIndicator: 'ActivityIndicator',
  useWindowDimensions: () => ({ fontScale: 1 }),
  AppState: {
    addEventListener: (_event: string, listener: (next: string) => void) => {
      state.listeners.add(listener);
      return {
        remove: () => {
          state.listeners.delete(listener);
        },
      };
    },
  },
  FlatList: (props: {
    data: ActiveSession[];
    renderItem: (entry: { item: ActiveSession }) => ReactNode;
    keyExtractor: (item: ActiveSession) => string;
  }) =>
    createElement(
      'FlatList',
      props,
      props.data.map(item =>
        createElement(Fragment, { key: props.keyExtractor(item) }, props.renderItem({ item }))
      )
    ),
}));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => state.focused }),
  useFocusEffect: (effect: () => void) => {
    state.focusCallbacks.push(effect);
  },
  useRouter: () => ({
    push: (path: string) => {
      state.destination = path;
    },
    replace: (path: string) => {
      state.destination = path;
    },
  }),
  useScrollToTop: () => undefined,
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}));
vi.mock('@/components/ui/icons', () => ({
  Plus: 'Plus',
  Bot: 'Bot',
  AlertCircle: 'AlertCircle',
  Lock: 'Lock',
  SearchX: 'SearchX',
  ServerCrash: 'ServerCrash',
  WifiOff: 'WifiOff',
}));
vi.mock('@/components/agents/remote-session-row', () => ({ RemoteSessionRow: 'RemoteSessionRow' }));
vi.mock('@/components/agents/session-list-content', () => ({
  AgentSessionListContent: 'AgentSessionListContent',
  FAB_MARGIN: 16,
  FAB_SIZE: 48,
}));
vi.mock('@/components/agents/session-list-search-header', () => ({
  SessionListSearchHeader: 'SessionListSearchHeader',
}));
vi.mock('@/components/agents/platform-filter-modal', () => ({
  SessionFilterChips: 'SessionFilterChips',
  SessionFilterModal: 'SessionFilterModal',
}));
vi.mock('@/components/agents/active-now-section', () => ({ ActiveNowSection: 'ActiveNowSection' }));
vi.mock('@/components/agents/use-agent-session-navigator', () => ({
  useAgentSessionNavigator: () => (id: string) => {
    state.sessionId = id;
  },
}));
vi.mock('@/components/home/section-header', () => ({ SectionHeader: 'SectionHeader' }));
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: 'Skeleton' }));
vi.mock('@/components/ui/text', async () => {
  const { createContext } = await import('react');
  return { Text: 'Text', TextClassContext: createContext('') };
});
vi.mock('@/components/screen-header', () => ({ ScreenHeader: 'ScreenHeader' }));
vi.mock('@/lib/auth/auth-context', () => ({ useAuth: () => state.auth }));
vi.mock('@/lib/organization-context', () => ({ useOrganization: () => state.organization }));
vi.mock('@/lib/hooks/use-organization-queries', () => ({
  useOrgBoundary: () => ({
    ...state.boundary,
    org: state.boundary.orgs?.find(org => org.organizationId === state.organization.organizationId),
    refetch: state.boundaryRefetch,
  }),
}));
vi.mock('@/lib/hooks/use-theme-colors', () => ({
  useThemeColors: () => ({
    primaryForeground: '#ffffff',
    foreground: '#000000',
    mutedForeground: '#777777',
  }),
}));
vi.mock('@/lib/hooks/use-offline-banner-state', () => ({
  useCommittedConnectivityStatus: () => state.internet,
}));
vi.mock('@/lib/hooks/use-user-web-connection-state', () => ({
  useUserWebConnectionHealth: () => state.connection,
}));
vi.mock('@/components/agents/user-web-connection-provider', () => ({
  useUserWebConnection: () => ({ retryConnection: state.socketRetry }),
}));
vi.mock('@/lib/a11y/announce', () => ({
  announceForA11y: (message: string) => {
    state.announcements.push(message);
  },
}));
vi.mock('@/lib/tab-bar-layout', () => ({ getEffectiveTabBarHeight: () => 60 }));
vi.mock('@/lib/hooks/use-agent-sessions', () => ({
  useLiveAgentSessions: () => ({ ...state.live, refetch: state.refetch }),
  useAgentSessions: () => {
    throw new Error('Live list must not mount stored history');
  },
}));
const row: ActiveSession = {
  id: 'live-1',
  status: 'running',
  title: 'Live task',
  connectionId: 'connection-1',
};
const failure = { kind: 'retryable', error: new Error('temporary') } as const;
let renderer: TestRenderer.ReactTestRenderer | undefined = undefined;
function nodes(type: string) {
  if (!renderer) {
    throw new Error('Missing live list');
  }
  return renderer.root.findAll(node => typeof node.type === 'string' && node.type === type);
}
function text() {
  return nodes('Text')
    .map(node => node.children.filter(child => typeof child === 'string').join(''))
    .join('\n');
}
function action(label: string) {
  const button = nodes('Pressable').find(node => node.props.accessibilityLabel === label);
  if (!button) {
    throw new Error(`Missing action: ${label}`);
  }
  return button;
}
function press(label: string) {
  (action(label).props.onPress as () => void)();
}
function headerRight() {
  return nodes('ScreenHeader')[0]?.props.headerRight as {
    type: string;
    props: {
      onPress: () => void;
      testID: string;
      accessibilityRole: string;
      children: { type: string };
    };
  };
}
async function renderScreen() {
  await act(async () => {
    const tree = createElement(AgentSessionListScreen);
    if (renderer) {
      renderer.update(tree);
    } else {
      renderer = TestRenderer.create(tree);
    }
    await Promise.resolve();
  });
}
function foreground() {
  for (const listener of state.listeners) {
    listener('active');
  }
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  state.focused = true;
  state.focusCallbacks = [];
  state.destination = '';
  state.sessionId = '';
  state.announcements = [];
  Object.assign(state.auth, { token: 'account', isLoading: false, isSigningOut: false });
  Object.assign(state.organization, { organizationId: null, isLoaded: true });
  Object.assign(state.boundary, { orgs: [], isResolving: false, isError: false });
  Object.assign(state.live, {
    activeSessions: [],
    isLoading: false,
    isError: false,
    hasAcceptedSuccess: true,
    isFetching: false,
    isPaused: false,
    terminalError: null,
  });
  Object.assign(state.connection, { isConnected: true, reconnectExhausted: false });
  state.internet = 'online';
  state.refetch.mockReset().mockResolvedValue(true);
  state.boundaryRefetch.mockReset();
  state.socketRetry.mockReset();
  state.invalidate.mockReset();
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  state.listeners.clear();
});

describe('AgentSessionListScreen live presentation', () => {
  it.each<{
    name: string;
    patch: Partial<typeof state.live>;
    skeleton?: boolean;
    empty?: boolean;
    rows?: boolean;
    error?: boolean;
    updating?: boolean;
  }>([
    {
      name: 'pending',
      patch: { hasAcceptedSuccess: false, isLoading: true, isFetching: true },
      skeleton: true,
    },
    { name: 'paused', patch: { hasAcceptedSuccess: false, isPaused: true }, skeleton: true },
    { name: 'socket-only empty', patch: { hasAcceptedSuccess: false }, skeleton: true },
    { name: 'canceled without provenance', patch: { hasAcceptedSuccess: false }, skeleton: true },
    { name: 'accepted empty', patch: {}, empty: true },
    {
      name: 'initial failure',
      patch: { hasAcceptedSuccess: false, terminalError: failure, isError: true },
      error: true,
    },
    {
      name: 'retained cache after a socket write',
      patch: { activeSessions: [row], terminalError: failure },
      rows: true,
      error: true,
    },
    {
      name: 'updating',
      patch: { activeSessions: [row], isFetching: true },
      rows: true,
      updating: true,
    },
    {
      name: 'updating after a terminal failure',
      patch: { activeSessions: [row], terminalError: failure, isFetching: true },
      rows: true,
      error: true,
      updating: true,
    },
    {
      name: 'paused cache',
      patch: { activeSessions: [row], isPaused: true, isFetching: true },
      rows: true,
    },
  ])('keeps creation, history, and truthful content during $name', async test => {
    Object.assign(state.live, test.patch);
    await renderScreen();
    expect(nodes('Skeleton')).toHaveLength(test.skeleton ? 8 : 0);
    if (test.skeleton) {
      expect(nodes('Skeleton')[0]?.props.className).toContain('h-[76px]');
    }
    expect(text().includes('Nothing running right now')).toBe(Boolean(test.empty));
    expect(text().includes('Could not load active sessions')).toBe(Boolean(test.error));
    expect(text().includes('Updating')).toBe(Boolean(test.updating));
    expect(text().includes('Loading…')).toBe(Boolean(test.skeleton));
    expect(nodes('FlatList')).toHaveLength(test.rows ? 1 : 0);
    expect(text()).toContain('Personal');
    expect(headerRight().props.testID).toBe('agents-view-history');
    headerRight().props.onPress();
    expect(state.destination).toBe('/(app)/(tabs)/(2_agents)/history');
    if (test.empty) {
      expect(nodes('Pressable').some(node => node.props.testID === 'agents-new-session-fab')).toBe(
        false
      );
      press('New coding task');
    } else {
      press('New session');
    }
    expect(state.destination).toBe('/(app)/agent-chat/new');
  });

  it('keeps cold-loading feedback stable until an accepted result', async () => {
    state.live.hasAcceptedSuccess = false;
    state.live.isLoading = true;
    state.live.isFetching = true;
    await renderScreen();
    const loading = nodes('Text').find(node => node.children.includes('Loading…'));
    const skeletons = nodes('Skeleton');
    expect(loading).toBeDefined();
    expect(skeletons).toHaveLength(8);
    expect(text()).not.toContain('Updating');
    expect(text()).not.toContain('Nothing running right now');
    expect(state.announcements).toEqual(['Loading…']);

    await renderScreen();
    state.live.isLoading = false;
    state.live.isFetching = false;
    await renderScreen();
    expect(nodes('Text').find(node => node.children.includes('Loading…'))).toBe(loading);
    for (const [index, skeleton] of skeletons.entries()) {
      expect(nodes('Skeleton')[index]).toBe(skeleton);
    }
    expect(state.announcements).toEqual(['Loading…']);
    expect(text()).not.toContain('Nothing running right now');

    state.live.hasAcceptedSuccess = true;
    await renderScreen();
    expect(text()).not.toContain('Loading…');
    expect(nodes('Skeleton')).toHaveLength(0);
    expect(text()).toContain('Nothing running right now');
    expect(state.announcements).toEqual(['Loading…']);
  });

  it('keeps list identity, row identity, navigation, run state, and scroll policy through reconnect and refresh failure', async () => {
    state.live.activeSessions = [row];
    await renderScreen();
    const list = nodes('FlatList')[0];
    const originalRow = nodes('RemoteSessionRow')[0];
    if (!originalRow) {
      throw new Error('Missing live row');
    }
    state.live.isFetching = true;
    state.connection.isConnected = false;
    await renderScreen();
    expect(text()).toContain('Reconnecting…');
    expect(text()).toContain('Updating');
    state.live.isFetching = false;
    state.live.terminalError = failure;
    state.internet = 'offline';
    await renderScreen();
    expect(nodes('FlatList')[0]).toBe(list);
    expect(nodes('RemoteSessionRow')[0]).toBe(originalRow);
    expect(nodes('FlatList')[0]?.props.maintainVisibleContentPosition).toEqual({
      minIndexForVisible: 0,
      autoscrollToTopThreshold: 10,
    });
    expect(nodes('RemoteSessionRow')[0]?.props.session).toMatchObject({ status: 'running' });
    expect(text()).toContain('No internet connection');
    expect(text()).not.toContain('Reconnecting…');
    (originalRow.props.onPress as () => void)();
    expect(state.sessionId).toBe('live-1');
  });

  it.each([
    ['offline', 'No internet connection'],
    ['unknown', 'Connecting…'],
    ['connecting', 'Connecting…'],
    ['exhausted', 'Connection lost'],
  ] as const)(
    'keeps %s connection facts beside empty and error content',
    async (mode, expected) => {
      state.connection.isConnected = false;
      state.connection.reconnectExhausted = mode === 'exhausted';
      state.internet = mode === 'offline' || mode === 'unknown' ? mode : 'online';
      await renderScreen();
      expect(text()).toContain(expected);
      expect(text()).toContain('Nothing running right now');
      state.live.terminalError = failure;
      await renderScreen();
      expect(text()).toContain(expected);
      expect(text()).toContain('Could not load active sessions');
      expect(text()).not.toContain('Nothing running right now');
      expect(text()).not.toContain('Internet connection restored');
      if (mode === 'offline') {
        expect(text()).not.toContain('Connecting…');
      }
      if (mode === 'exhausted') {
        expect(text()).not.toContain('Connecting…');
        expect(text()).not.toContain('Reconnecting…');
      }
    }
  );

  it.each([false, true])(
    'keeps a failed query Retry recoverable with cached rows=%s',
    async cached => {
      state.live.activeSessions = cached ? [row] : [];
      state.live.terminalError = failure;
      state.connection.isConnected = false;
      state.connection.reconnectExhausted = true;
      const pending = Promise.withResolvers<boolean>();
      state.refetch.mockReturnValue(pending.promise);
      await renderScreen();
      act(() => {
        press('Retry');
        press('Retry');
      });
      expect(action('Retry').props.disabled).toBe(true);
      expect(action('Retry').props.accessibilityState).toMatchObject({
        busy: true,
        disabled: true,
      });
      expect(action('Retry connection').props.disabled).toBe(false);
      const queryRetry = action('Retry');
      const socketRetry = action('Retry connection');
      expect(
        nodes('View').filter(
          view =>
            view.props.accessible === true &&
            view.findAll(node => node === queryRetry || node === socketRetry).length > 0
        )
      ).toHaveLength(0);
      expect(state.refetch).toHaveBeenCalledTimes(1);
      await act(async () => {
        pending.resolve(false);
        await pending.promise;
      });
      expect(action('Retry').props.disabled).toBe(false);
      expect(text()).toContain('Could not load active sessions');
      state.refetch.mockImplementation(async () => {
        await Promise.resolve();
        state.live.terminalError = null;
        return true;
      });
      await act(async () => {
        press('Retry');
        await Promise.resolve();
      });
      await renderScreen();
      expect(text()).not.toContain('Could not load active sessions');
      expect(nodes('FlatList')).toHaveLength(cached ? 1 : 0);
      state.socketRetry.mockImplementation(() => {
        state.connection.reconnectExhausted = false;
      });
      act(() => {
        press('Retry connection');
      });
      await renderScreen();
      expect(text()).toContain('Connecting…');
      expect(text()).not.toContain('Connection lost');
      expect(state.refetch).toHaveBeenCalledTimes(2);
    }
  );

  it('keeps the retained error and Retry mounted as socket rows appear and disappear', async () => {
    state.live.hasAcceptedSuccess = false;
    state.live.terminalError = failure;
    await renderScreen();
    const message = 'Could not load active sessions';
    const retry = action('Retry');
    const status = nodes('Text').find(node => node.children.includes(message));
    expect(status).toBeDefined();
    expect(nodes('AlertCircle')).toHaveLength(1);

    async function updateSocketRows(activeSessions: ActiveSession[]) {
      state.live.activeSessions = activeSessions;
      await renderScreen();
      expect(nodes('RemoteSessionRow')).toHaveLength(activeSessions.length);
      expect.soft(action('Retry') === retry).toBe(true);
      expect
        .soft(nodes('Text').find(node => node.children.includes(message)) === status)
        .toBe(true);
      expect.soft(state.announcements).toEqual([message]);
      expect(nodes('AlertCircle')).toHaveLength(activeSessions.length === 0 ? 1 : 0);
    }
    await updateSocketRows([row]);
    await updateSocketRows([]);
  });

  it('does not invent internet or retry activity for an unknown paused connection', async () => {
    state.internet = 'unknown';
    state.connection.isConnected = false;
    state.live.isPaused = true;
    state.live.hasAcceptedSuccess = false;
    await renderScreen();
    expect(nodes('Skeleton')).toHaveLength(8);
    expect(text()).not.toContain('Nothing running right now');
    expect(text()).not.toContain('Connecting…');
    expect(text()).not.toContain('Reconnecting…');
    expect(text()).not.toContain('No internet connection');
    expect(text()).not.toContain('Updating');
  });

  it('retains one error announcement after a failed pull and waits for coordinated completion', async () => {
    state.live.activeSessions = [row];
    const pending = Promise.withResolvers<boolean>();
    state.refetch.mockReturnValue(pending.promise);
    await renderScreen();
    const refresh = () =>
      nodes('FlatList')[0]?.props.refreshControl as {
        props: { refreshing: boolean; onRefresh: () => void };
      };
    act(() => {
      refresh().props.onRefresh();
    });
    expect(refresh().props.refreshing).toBe(true);
    state.live.terminalError = failure;
    await act(async () => {
      pending.resolve(false);
      await pending.promise;
    });
    expect(refresh().props.refreshing).toBe(false);
    expect(text()).toContain('Could not load active sessions');
    expect(
      state.announcements.filter(message => message === 'Could not load active sessions')
    ).toHaveLength(1);
  });

  it('renders no combined-list controls and keeps one history label without a plus icon', async () => {
    state.live.activeSessions = [row];
    await renderScreen();
    for (const type of [
      'SessionListSearchHeader',
      'SessionFilterChips',
      'SessionFilterModal',
      'ActiveNowSection',
      'AgentSessionListContent',
      'AnimatedView',
    ]) {
      expect(nodes(type)).toHaveLength(0);
    }
    expect(headerRight().type).toBe('Pressable');
    expect(headerRight().props.children.type).toBe('Text');
  });
});

describe('Live list admission and lifecycle', () => {
  it.each(['pending', 'failed'] as const)(
    'admits personal creation while membership is %s',
    async mode => {
      state.boundary.orgs = undefined;
      state.boundary.isResolving = mode === 'pending';
      state.boundary.isError = mode === 'failed';
      state.live.hasAcceptedSuccess = false;
      await renderScreen();
      press('New session');
      expect(state.destination).toBe('/(app)/agent-chat/new');
      expect(text()).toContain('Personal');
    }
  );

  it.each([
    'account pending',
    'signed out',
    'signing out',
    'selection pending',
    'membership paused',
    'membership missing',
    'permission denied',
  ] as const)('suppresses protected rows for %s', async mode => {
    state.live.activeSessions = [row];
    state.organization.organizationId = 'org-1';
    state.boundary.orgs = [{ organizationId: 'org-1', organizationName: 'Engineering' }];
    if (mode === 'account pending') {
      state.auth.isLoading = true;
    }
    if (mode === 'signed out') {
      state.auth.token = undefined;
    }
    if (mode === 'signing out') {
      state.auth.isSigningOut = true;
    }
    if (mode === 'selection pending') {
      state.organization.isLoaded = false;
    }
    if (mode === 'membership paused') {
      state.boundary.orgs = undefined;
    }
    if (mode === 'membership missing') {
      state.boundary.orgs = [];
    }
    if (mode === 'permission denied') {
      state.live.terminalError = { kind: 'non-retryable', error: { data: { code: 'FORBIDDEN' } } };
    }
    await renderScreen();
    expect(nodes('FlatList')).toHaveLength(0);
    expect(text()).not.toContain('Nothing running right now');
    if (mode !== 'permission denied') {
      expect(nodes('Pressable').some(node => node.props.testID === 'agents-new-session-fab')).toBe(
        false
      );
      expect(text()).not.toContain('Engineering');
    }
    if (mode === 'membership paused') {
      expect(nodes('Skeleton')).toHaveLength(8);
      expect(text()).not.toContain('Organization unavailable');
    }
    if (mode === 'membership missing' || mode === 'permission denied') {
      expect(text()).toContain(
        mode === 'permission denied' ? 'Access denied' : 'Organization unavailable'
      );
      expect(nodes('Pressable').some(node => node.props.accessibilityLabel === 'Retry')).toBe(
        false
      );
    }
    headerRight().props.onPress();
    expect(state.destination).toBe('/(app)/(tabs)/(2_agents)/history');
  });

  it('recovers membership through boundary Retry, scopes empty content, and drops old labels on a context change', async () => {
    state.organization.organizationId = 'org-1';
    state.boundary.isError = true;
    state.boundary.orgs = undefined;
    await renderScreen();
    expect(text()).toContain("Couldn't load your organizations");
    state.boundaryRefetch.mockImplementation(async () => {
      state.boundary.isError = false;
      state.boundary.orgs = [{ organizationId: 'org-1', organizationName: 'Engineering' }];
      await Promise.resolve();
    });
    await act(async () => {
      press('Retry');
      await Promise.resolve();
    });
    await renderScreen();
    expect(text()).toContain('Engineering');
    expect(text()).toContain('Nothing running right now');
    press('New coding task');
    expect(state.destination).toBe('/(app)/agent-chat/new?organizationId=org-1');
    expect(state.refetch).not.toHaveBeenCalled();
    state.organization.organizationId = 'org-2';
    state.live.activeSessions = [row];
    await renderScreen();
    expect(text()).not.toContain('Engineering');
    expect(nodes('FlatList')).toHaveLength(0);
  });

  it('refreshes live sessions on focus and preserves foreground tray invalidation', async () => {
    state.refetch.mockImplementationOnce(async () => {
      await Promise.resolve();
      state.live.activeSessions = [row];
      return true;
    });
    await renderScreen();
    expect(nodes('FlatList')).toHaveLength(0);
    act(() => {
      for (const effect of state.focusCallbacks) {
        effect();
      }
    });
    await renderScreen();
    expect(nodes('RemoteSessionRow')[0]?.props.session).toMatchObject({ title: 'Live task' });
    state.refetch.mockImplementationOnce(async () => {
      await Promise.resolve();
      state.live.activeSessions = [{ ...row, title: 'Foreground result' }];
      return true;
    });
    act(foreground);
    await renderScreen();
    expect(nodes('RemoteSessionRow')[0]?.props.session).toMatchObject({
      title: 'Foreground result',
    });
    expect(state.refetch).toHaveBeenCalledTimes(2);
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: [['activeSessions']] });
  });

  it.each([false, true])(
    'does not refresh an unfocused tab, including post-mount blur=%s',
    async blurAfterMount => {
      state.refetch.mockImplementation(async () => {
        await Promise.resolve();
        state.live.activeSessions = [row];
        return true;
      });
      state.focused = blurAfterMount;
      await renderScreen();
      state.focused = false;
      act(foreground);
      await renderScreen();
      expect(text()).toContain('Nothing running right now');
      expect(nodes('FlatList')).toHaveLength(0);
      expect(state.refetch).not.toHaveBeenCalled();
      expect(state.invalidate).not.toHaveBeenCalled();
    }
  );
});
