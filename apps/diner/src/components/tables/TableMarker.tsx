import { unavailableCopy, type TableUnavailableReason } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import type { TablePhotoMarker } from '../../places/model';
import { isPartyFitReason } from '../../places/rooms';
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

/**
 * Why `partySize` cannot have this table at the slot, or `null` when it can
 * (or no party is being booked for). The server's reason when it gave one;
 * else, for a table the party does not fit, that it is too small or too large.
 */
export function pinRefusal(
  table: TablePhotoMarker,
  partySize: number | undefined,
): { reason: TableUnavailableReason | null } | null {
  if (partySize === undefined || table.isBookable) return null;
  if (table.unavailableReason) return { reason: table.unavailableReason };
  if (partySize > table.capacityMax) return { reason: 'tooSmall' };
  if (partySize < table.capacityMin) return { reason: 'tooLarge' };
  return { reason: null };
}

/** "Table 6 · 1–2 people. Too small for 3 guests." — what a tap on a refused pin says. */
export function usePinRefusalText(): (
  table: TablePhotoMarker,
  partySize: number | undefined,
) => string | null {
  const { t } = useTranslation('diner');
  const capacity = useCapacityLabel();
  return useCallback(
    (table, partySize) => {
      const refusal = pinRefusal(table, partySize);
      if (!refusal || partySize === undefined) return null;
      const line = unavailableCopy(refusal.reason, partySize);
      return t('tables.refusal', {
        table: t('tables.table', { label: table.label }),
        capacity: capacity(table),
        reason: t(line.key, line.params),
      });
    },
    [t, capacity],
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

  const refusal = pinRefusal(table, partySize);
  const refused = refusal !== null;
  // Free at the slot, but the party does not fit it: still free, so not grey
  // or red, and drawn hollow. Free but refused for the time itself (closed,
  // too soon) is a different answer and says so.
  const unfit =
    refused &&
    table.status === 'free' &&
    (refusal.reason === null || isPartyFitReason(refusal.reason));
  const timeRefused = refused && table.status === 'free' && !unfit;
  const label = unfit
    ? t('tables.pin.notForParty', { label: table.label, count: partySize })
    : timeRefused && partySize !== undefined
      ? (() => {
          const line = unavailableCopy(refusal.reason, partySize);
          return t('tables.pin.withReason', {
            label: table.label,
            reason: t(line.key, line.params),
          });
        })()
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
        // Not selectable, yet still tappable: the tap says why on the photo
        // (QA 20261016T2 B3). The name says it too, for a screen reader.
        accessibilityState={{ selected, disabled: refused }}
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
