import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabIcon, type TabName } from '~/components/TabIcon';
import { usePalette } from '~/providers/ThemeProvider';
import { fontSize, lineHeight } from '~/theme/tokens';

/**
 * The tab bar.
 *
 * Both platforms get the same five destinations but not identical chrome, which
 * is the point: iOS convention is a translucent bar with a small label under a
 * scaled icon, Material 3 puts the icon in a tinted pill and uses a taller bar.
 * Forcing one look on both would make the app feel foreign on one of them.
 */
const TAB_SCREENS: Array<{ name: string; title: string; icon: TabName }> = [
  { name: 'index', title: 'Home', icon: 'home' },
  { name: 'events', title: 'Events', icon: 'events' },
  { name: 'book', title: 'Book', icon: 'book' },
  { name: 'community', title: 'Community', icon: 'community' },
  { name: 'dojo', title: 'Dojo', icon: 'dojo' },
];

export default function TabsLayout() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const isAndroid = Platform.OS === 'android';

  const iconSize = isAndroid ? 24 : 25;
  const padTop = isAndroid ? 8 : 6;
  const padBottom = isAndroid ? 8 : 4;
  const labelGap = isAndroid ? 2 : 0;
  /**
   * What the icon, its label and the padding around them genuinely occupy.
   *
   * The two constants are the navigator's own layout, measured rather than
   * assumed: it renders every icon in a fixed 28pt box regardless of the size
   * passed to `tabBarIcon`, and pads each item by 5pt top and bottom. Sizing
   * the bar without counting them is what left the label 7pt of a 14pt line
   * and sliced every one of them through the middle.
   */
  const ICON_BOX = 28;
  const ITEM_PADDING_Y = 10;
  const MIN_BAR_CONTENT =
    padTop + ITEM_PADDING_Y + ICON_BOX + labelGap + lineHeight.micro + padBottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.accentText,
        tabBarInactiveTintColor: palette.textSubtle,
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
          borderTopWidth: 1,
          // Add the gesture-bar inset to the bar's own height rather than
          // letting the OS overlay it — otherwise the labels sit under the
          // home indicator on iPhone and the nav bar on Android.
          //
          // The floor is whichever is taller: the platform's convention, or
          // what the contents actually need. Hard-coding the convention alone
          // assumes a font size and an icon size that a later edit — or the
          // reader's own Dynamic Type setting — can invalidate silently.
          height: Math.max(isAndroid ? 64 : 56, MIN_BAR_CONTENT) + insets.bottom,
          paddingBottom: insets.bottom + padBottom,
          paddingTop: padTop,
        },
        tabBarLabelStyle: {
          fontSize: fontSize.micro,
          // Stated, not inherited. The label box is `overflow: hidden`, and
          // with `line-height: normal` the navigator sized it to 7px around a
          // 10px font — so every label was cut through the middle. A concrete
          // line height makes the box tall enough to hold its own text.
          lineHeight: lineHeight.micro,
          // The label is the only flexible child in the item, so any shortfall
          // in the bar's height is taken out of it alone — and it clips rather
          // than overflows. Refusing to shrink turns a silent slice into a
          // layout that is visibly wrong, which is the failure worth having.
          flexShrink: 0,
          fontWeight: '500',
          // Material 3 keeps the label always visible under the pill; iOS
          // labels sit tighter to the icon.
          marginTop: isAndroid ? 2 : 0,
        },
        // Material's ripple, tinted to the brand rather than the default grey.
        ...(isAndroid
          ? { tabBarAndroidRipple: { color: palette.accentTint, borderless: true } }
          : {}),
        tabBarHideOnKeyboard: true,
      }}
    >
      {TAB_SCREENS.map((screen) => (
        <Tabs.Screen
          key={screen.name}
          name={screen.name}
          options={{
            title: screen.title,
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name={screen.icon} color={String(color)} focused={focused} size={iconSize} />
            ),
            // Screen readers announce the destination, not just the icon.
            tabBarAccessibilityLabel: screen.title,
          }}
        />
      ))}
    </Tabs>
  );
}
