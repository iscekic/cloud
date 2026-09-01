/* eslint-disable max-lines -- The live Agents list screen keeps its header, filter chips, connection strip, and every body branch together. */
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AppState,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Bot, Plus } from '@/components/ui/icons';

import { EmptyState } from '@/components/empty-state';
import { QueryError } from '@/components/query-error';
import { SessionFilterChips, SessionFilterModal } from '@/components/agents/platform-filter-modal';
import { SessionFilterButton } from '@/components/agents/session-filter-button';
import { SessionListConnectionStrip } from '@/components/agents/session-list-connection-strip';
import { SessionListSearchHeader } from '@/components/agents/session-list-search-header';
import { useLiveSessionQuery } from '@/components/agents/use-live-session-query';
import { getNewAgentSessionPath } from '@/components/agents/session-list-routes';
import { RemoteSessionRow } from '@/components/agents/remote-session-row';
import { FAB_MARGIN, FAB_SIZE } from '@/components/agents/session-list-content';
import { useAgentSessionNavigator } from '@/components/agents/use-agent-session-navigator';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { ScreenHeader } from '@/components/screen-header';
import { useOrganization } from '@/lib/organization-context';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';
import { getRevisionSnapshot } from '@/lib/session-attention';
import { getEffectiveTabBarHeight } from '@/lib/tab-bar-layout';
import { type ActiveSession, useLiveAgentSessions } from '@/lib/hooks/use-agent-sessions';
import { isTerminalTrpcCode, readTrpcErrorField } from '@/lib/trpc-error';

import { type Href, useFocusEffect, useNavigation, useRouter, useScrollToTop } from 'expo-router';

const SKELETON_ROW_COUNT = 8;

export function AgentSessionListScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();

  const tabBarHeight = useMemo(
    () => getEffectiveTabBarHeight({ bottomInset: bottom, platform: Platform.OS, fontScale }),
    [bottom, fontScale]
  );

  const { organizationId, isLoaded: orgLoaded } = useOrganization();
  const { activeSessions, isLoading, isFetching, isSuccess, isError, error, refetch } =
    useLiveAgentSessions({
      organizationId,
      enabled: orgLoaded,
    });

  const query = useLiveSessionQuery(activeSessions);
  const { visibleSessions, isSearching } = query;
  const displayedSessions = query.hasLoaded ? visibleSessions : activeSessions;
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Treat !orgLoaded as loading so the empty state cannot flash before skeletons.
  const loading = isLoading || !orgLoaded;
  const hasLiveRows = activeSessions.length > 0;
  const hasDisplayedRows = displayedSessions.length > 0;
  // The live query polls on its own interval (30s/10s), which must not surface
  // as visible refresh progress. `updating` is scoped to a user-initiated
  // refresh: `isRefreshing` is set when the user pulls, returns focus, or
  // foregrounds the app, and cleared when that fetch settles.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const updating = hasLiveRows && isRefreshing;
  const refreshFailed = hasLiveRows && isError && !isFetching;

  const runRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  const runRefreshRef = useRef(runRefresh);
  useEffect(() => {
    runRefreshRef.current = runRefresh;
  }, [runRefresh]);
  useFocusEffect(
    useCallback(() => {
      void runRefreshRef.current();
    }, [])
  );

  const listRef = useRef<FlatList<ActiveSession>>(null);
  useScrollToTop(listRef);

  // The tabs navigator uses `freezeOnBlur`, so while the session detail screen
  // is pushed the live Agents list is frozen. On return, each row re-reads the
  // ack store via its own `useSyncExternalStore` subscription
  // (`useSessionAttentionRevision`). Snapshot the attention revision when the
  // tab (re)gains focus via `useFocusEffect` (fires after unfreeze) and pass
  // it as `extraData` so visible cells re-render without remounting the list —
  // preserving scroll.
  const [attentionFocusRevision, setAttentionFocusRevision] = useState(getRevisionSnapshot);
  useFocusEffect(
    useCallback(() => {
      setAttentionFocusRevision(getRevisionSnapshot());
    }, [])
  );

  // App-foreground refresh for the live Agents list. The live query keeps its
  // own poll interval; an OS foreground transition re-reads focus live via
  // `navigation.isFocused()` because a frozen (unfocused) tab does not
  // re-render. Only the focused tab refetches live sessions and invalidates
  // the active-sessions tray — no stored queries are touched.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active' && navigation.isFocused()) {
        void runRefreshRef.current();
        void queryClient.invalidateQueries({ queryKey: [['activeSessions']] });
      }
    });
    return () => {
      subscription.remove();
    };
  }, [queryClient, navigation]);

  const navigateToSession = useAgentSessionNavigator();

  const seeAllLabel = t('home.seeAll');
  const headerRight = (
    <View className="flex-row items-center gap-4">
      <Pressable
        onPress={() => {
          router.push('/(app)/(tabs)/(2_agents)/history' as Href);
        }}
        // left slop capped against the large title, right slop reaches 44pt wide
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 16 }}
        accessibilityRole="button"
        accessibilityLabel={seeAllLabel}
        testID="agents-view-history"
        className="active:opacity-70"
      >
        <Text className="shrink font-mono-medium text-[11px] uppercase tracking-[1.5px] text-primary">
          {seeAllLabel}
        </Text>
      </Pressable>
      {query.canFilter ? (
        <SessionFilterButton
          activeCount={query.activeFilterCount}
          onPress={() => {
            setShowFilterModal(true);
          }}
          testID="agents-open-filters"
        />
      ) : null}
    </View>
  );

  const handleRefresh = useCallback(() => {
    void runRefresh();
  }, [runRefresh]);

  const renderItem = useCallback(
    ({ item }: { item: ActiveSession }) => (
      <RemoteSessionRow
        session={item}
        onPress={() => {
          navigateToSession(item.id, organizationId);
        }}
      />
    ),
    [navigateToSession, organizationId]
  );

  const keyExtractor = useCallback((item: ActiveSession) => item.id, []);

  // The tab bar is an absolutely-positioned overlay, so scrollable content
  // must clear it. The FAB adds its own inset when it shows so the last row
  // scrolls clear of the button too. The connection strip reuses the 18px
  // first-row inset, so the list itself has no extra top padding.
  const listPadding = useMemo(
    () => ({
      paddingBottom: tabBarHeight + (hasLiveRows ? FAB_SIZE + FAB_MARGIN : 0),
    }),
    [tabBarHeight, hasLiveRows]
  );

  const fabStyle = useMemo(
    () => ({
      bottom: tabBarHeight + FAB_MARGIN,
      right: 20,
      width: FAB_SIZE,
      height: FAB_SIZE,
    }),
    [tabBarHeight]
  );

  const skeletonBody = (
    <View>
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
        <View key={i} className="py-1.5">
          <Skeleton className="mx-[22px] h-[76px] rounded-none" />
        </View>
      ))}
    </View>
  );

  let body: ReactNode = null;
  if (hasDisplayedRows) {
    body = (
      <FlatList
        ref={listRef}
        data={displayedSessions}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        extraData={attentionFocusRevision}
        contentContainerStyle={listPadding}
        refreshControl={<RefreshControl refreshing={false} onRefresh={handleRefresh} />}
        maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 10 }}
      />
    );
  } else if (hasLiveRows) {
    body = (
      <EmptyState
        icon={Bot}
        title={t('agents.sessionList.noMatches')}
        description={
          isSearching
            ? t('agents.sessionList.tryDifferentSearch')
            : t('agents.sessionList.tryAdjustFilters')
        }
        action={
          <Button
            variant="outline"
            onPress={isSearching ? query.handleClearSearch : query.handleClearFilters}
          >
            <Text>
              {isSearching ? t('agents.search.clearSearch') : t('agents.search.clearFilters')}
            </Text>
          </Button>
        }
      />
    );
  } else if (loading) {
    body = skeletonBody;
  } else if (isError) {
    const code = readTrpcErrorField(error, 'code');
    const terminal = isTerminalTrpcCode(code);
    const permission = code === 'FORBIDDEN' || code === 'UNAUTHORIZED';
    body = (
      <QueryError
        variant={permission ? 'permission' : 'neutral'}
        message={permission ? undefined : t('agents.sessionList.couldNotLoadActive')}
        onRetry={
          terminal
            ? undefined
            : () => {
                void refetch();
              }
        }
      />
    );
  } else if (isSuccess) {
    body = (
      <EmptyState
        icon={Bot}
        title={t('home.noLiveSessions')}
        description={t('agents.sessionList.emptyDescription', {
          context: organizationId ? t('profile.organization') : t('profile.personal'),
        })}
        action={
          <Button
            variant="outline"
            onPress={() => {
              router.push(getNewAgentSessionPath(organizationId) as Href);
            }}
          >
            <Plus size={16} color={colors.foreground} />
            <Text>{t('home.newCodingTask')}</Text>
          </Button>
        }
      />
    );
  } else {
    body = skeletonBody;
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title={t('tabs.agents')}
        size="large"
        showBackButton={false}
        className="px-[22px]"
        headerRight={headerRight}
      />
      {hasLiveRows || isSearching ? (
        <SessionListSearchHeader
          inputRef={query.searchInputRef}
          hasText={query.searchQuery.length > 0}
          showSearchBusy={false}
          showInlineError={false}
          onChangeText={query.handleSearchChange}
          onClearSearch={query.handleClearSearch}
        />
      ) : null}
      <SessionFilterChips
        platformFilter={query.platformFilter}
        projectFilter={query.projectFilter}
        projectOptions={query.options.projectOptions}
        onRemovePlatform={query.handleRemovePlatform}
        onRemoveProject={query.handleRemoveProject}
      />
      <SessionListConnectionStrip
        hasLiveRows={hasLiveRows}
        updating={updating}
        refreshFailed={refreshFailed}
        onRetryRefresh={() => {
          void runRefresh();
        }}
      />
      {body}
      {/* FAB visible when there are live rows — empty state already owns the creation CTA. */}
      {hasLiveRows && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('agentChat.newSession.title')}
          testID="agents-new-session-fab"
          onPress={() => {
            router.push(getNewAgentSessionPath(organizationId) as Href);
          }}
          className="absolute items-center justify-center rounded-full bg-primary shadow-lg shadow-[#00000040] active:opacity-80"
          style={fabStyle}
        >
          <Plus size={24} color={colors.primaryForeground} />
        </Pressable>
      )}
      {showFilterModal && (
        <SessionFilterModal
          selectedPlatforms={query.platformFilter}
          selectedProjects={query.projectFilter}
          projectOptions={query.options.projectOptions}
          platformOptions={query.options.platformOptions}
          onClose={() => {
            setShowFilterModal(false);
          }}
          onApply={query.handleApplyFilters}
        />
      )}
    </View>
  );
}
