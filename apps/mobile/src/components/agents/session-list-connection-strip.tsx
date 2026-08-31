import { AlertCircle, WifiOff } from '@/components/ui/icons';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useUserWebConnection } from '@/components/agents/user-web-connection-provider';
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

/**
 * Presentational connection/refresh strip for the Agents session list.
 *
 * Reads the phone↔server socket directly and renders exactly one line, or
 * nothing. The line is fixed at `h-6` / text-xs so the row dimensions never
 * shift when it appears.
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

  if (status.kind === 'ready') {
    return null;
  }

  if (status.kind === 'connecting' || status.kind === 'reconnecting') {
    return (
      <View className="h-6 flex-row items-center justify-center gap-1.5">
        <WifiOff size={12} color={colors.mutedForeground} />
        <Text className="text-xs text-muted-foreground">
          {t(
            status.kind === 'connecting'
              ? 'agentChat.sessionConnection.connecting'
              : 'agentChat.sessionConnection.reconnecting'
          )}
        </Text>
      </View>
    );
  }

  if (status.kind === 'connection-lost') {
    return (
      <View className="h-6 flex-row items-center justify-center gap-1.5">
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
      </View>
    );
  }

  if (status.kind === 'updating') {
    return (
      <View className="h-6 flex-row items-center justify-center gap-1.5">
        <ActivityIndicator size="small" color={colors.mutedForeground} />
        <Text className="text-xs text-muted-foreground">{t('agents.sessionList.updating')}</Text>
      </View>
    );
  }

  // refresh-failed
  return (
    <View className="h-6 flex-row items-center justify-center gap-1.5">
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
    </View>
  );
}
