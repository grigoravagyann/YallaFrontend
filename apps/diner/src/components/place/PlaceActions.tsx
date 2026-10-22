import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@yalla/i18n';
import {
  Animated,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { Coordinates, Place } from '../../places/model';
import { actionIcon, colors, radius, space, type IoniconName } from '../../theme';
import { usePressScale } from '../motion/usePressScale';
import { Text } from '../Text';

export interface PlaceActionsProps {
  readonly place: Pick<Place, 'name' | 'phone' | 'coords'>;
  /** The Menu tile: the page moves to the menu. */
  readonly onMenu: () => void;
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

export function openUrl(url: string): void {
  void Linking.openURL(url).catch(() => undefined);
}

/** Call · Directions · Menu — three glass tiles, the glyph over a small label. */
export function PlaceActions({ place, onMenu, style }: PlaceActionsProps) {
  const { t } = useTranslation('diner');
  const phone = place.phone?.trim() ?? '';

  return (
    <View style={[styles.row, style]}>
      <Tile
        icon={actionIcon.call}
        label={t('place.action.call')}
        disabled={phone === ''}
        onPress={() => openUrl(`tel:${phone.replace(/\s+/g, '')}`)}
      />
      <Tile
        icon={actionIcon.directions}
        label={t('place.action.directions')}
        disabled={place.coords === null}
        onPress={() => {
          if (place.coords) openUrl(directionsUrl(place.coords, place.name));
        }}
      />
      <Tile icon={MENU_ICON} label={t('place.tab.menu')} onPress={onMenu} />
    </View>
  );
}

interface TileProps {
  readonly icon: IoniconName;
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
}

function Tile({ icon, label, onPress, disabled = false }: TileProps) {
  const press = usePressScale();
  return (
    <Animated.View style={[styles.cell, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) => [
          styles.tile,
          pressed && styles.tilePressed,
          disabled && styles.tileDisabled,
        ]}
      >
        <Ionicons name={icon} size={TILE_GLYPH} color={colors.text} />
        <Text numberOfLines={1} style={styles.label}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/** A menu card with its lines: the design's glyph for the Menu tile. */
const MENU_ICON: IoniconName = 'reader-outline';

/** The design's 56px tile with an 18px glyph. */
const TILE_HEIGHT = 56;
const TILE_GLYPH = 18;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  cell: { flex: 1, minWidth: 0 },
  tile: {
    height: TILE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: space.xs,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tilePressed: { borderColor: colors.borderStrong, opacity: 0.85 },
  tileDisabled: { opacity: 0.45 },
  label: { fontSize: 12, lineHeight: 16, color: colors.text },
});
