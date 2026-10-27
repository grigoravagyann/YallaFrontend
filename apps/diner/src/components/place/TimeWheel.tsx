import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type KeyDownEvent,
  type ScrollViewInstance,
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
/**
 * How long a hand on a column counts with nothing moving: a wheel at the
 * column's edge has no release to end it, and must not leave a stray scroll
 * later to be taken as the diner's stop.
 */
const HAND_MS = 400;

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
  // Where the chosen time is — none when nothing is chosen, so no row is
  // drawn as chosen — and where the columns rest: there, else at the top.
  const chosen = wheelPosition(hours, value);
  const position = chosen ?? (hours.length > 0 ? { hour: 0, minute: 0 } : null);
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
  // The one tab stop: the rows under it are not (see `WheelColumn`).
  const keyboard =
    Platform.OS === 'web'
      ? {
          tabIndex: 0 as const,
          onKeyDown: (event: KeyDownEvent) => {
            // On the web the native event is the DOM KeyboardEvent itself.
            const { key } = event.nativeEvent;
            const action =
              key === 'ArrowUp' || key === 'ArrowRight'
                ? () => step(1)
                : key === 'ArrowDown' || key === 'ArrowLeft'
                  ? () => step(-1)
                  : key === 'Home'
                    ? () => jump('first')
                    : key === 'End'
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
          selected={chosen?.hour ?? -1}
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
          selected={chosen?.minute ?? -1}
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
 * a step, the other column — and reports the row it comes to rest on, unless
 * that is the chosen row already.
 *
 * Only the diner's own hand makes a choice. A scroll event says where the
 * column is, not who moved it: the app's embedded browser accepts a smooth
 * `scrollTo` and never moves, and a later event — the page scrolling, a sheet
 * opening — would then read as the diner stopping on the old row (QA
 * 2026-10-18: 19:30 became 13:30 under the "free by" sheet, and was booked).
 * So a column reports only after a touch, a drag, a wheel, a pointer or a tap
 * on it since the last move made for the diner; anything else puts it back
 * on its row, without animation.
 */
function WheelColumn({
  rows,
  index,
  selected,
  revision,
  onSettle,
}: {
  readonly rows: readonly WheelRow[];
  /** The row the column rests on. */
  readonly index: number;
  /**
   * The chosen row, drawn as chosen; `-1` when nothing is chosen — then the
   * column rests on its first row, and stopping on it or tapping it chooses it.
   */
  readonly selected: number;
  /** Changes on every stop, so the column realigns even when `index` did not move. */
  readonly revision: number;
  readonly onSettle: (index: number) => void;
}) {
  const reduced = useReducedMotion();
  const scroller = useRef<ScrollViewInstance | null>(null);
  const [scrollY] = useState(() => new Animated.Value(index * WHEEL_ROW));
  const offset = useRef(index * WHEEL_ROW);
  const crossed = useRef(index);
  const dragging = useRef(false);
  // A fling under way: the stop is its end, not a pause in the scroll events.
  const coasting = useRef(false);
  // The first placement, and a move made for the diner (a chip, a step, the
  // other column), are not the diner's hand on the wheel: no ticks for them,
  // and where they come to rest is not a choice — the column only aligns.
  const placed = useRef(false);
  // Until when a scroll is one made for the diner: long enough for a smooth
  // scroll to finish and the column to fall still after it.
  const followUntil = useRef(0);
  const following = () => Date.now() < followUntil.current;
  // The diner's hand on this column since the last move made for them: the
  // only thing that lets a stop be a choice.
  const handled = useRef(false);
  // And the column has scrolled under that hand: a touch, a press or a wheel
  // that moved nothing is no stop (a tap on the chosen row, the top edge).
  const moved = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const followEnd = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handEnd = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read inside the timer, which outlives the render that set it.
  const latest = useRef({ index, selected, rows: rows.length, onSettle });
  useEffect(() => {
    latest.current = { index, selected, rows: rows.length, onSettle };
  });

  // Put the column on its row at once — no animation to wait for, or to never
  // happen.
  const realign = useCallback(() => {
    const y = latest.current.index * WHEEL_ROW;
    if (Math.abs(offset.current - y) <= 1) return;
    scroller.current?.scrollTo({ y, animated: false });
    offset.current = y;
    crossed.current = latest.current.index;
    scrollY.setValue(y);
  }, [scrollY]);

  // A move made for the diner: their hand is off the column, and once the
  // move has had its time, a column that did not get there is put there.
  const follow = useCallback(() => {
    handled.current = false;
    moved.current = false;
    followUntil.current = Date.now() + FOLLOW_MS;
    if (followEnd.current) clearTimeout(followEnd.current);
    followEnd.current = setTimeout(() => {
      followEnd.current = null;
      if (!handled.current) realign();
    }, FOLLOW_MS);
  }, [realign]);

  // The diner's hand comes off: a hand that moved nothing leaves nothing behind.
  const release = useCallback(() => {
    if (handEnd.current) clearTimeout(handEnd.current);
    handEnd.current = null;
    if (!moved.current) handled.current = false;
  }, []);

  // The diner's own hand: where the column stops now is theirs, once it moves.
  const touch = useCallback(() => {
    if (!handled.current) moved.current = false;
    handled.current = true;
    followUntil.current = 0;
    if (followEnd.current) clearTimeout(followEnd.current);
    followEnd.current = null;
    if (moved.current) return;
    if (handEnd.current) clearTimeout(handEnd.current);
    handEnd.current = setTimeout(release, HAND_MS);
  }, [release]);

  // Placed on the chosen row, then following it.
  useEffect(() => {
    const y = index * WHEEL_ROW;
    if (!placed.current) {
      placed.current = true;
      follow();
      scroller.current?.scrollTo({ y, animated: false });
      offset.current = y;
      crossed.current = index;
      return;
    }
    if (Math.round(offset.current / WHEEL_ROW) === index) return;
    crossed.current = index;
    follow();
    scroller.current?.scrollTo({ y, animated: !reduced });
    if (reduced) {
      offset.current = y;
      scrollY.setValue(y);
    }
  }, [index, revision, rows.length, reduced, scrollY, follow]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (followEnd.current) clearTimeout(followEnd.current);
      if (handEnd.current) clearTimeout(handEnd.current);
    },
    [],
  );

  const settle = useCallback(
    (y: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const { rows: count, selected: chosen, onSettle: report } = latest.current;
      if (count === 0) return;
      // Not the diner's hand — a move made for them, or a scroll event nobody
      // made: the column goes back on its row, and nothing is chosen.
      if (!handled.current || !moved.current) {
        if (!following()) realign();
        return;
      }
      followUntil.current = 0;
      // One stop per touch: a later event with no hand on the column is not theirs.
      handled.current = false;
      moved.current = false;
      const at = Math.min(count - 1, Math.max(0, Math.round(y / WHEEL_ROW)));
      // Come to rest exactly on the row: the web's scroller has no snapping.
      if (Math.abs(y - at * WHEEL_ROW) > 1) {
        scroller.current?.scrollTo({ y: at * WHEEL_ROW, animated: !reduced });
      }
      // With nothing chosen (`-1`), wherever the diner stops is a choice.
      if (at !== chosen) report(at);
    },
    [reduced, realign],
  );

  // A mouse wheel turns the column without a pointer going down: the web's
  // own hand, which React Native Web forwards and the native types lack.
  const wheelHand = Platform.OS === 'web' ? { onWheel: touch } : {};

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
      // The column moves under the diner's hand: their stop, when it comes.
      if (handled.current && !moved.current) {
        moved.current = true;
        if (handEnd.current) clearTimeout(handEnd.current);
        handEnd.current = null;
      }
      const row = Math.round(y / WHEEL_ROW);
      if (row !== crossed.current) {
        crossed.current = row;
        // A light tick per row crossing the band under the diner's hand, as a wheel clicks.
        if (handled.current) haptics.select();
      }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (!dragging.current && !coasting.current) settle(offset.current);
      }, SETTLE_MS);
    },
    [settle],
  );
  /*
   * Each row's fade and size with its distance from the band, on the native
   * driver: made once per column length, not on every render — the screen
   * re-renders on every chip and step, and each made two new interpolations
   * per row.
   */
  const looks = useMemo(
    () =>
      Array.from({ length: rows.length }, (_, i) => {
        const distance = [(i - 2) * WHEEL_ROW, i * WHEEL_ROW, (i + 2) * WHEEL_ROW];
        return {
          opacity: scrollY.interpolate({
            inputRange: distance,
            outputRange: [0.25, 1, 0.25],
            extrapolate: 'clamp',
          }),
          scale: scrollY.interpolate({
            inputRange: distance,
            outputRange: [0.86, 1, 0.86],
            extrapolate: 'clamp',
          }),
        };
      }),
    [rows.length, scrollY],
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
        coasting.current = false;
        touch();
      }}
      // The diner's hand, in every form a platform has it.
      onTouchStart={touch}
      // A finger held still past the settle and moved on is still the diner's.
      onTouchMove={touch}
      onTouchEnd={release}
      onPointerDown={touch}
      onPointerUp={release}
      {...wheelHand}
      onScrollEndDrag={(event) => {
        dragging.current = false;
        // A drag that ends without a fling has no momentum to end.
        const y = event.nativeEvent.contentOffset.y;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => settle(y), SETTLE_MS);
      }}
      onMomentumScrollBegin={() => {
        // A fling after the drag: the drag's own stop is not where it ends.
        coasting.current = true;
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
      }}
      onMomentumScrollEnd={(event) => {
        coasting.current = false;
        settle(event.nativeEvent.contentOffset.y);
      }}
    >
      {rows.map((row, i) => {
        const look = looks[i];
        const chosen = i === selected;
        return (
          <Animated.View
            key={row.key}
            style={[
              styles.row,
              look
                ? { opacity: look.opacity, transform: reduced ? [] : [{ scale: look.scale }] }
                : null,
            ]}
          >
            <Pressable
              onPress={() => {
                if (i === selected) return;
                scroller.current?.scrollTo({ y: i * WHEEL_ROW, animated: !reduced });
                onSettle(i);
              }}
              // Not a tab stop: the wheel is one control, the slider (see above).
              tabIndex={-1}
              style={styles.rowPress}
            >
              <Text
                {...(chosen ? { testID: 'time-wheel-chosen' } : {})}
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
    borderWidth: 1,
    borderColor: colors.border,
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
