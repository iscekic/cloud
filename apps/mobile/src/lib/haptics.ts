import * as ExpoHaptics from 'expo-haptics';

/**
 * App-wide haptics gate. Every haptic call site routes through this module so
 * the 'Haptic feedback' preference can silence or soften feedback everywhere.
 * The strength is module-scope state and each call re-reads it, so a change
 * takes effect on the next call without any listener wiring.
 *
 * This module must import ONLY expo-haptics: it sits below the preference
 * hooks, and any heavier import (react-native, the SecureStore chain) breaks
 * every haptics-adjacent test under the node-environment vitest projects.
 */
export type HapticStrength = 'off' | 'light' | 'full';

let strength: HapticStrength = 'full';

export function setHapticStrength(next: HapticStrength): void {
  strength = next;
}

/**
 * Re-exported so callers take their haptic constants from the gate, not from
 * expo. The read is guarded because a partial `vi.mock('expo-haptics')`
 * factory throws when a missing property is accessed; an unguarded
 * module-scope read would break every test that imports a haptic call site.
 * The guard yields undefined for such a partial mock, exactly as a direct
 * expo-haptics import resolves a missing constant to undefined.
 */
function resolveEnum<Enum>(read: () => Enum): Enum {
  try {
    return read();
  } catch {
    return undefined as Enum;
  }
}

export const ImpactFeedbackStyle = resolveEnum(() => ExpoHaptics.ImpactFeedbackStyle);
export const NotificationFeedbackType = resolveEnum(() => ExpoHaptics.NotificationFeedbackType);

/** Re-exported types so call sites can use the constants in type position too. */
export type ImpactFeedbackStyle = ExpoHaptics.ImpactFeedbackStyle;
export type NotificationFeedbackType = ExpoHaptics.NotificationFeedbackType;

export async function selectionAsync(): Promise<void> {
  if (strength === 'off') {
    return;
  }
  await ExpoHaptics.selectionAsync();
}

export async function impactAsync(style?: ExpoHaptics.ImpactFeedbackStyle): Promise<void> {
  if (strength === 'off') {
    return;
  }
  if (strength === 'light') {
    // The light setting caps every impact at the softest tick, whatever the
    // caller asked for.
    await ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light);
    return;
  }
  await ExpoHaptics.impactAsync(style);
}

export async function notificationAsync(
  type?: ExpoHaptics.NotificationFeedbackType
): Promise<void> {
  if (strength === 'off') {
    return;
  }
  if (strength === 'light') {
    // Notification buzzes are the loudest haptics; the light setting
    // downgrades them to the selection tick.
    await ExpoHaptics.selectionAsync();
    return;
  }
  await ExpoHaptics.notificationAsync(type);
}
