import { useTranslation } from '@yalla/i18n';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { actionIcon, colors, space, typography } from '../theme';
import { Button } from './Button';
import { Rise } from './motion/Rise';
import { StateGlow } from './StateGlow';
import { Text } from './Text';

export interface ErrorStateProps {
  /** No connection: a state, not a failure, and it says so calmly. */
  readonly offline?: boolean;
  /** Override the default copy for the two kinds. */
  readonly title?: string;
  readonly body?: string;
  readonly onRetry?: () => void;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * The query failed, or the phone is offline. Two kinds, each with its own
 * words, because "something went wrong" sends the diner to the wrong fix.
 */
export function ErrorState({ offline = false, title, body, onRetry, style }: ErrorStateProps) {
  const { t } = useTranslation('diner');
  const heading = title ?? (offline ? t('net.offline') : t('net.serverError'));
  const detail = body ?? (offline ? t('net.offlineBody') : undefined);

  return (
    <View accessibilityRole="alert" style={[styles.root, style]}>
      <Rise>
        <StateGlow icon={offline ? actionIcon.offline : actionIcon.error} />
      </Rise>
      <Rise delay={80}>
        <Text display style={styles.title}>
          {heading}
        </Text>
      </Rise>
      {detail ? (
        <Rise delay={140}>
          <Text style={styles.body}>{detail}</Text>
        </Rise>
      ) : null}
      {onRetry ? (
        <Rise delay={200}>
          <Button
            label={t('net.retry')}
            icon={actionIcon.refresh}
            onPress={onRetry}
            fullWidth={false}
            style={styles.action}
          />
        </Rise>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    paddingVertical: space.xxl,
    paddingHorizontal: space.xl,
    gap: space.sm,
  },
  title: { ...typography.heading, color: colors.text, textAlign: 'center', marginTop: space.md },
  body: { ...typography.body, color: colors.textMuted, textAlign: 'center', maxWidth: 280 },
  action: { marginTop: space.md },
});
