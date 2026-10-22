import { useTranslation } from '@yalla/i18n';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { FROM_START } from '../../src/components/auth/PhoneAuthFlow';
import { FloatingTabBar } from '../../src/components/nav/FloatingTabBar';
import { useSession } from '../../src/stores/session';
import { colors } from '../../src/theme';

/**
 * Explore · Bookings · [Scan] · Orders · Profile, under the floating pill.
 *
 * Scan sits in the middle as a raised white circle rather than a fifth
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
  const signedIn = useSession((s) => s.signedIn);

  // An account comes first: a diner who is not signed in (a first launch, or
  // after signing out) meets the welcome, and the app opens once signed in.
  if (!signedIn) {
    return <Redirect href={{ pathname: '/auth', params: { from: FROM_START } }} />;
  }

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
