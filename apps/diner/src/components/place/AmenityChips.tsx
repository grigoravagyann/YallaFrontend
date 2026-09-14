import { useTranslation } from '@yalla/i18n';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { amenityIcon, space } from '../../theme';
import { Chip } from '../Chip';

export interface AmenityChipsProps {
  /** Keys under `place.amenity.*`. */
  readonly amenities: readonly string[];
  readonly style?: StyleProp<ViewStyle>;
}

/** Static chips — "Outdoor Seating", "Wi-Fi", "Parking" — wrapping onto new rows. */
export function AmenityChips({ amenities, style }: AmenityChipsProps) {
  const { t } = useTranslation('diner');
  if (amenities.length === 0) return null;
  return (
    <View style={[styles.wrap, style]}>
      {amenities.map((amenity) => {
        // An amenity the app has no glyph for still gets its chip, without one.
        const icon = amenityIcon[amenity];
        return (
          <Chip
            key={amenity}
            label={t(`place.amenity.${amenity}`)}
            size="sm"
            {...(icon ? { icon } : {})}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
