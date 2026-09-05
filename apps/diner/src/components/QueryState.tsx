import { describeFailure } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';

/**
 * The two non-happy states every screen renders explicitly.
 *
 * Mock data was instant and always succeeded; real data is neither. A screen
 * that shows the same "something went wrong" for a dead wifi and a dead server
 * sends the diner to the wrong fix, so the failure is classified once and each
 * kind gets its own words. Offline is not an error — it is a state, and it says
 * so calmly.
 */

export function QueryLoading({ label }: { readonly label: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={color.primary} />
      <Text style={styles.body}>{label}</Text>
    </View>
  );
}

export interface QueryFailureProps {
  readonly error?: unknown;
  /**
   * The phone has no connection, so the query was paused rather than
   * attempted. There is no error to classify — and a diner staring at a
   * spinner needs telling more than one who got a 500 does.
   */
  readonly offline?: boolean | undefined;
  readonly onRetry?: (() => void) | undefined;
}

export function QueryFailure({ error, offline, onRetry }: QueryFailureProps) {
  const { t } = useTranslation('diner');
  const kind = offline ? 'offline' : describeFailure(error);

  const title =
    kind === 'offline'
      ? t('net.offline')
      : kind === 'unavailable'
        ? t('net.notAvailable')
        : kind === 'unauthorized'
          ? t('net.signedOut')
          : t('net.serverError');
  const body =
    kind === 'offline'
      ? t('net.offlineBody')
      : kind === 'unavailable'
        ? t('net.notAvailableBody')
        : null;

  return (
    <View style={styles.centered} accessibilityRole="alert">
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {onRetry && kind !== 'unavailable' ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
        >
          <Text style={styles.retryText}>{t('net.retry')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    paddingTop: space.xxl,
    paddingHorizontal: space.xl,
    gap: space.sm,
  },
  title: {
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: fontWeight.bold,
    color: color.foreground,
    textAlign: 'center',
  },
  body: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: color.mutedForeground,
    textAlign: 'center',
  },
  retry: {
    marginTop: space.sm,
    minHeight: touchTarget.regular,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: color.primary,
  },
  retryPressed: { backgroundColor: color.greenTint, transform: [{ scale: 0.97 }] },
  retryText: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: color.primary },
});
