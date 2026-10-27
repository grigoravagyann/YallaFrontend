import { useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { colors, fontWeight, layout, space } from '../../theme';
import { Text } from '../Text';

export type PlaceTab = 'menu' | 'rooms' | 'reviews' | 'about';

/** The order the sections stand in on the page, and the tabs over them. */
export const placeTabs: readonly PlaceTab[] = ['menu', 'rooms', 'reviews', 'about'];

export interface PlaceTabsProps {
  readonly value: PlaceTab;
  readonly onChange: (tab: PlaceTab) => void;
  /** The sections the place has: Reviews goes where they are switched off. Default all four. */
  readonly tabs?: readonly PlaceTab[];
  readonly style?: StyleProp<ViewStyle>;
}

interface Span {
  readonly x: number;
  readonly width: number;
}

/** The underline is drawn this wide and scaled to each label, so it moves on the native driver. */
const BASE = 100;
const UNDERLINE = 2;

/**
 * Menu · Rooms · Reviews · About: labels set left to right over a hairline,
 * with a 2px amber underline that slides to the active one and takes its width.
 */
export function PlaceTabs({ value, onChange, tabs = placeTabs, style }: PlaceTabsProps) {
  const { t } = useTranslation('diner');
  const reduced = useReducedMotion();
  const [spans, setSpans] = useState<Readonly<Partial<Record<PlaceTab, Span>>>>({});
  const [x] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(0));
  // The first placement is a jump, not a slide in from the left edge.
  const placed = useRef(false);

  const span = spans[value];
  useEffect(() => {
    if (!span) return;
    // Scaled about its own centre: move the centre, then stretch to the label.
    const toX = span.x + span.width / 2 - BASE / 2;
    const toScale = span.width / BASE;
    if (reduced || !placed.current) {
      x.setValue(toX);
      scale.setValue(toScale);
      placed.current = true;
      return;
    }
    Animated.parallel([
      Animated.spring(x, { toValue: toX, useNativeDriver: true, speed: 18, bounciness: 4 }),
      Animated.spring(scale, { toValue: toScale, useNativeDriver: true, speed: 18, bounciness: 4 }),
    ]).start();
  }, [reduced, scale, span, x]);

  const measure = useCallback((tab: PlaceTab, event: LayoutChangeEvent) => {
    const { x: left, width } = event.nativeEvent.layout;
    setSpans((current) => {
      const known = current[tab];
      return known && known.x === left && known.width === width
        ? current
        : { ...current, [tab]: { x: left, width } };
    });
  }, []);

  return (
    <View accessibilityRole="tablist" style={[styles.row, style]}>
      <View pointerEvents="none" style={styles.track} />
      {tabs.map((tab) => {
        const selected = tab === value;
        return (
          <Pressable
            key={tab}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            // The web build reads none of accessibilityState.
            aria-selected={selected}
            onLayout={(event) => measure(tab, event)}
            onPress={() => onChange(tab)}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
          >
            <Text numberOfLines={1} style={[styles.label, selected && styles.labelActive]}>
              {t(`place.tab.${tab}`)}
            </Text>
          </Pressable>
        );
      })}
      {span ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.underline, { transform: [{ translateX: x }, { scaleX: scale }] }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.lg + space.xs, position: 'relative' },
  tab: { minHeight: layout.touchTarget, justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.regular, color: colors.textMuted },
  labelActive: { fontWeight: fontWeight.bold, color: colors.primary },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: colors.border,
  },
  underline: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: BASE,
    height: UNDERLINE,
    backgroundColor: colors.primary,
  },
});
