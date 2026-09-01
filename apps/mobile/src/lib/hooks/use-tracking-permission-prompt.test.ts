/* eslint-disable typescript-eslint/no-deprecated -- react-test-renderer is the DOM-free renderer used to mount React/RN trees under vitest (node env, no jsdom); see src/test/render-with-providers.tsx */
/* eslint-disable import/first -- mocks must be defined before the module under test is imported */
import { createElement, type FC } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getTrackingPermissionsAsync, requestTrackingPermissionsAsync } = vi.hoisted(() => ({
  getTrackingPermissionsAsync: vi.fn<() => Promise<{ status: string }>>(),
  requestTrackingPermissionsAsync: vi.fn<() => Promise<{ status: string }>>(),
}));
vi.mock('expo-tracking-transparency', () => ({
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
  PermissionStatus: {
    UNDETERMINED: 'undetermined',
    DENIED: 'denied',
    GRANTED: 'granted',
  } as const,
}));

const { alertMock } = vi.hoisted(() => ({ alertMock: vi.fn() }));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Alert: { alert: alertMock },
}));

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock('@sentry/react-native', () => ({ captureException }));

const { secureStoreGetItem, secureStoreSetItem } = vi.hoisted(() => ({
  secureStoreGetItem: vi.fn<() => string | null>(),
  secureStoreSetItem: vi.fn<() => void>(),
}));
vi.mock('expo-secure-store', () => ({
  getItem: secureStoreGetItem,
  setItem: secureStoreSetItem,
}));

import { useTrackingPermissionPrompt } from './use-tracking-permission-prompt';
import { TRACKING_PERMISSION_DISMISSED_KEY } from '@/lib/storage-keys';

type AlertButton = { text: string; style?: string; onPress?: () => void };

// A thin React component that calls the hook for testing.
const TestHarness: FC<{ enabled: boolean }> = ({ enabled }) => {
  useTrackingPermissionPrompt(enabled);
  return null;
};

function mountHarness(enabled: boolean): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | undefined = undefined;
  act(() => {
    renderer = TestRenderer.create(createElement(TestHarness, { enabled }));
  });
  // act() is synchronous; renderer is assigned inside the callback.
  return renderer as unknown as TestRenderer.ReactTestRenderer;
}

// Flush pending microtasks inside act() so async effects settle.
async function flush(action?: () => void): Promise<void> {
  await act(async () => {
    action?.();
    await Promise.resolve();
  });
}

// Helper to produce a controllable promise without uninitialized variables.
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let storedResolve: ((value: T) => void) | undefined = undefined;
  const promise = new Promise<T>(resolve => {
    storedResolve = resolve;
  });
  return {
    promise,
    resolve: (value: T) => {
      storedResolve?.(value);
    },
  };
}

function getAlertButtons(): [AlertButton, AlertButton] {
  expect(alertMock).toHaveBeenCalledOnce();
  const call = alertMock.mock.calls[0] as unknown[];
  expect(call[0]).toBe('Allow install attribution?');
  expect(call[1]).toBe(
    "Kilo uses Apple's tracking permission only to learn which channel brought you here. Your prompts and conversations are never used."
  );
  const buttons = call[2] as AlertButton[];
  expect(buttons).toHaveLength(2);
  return buttons as [AlertButton, AlertButton];
}

// The tap-triggered failure alerts render the given title and one Retry action.
function getFailureAlertButton(title: string): AlertButton {
  expect(alertMock).toHaveBeenCalledTimes(2);
  const call = alertMock.mock.calls[1] as unknown[];
  expect(call[0]).toBe(title);
  const buttons = call[2] as AlertButton[];
  expect(buttons).toHaveLength(1);
  const button = buttons[0];
  if (!button) {
    throw new Error('Expected a Retry button');
  }
  expect(button.text).toBe('Retry');
  return button;
}

describe('useTrackingPermissionPrompt', () => {
  beforeEach(() => {
    getTrackingPermissionsAsync.mockReset();
    requestTrackingPermissionsAsync.mockReset();
    alertMock.mockReset();
    captureException.mockReset();
    secureStoreGetItem.mockReset();
    secureStoreSetItem.mockReset();
    // Default: no persisted dismissal, so the status/gating tests below
    // exercise the prompt path unchanged.
    secureStoreGetItem.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Gate false: no pre-prompt.
  it('does nothing when enabled is false', async () => {
    const renderer = mountHarness(false);
    await flush();
    expect(getTrackingPermissionsAsync).not.toHaveBeenCalled();
    expect(alertMock).not.toHaveBeenCalled();
    renderer.unmount();
  });

  // Status decided: no pre-prompt.
  it.each([
    { label: 'denied', status: 'denied' },
    { label: 'granted', status: 'granted' },
  ])('shows no alert when status is already $label', async ({ status }) => {
    getTrackingPermissionsAsync.mockResolvedValue({ status });

    const renderer = mountHarness(true);
    await flush();

    expect(getTrackingPermissionsAsync).toHaveBeenCalledOnce();
    expect(alertMock).not.toHaveBeenCalled();
    expect(requestTrackingPermissionsAsync).not.toHaveBeenCalled();
    renderer.unmount();
  });

  // Happy: Continue is tapped and the system dialog appears.
  it('shows the pre-prompt alert when status is undetermined and calls requestTrackingPermissionsAsync on Continue', async () => {
    getTrackingPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    requestTrackingPermissionsAsync.mockResolvedValue({ status: 'granted' });

    const renderer = mountHarness(true);
    await flush();

    expect(getTrackingPermissionsAsync).toHaveBeenCalledOnce();

    const [notNowButton, continueButton] = getAlertButtons();
    expect(notNowButton.text).toBe('Not now');
    expect(notNowButton.style).toBe('cancel');
    expect(continueButton.text).toBe('Continue');
    expect(requestTrackingPermissionsAsync).not.toHaveBeenCalled();

    // Tap Continue.
    await flush(continueButton.onPress);

    expect(requestTrackingPermissionsAsync).toHaveBeenCalledOnce();
    renderer.unmount();
  });

  // Not now: persists the dismissal and makes no tracking system request.
  it('persists the dismissal and does not request tracking permission when Not now is tapped', async () => {
    getTrackingPermissionsAsync.mockResolvedValue({ status: 'undetermined' });

    const renderer = mountHarness(true);
    await flush();

    const [notNowButton] = getAlertButtons();
    expect(notNowButton.text).toBe('Not now');

    // Tap Not now.
    await flush(notNowButton.onPress);

    expect(secureStoreSetItem).toHaveBeenCalledWith(TRACKING_PERMISSION_DISMISSED_KEY, 'true');
    expect(requestTrackingPermissionsAsync).not.toHaveBeenCalled();
    renderer.unmount();
  });

  // Launch cycle: a fresh install shows one prompt, Not now persists it, and
  // a remount (the next launch) shows no second prompt.
  it('shows one total alert across a dismissal and a remount', async () => {
    getTrackingPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    let dismissed = false;
    secureStoreGetItem.mockImplementation(() => (dismissed ? 'true' : null));
    secureStoreSetItem.mockImplementation(() => {
      dismissed = true;
    });

    const first = mountHarness(true);
    await flush();

    const [notNowButton] = getAlertButtons();
    await flush(notNowButton.onPress);
    expect(secureStoreSetItem).toHaveBeenCalledOnce();
    first.unmount();

    const second = mountHarness(true);
    await flush();

    expect(secureStoreGetItem).toHaveBeenCalledTimes(2);
    expect(alertMock).toHaveBeenCalledOnce();
    second.unmount();
  });

  // Dismissed flag set: no pre-prompt and no status check on this install.
  it('shows no alert when the dismissal flag is already persisted', async () => {
    secureStoreGetItem.mockReturnValue('true');

    const renderer = mountHarness(true);
    await flush();

    expect(secureStoreGetItem).toHaveBeenCalledWith(TRACKING_PERMISSION_DISMISSED_KEY);
    expect(getTrackingPermissionsAsync).not.toHaveBeenCalled();
    expect(alertMock).not.toHaveBeenCalled();
    renderer.unmount();
  });

  // Dismissal read failure: reported to Sentry and the prompt is suppressed,
  // so a later launch retries once storage recovers.
  it('reports to Sentry and suppresses the prompt when the dismissal read fails', async () => {
    const readError = new Error('SecureStore read failed');
    secureStoreGetItem.mockImplementation(() => {
      throw readError;
    });

    const renderer = mountHarness(true);
    await flush();

    expect(captureException).toHaveBeenCalledWith(readError, {
      tags: { 'error.subsystem': 'tracking_permission', 'error.operation': 'read_dismissal' },
    });
    expect(getTrackingPermissionsAsync).not.toHaveBeenCalled();
    expect(alertMock).not.toHaveBeenCalled();
    renderer.unmount();
  });

  // Dismissal write failure: shows the generic failure text with a Retry CTA
  // that repeats the write.
  it('shows couldNotSaveSetting with a Retry action when persisting the dismissal fails', async () => {
    getTrackingPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    const writeError = new Error('SecureStore write failed');
    secureStoreSetItem.mockImplementation(() => {
      throw writeError;
    });

    const renderer = mountHarness(true);
    await flush();

    const [notNowButton] = getAlertButtons();
    await flush(notNowButton.onPress);

    expect(captureException).toHaveBeenCalledWith(writeError, {
      tags: { 'error.subsystem': 'tracking_permission', 'error.operation': 'persist_dismissal' },
    });

    const retryButton = getFailureAlertButton('Could not save setting');
    await flush(retryButton.onPress);

    expect(secureStoreSetItem).toHaveBeenCalledTimes(2);
    renderer.unmount();
  });

  // Request failure: shows a native retry alert whose action repeats the request.
  it('shows a retry alert when requestTrackingPermissionsAsync fails', async () => {
    getTrackingPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    const requestError = new Error('ATT request failed');
    requestTrackingPermissionsAsync.mockRejectedValue(requestError);

    const renderer = mountHarness(true);
    await flush();

    const [, continueButton] = getAlertButtons();
    await flush(continueButton.onPress);

    expect(captureException).toHaveBeenCalledWith(requestError, {
      tags: {
        'error.subsystem': 'tracking_permission',
        'error.operation': 'request_permission',
      },
    });

    const retryButton = getFailureAlertButton('Something went wrong');
    await flush(retryButton.onPress);

    expect(requestTrackingPermissionsAsync).toHaveBeenCalledTimes(2);
    renderer.unmount();
  });

  // getTrackingPermissionsAsync failure: error reported to Sentry, no alert shown.
  it('reports errors to Sentry when getTrackingPermissionsAsync fails and shows no alert', async () => {
    const checkError = new Error('ATT check failed');
    getTrackingPermissionsAsync.mockRejectedValue(checkError);

    const renderer = mountHarness(true);
    await flush();

    expect(getTrackingPermissionsAsync).toHaveBeenCalledOnce();
    expect(alertMock).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(checkError, {
      tags: { 'error.subsystem': 'tracking_permission', 'error.operation': 'get_permission' },
    });
    renderer.unmount();
  });

  // Cancellation: a late status result cannot show Alert after disable.
  it('does not show Alert when enabled becomes false before status resolves', async () => {
    const { promise: statusPromise, resolve: resolveStatus } = deferred<{ status: string }>();
    getTrackingPermissionsAsync.mockReturnValue(statusPromise);

    const renderer = mountHarness(true);
    await flush();
    expect(getTrackingPermissionsAsync).toHaveBeenCalledOnce();

    // Disable before the status resolves.
    act(() => {
      renderer.update(createElement(TestHarness, { enabled: false }));
    });

    // Now resolve the status — it arrives after disable.
    await flush(() => {
      resolveStatus({ status: 'undetermined' });
    });

    expect(alertMock).not.toHaveBeenCalled();
    renderer.unmount();
  });

  // Unmount: a late status result cannot show Alert after unmount.
  it('does not show Alert when the component unmounts before status resolves', async () => {
    const { promise: statusPromise, resolve: resolveStatus } = deferred<{ status: string }>();
    getTrackingPermissionsAsync.mockReturnValue(statusPromise);

    const renderer = mountHarness(true);
    await flush();
    expect(getTrackingPermissionsAsync).toHaveBeenCalledOnce();

    // Unmount before the status resolves so the cleanup flips `cancelled`.
    act(() => {
      renderer.unmount();
    });

    await flush(() => {
      resolveStatus({ status: 'undetermined' });
    });

    expect(alertMock).not.toHaveBeenCalled();
  });
});
