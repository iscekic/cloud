import { type ReactNode, useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useUserWebConnection } from '@/components/agents/user-web-connection-provider';
import { AlertCircle, Loader2, WifiOff } from '@/components/ui/icons';
import { SpinningIcon } from '@/components/ui/spinning-icon';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';
import { useUserWebConnectionHealth } from '@/lib/hooks/use-user-web-connection-state';

import { selectLiveListStatus } from './session-list-live-status';

type SessionListConnectionStripProps = {
  hasLiveRows: boolean;
  updating: boolean;
  refreshFailed: boolean;
  onRetryRefresh: () => void;
};

const STRIP_CLASS = 'h-[18px] flex-row items-center justify-center gap-1.5';

/**
 * Presentational connection/refresh strip for the Agents session list.
 *
 * Reads the phone↔server socket directly and renders exactly one line inside a
 * reserved 18px inset so the list below never shifts. Ready still occupies
 * that height with no message.
 */
export function SessionListConnectionStrip({
  hasLiveRows,
  updating,
  refreshFailed,
  onRetryRefresh,
}: Readonly<SessionListConnectionStripProps>) {
  const { isConnected, reconnectExhausted } = useUserWebConnectionHealth();
  const connection = useUserWebConnection();
  const colors = useThemeColors();
  const { t } = useTranslation();

  // "Ever up" is a committed-state ref (written in an effect), so a drop
  // after the first committed up reads "Reconnecting…" while a cold start
  // reads "Connecting…".
  const wasUpRef = useRef(false);
  useEffect(() => {
    if (isConnected) {
      wasUpRef.current = true;
    }
  }, [isConnected]);

  const status = selectLiveListStatus({
    isConnected,
    reconnectExhausted,
    wasUp: wasUpRef.current,
    hasLiveRows,
    updating,
    refreshFailed,
  });

  let content: ReactNode = null;
  if (status.kind === 'connecting' || status.kind === 'reconnecting') {
    content = (
      <>
        <WifiOff size={12} color={colors.mutedForeground} />
        <Text className="text-xs text-muted-foreground">
          {t(
            status.kind === 'connecting'
              ? 'agentChat.sessionConnection.connecting'
              : 'agentChat.sessionConnection.reconnecting'
          )}
        </Text>
      </>
    );
  } else if (status.kind === 'connection-lost') {
    content = (
      <>
        <WifiOff size={12} color={colors.mutedForeground} />
        <Text className="text-xs text-muted-foreground">
          {t('agentChat.sessionConnection.connectionLost')}
        </Text>
        <Pressable
          onPress={() => {
            connection.retryConnection();
          }}
          hitSlop={8}
          className="active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel={t('agentChat.sessionConnection.retryConnection')}
        >
          <Text className="text-xs font-medium text-primary">
            {t('agentChat.sessionConnection.retryConnection')}
          </Text>
        </Pressable>
      </>
    );
  } else if (status.kind === 'updating') {
    content = (
      <>
        <SpinningIcon icon={Loader2} size={12} color={colors.mutedForeground} />
        <Text className="text-xs text-muted-foreground">{t('agents.sessionList.updating')}</Text>
      </>
    );
  } else if (status.kind === 'refresh-failed') {
    content = (
      <>
        <AlertCircle size={12} color={colors.mutedForeground} />
        <Text className="text-xs text-muted-foreground">
          {t('agents.sessionList.refreshFailed')}
        </Text>
        <Pressable
          onPress={onRetryRefresh}
          hitSlop={8}
          className="active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel={t('common.retry')}
        >
          <Text className="text-xs font-medium text-primary">{t('common.retry')}</Text>
        </Pressable>
      </>
    );
  }

  const ready = status.kind === 'ready';
  return (
    <View
      className={STRIP_CLASS}
      accessibilityElementsHidden={ready}
      importantForAccessibility={ready ? 'no-hide-descendants' : 'auto'}
    >
      {content}
    </View>
  );
}
