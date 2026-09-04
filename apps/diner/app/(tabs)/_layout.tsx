import { useTranslation } from '@yalla/i18n';
import { color, fontSize, touchTarget } from '@yalla/tokens';
import { Tabs } from 'expo-router';

/**
 * Explore / Scan / Bookings / Profile.
 *
 * Scan is a tab rather than a button inside a menu because of who uses it: a
 * person who has just sat down with a coffee, holding a phone in one hand. One
 * tap from anywhere in the app, and it is the second thing they see.
 *
 * Every label comes from i18next; nothing here is a literal, including on a
 * placeholder shell, because scaffolding is where hardcoded English survives.
 */
export default function TabsLayout() {
  const { t } = useTranslation(['diner', 'common']);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.primary,
        tabBarInactiveTintColor: color.mutedForeground,
        tabBarStyle: {
          backgroundColor: color.surface,
          borderTopColor: color.border,
          height: touchTarget.minimum + 16,
        },
        tabBarLabelStyle: { fontSize: fontSize.xs },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.explore') }} />
      <Tabs.Screen name="scan" options={{ title: t('scan.tabTitle') }} />
      <Tabs.Screen name="bookings" options={{ title: t('tabs.bookings') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
