import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getItemAsync, setItemAsync, deleteItemAsync } = vi.hoisted(() => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock('expo-secure-store', () => ({ getItemAsync, setItemAsync, deleteItemAsync }));

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock('@sentry/react-native', () => ({ captureException }));

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('sonner-native', () => ({ toast: { error: toastError } }));

// The hook imports the gate, which imports expo-haptics; mock it so the gate
// runs dependency-free and its effect is observable through the mock calls.
const { expo } = vi.hoisted(() => ({
  expo: {
    selectionAsync: vi.fn(),
    notificationAsync: vi.fn(),
    impactAsync: vi.fn(),
    NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
    ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  },
}));
vi.mock('expo-haptics', () => expo);

// eslint-disable-next-line typescript-eslint/promise-function-async -- conflicting require-await rule
function flushMicrotasks(): Promise<void> {
  return new Promise(resolve => {
    setImmediate(resolve);
  });
}

/**
 * The store and the gate are module singletons, so each test re-imports them
 * on a cleared registry: preload's load-once flag and the gate's strength
 * start fresh every time.
 */
async function freshModules() {
  vi.resetModules();
  const hook = await import('./use-haptic-preference');
  const gate = await import('@/lib/haptics');
  return { hook, gate };
}

describe('useHapticPreference store + gate mirror', () => {
  beforeEach(() => {
    getItemAsync.mockReset();
    setItemAsync.mockReset();
    deleteItemAsync.mockReset();
    captureException.mockReset();
    toastError.mockReset();
    expo.selectionAsync.mockReset();
    expo.notificationAsync.mockReset();
    expo.impactAsync.mockReset();
  });

  it("arms the gate to 'off' from the stored value after preloadHapticPreference + load", async () => {
    getItemAsync.mockResolvedValue('off');
    const { hook, gate } = await freshModules();

    hook.preloadHapticPreference();
    await flushMicrotasks();

    await gate.selectionAsync();
    expect(expo.selectionAsync).not.toHaveBeenCalled();
  });

  it("arms the gate to 'light' so a Heavy impact reaches expo as Light", async () => {
    getItemAsync.mockResolvedValue('light');
    const { hook, gate } = await freshModules();

    hook.preloadHapticPreference();
    await flushMicrotasks();

    await gate.impactAsync(gate.ImpactFeedbackStyle.Heavy);
    expect(expo.impactAsync).toHaveBeenCalledWith('light');
  });

  it("falls back to 'full' for an unrecognized stored value", async () => {
    getItemAsync.mockResolvedValue('high-contrast');
    const { hook, gate } = await freshModules();
    // Start from a non-default gate value so the load's mirror emit is what
    // lands 'full' — a silent no-load would look identical otherwise.
    gate.setHapticStrength('off');

    hook.preloadHapticPreference();
    await flushMicrotasks();

    await gate.impactAsync(gate.ImpactFeedbackStyle.Heavy);
    expect(expo.impactAsync).toHaveBeenCalledWith('heavy');
  });

  it("setHapticPreference('light') persists via the account-metadata write and flips the gate synchronously", async () => {
    getItemAsync.mockResolvedValue(null);
    const { hook, gate } = await freshModules();
    hook.preloadHapticPreference();
    await flushMicrotasks();

    hook.setHapticPreference('light');

    // No flush in between: the gate flipped in the same tick as the call,
    // before the disk write settled.
    await gate.impactAsync(gate.ImpactFeedbackStyle.Heavy);
    expect(expo.impactAsync).toHaveBeenCalledWith('light');

    await flushMicrotasks();
    expect(setItemAsync).toHaveBeenCalledWith('haptic-strength', 'light');
  });

  it('shows the save-failure toast on a rejected write while the gate keeps the in-memory value', async () => {
    getItemAsync.mockResolvedValue(null);
    const { hook, gate } = await freshModules();
    hook.preloadHapticPreference();
    await flushMicrotasks();
    setItemAsync.mockRejectedValueOnce(new Error('save failed'));

    hook.setHapticPreference('off');
    await flushMicrotasks();

    expect(toastError).toHaveBeenCalledWith('Could not save setting');
    await gate.selectionAsync();
    expect(expo.selectionAsync).not.toHaveBeenCalled();
  });
});
