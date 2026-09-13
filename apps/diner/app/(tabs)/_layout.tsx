import { useTranslation } from '@yalla/i18n';
import { Tabs } from 'expo-router/js-tabs';
import { FloatingTabBar } from '../../src/components/nav/FloatingTabBar';
import { colors } from '../../src/theme';

/**
 * Explore · Bookings · [Scan] · Orders · Profile, under the floating pill.
 *
 * Scan sits in the middle as a raised brown circle rather than a fifth
 * equal tab because of who presses it: a person who has just sat down with a
 * coffee, phone in one hand. It is the one control reachable from every screen
 * without looking.
 *
 * The bar floats over the screens (it is absolutely positioned), so each tab
 * screen adds `NAV_CLEARANCE` under its scroll content — see
 * `useNavClearance` in `src/components/Screen.tsx`.
 *
 * Every label comes from i18next; nothing here is a literal, including on a
 * placeholder shell, because scaffolding is where hardcoded English survives.
 */
export default function TabsLayout() {
  const { t } = useTranslation(['diner', 'common']);

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.explore') }} />
      <Tabs.Screen name="bookings" options={{ title: t('tabs.bookings') }} />
      <Tabs.Screen name="scan" options={{ title: t('scan.tabTitle') }} />
      <Tabs.Screen name="orders" options={{ title: t('tabs.orders') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
