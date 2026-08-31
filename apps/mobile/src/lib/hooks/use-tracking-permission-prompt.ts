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
      const checkAndPrompt = async () => {
        // The "Not now" dismissal is one-way and per-install: once persisted,
        // a later launch must never ask again.
        try {
          const dismissed = await SecureStore.getItemAsync(TRACKING_PERMISSION_DISMISSED_KEY);
          if (cancelled) {
            return;
          }
          if (dismissed === 'true') {
            return;
          }
        } catch (error) {
          if (cancelled) {
            return;
          }
          Sentry.captureException(error, {
            tags: {
              'error.subsystem': 'tracking_permission',
              'error.operation': 'read_dismissal',
            },
          });
          // Fall through: a transient read failure must not suppress the
          // prompt on a fresh install where it has never been dismissed.
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
              onPress: () => {
                void (async () => {
                  try {
                    await SecureStore.setItemAsync(TRACKING_PERMISSION_DISMISSED_KEY, 'true');
                  } catch (error) {
                    Sentry.captureException(error, {
                      tags: {
                        'error.subsystem': 'tracking_permission',
                        'error.operation': 'persist_dismissal',
                      },
                    });
                  }
                })();
              },
            },
            {
              text: i18n.t('consent.continue'),
              onPress: () => {
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
                  }
                })();
              },
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
