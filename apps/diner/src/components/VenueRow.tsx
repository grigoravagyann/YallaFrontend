import { venueAvailability, type VenueSummary } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, space, touchTarget } from '@yalla/tokens';
import { Pressable, StyleSheet, View } from 'react-native';
import { FreeTablesGlyph } from './FreeTablesGlyph';
import { Text } from './Text';

export interface VenueRowProps {
  readonly venue: VenueSummary;
  readonly onPress: (venueId: string) => void;
}

/**
 * One venue in the Explore list.
 *
 * A row on the page rather than a card on it: the list is the screen, and a
 * stack of identical white boxes read as a component kit. The venue's name is
 * the one thing set in the serif — it is the thing being named — and the free
 * count is still the loudest line, because it is the number only this app can
 * show. The glyph on the right draws the same number as squares.
 */
export function VenueRow({ venue, onPress }: VenueRowProps) {
  const { t } = useTranslation('diner');

  const availability = venueAvailability(venue);
  const branchNames = venue.branches.map((b) => b.name).join(', ');

  /*
   * Three cases, and they are not interchangeable. The count is of tables
   * nobody is sitting at this second, summed over the branches that are
   * open: a shut venue says "Closed" instead, because every table is free
   * at 03:00. Zero at an open venue is "none free right now", not "fully
   * booked tonight" — the room may well empty in twenty minutes.
   */
  const availabilityLine =
    availability.kind === 'freeNow'
      ? t('venue.freeNow', { count: availability.count })
      : availability.kind === 'noneFreeNow'
        ? t('venue.noneFreeNow')
        : t('venue.closedNow');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${venue.name}. ${availabilityLine}`}
      onPress={() => onPress(venue.id)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.body}>
        <Text display style={styles.name} numberOfLines={1}>
          {venue.name}
        </Text>

        <Text style={styles.meta} numberOfLines={1}>
          {t('venue.typeAndBranches', {
            type: t(`venue.type.${venue.type}`),
            branches: t('venue.branchCount', { count: venue.branches.length }),
          })}
        </Text>

        {venue.branches.length > 1 ? (
          <Text style={styles.meta} numberOfLines={1}>
            {branchNames}
          </Text>
        ) : null}

        <Text style={[styles.availability, availability.kind !== 'freeNow' && styles.quiet]}>
          {availabilityLine}
        </Text>
      </View>

      <FreeTablesGlyph availability={availability} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.lg,
    minHeight: touchTarget.minimum + space.xl,
  },
  rowPressed: { opacity: 0.7 },
  body: { flex: 1, gap: 2 },
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
  availability: {
    marginTop: space.xs,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: fontWeight.medium,
    color: color.successInk,
  },
  quiet: { fontWeight: fontWeight.regular, color: color.mutedForeground },
});
