import { useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { useJoinByCode } from '../hooks/useJoinByCode';

export interface JoinByLinkProps {
  /** The token or table code lifted out of the link. */
  readonly code: string | undefined;
}

/**
 * The landing pad for every link into the app.
 *
 * Two routes render it — `/join/<invite token>` and `/t/<table code>` — because
 * a QR on a table and a link in a group chat are the same journey from the
 * diner's point of view, and the backend resolves both through one endpoint.
 * Keeping one component means a link and a scan cannot drift apart in what they
 * say when they fail.
 */
export function JoinByLink({ code }: JoinByLinkProps) {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const { submit, failure, isWorking } = useJoinByCode();

  // One attempt per code. Without the guard a re-render — or the router
  // re-reading params — fires a second join while the first is still in flight.
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (!code || attempted.current === code) return;
    attempted.current = code;
    void submit(code);
  }, [code, submit]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: true, title: t('join.title') }} />

      <View style={styles.centered}>
        {isWorking || !failure ? (
          <>
            <ActivityIndicator color={color.primary} />
            <Text style={styles.muted}>{t('join.working')}</Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>{t('join.failedTitle')}</Text>
            <Text style={styles.body}>{t(failure.key, failure.params ?? {})}</Text>
            <Text style={styles.muted}>{t('join.failedBody')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/(tabs)/scan')}
              style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
            >
              <Text style={styles.primaryText}>{t('scan.scanAgain')}</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.paper },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: color.foreground },
  body: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    color: color.danger,
    textAlign: 'center',
  },
  muted: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: color.mutedForeground,
    textAlign: 'center',
  },
  primary: {
    marginTop: space.md,
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    backgroundColor: color.primary,
  },
  primaryPressed: { backgroundColor: color.primaryPressed },
  primaryText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: color.primaryForeground,
  },
});
