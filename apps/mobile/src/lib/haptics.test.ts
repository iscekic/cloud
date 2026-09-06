import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  impactAsync,
  ImpactFeedbackStyle,
  notificationAsync,
  NotificationFeedbackType,
  selectionAsync,
  setHapticStrength,
} from './haptics';

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

describe('haptics gate', () => {
  beforeEach(() => {
    // The gate is module-scope state; every test starts from the shipped default.
    setHapticStrength('full');
    expo.selectionAsync.mockReset();
    expo.notificationAsync.mockReset();
    expo.impactAsync.mockReset();
  });

  it("forwards every call unchanged at the default 'full' strength", async () => {
    await selectionAsync();
    await impactAsync(ImpactFeedbackStyle.Heavy);
    await notificationAsync(NotificationFeedbackType.Error);

    expect(expo.selectionAsync).toHaveBeenCalledTimes(1);
    expect(expo.impactAsync).toHaveBeenCalledWith('heavy');
    expect(expo.notificationAsync).toHaveBeenCalledWith('error');
  });

  it("makes all three calls no-ops at 'off'", async () => {
    setHapticStrength('off');

    await selectionAsync();
    await impactAsync(ImpactFeedbackStyle.Heavy);
    await notificationAsync(NotificationFeedbackType.Error);

    expect(expo.selectionAsync).not.toHaveBeenCalled();
    expect(expo.impactAsync).not.toHaveBeenCalled();
    expect(expo.notificationAsync).not.toHaveBeenCalled();
  });

  it("caps impact feedback at Light and downgrades notifications to a selection tick at 'light'", async () => {
    setHapticStrength('light');

    await impactAsync(ImpactFeedbackStyle.Heavy);
    await notificationAsync(NotificationFeedbackType.Error);
    await selectionAsync();

    expect(expo.impactAsync).toHaveBeenCalledWith('light');
    expect(expo.notificationAsync).not.toHaveBeenCalled();
    expect(expo.selectionAsync).toHaveBeenCalledTimes(2);
  });

  it('re-exportes the expo constants so callers never import expo-haptics', () => {
    expect(ImpactFeedbackStyle).toBe(expo.ImpactFeedbackStyle);
    expect(NotificationFeedbackType).toBe(expo.NotificationFeedbackType);
  });
});
