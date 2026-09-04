import { createQueryClient } from '@yalla/api';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { color } from '@yalla/tokens';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { bootstrapI18n } from '../src/i18n';

const queryClient = createQueryClient();

export default function RootLayout() {
  const [ready, setReady] = useState(false);

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
        <ActivityIndicator color={color.accent} />
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
