import type { ScannedCode } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from 'react-native';
import { colors, layout, space, typography } from '../theme';
import { Button } from './Button';
import { Text } from './Text';
import { useJoinByCode } from '../hooks/useJoinByCode';

export interface JoinByLinkProps {
  /** What the route lifted out of the link: an invitation or a table code. */
  readonly code: ScannedCode | null;
}

/**
 * The landing pad for every link into the app.
 *
 * Two routes render it — `/join/<invite token>` and `/t/<table code>` — because
 * a QR on a table and a link in a group chat are the same journey from the
 * diner's point of view. They are not the same request: the route says which
 * one it is, an invitation goes to `/api/tabs/join` and a table code to the
 * table scan. Keeping one component means a link and a scan cannot drift apart
 * in what they say when they fail.
 */
export function JoinByLink({ code }: JoinByLinkProps) {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const { enter, failure, isWorking } = useJoinByCode();

  // One attempt per code. Without the guard a re-render — or the router
  // re-reading params — fires a second join while the first is still in flight.
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (!code) return;
    const key = JSON.stringify(code);
    if (attempted.current === key) return;
    attempted.current = key;
    void enter(code);
  }, [code, enter]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: true, title: t('join.title') }} />

      <View style={styles.centered}>
        {isWorking || !failure ? (
          <>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.muted}>{t('join.working')}</Text>
          </>
        ) : (
          <>
            <Text display style={styles.title}>
              {t('join.failedTitle')}
            </Text>
            <Text style={styles.body}>{t(failure.key, failure.params ?? {})}</Text>
            <Text style={styles.muted}>{t('join.failedBody')}</Text>
            <Button
              label={t('scan.scanAgain')}
              onPress={() => router.replace('/(tabs)/scan')}
              fullWidth={false}
              style={styles.primary}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },
  title: { ...typography.heading, color: colors.text, textAlign: 'center' },
  body: {
    ...typography.bodyLg,
    color: colors.errorInk,
    textAlign: 'center',
    maxWidth: layout.readableWidth,
  },
  muted: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: layout.readableWidth,
  },
  primary: { marginTop: space.md, alignSelf: 'center' },
});
