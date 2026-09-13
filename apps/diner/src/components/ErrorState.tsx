import { useTranslation } from '@yalla/i18n';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { actionIcon, colors, iconSize, radius, space, typography } from '../theme';
import { Button } from './Button';
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
      <View style={styles.iconWell}>
        <Ionicons
          name={offline ? actionIcon.offline : actionIcon.error}
          size={iconSize.xl}
          color={offline ? colors.textMuted : colors.error}
        />
      </View>
      <Text style={styles.title}>{heading}</Text>
      {detail ? <Text style={styles.body}>{detail}</Text> : null}
      {onRetry ? (
        <Button
          label={t('net.retry')}
          onPress={onRetry}
          variant="outline"
          fullWidth={false}
          style={styles.action}
        />
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
  iconWell: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  title: { ...typography.h3, color: colors.text, textAlign: 'center' },
  body: { ...typography.body, color: colors.textMuted, textAlign: 'center', maxWidth: 280 },
  action: { marginTop: space.md },
});
