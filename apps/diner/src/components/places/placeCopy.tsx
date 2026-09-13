import { Ionicons } from '@expo/vector-icons';
import { intlTag } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Place } from '../../places/model';
import { actionIcon, colors, fontWeight, iconSize, space, tabularNumbers } from '../../theme';
import { Text } from '../Text';

/** The fields the three repeated lines are built from. */
export type PlaceCopySource = Pick<
  Place,
  'type' | 'cuisine' | 'rating' | 'ratingCount' | 'distanceKm'
>;

/** The three lines every place card repeats, formatted once for the active locale. */
export interface PlaceCopy {
  /** "Café · Armenian & Mediterranean" */
  readonly typeLine: string;
  /** "4.8 (1,540)" — one decimal always, count in the locale's digits and grouping. */
  readonly rating: string;
  /** "0.3 km" */
  readonly distance: string;
}

/**
 * The one place the rating, count and distance are worded.
 *
 * Every card — the hero on Explore, the card on the map, the summary on the
 * booking screen, the details sheet, a favourite — reads these three strings
 * from here, so "4.0" on one screen can never be "4" on the next. Follows the
 * active locale through `useLocale`, so a language change re-renders it.
 */
export function usePlaceCopy(place: PlaceCopySource): PlaceCopy {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const tag = intlTag(locale);

  return useMemo(() => {
    const type = t(`place.type.${place.type}`);
    const cuisine = place.cuisine.trim();
    // No reviews yet is said in words, never as "0.0 (0)"; an unknown distance
    // is left out rather than shown from somewhere invented.
    let rating = t('place.noReviews');
    if (place.rating !== null) {
      const stars = new Intl.NumberFormat(tag, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(place.rating);
      const count = new Intl.NumberFormat(tag).format(place.ratingCount);
      rating = t('place.rating', { rating: stars, count });
    }
    const distance =
      place.distanceKm === null
        ? ''
        : t('place.distanceKm', {
            km: new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }).format(place.distanceKm),
          });
    return {
      typeLine: cuisine ? `${type} · ${cuisine}` : type,
      rating,
      distance,
    };
  }, [t, tag, place.type, place.cuisine, place.rating, place.ratingCount, place.distanceKm]);
}

export interface PlaceMetaRowProps {
  readonly place: PlaceCopySource;
  /** Cards lead with the distance; the details hero leads with the rating. */
  readonly order?: 'ratingFirst' | 'distanceFirst';
  /** White glyphs and text, for the caption on a photo. */
  readonly onImage?: boolean;
  /** Text colour on a light ground; the star stays the warning orange. */
  readonly color?: string;
  readonly style?: StyleProp<ViewStyle>;
}

/** "★ 4.8 (124)  ⌖ 0.3 km" — one row, two glyphs, tabular digits. */
export function PlaceMetaRow({
  place,
  order = 'distanceFirst',
  onImage = false,
  color = colors.textMuted,
  style,
}: PlaceMetaRowProps) {
  const copy = usePlaceCopy(place);
  const textColor = onImage ? colors.onImage : color;
  const starColor = onImage ? colors.onImage : colors.warning;
  const rating = (
    <View key="rating" style={styles.metaItem}>
      {place.rating !== null ? (
        <Ionicons name={actionIcon.star} size={iconSize.sm - 1} color={starColor} />
      ) : null}
      <Text style={[styles.metaText, onImage && styles.metaTextOnImage, { color: textColor }]}>
        {copy.rating}
      </Text>
    </View>
  );
  const distance =
    place.distanceKm === null ? null : (
      <View key="distance" style={styles.metaItem}>
        <Ionicons name={actionIcon.location} size={iconSize.sm - 1} color={textColor} />
        <Text style={[styles.metaText, onImage && styles.metaTextOnImage, { color: textColor }]}>
          {copy.distance}
        </Text>
      </View>
    );
  return (
    <View style={[styles.metaRow, style]}>
      {order === 'ratingFirst' ? [rating, distance] : [distance, rating]}
    </View>
  );
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  metaText: { fontSize: 13, lineHeight: 18, ...tabularNumbers },
  metaTextOnImage: { fontWeight: fontWeight.medium },
});
