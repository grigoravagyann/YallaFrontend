import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type ScrollView,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { haptics } from '../../lib/haptics';
import {
  isOffered,
  minuteIn,
  settleOn,
  stepOffered,
  wheelHours,
  wheelPosition,
  type WheelSlot,
} from '../../places/wheelTimes';
import { colors, fontWeight, radius, space, tabularNumbers } from '../../theme';
import { Text } from '../Text';

/** One row of a column. 44 — a thumb's worth, and the touch-target minimum. */
export const WHEEL_ROW = 44;
/** Rows in view: the chosen one and two either side. */
const VISIBLE_ROWS = 5;
const PAD_ROWS = (VISIBLE_ROWS - 1) / 2;
/** How long a column has to be still before it counts as stopped (web has no momentum end). */
const SETTLE_MS = 140;
/** How long a scroll made for the diner (a chip, a step) is taken to last, settling included. */
const FOLLOW_MS = 900;

export interface TimeWheelProps {
  /** The day's times, each free, requestable or busy. A time past closing is simply not here. */
  readonly slots: readonly WheelSlot[];
  /** The chosen instant, or `null` when there is nothing to choose. */
  readonly value: number | null;
  /**
   * A time was chosen — by the wheel coming to rest, a tap on a row, or one
   * step from a screen reader or the keyboard. `snappedFrom` is the busy time
   * the wheel stopped on and left, for "No free table at 20:15 — 20:30
   * suggested".
   */
  readonly onChange: (at: number, how: { readonly snappedFrom: WheelSlot | null }) => void;
  /** What the control is: "Time". */
  readonly accessibilityLabel: string;
  /** What a screen reader says the value is: "19:00", with any note after it. */
  readonly accessibilityValueText: string;
  /** "Swipe up or down to change the time". */
  readonly accessibilityHint?: string | undefined;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * An iOS-style time wheel: two columns, hour and minute, over the day's own
 * times, with an amber band across the middle.
 *
 * Nothing native: two vertical scrollers that snap row by row, a light haptic
 * as each row crosses the band, and the rows fading (and, unless reduced
 * motion is on, shrinking) with their distance from it — all on the native
 * driver. Busy times are dimmed and struck; stopping on one moves on to the
 * nearest time that can be had and the screen says so. Times whose sitting
 * would run past closing are not rows at all.
 *
 * To a screen reader the whole wheel is one `adjustable` control — "Time,
 * 19:00" — that steps to the next or previous time that can be had; on the web
 * it is a slider the arrow keys move, Home and End jump.
 */
export function TimeWheel({
  slots,
  value,
  onChange,
  accessibilityLabel,
  accessibilityValueText,
  accessibilityHint,
  style,
}: TimeWheelProps) {
  const hours = useMemo(() => wheelHours(slots), [slots]);
  const position =
    wheelPosition(hours, value) ?? (hours.length > 0 ? { hour: 0, minute: 0 } : null);
  const hour = position ? hours[position.hour] : undefined;
  const current = value === null ? null : (slots.find((slot) => slot.at === value) ?? null);

  // Bumped on every stop, so a column left on a busy row is brought back
  // even when the time it settles on is the one already chosen.
  const [revision, setRevision] = useState(0);
  const choose = useCallback(
    (at: number) => {
      setRevision((count) => count + 1);
      const { slot, snappedFrom } = settleOn(slots, at);
      if (!slot || (slot.at === value && !snappedFrom)) return;
      onChange(slot.at, { snappedFrom });
    },
    [slots, value, onChange],
  );

  const step = useCallback(
    (direction: 1 | -1) => {
      const from = value ?? (direction === 1 ? -Infinity : Infinity);
      const next = stepOffered(slots, from, direction);
      if (!next) return;
      haptics.select();
      onChange(next.at, { snappedFrom: null });
    },
    [slots, value, onChange],
  );

  const jump = useCallback(
    (end: 'first' | 'last') => {
      const offered = slots.filter(isOffered).sort((a, b) => a.at - b.at);
      const target = end === 'first' ? offered[0] : offered[offered.length - 1];
      if (target && target.at !== value) onChange(target.at, { snappedFrom: null });
    },
    [slots, value, onChange],
  );

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') step(1);
    if (event.nativeEvent.actionName === 'decrement') step(-1);
  };

  // The web's slider keys. React Native's View forwards them on the web only.
  const keyboard =
    Platform.OS === 'web'
      ? {
          focusable: true,
          onKeyDown: (event: { key: string; preventDefault: () => void }) => {
            const action =
              event.key === 'ArrowUp' || event.key === 'ArrowRight'
                ? () => step(1)
                : event.key === 'ArrowDown' || event.key === 'ArrowLeft'
                  ? () => step(-1)
                  : event.key === 'Home'
                    ? () => jump('first')
                    : event.key === 'End'
                      ? () => jump('last')
                      : null;
            if (!action) return;
            event.preventDefault();
            action();
          },
        }
      : {};

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      accessibilityValue={{ text: accessibilityValueText }}
      aria-valuetext={accessibilityValueText}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAccessibilityAction}
      {...keyboard}
      style={[styles.wheel, style]}
    >
      {/* The band the chosen row sits in. */}
      <View pointerEvents="none" style={styles.band} />
      <View
        style={styles.columns}
        // One control to a screen reader: the rows are for the eye and thumb.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
      >
        <WheelColumn
          rows={hours.map((entry) => ({ key: entry.key, label: entry.label, busy: entry.busy }))}
          index={position?.hour ?? 0}
          revision={revision}
          onSettle={(index) => {
            const next = hours[index];
            if (!next) return;
            const minutes = current?.label.slice(3) ?? '00';
            const target = minuteIn(next, minutes);
            if (target) choose(target.at);
          }}
        />
        <Text style={styles.colon}>:</Text>
        <WheelColumn
          rows={(hour?.slots ?? []).map((slot) => ({
            key: String(slot.at),
            label: slot.label.slice(3),
            busy: !isOffered(slot),
          }))}
          index={position?.minute ?? 0}
          revision={revision}
          onSettle={(index) => {
            const slot = hour?.slots[index];
            if (slot) choose(slot.at);
          }}
        />
      </View>
    </View>
  );
}

interface WheelRow {
  readonly key: string;
  readonly label: string;
  readonly busy: boolean;
}

/**
 * One scrolling column. Follows `index` when it changes from outside — a chip,
 * a step, the other column — and reports the row it comes to rest on.
 */
function WheelColumn({
  rows,
  index,
  revision,
  onSettle,
}: {
  readonly rows: readonly WheelRow[];
  readonly index: number;
  /** Changes on every stop, so the column realigns even when `index` did not move. */
  readonly revision: number;
  readonly onSettle: (index: number) => void;
}) {
  const reduced = useReducedMotion();
  const scroller = useRef<ScrollView | null>(null);
  const [scrollY] = useState(() => new Animated.Value(index * WHEEL_ROW));
  const offset = useRef(index * WHEEL_ROW);
  const crossed = useRef(index);
  const dragging = useRef(false);
  // The first placement, and a move made for the diner (a chip, a step, the
  // other column), are not the diner's hand on the wheel: no ticks for them,
  // and where they come to rest is not a choice — the column only aligns.
  const placed = useRef(false);
  // Until when a scroll is one made for the diner: long enough for a smooth
  // scroll to finish and the column to fall still after it.
  const followUntil = useRef(0);
  const following = () => Date.now() < followUntil.current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read inside the timer, which outlives the render that set it.
  const latest = useRef({ index, rows: rows.length, onSettle });
  useEffect(() => {
    latest.current = { index, rows: rows.length, onSettle };
  });

  // Placed on the chosen row, then following it.
  useEffect(() => {
    const y = index * WHEEL_ROW;
    if (!placed.current) {
      placed.current = true;
      followUntil.current = Date.now() + FOLLOW_MS;
      scroller.current?.scrollTo({ y, animated: false });
      offset.current = y;
      crossed.current = index;
      return;
    }
    if (Math.round(offset.current / WHEEL_ROW) === index) return;
    crossed.current = index;
    followUntil.current = Date.now() + FOLLOW_MS;
    scroller.current?.scrollTo({ y, animated: !reduced });
    if (reduced) {
      offset.current = y;
      scrollY.setValue(y);
    }
  }, [index, revision, rows.length, reduced, scrollY]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const settle = useCallback(
    (y: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const madeForTheDiner = following();
      followUntil.current = 0;
      const { rows: count, index: chosen, onSettle: report } = latest.current;
      if (count === 0) return;
      const at = Math.min(count - 1, Math.max(0, Math.round(y / WHEEL_ROW)));
      // A move made for the diner ends on the chosen row, however a quick run
      // of them left the scroller; the diner's own ends where it stopped.
      const target = madeForTheDiner ? chosen : at;
      // Come to rest exactly on the row: the web's scroller has no snapping.
      if (Math.abs(y - target * WHEEL_ROW) > 1) {
        scroller.current?.scrollTo({ y: target * WHEEL_ROW, animated: !reduced });
      }
      if (!madeForTheDiner && at !== chosen) report(at);
    },
    [reduced],
  );

  // The offset on the native driver, for the rows' fade and size.
  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
      }),
    [scrollY],
  );
  // The native driver still reports the offset back to a JS listener: a tick
  // as each row crosses the band, and the stop once the column is still.
  const onScrollAt = useCallback(
    (y: number) => {
      offset.current = y;
      const row = Math.round(y / WHEEL_ROW);
      if (row !== crossed.current) {
        crossed.current = row;
        // A light tick per row crossing the band, as a wheel clicks.
        if (!following()) haptics.select();
      }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (!dragging.current) settle(offset.current);
      }, SETTLE_MS);
    },
    [settle],
  );
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => onScrollAt(value));
    return () => scrollY.removeListener(id);
  }, [scrollY, onScrollAt]);

  return (
    <Animated.ScrollView
      ref={scroller}
      style={styles.column}
      contentContainerStyle={styles.columnContent}
      showsVerticalScrollIndicator={false}
      snapToInterval={WHEEL_ROW}
      decelerationRate="fast"
      scrollEventThrottle={16}
      contentOffset={{ x: 0, y: index * WHEEL_ROW }}
      onScroll={onScroll}
      onScrollBeginDrag={() => {
        dragging.current = true;
        // The diner's hand: where this stops is theirs.
        followUntil.current = 0;
      }}
      onTouchStart={() => {
        followUntil.current = 0;
      }}
      onScrollEndDrag={(event) => {
        dragging.current = false;
        // A drag that ends without a fling has no momentum to end.
        const y = event.nativeEvent.contentOffset.y;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => settle(y), SETTLE_MS);
      }}
      onMomentumScrollEnd={(event) => settle(event.nativeEvent.contentOffset.y)}
    >
      {rows.map((row, i) => {
        const distance = [(i - 2) * WHEEL_ROW, i * WHEEL_ROW, (i + 2) * WHEEL_ROW];
        const opacity = scrollY.interpolate({
          inputRange: distance,
          outputRange: [0.25, 1, 0.25],
          extrapolate: 'clamp',
        });
        const scale = scrollY.interpolate({
          inputRange: distance,
          outputRange: [0.86, 1, 0.86],
          extrapolate: 'clamp',
        });
        const chosen = i === index;
        return (
          <Animated.View
            key={row.key}
            style={[styles.row, { opacity, transform: reduced ? [] : [{ scale }] }]}
          >
            <Pressable
              onPress={() => {
                if (i === index) return;
                scroller.current?.scrollTo({ y: i * WHEEL_ROW, animated: !reduced });
                latest.current.onSettle(i);
              }}
              style={styles.rowPress}
            >
              <Text
                style={[
                  styles.rowText,
                  chosen && !row.busy && styles.rowChosen,
                  row.busy && styles.rowBusy,
                ]}
              >
                {row.label}
              </Text>
            </Pressable>
          </Animated.View>
        );
      })}
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  wheel: {
    height: WHEEL_ROW * VISIBLE_ROWS,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  band: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    top: WHEEL_ROW * PAD_ROWS,
    height: WHEEL_ROW,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  columns: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  column: { width: 76, height: WHEEL_ROW * VISIBLE_ROWS, flexGrow: 0 },
  columnContent: { paddingVertical: WHEEL_ROW * PAD_ROWS },
  colon: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    marginHorizontal: space.xs,
  },
  row: { height: WHEEL_ROW, alignItems: 'center', justifyContent: 'center' },
  rowPress: {
    height: WHEEL_ROW,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: fontWeight.medium,
    color: colors.text,
    ...tabularNumbers,
  },
  rowChosen: { color: colors.primary, fontWeight: fontWeight.bold },
  rowBusy: { color: colors.textSubtle, textDecorationLine: 'line-through' },
});
