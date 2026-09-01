import {
  Platform,
  ScrollView,
  type ScrollViewProps,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getEffectiveTabBarHeight } from '@/lib/tab-bar-layout';

// FlatList/FlashList screens use this directly for contentContainerStyle.paddingBottom.
export function useTabBarBottomPadding() {
  const { bottom } = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  return getEffectiveTabBarHeight({ bottomInset: bottom, platform: Platform.OS, fontScale }) + 16;
}

export function TabScreenScrollView({ children, ...props }: ScrollViewProps) {
  const paddingBottom = useTabBarBottomPadding();
  // Clear the floating tab bar with a trailing spacer rather than insetting the
  // viewport. Insetting hard-clips a mid-list row at the resting offset, which
  // reads as a broken cut; a spacer keeps the full viewport so rows render
  // through the blurred bar and the last row scrolls clear. Avoid
  // contentContainerStyle here — setting that style prop makes NativeWind drop
  // the caller's contentContainerClassName (padding/gap), collapsing section
  // spacing.
  return (
    <ScrollView {...props}>
      {children}
      <View style={{ height: paddingBottom }} pointerEvents="none" />
    </ScrollView>
  );
}
