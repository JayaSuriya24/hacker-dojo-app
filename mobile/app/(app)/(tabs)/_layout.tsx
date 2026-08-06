import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabIcon, type TabName } from '~/components/TabIcon';
import { usePalette } from '~/providers/ThemeProvider';
import { fontSize } from '~/theme/tokens';

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
          height: (isAndroid ? 64 : 56) + insets.bottom,
          paddingBottom: insets.bottom + (isAndroid ? 8 : 4),
          paddingTop: isAndroid ? 8 : 6,
        },
        tabBarLabelStyle: {
          fontSize: fontSize.micro,
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
              <TabIcon
                name={screen.icon}
                color={String(color)}
                focused={focused}
                size={isAndroid ? 24 : 25}
              />
            ),
            // Screen readers announce the destination, not just the icon.
            tabBarAccessibilityLabel: screen.title,
          }}
        />
      ))}
    </Tabs>
  );
}
