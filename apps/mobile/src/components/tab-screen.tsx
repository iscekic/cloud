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

export function TabScreenScrollView({ children, className, ...props }: ScrollViewProps) {
  const paddingBottom = useTabBarBottomPadding();
  // Inset the scroll viewport above the floating tab bar so no row ever renders
  // behind it. A content-end spacer only clears the last row once scrolled to
  // the bottom; mid-list rows still sit behind the bar at the resting offset.
  return (
    <View className={className} style={{ paddingBottom }}>
      <ScrollView {...props} className="flex-1">
        {children}
      </ScrollView>
    </View>
  );
}
