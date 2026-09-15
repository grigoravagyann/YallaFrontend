import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@yalla/i18n';
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { Coordinates, Place } from '../../places/model';
import {
  actionIcon,
  colors,
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  typography,
  type IoniconName,
} from '../../theme';
import { Text } from '../Text';

export interface PlaceActionsProps {
  readonly place: Pick<Place, 'name' | 'phone' | 'website' | 'coords'>;
  /** Whether the place is already in the diner's favourites. */
  readonly saved: boolean;
  readonly onToggleSave: () => void;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * The native maps app, with the web as the fallback everywhere else.
 *
 * Apple Maps and Google Maps take different schemes; the universal Google URL
 * opens in any browser and hands off to the installed app on both phones.
 */
export function directionsUrl(coords: Coordinates, name: string): string {
  const point = `${coords.latitude},${coords.longitude}`;
  const label = encodeURIComponent(name);
  return Platform.select({
    ios: `maps:0,0?q=${label}@${point}`,
    android: `geo:${point}?q=${point}(${label})`,
    default: `https://www.google.com/maps/dir/?api=1&destination=${point}`,
  });
}

function open(url: string): void {
  void Linking.openURL(url).catch(() => undefined);
}

/** Call · Directions · Website · Save — four square tiles, icon over label. */
export function PlaceActions({ place, saved, onToggleSave, style }: PlaceActionsProps) {
  const { t } = useTranslation('diner');
  const phone = place.phone?.trim() ?? '';
  const website = place.website?.trim() ?? '';

  return (
    <View style={[styles.row, style]}>
      <Tile
        icon={actionIcon.call}
        label={t('place.action.call')}
        disabled={phone === ''}
        onPress={() => open(`tel:${phone.replace(/\s+/g, '')}`)}
      />
      <Tile
        icon={actionIcon.directions}
        label={t('place.action.directions')}
        disabled={place.coords === null}
        onPress={() => {
          if (place.coords) open(directionsUrl(place.coords, place.name));
        }}
      />
      <Tile
        icon={actionIcon.website}
        label={t('place.action.website')}
        disabled={website === ''}
        onPress={() => open(/^https?:\/\//i.test(website) ? website : `https://${website}`)}
      />
      <Tile
        icon={saved ? actionIcon.saved : actionIcon.save}
        label={t('place.action.save')}
        accessibilityLabel={saved ? t('place.unfavorite') : t('place.favorite')}
        selected={saved}
        onPress={onToggleSave}
      />
    </View>
  );
}

interface TileProps {
  readonly icon: IoniconName;
  readonly label: string;
  readonly onPress: () => void;
  readonly accessibilityLabel?: string;
  readonly disabled?: boolean;
  readonly selected?: boolean;
}

function Tile({
  icon,
  label,
  onPress,
  accessibilityLabel,
  disabled = false,
  selected = false,
}: TileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        selected && styles.tileSelected,
        pressed && styles.tilePressed,
        disabled && styles.tileDisabled,
      ]}
    >
      <Ionicons name={icon} size={iconSize.lg} color={colors.primary} />
      <Text numberOfLines={1} style={styles.label}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  tile: {
    flex: 1,
    height: layout.actionTile,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs + 2,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tileSelected: { backgroundColor: colors.primarySoft, borderColor: colors.borderStrong },
  tilePressed: { backgroundColor: colors.surfaceMuted, borderColor: colors.borderStrong },
  tileDisabled: { opacity: 0.45 },
  label: { ...typography.caption, fontWeight: fontWeight.medium, color: colors.text },
});
