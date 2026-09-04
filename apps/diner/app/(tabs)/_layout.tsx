import { useTranslation } from '@yalla/i18n';
import { color, fontSize, touchTarget } from '@yalla/tokens';
import { Tabs } from 'expo-router';

/**
 * Explore / Bookings / Profile.
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
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.textSecondary,
        tabBarStyle: {
          backgroundColor: color.surface,
          borderTopColor: color.border,
          height: touchTarget.minimum + 16,
        },
        tabBarLabelStyle: { fontSize: fontSize.xs },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.explore') }} />
      <Tabs.Screen name="bookings" options={{ title: t('tabs.bookings') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
