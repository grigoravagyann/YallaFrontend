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
}

/**
 * A numbered circle on the photo: green free, orange reserved, red occupied.
 *
 * Positioned by the marker's normalised `x`/`y` as percentages of the photo,
 * so it lands on the same table at any size and scales with the photo when
 * the view is zoomed. Selecting it springs it up and sends a ring of its own
 * colour outwards, so the eye finds the tapped table even on a busy photo.
 */
export function TableMarker({ table, selected, onPress }: TableMarkerProps) {
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

  const label = `${t('tables.table', { label: table.label })}, ${t(`tables.status.${table.status}`)}, ${capacity(table)}`;
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
        accessibilityState={{ selected }}
        hitSlop={8}
        onPress={() => onPress(table)}
        style={({ pressed }) => [
          styles.marker,
          { backgroundColor: color },
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
  label: {
    ...typography.caption,
    lineHeight: 14,
    fontWeight: fontWeight.bold,
    color: colors.onImage,
    ...tabularNumbers,
  },
});
