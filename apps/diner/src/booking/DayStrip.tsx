import { intlTag } from '@yalla/format';
import { useLocale } from '@yalla/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { haptics } from '../lib/haptics';
import type { DayOption } from '../places/slots';
import { colors, fontWeight, layout, radius, shadows, space } from '../theme';

const DAYS_IN_VIEW = 4;
const DAY_GAP = space.sm;
/** A day cell's width before the strip has been measured. */
const DAY_FALLBACK = 84;

interface DayStripProps {
  readonly days: readonly DayOption[];
  readonly selectedKey: string | null;
  readonly timeZoneId: string;
  readonly label: (day: DayOption) => string;
  readonly onSelect: (dateKey: string) => void;
}

/**
 * Four equal day cells in view, the rest a swipe away, with one brand thumb
 * that slides under the chosen day. Each cell is a button named by the whole
 * date ("Saturday, 18 October"), which is what a screen reader should say.
 */
export function DayStrip({ days, selectedKey, timeZoneId, label, onSelect }: DayStripProps) {
  const { locale } = useLocale();
  const reduced = useReducedMotion();
  const full = useMemo(
    () =>
      new Intl.DateTimeFormat(intlTag(locale), {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: timeZoneId,
      }),
    [locale, timeZoneId],
  );
  const [width, setWidth] = useState(0);
  const cell = width > 0 ? (width - DAY_GAP * (DAYS_IN_VIEW - 1)) / DAYS_IN_VIEW : 0;
  const index = days.findIndex((day) => day.dateKey === selectedKey);
  const [x] = useState(() => new Animated.Value(0));
  // The first placement is a jump; only a new choice slides.
  const placed = useRef(false);

  useEffect(() => {
    if (cell <= 0 || index < 0) return;
    const to = index * (cell + DAY_GAP);
    if (reduced || !placed.current) {
      x.setValue(to);
      placed.current = true;
      return;
    }
    Animated.spring(x, { toValue: to, useNativeDriver: true, speed: 16, bounciness: 7 }).start();
  }, [cell, index, reduced, x]);

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dayStrip}
      >
        {cell > 0 && index >= 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.dayThumb, { width: cell, transform: [{ translateX: x }] }]}
          />
        ) : null}
        {days.map((day) => {
          const selected = day.dateKey === selectedKey;
          return (
            <Pressable
              key={day.dateKey}
              accessibilityRole="button"
              accessibilityLabel={full.format(day.date)}
              accessibilityState={{ selected }}
              // The web build reads only the aria prop: the chosen day, said.
              aria-selected={selected}
              onPress={() => {
                if (selected) return;
                haptics.select();
                onSelect(day.dateKey);
              }}
              style={({ pressed }) => [
                styles.day,
                { width: cell > 0 ? cell : DAY_FALLBACK },
                !selected && styles.dayIdle,
                pressed && !selected && styles.dayPressed,
              ]}
            >
              <Text numberOfLines={1} style={[styles.dayLabel, selected && styles.dayLabelOn]}>
                {label(day)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Room above and below for the thumb's glow, which the scroller would clip.
  dayStrip: { gap: DAY_GAP, paddingVertical: space.xs },
  dayThumb: {
    position: 'absolute',
    top: space.xs,
    left: 0,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: colors.brandEdge,
    ...shadows.brand,
  },
  day: {
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
    // Transparent on the chosen day, so the thumb under it shows no edge.
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dayIdle: { backgroundColor: colors.surface, borderColor: colors.border },
  dayPressed: { borderColor: colors.borderStrong },
  dayLabel: { fontSize: 12.5, lineHeight: 16, color: colors.textMuted },
  dayLabelOn: { fontWeight: fontWeight.bold, color: colors.onPrimary },
});
