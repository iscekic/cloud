import * as Sentry from '@sentry/react-native';
import * as SecureStore from 'expo-secure-store';
import {
  getTrackingPermissionsAsync,
  PermissionStatus,
  requestTrackingPermissionsAsync,
} from 'expo-tracking-transparency';
import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';

import { i18n } from '@/i18n';
import { TRACKING_PERMISSION_DISMISSED_KEY } from '@/lib/storage-keys';

export function useTrackingPermissionPrompt(enabled: boolean): void {
  useEffect(() => {
    let cancelled = false;

    if (!enabled || Platform.OS !== 'ios') {
      // No-op cleanup so every branch returns the same type.
    } else {
      // The "Not now" dismissal is one-way and per-install: once persisted,
      // a later launch must never ask again. The write is synchronous so it
      // completes before the callback returns and cannot be lost when the app
      // terminates right after the tap.
      const persistDismissal = (): void => {
        try {
          SecureStore.setItem(TRACKING_PERMISSION_DISMISSED_KEY, 'true');
        } catch (error) {
          Sentry.captureException(error, {
            tags: {
              'error.subsystem': 'tracking_permission',
              'error.operation': 'persist_dismissal',
            },
          });
          Alert.alert(i18n.t('common.couldNotSaveSetting'), undefined, [
            { text: i18n.t('common.retry'), onPress: persistDismissal },
          ]);
        }
      };

      const requestPermission = (): void => {
        void (async () => {
          try {
            await requestTrackingPermissionsAsync();
          } catch (error) {
            Sentry.captureException(error, {
              tags: {
                'error.subsystem': 'tracking_permission',
                'error.operation': 'request_permission',
              },
            });
            Alert.alert(i18n.t('common.somethingWentWrong'), undefined, [
              { text: i18n.t('common.retry'), onPress: requestPermission },
            ]);
          }
        })();
      };

      const checkAndPrompt = async () => {
        let dismissed: string | null = null;
        try {
          dismissed = SecureStore.getItem(TRACKING_PERMISSION_DISMISSED_KEY);
        } catch (error) {
          Sentry.captureException(error, {
            tags: {
              'error.subsystem': 'tracking_permission',
              'error.operation': 'read_dismissal',
            },
          });
          // A failed read cannot reliably persist a fresh dismissal, so
          // suppress the prompt and let a later launch retry once storage
          // recovers.
          return;
        }

        if (dismissed === 'true') {
          return;
        }

        let currentStatus: PermissionStatus | undefined = undefined;
        try {
          const response = await getTrackingPermissionsAsync();
          // oxlint-disable-next-line typescript-eslint/no-unnecessary-condition -- `cancelled` flips in the cleanup closure during the awaited status read
          if (cancelled) {
            return;
          }
          currentStatus = response.status;
        } catch (error) {
          // oxlint-disable-next-line typescript-eslint/no-unnecessary-condition -- `cancelled` flips in the cleanup closure before this catch can run
          if (cancelled) {
            return;
          }
          Sentry.captureException(error, {
            tags: {
              'error.subsystem': 'tracking_permission',
              'error.operation': 'get_permission',
            },
          });
          return;
        }

        if (currentStatus !== PermissionStatus.UNDETERMINED) {
          return;
        }

        Alert.alert(
          i18n.t('consent.installAttributionPromptTitle'),
          i18n.t('consent.installAttributionPromptMessage'),
          [
            {
              text: i18n.t('common.notNow'),
              style: 'cancel',
              onPress: persistDismissal,
            },
            {
              text: i18n.t('consent.continue'),
              onPress: requestPermission,
            },
          ]
        );
      };

      void checkAndPrompt();
    }

    return () => {
      cancelled = true;
    };
  }, [enabled]);
}
