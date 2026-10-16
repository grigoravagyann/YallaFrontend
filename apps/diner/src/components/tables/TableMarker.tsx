import { useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import type { TablePhotoMarker } from '../../places/model';
import {
  colors,
  fontWeight,
  radius,
  shadows,
  tableStatusColor,
  tabularNumbers,
  typography,
} from '../../theme';
import { Text } from '../Text';

/** Diameter of a marker at zoom 1. */
export const TABLE_MARKER_SIZE = 30;

const SELECTED_SCALE = 1.2;
/** How far the ring spreads before it fades, as a multiple of the marker. */
const RING_SCALE = 1.6;
const RING_MS = 420;

/**
 * "2–4 people" / "6 people", for a marker's label, the info bar and the
 * booking screen's "Selected table" row.
 */
export function useCapacityLabel(): (
  table: Pick<TablePhotoMarker, 'capacityMin' | 'capacityMax'>,
) => string {
  const { t } = useTranslation('diner');
  return useCallback(
    (table) =>
      table.capacityMin === table.capacityMax
        ? t('tables.capacityOne', { max: table.capacityMax })
        : t('tables.capacity', { min: table.capacityMin, max: table.capacityMax }),
    [t],
  );
}

export interface TableMarkerProps {
  readonly table: TablePhotoMarker;
  readonly selected: boolean;
  readonly onPress: (table: TablePhotoMarker) => void;
  /**
   * The party being booked for. Given, a table the slot will not give this
   * party (`isBookable` false) cannot be picked: a free one is drawn hollow
   * rather than green and named "Table 3, free, not for a party of 6".
   */
  readonly partySize?: number | undefined;
}

/**
 * A numbered circle on the photo: green free, orange reserved, red occupied,
 * grey out of service; hollow with a green ring when free but not for the
 * party being booked. Named "Table 4, free" for a screen reader, so the
 * colour is never the only way to know.
 *
 * Positioned by the pin's `x`/`y` as percentages of the box the photo is drawn
 * in, so it lands on the same table at any size and scales with the photo when
 * the view is zoomed. Selecting it springs it up and sends a ring of its own
 * colour outwards, so the eye finds the tapped table even on a busy photo.
 */
export function TableMarker({ table, selected, onPress, partySize }: TableMarkerProps) {
  const { t } = useTranslation('diner');
  const capacity = useCapacityLabel();
  const [scale] = useState(() => new Animated.Value(selected ? SELECTED_SCALE : 1));
  const [ring] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.spring(scale, {
      toValue: selected ? SELECTED_SCALE : 1,
      bounciness: 10,
      speed: 20,
      useNativeDriver: true,
    }).start();
    if (!selected) {
      ring.setValue(0);
      return;
    }
    // One pulse per selection: the ring grows from the marker's edge and
    // thins out to nothing, then stays gone until the next tap.
    ring.setValue(0);
    const pulse = Animated.timing(ring, {
      toValue: 1,
      duration: RING_MS,
      useNativeDriver: true,
    });
    pulse.start();
    return () => pulse.stop();
  }, [scale, ring, selected]);

  const refused = partySize !== undefined && !table.isBookable;
  // Free at the slot, but not for this party: still free, so not grey or red.
  const unfit = refused && table.status === 'free';
  const label = unfit
    ? t('tables.pin.notForParty', { label: table.label, count: partySize })
    : t(`tables.pin.${table.status}`, { label: table.label });
  const color = tableStatusColor[table.status];
  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [1, RING_SCALE] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.6, 0] });

  return (
    <Animated.View
      style={[
        styles.anchor,
        { left: `${table.x * 100}%`, top: `${table.y * 100}%`, transform: [{ scale }] },
      ]}
    >
      {selected ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            { borderColor: color, opacity: ringOpacity, transform: [{ scale: ringScale }] },
          ]}
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={capacity(table)}
        accessibilityState={{ selected, disabled: refused }}
        disabled={refused}
        hitSlop={8}
        onPress={() => onPress(table)}
        style={({ pressed }) => [
          styles.marker,
          unfit ? [styles.markerUnfit, { borderColor: color }] : { backgroundColor: color },
          refused && !unfit && styles.markerRefused,
          selected && styles.markerSelected,
          pressed && styles.markerPressed,
        ]}
      >
        <Text numberOfLines={1} style={styles.label}>
          {table.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    width: TABLE_MARKER_SIZE,
    height: TABLE_MARKER_SIZE,
    marginLeft: -TABLE_MARKER_SIZE / 2,
    marginTop: -TABLE_MARKER_SIZE / 2,
  },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: TABLE_MARKER_SIZE,
    height: TABLE_MARKER_SIZE,
    borderRadius: radius.pill,
    borderWidth: 2,
  },
  marker: {
    width: TABLE_MARKER_SIZE,
    height: TABLE_MARKER_SIZE,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.onImageMuted,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lift,
  },
  markerSelected: { borderWidth: 3, borderColor: colors.onImage },
  markerPressed: { opacity: 0.85 },
  // Hollow: the free colour as a ring on the dark glass, never a green fill.
  markerUnfit: { backgroundColor: colors.glass, borderStyle: 'dashed' },
  markerRefused: { opacity: 0.6 },
  label: {
    ...typography.caption,
    lineHeight: 14,
    fontWeight: fontWeight.bold,
    color: colors.onImage,
    ...tabularNumbers,
  },
});
