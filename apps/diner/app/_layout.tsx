import { createQueryClient } from '@yalla/api';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { color, nativeDisplayFontFace, nativeFontFace } from '@yalla/tokens';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { bootstrapI18n } from '../src/i18n';

const queryClient = createQueryClient();

/**
 * Two families for Armenian, Cyrillic and Latin — Yalla Sans for body, Yalla
 * Serif for display — registered under the exact face names `@yalla/tokens`
 * hands to `Text`. Loaded before the first frame: a screen that paints in the
 * system font and then reflows into Yalla Sans half a second later looks
 * broken, not fast.
 */
// Metro resolves assets by statically analysing a literal `require()`; an
// `import` would need a module declaration per extension and gains nothing.
/* eslint-disable @typescript-eslint/no-require-imports */
const FONTS = {
  [nativeFontFace['400']]: require('../assets/fonts/YallaSans-400.ttf'),
  [nativeFontFace['500']]: require('../assets/fonts/YallaSans-500.ttf'),
  [nativeFontFace['700']]: require('../assets/fonts/YallaSans-700.ttf'),
  [nativeDisplayFontFace['600']]: require('../assets/fonts/YallaSerif-600.ttf'),
  [nativeDisplayFontFace['700']]: require('../assets/fonts/YallaSerif-700.ttf'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts(FONTS);

  // Reading the device locale and any stored override is async, so the first
  // frame has to wait — rendering before it resolves would flash Armenian at a
  // tourist whose phone is set to English.
  useEffect(() => {
    let cancelled = false;
    void bootstrapI18n().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // A font that fails to load is logged and the app proceeds in the system
  // face: an unreadable label is worse than an off-brand one.
  if (fontError) console.warn('[fonts] Yalla fonts failed to load', fontError);

  if (!ready || (!fontsLoaded && !fontError)) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color.paper,
        }}
      >
        <ActivityIndicator color={color.primary} />
      </View>
    );
  }

  return (
    <I18nextProvider i18n={i18next}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          {/* Pushed screens set their own header, which also gives Android
              hardware-back and the iOS swipe-back gesture. */}
          <Stack.Screen name="venue/[venueId]" />
          <Stack.Screen name="branch/[branchId]" />
          <Stack.Screen name="verify/index" />
          <Stack.Screen name="reserve/confirm" />
          <Stack.Screen name="reserve/success" />
          <Stack.Screen name="booking/[bookingId]" />
          {/* Scanning in and the shared tab. */}
          <Stack.Screen name="tab/[tabId]/index" />
          <Stack.Screen name="tab/[tabId]/pending" />
          <Stack.Screen name="tab/[tabId]/invite" />
          <Stack.Screen name="tab/[tabId]/people" />
          <Stack.Screen name="tab/[tabId]/menu" />
          {/* Deep links. Expo Router derives the linking config from these
              paths, so `https://yalla.am/join/<token>` and the `yalla://`
              scheme both resolve without a hand-written linking map. */}
          <Stack.Screen name="join/[token]" />
          <Stack.Screen name="t/[code]" />
        </Stack>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
