import { createQueryClient } from '@yalla/api';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { color } from '@yalla/tokens';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { bootstrapI18n } from '../src/i18n';

const queryClient = createQueryClient();

/**
 * Staff shell.
 *
 * Deliberately a single `Stack` with no nesting: the app is used by someone with
 * ten minutes of training during a Friday rush, and every extra navigation level
 * is somewhere to get lost. Screens are siblings, reachable in one tap.
 */
export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // app.json pins orientation at build time; this also holds the lock on a
    // tablet that was already running when the app came to the foreground.
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);

    void bootstrapI18n().then(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color.background,
        }}
      >
        <ActivityIndicator size="large" color={color.accent} />
      </View>
    );
  }

  return (
    <I18nextProvider i18n={i18next}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" hidden />
        <Stack screenOptions={{ headerShown: false }} />
      </QueryClientProvider>
    </I18nextProvider>
  );
}
