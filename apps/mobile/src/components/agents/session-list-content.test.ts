/* eslint-disable max-lines, typescript-eslint/no-deprecated -- react-test-renderer is the DOM-free renderer used to mount the list under vitest; max-lines holds the live-dot mount case beside the surface-selector unit tests in one file. */
import {
  type Component,
  type ComponentProps,
  createElement,
  type RefObject,
} from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentSessionListContent } from './session-list-content';
import { selectSessionListContentSurface } from './session-list-content-surface';
import { type StoredSession } from '@/lib/hooks/use-agent-sessions';

vi.mock('expo-router', () => ({
  useFocusEffect: () => undefined,
  useScrollToTop: () => undefined,
}));

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Platform: { OS: 'ios' },
  RefreshControl: 'RefreshControl',
  SectionList: 'SectionList',
  View: 'View',
  useWindowDimensions: () => ({ fontScale: 1 }),
}));

vi.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'AnimatedView' },
  FadeIn: { duration: () => 'FadeIn' },
  FadeOut: { duration: () => 'FadeOut' },
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/agents/session-list-body-empty', () => ({
  BodyEmpty: 'BodyEmpty',
}));
vi.mock('@/components/agents/session-list-section-header', () => ({
  SessionListSectionHeader: 'SessionListSectionHeader',
}));
vi.mock('@/components/agents/session-row', () => ({
  StoredSessionRow: 'StoredSessionRow',
}));
vi.mock('@/components/query-error', () => ({
  QueryError: 'QueryError',
}));
vi.mock('@/components/ui/button', () => ({
  Button: 'Button',
}));
vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: 'Skeleton',
}));
vi.mock('@/components/ui/text', () => ({
  Text: 'Text',
}));
vi.mock('@/lib/a11y/announce', () => ({
  moveA11yFocus: () => false,
}));
vi.mock('@/lib/agent-session-sort', () => ({
  SESSION_LIST_SORT: 'updated_at',
}));
vi.mock('@/lib/hooks/use-session-mutations', () => ({
  useSessionMutations: () => ({ deleteSession: vi.fn(), renameSession: vi.fn() }),
}));
vi.mock('@/lib/hooks/use-theme-colors', () => ({
  useThemeColors: () => ({ mutedForeground: '#888888' }),
}));
vi.mock('@/lib/session-attention', () => ({
  getRevisionSnapshot: () => 0,
}));
vi.mock('@/lib/tab-bar-layout', () => ({
  getEffectiveTabBarHeight: () => 0,
}));

function makeStored(over: Partial<StoredSession> = {}): StoredSession {
  return {
    session_id: 's1',
    title: 'Untitled',
    cloud_agent_session_id: null,
    parent_session_id: null,
    organization_id: null,
    created_on_platform: 'cli',
    git_url: null,
    git_branch: null,
    status: null,
    status_updated_at: null,
    total_cost_microdollars: null,
    created_at: '2026-07-01 00:00:00+00',
    updated_at: '2026-07-01 00:00:00+00',
    version: 0,
    associatedPr: null,
    ...over,
  };
}

function surface(overrides: Partial<Parameters<typeof selectSessionListContentSurface>[0]> = {}) {
  return selectSessionListContentSurface({
    isLoading: false,
    isError: false,
    hasAnySessions: true,
    hasHistoryContent: true,
    ...overrides,
  });
}

describe('selectSessionListContentSurface', () => {
  describe('loading (single SectionList site)', () => {
    it('keeps the section-list path with skeleton empty while loading, even with empty cache', () => {
      // Cold open: hasAnySessions is false for the whole load. Must NOT fall
      // through to history-empty — that would flash "No past sessions".
      expect(
        surface({
          isLoading: true,
          hasAnySessions: false,
          hasHistoryContent: false,
        })
      ).toEqual({ kind: 'section-list', listEmpty: 'loading-skeletons' });
    });

    it('does not surface full-screen error while still loading', () => {
      expect(
        surface({
          isLoading: true,
          isError: true,
          hasAnySessions: false,
          hasHistoryContent: false,
        })
      ).toEqual({ kind: 'section-list', listEmpty: 'loading-skeletons' });
    });
  });

  describe('after load — non-list surfaces', () => {
    it('shows full-screen error only when load finished with nothing on screen', () => {
      expect(
        surface({
          isLoading: false,
          isError: true,
          hasAnySessions: false,
          hasHistoryContent: false,
        })
      ).toEqual({ kind: 'full-screen-error' });
    });

    it('shows history-empty only after load with no sessions at all', () => {
      expect(
        surface({
          isLoading: false,
          hasAnySessions: false,
          hasHistoryContent: false,
        })
      ).toEqual({ kind: 'history-empty' });
    });
  });

  describe('after load — section list', () => {
    it('renders history rows with no ListEmptyComponent when sections exist', () => {
      expect(
        surface({
          isLoading: false,
          hasAnySessions: true,
          hasHistoryContent: true,
        })
      ).toEqual({ kind: 'section-list', listEmpty: 'none' });
    });

    it('uses body-empty ListEmptyComponent when history is empty but sessions exist', () => {
      // Filtered empty — body model decides the empty kind.
      expect(
        surface({
          isLoading: false,
          hasAnySessions: true,
          hasHistoryContent: false,
        })
      ).toEqual({ kind: 'section-list', listEmpty: 'body-empty' });
    });
  });

  describe('ListEmptyComponent precedence', () => {
    it('prefers loading-skeletons over body-empty whenever isLoading', () => {
      // Explicit precedence: isLoading ? skeletons : body-empty.
      // hasHistoryContent false would otherwise be body-empty.
      const loading = surface({
        isLoading: true,
        hasAnySessions: true,
        hasHistoryContent: false,
      });
      const loaded = surface({
        isLoading: false,
        hasAnySessions: true,
        hasHistoryContent: false,
      });
      expect(loading).toEqual({ kind: 'section-list', listEmpty: 'loading-skeletons' });
      expect(loaded).toEqual({ kind: 'section-list', listEmpty: 'body-empty' });
    });
  });
});

type ContentProps = ComponentProps<typeof AgentSessionListContent>;

const SEARCH_INPUT_REF: RefObject<Component | null> = { current: null };

function contentProps(overrides: Partial<ContentProps> = {}): ContentProps {
  return {
    searchInputRef: SEARCH_INPUT_REF,
    sections: [{ title: 'Today', data: [makeStored()] }],
    liveSessionIds: new Set<string>(),
    hasAnySessions: true,
    isLoading: false,
    isError: false,
    isFetchingNextPage: false,
    refetch: vi.fn(),
    onRetry: () => undefined,
    onEndReached: () => undefined,
    onSessionPress: () => undefined,
    hasActiveQuery: false,
    isSearching: false,
    searchQuery: '',
    onClearQuery: () => undefined,
    ...overrides,
  };
}

type RenderedStoredRow = { props: { live: boolean; metaWhileLive: boolean; session: StoredSession } };

type SectionListProps = {
  extraData: { liveSessionIds: ReadonlySet<string> };
  renderItem: (input: { item: StoredSession }) => RenderedStoredRow;
};

function sectionListProps(renderer: TestRenderer.ReactTestRenderer): SectionListProps {
  const list = renderer.root.find(
    node => typeof node.type === 'string' && (node.type as string) === 'SectionList'
  );
  return list.props as SectionListProps;
}

function renderedRow(
  renderer: TestRenderer.ReactTestRenderer,
  item: StoredSession
): RenderedStoredRow {
  return sectionListProps(renderer).renderItem({ item });
}

const mountedRenderers: TestRenderer.ReactTestRenderer[] = [];

async function renderContent(
  overrides: Partial<ContentProps> = {}
): Promise<TestRenderer.ReactTestRenderer> {
  const rendererRef: { current: TestRenderer.ReactTestRenderer | undefined } = {
    current: undefined,
  };
  await act(async () => {
    await Promise.resolve();
    rendererRef.current = TestRenderer.create(
      createElement(AgentSessionListContent, contentProps(overrides))
    );
  });
  const renderer = rendererRef.current;
  if (!renderer) {
    throw new Error('renderer was not created');
  }
  mountedRenderers.push(renderer);
  return renderer;
}

describe('AgentSessionListContent live dot', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => {
      for (const renderer of mountedRenderers) {
        renderer.unmount();
      }
    });
    mountedRenderers.length = 0;
    vi.restoreAllMocks();
  });

  it('renders the live dot beside the timestamp for a stored row in the active set', async () => {
    const row = makeStored({ session_id: 's1' });
    const renderer = await renderContent({
      sections: [{ title: 'Today', data: [row] }],
      liveSessionIds: new Set(['s1']),
    });

    const element = renderedRow(renderer, row);
    expect(element.props.live).toBe(true);
    expect(element.props.metaWhileLive).toBe(true);
  });

  it('omits the live dot for a stored row outside the active set', async () => {
    const row = makeStored({ session_id: 's1' });
    const renderer = await renderContent({
      sections: [{ title: 'Today', data: [row] }],
      liveSessionIds: new Set(['s9']),
    });

    const element = renderedRow(renderer, row);
    expect(element.props.live).toBe(false);
    expect(element.props.metaWhileLive).toBe(false);
  });

  it('flips the live dot on a cache change without remounting the list', async () => {
    const row = makeStored({ session_id: 's1' });
    const renderer = await renderContent({
      sections: [{ title: 'Today', data: [row] }],
      liveSessionIds: new Set(),
    });
    expect(renderedRow(renderer, row).props.live).toBe(false);

    // A WS write mutates the activeSessions cache, which recomputes the id set
    // and re-renders the same mounted SectionList through extraData.
    act(() => {
      renderer.update(
        createElement(
          AgentSessionListContent,
          contentProps({
            sections: [{ title: 'Today', data: [row] }],
            liveSessionIds: new Set(['s1']),
          })
        )
      );
    });

    const element = renderedRow(renderer, row);
    expect(element.props.live).toBe(true);
    expect(element.props.metaWhileLive).toBe(true);

    expect(sectionListProps(renderer).extraData.liveSessionIds).toEqual(new Set(['s1']));
  });
});
