import { useTranslation } from '@yalla/i18n';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { space, type IoniconName } from '../../theme';
import { Chip } from '../Chip';

/** A glyph for the amenities the venues name; an unknown key gets no icon. */
const amenityIcon: Record<string, IoniconName> = {
  outdoorSeating: 'leaf-outline',
  wifi: 'wifi',
  parking: 'car-outline',
  cardPayment: 'card-outline',
  vegan: 'nutrition-outline',
};

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
        const icon = amenityIcon[amenity] as IoniconName | undefined;
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
