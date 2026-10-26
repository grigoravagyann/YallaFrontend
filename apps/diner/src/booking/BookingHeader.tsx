import { useTranslation } from '@yalla/i18n';
import { StyleSheet, View } from 'react-native';
import { IconButton } from '../components/IconButton';
import { Text } from '../components/Text';
import { placeArea, placeTitle } from '../components/places/placeTitle';
import type { Place } from '../places/model';
import { actionIcon, colors, fontWeight, layout, space, typography } from '../theme';

/**
 * "Book a Table" — or "Change booking" — over the venue and where it is, the
 * same area line the place card shows: "Lavash Restaurant · Northern Avenue ·
 * Kentron".
 */
export function BookingHeader({
  title,
  onBack,
  place,
}: {
  title: string;
  onBack: () => void;
  place?: Pick<Place, 'name' | 'venueName' | 'branchName' | 'address' | 'district'> | undefined;
}) {
  const { t } = useTranslation('diner');
  const venue = place ? placeTitle(place).venue : null;
  // The branch and the district; the branch alone, or the street, without one.
  // It carries the branch, so two branches of one venue never sound alike.
  const where = place ? placeArea(place) || null : null;
  const heard = [title, venue, where];
  return (
    <View style={styles.header}>
      <IconButton
        icon={actionIcon.back}
        accessibilityLabel={t('floorPlan.back')}
        variant="surface"
        onPress={onBack}
      />
      <View
        style={styles.titleBlock}
        accessible
        accessibilityRole="header"
        accessibilityLabel={heard.filter(Boolean).join(', ')}
      >
        <Text display numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        {venue ? (
          <Text numberOfLines={1} style={styles.subline}>
            {[venue, where].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  title: { fontSize: 20, lineHeight: 26, fontWeight: fontWeight.bold, color: colors.text },
  titleBlock: { flexShrink: 1 },
  subline: { ...typography.caption, color: colors.textMuted },
});
