import { useTranslation } from '@yalla/i18n';
import { StyleSheet, View } from 'react-native';
import { actionIcon, colors, layout, space, typography } from '../../theme';
import { IconButton } from '../IconButton';
import { Text } from '../Text';

export interface AuthHeaderProps {
  readonly title: string;
  /** One quiet line under the title — "The last step before your booking". */
  readonly subline?: string | null;
  /** Omit for a step that has no way back (the number is already proved). */
  readonly onBack?: () => void;
}

/**
 * The top of every sign-in screen: a glass back button, the step's serif
 * title, and the line under it that says where this sits in what the diner
 * was doing.
 */
export function AuthHeader({ title, subline, onBack }: AuthHeaderProps) {
  const { t } = useTranslation('diner');
  return (
    <View style={styles.header}>
      {onBack ? (
        <IconButton
          icon={actionIcon.back}
          accessibilityLabel={t('floorPlan.back')}
          variant="surface"
          onPress={onBack}
        />
      ) : null}
      <View style={styles.titles}>
        <Text display style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {subline ? <Text style={styles.subline}>{subline}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: layout.touchTarget,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.xl,
    paddingBottom: space.sm,
  },
  titles: { flex: 1, gap: space.xs / 2 },
  title: { ...typography.heading, color: colors.text },
  subline: { ...typography.caption, color: colors.textMuted },
});
