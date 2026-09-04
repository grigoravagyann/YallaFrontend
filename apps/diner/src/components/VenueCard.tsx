import { venueFreeTables, type VenueSummary } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';

export interface VenueCardProps {
  readonly venue: VenueSummary;
  readonly onPress: (venueId: string) => void;
}

/**
 * One venue in the Explore list.
 *
 * The free-table count is the loudest thing on the card on purpose: it is the
 * single number a hungry person actually wants, and it is the number only this
 * app can show, because only it holds live floor state.
 */
export function VenueCard({ venue, onPress }: VenueCardProps) {
  const { t } = useTranslation('diner');

  const freeTables = venueFreeTables(venue);
  const fullyBooked = freeTables === 0;
  const branchNames = venue.branches.map((b) => b.name).join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={venue.name}
      onPress={() => onPress(venue.id)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {/* Photo placeholder — real imagery is out of scope for this task. */}
      <View style={styles.thumb} />

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {venue.name}
        </Text>

        <Text style={styles.meta} numberOfLines={1}>
          {t('venue.typeAndBranches', {
            type: t(`venue.type.${venue.type}`),
            branches: t('venue.branchCount', { count: venue.branches.length }),
          })}
        </Text>

        {venue.branches.length > 1 ? (
          <Text style={styles.branches} numberOfLines={1}>
            {branchNames}
          </Text>
        ) : null}

        {/*
          A fully booked venue keeps its place in the list rather than being
          hidden or filtered out. Hiding busy venues makes the app look empty;
          showing them makes it look used.
        */}
        {fullyBooked ? (
          <Text style={styles.fullyBooked}>{t('venue.fullyBooked')}</Text>
        ) : (
          <Text style={styles.freeNow}>{t('venue.freeNow', { count: freeTables })}</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.md,
    marginBottom: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.border,
    minHeight: touchTarget.minimum + space.xl,
  },
  cardPressed: {
    backgroundColor: color.greenTint,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radius.control,
    backgroundColor: color.greenTint,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  name: {
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: fontWeight.bold,
    color: color.foreground,
  },
  meta: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: color.mutedForeground,
  },
  branches: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: color.mutedForeground,
  },
  freeNow: {
    marginTop: space.xs,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: fontWeight.bold,
    color: color.success,
  },
  fullyBooked: {
    marginTop: space.xs,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: fontWeight.medium,
    color: color.mutedForeground,
  },
});
