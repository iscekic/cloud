import * as Haptics from '@/lib/haptics';
import { Pressable } from 'react-native';

import { RadioGroup, radioItemA11y } from '@/components/ui/radio-group';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type SegmentedControlOption<T extends string> = {
  value: T;
  label: string;
  /**
   * Screen-reader label for this radio; defaults to the visible label. Set it
   * when the visible label alone is ambiguous on the screen — VoiceOver
   * announces the radio label, not the section header above it.
   */
  accessibilityLabel?: string;
};

type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** The visible group name — required so the radio group is never unnamed. */
  accessibilityLabel: string;
};

/**
 * Horizontal segmented pill. Owns the selection haptic — callers must NOT
 * fire their own `Haptics.selectionAsync()` on press. The haptic only fires
 * on an actual change of selection, not when the current value is re-tapped.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: Readonly<SegmentedControlProps<T>>) {
  return (
    <RadioGroup label={accessibilityLabel} className="flex-row rounded-lg bg-secondary p-1">
      {options.map(option => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            {...radioItemA11y({
              label: option.accessibilityLabel ?? option.label,
              checked: selected,
            })}
            onPress={() => {
              if (selected) {
                return;
              }
              void Haptics.selectionAsync();
              onChange(option.value);
            }}
            className={cn(
              'min-h-11 flex-1 items-center justify-center rounded-md px-3 active:opacity-70',
              selected && 'bg-background'
            )}
          >
            <Text
              className={cn(
                'text-sm',
                selected ? 'font-medium text-foreground' : 'text-muted-foreground'
              )}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </RadioGroup>
  );
}
