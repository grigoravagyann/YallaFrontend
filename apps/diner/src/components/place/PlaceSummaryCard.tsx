import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Place } from '../../places/model';
import { colors, fontWeight, radius, space, typography } from '../../theme';
import { Card } from '../Card';
import { PhotoImage } from '../PhotoImage';
import { PlaceMetaRow, usePlaceCopy } from '../places/placeCopy';
import { Text } from '../Text';

export { PlaceMetaRow, usePlaceCopy } from '../places/placeCopy';
export type { PlaceCopy, PlaceMetaRowProps } from '../places/placeCopy';

export interface PlaceSummaryCardProps {
  readonly place: Place;
  readonly onPress?: () => void;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * Thumbnail, name, type · cuisine, distance + rating. The card at the top of
 * the booking screen, and anywhere else a place is named without its hero.
 */
export function PlaceSummaryCard({ place, onPress, style }: PlaceSummaryCardProps) {
  const copy = usePlaceCopy(place);
  return (
    <Card
      {...(onPress ? { onPress, accessibilityLabel: place.name } : {})}
      padded={false}
      style={[styles.card, style]}
    >
      <PhotoImage source={place.photos[0]} style={styles.thumb} />
      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.name}>
          {place.name}
        </Text>
        <Text numberOfLines={1} style={styles.typeLine}>
          {copy.typeLine}
        </Text>
        <PlaceMetaRow place={place} style={styles.meta} />
      </View>
    </Card>
  );
}

const THUMB = 64;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
  },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.chip },
  body: { flex: 1, gap: 2 },
  name: { ...typography.bodyLg, fontWeight: fontWeight.bold, color: colors.text },
  typeLine: { ...typography.caption, color: colors.textMuted },
  meta: { marginTop: 2 },
});
