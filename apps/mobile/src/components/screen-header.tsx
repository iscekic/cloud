import { useRouter } from 'expo-router';
import { ChevronDown } from '@/components/ui/icons';
import { DirectionalChevronLeft } from '@/components/ui/directional-icons';
import { I18nManager, Platform, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Eyebrow } from '@/components/ui/eyebrow';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';
import { cn } from '@/lib/utils';

type ScreenHeaderProps = {
  /** Omit to render a bare back-button bar (e.g. when the screen body provides its own title). */
  title?: string;
  /** Optional mono-uppercase line above the title. */
  eyebrow?: string;
  /**
   * Reserve the eyebrow's vertical space even when `eyebrow` is absent, so the
   * title never shifts when the eyebrow appears (e.g. a live-count line that is
   * hidden while loading or empty). The placeholder is invisible and hidden
   * from accessibility.
   */
  reserveEyebrow?: boolean;
  /** Use Focus's large 30px H1 style (list roots). Default 18px (detail). */
  size?: 'default' | 'large';
  headerRight?: React.ReactNode;
  modal?: boolean;
  showBackButton?: boolean;
  onBack?: () => void;
  onTitlePress?: () => void;
  /**
   * Accessibility label for the pressable title. Defaults to a generic
   * "Open menu" so list callers don't have to supply one. Detail screens
   * (e.g. session rename) should override with a verb that describes the
   * action, not "open menu".
   */
  onTitlePressAccessibilityLabel?: string;
  backIcon?: 'back' | 'close';
  /** Extra classes on the outer header container. Overrides the default `px-4` for screens that need a different horizontal inset. */
  className?: string;
};

export function ScreenHeader({
  title,
  eyebrow,
  reserveEyebrow,
  size = 'default',
  headerRight,
  modal,
  showBackButton,
  onBack,
  onTitlePress,
  onTitlePressAccessibilityLabel,
  backIcon,
  className,
}: Readonly<ScreenHeaderProps>) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const { t } = useTranslation();
  const canGoBack = showBackButton ?? router.canGoBack();

  // iOS modals are presented as cards already inset from the status bar
  const paddingTop = modal && Platform.OS === 'ios' ? 32 : insets.top + 8;

  // When `backIcon` isn't specified, fall back to the historical behaviour
  // where iOS modals get a ChevronDown and everything else gets a ChevronLeft.
  const resolvedBackIcon = backIcon ?? (modal && Platform.OS === 'ios' ? 'close' : 'back');

  const titleClass =
    size === 'large'
      ? 'shrink text-[30px] font-bold tracking-tight text-foreground'
      : 'shrink text-lg font-semibold text-foreground';

  // A visible eyebrow only when a non-empty label is supplied; `reserveEyebrow`
  // keeps the slot's height when the label is absent so the title does not jump.
  const showEyebrow = eyebrow != null && eyebrow !== '';
  const reserveEyebrowSlot = reserveEyebrow === true && !showEyebrow;
  const hasEyebrowSlot = showEyebrow || reserveEyebrowSlot;

  let titleNode: React.ReactNode = null;
  if (title != null) {
    const titleText = (
      <Text className={titleClass} numberOfLines={2} accessibilityRole="header">
        {title}
      </Text>
    );
    // Title caret removed: rename stays available via the pressable title
    // itself. The backIcon === 'close' ChevronDown on the back control is
    // unrelated and stays.
    titleNode = onTitlePress ? (
      <Pressable
        onPress={onTitlePress}
        hitSlop={{ top: 13, right: 13, bottom: 13, left: 0 }}
        accessibilityRole="button"
        accessibilityLabel={
          onTitlePressAccessibilityLabel ??
          (title ? t('screenHeader.openMenuFor', { title }) : t('screenHeader.openMenu'))
        }
        className="active:opacity-70"
      >
        {titleText}
      </Pressable>
    ) : (
      titleText
    );
  }

  return (
    <View className={cn('bg-background px-4 pb-3', className)} style={{ paddingTop }}>
      {/* The header right action sits on the eyebrow's row when an eyebrow is
          present (e.g. the Agents "SEE ALL" next to the "3 LIVE" count), and
          centers against the title when the header is a single line. */}
      <View className={cn('flex-row', hasEyebrowSlot ? 'items-start' : 'items-center')}>
        <View className="flex-1 flex-row items-center gap-1">
          {canGoBack && (
            <Pressable
              onPress={() => {
                if (onBack) {
                  onBack();
                } else {
                  router.back();
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={
                resolvedBackIcon === 'close' ? t('screenHeader.close') : t('screenHeader.goBack')
              }
              className={`${I18nManager.isRTL ? '-mr-4' : '-ml-4'} h-11 w-11 shrink-0 items-center justify-center active:opacity-70`}
            >
              {resolvedBackIcon === 'close' ? (
                <ChevronDown size={24} color={colors.foreground} />
              ) : (
                <DirectionalChevronLeft size={24} color={colors.foreground} />
              )}
            </Pressable>
          )}
          <View className="min-w-0 flex-1">
            {hasEyebrowSlot ? (
              <Eyebrow
                className={cn('mb-0.5', reserveEyebrowSlot && 'opacity-0')}
                accessibilityElementsHidden={reserveEyebrowSlot || undefined}
                importantForAccessibility={reserveEyebrowSlot ? 'no-hide-descendants' : undefined}
              >
                {showEyebrow ? eyebrow : '\u00A0'}
              </Eyebrow>
            ) : null}
            {titleNode}
          </View>
        </View>
        {headerRight ? (
          <View className={`${I18nManager.isRTL ? 'mr-3' : 'ml-3'} shrink-0`}>{headerRight}</View>
        ) : null}
      </View>
    </View>
  );
}
