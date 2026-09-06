import { createQueryClient } from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { color, nativeDisplayFontFace, nativeFontFace } from '@yalla/tokens';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { authSession } from '../src/auth/session';
import { projectId } from '../src/config';
import { gateway } from '../src/data/gateway';
import { bootstrapI18n } from '../src/i18n';
import { useSession } from '../src/stores/session';
import { usePushNotifications } from '../src/push/usePushNotifications';

/**
 * `'always'`: an offline send fails rather than pausing.
 *
 * A paused mutation leaves the send button spinning for ever and the diner
 * believing food is on the way. The tab screen would rather say "no signal, so
 * this order has not been placed" and keep the tray intact than queue anything:
 * nobody is standing at this table who can reconcile a late order, and twenty
 * minutes of waiting for food nobody is cooking is the worst outcome this app
 * has. `apps/web` sets the opposite for the opposite reason — see
 * `createQueryClient`.
 */
const queryClient = createQueryClient({ mutationNetworkMode: 'always' });

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

/**
 * Notification wiring, as a component rather than a call in `RootLayout`.
 *
 * It needs `useGateway`, which only resolves *inside* `GatewayProvider`, and
 * `RootLayout` renders that provider. A hook call in the parent would run one
 * level too high.
 */
function PushNotifications() {
  // Subscribed rather than read once: a diner who verifies their phone mid-
  // session becomes registerable at that moment, and a value read at mount
  // would leave them unreachable until the next launch.
  const verified = useSession((state) => state.verificationToken !== null);

  usePushNotifications({
    projectId,
    // `POST /api/diner/devices` is `VerifiedDiner`-scoped, so there is nothing
    // to register before then. A walk-in who scanned a QR holds a tab-
    // participant token and no account; the server has nobody to address.
    signedIn: verified,
  });
  return null;
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts(FONTS);

  // Reading the device locale, any stored override and the refresh token are
  // all async, so the first frame has to wait — rendering before they resolve
  // would flash Armenian at a tourist whose phone is set to English, or ask a
  // returning diner to verify a number the keychain still vouches for.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([bootstrapI18n(), authSession.restore()]).then(() => {
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
        <GatewayProvider gateway={gateway}>
          {/* Inside the providers, because it needs the gateway and the locale;
              above the navigator, because a cold-start tap has to be able to
              route before any screen has mounted. */}
          <PushNotifications />
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
        </GatewayProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
