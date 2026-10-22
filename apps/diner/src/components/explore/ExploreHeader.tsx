import { Ionicons } from '@expo/vector-icons';
import { Animated, Image, Pressable, StyleSheet, View } from 'react-native';
import WORDMARK from '../../../assets/images/explore-wordmark.png';
import { actionIcon, colors, layout, radius, space } from '../../theme';
import { usePressScale } from '../motion/usePressScale';

/** The logo's SHURJ wordmark, 844 × 188 trimmed to its ink. */
const WORDMARK_HEIGHT = 28;
/** The capitals fill rows 2–154 of the 188: their middle sits this share above the image's. */
const CAPS_LIFT = (94 - 78) / 188;
const WORDMARK_WIDTH = Math.round((WORDMARK_HEIGHT * 844) / 188);
/** The unread dot on the bell, and the white ring round it. */
const DOT = 9;
const DOT_RING = 2;

export interface ExploreHeaderProps {
  /** The app's name, spoken for the wordmark. */
  readonly brandName: string;
  readonly mapAccessibilityLabel: string;
  readonly onMap: () => void;
  readonly bellLabel: string;
  readonly unread: boolean;
  readonly onBell: () => void;
}

/**
 * The top of Explore, on white: the map in the left corner, the SHURJ wordmark
 * from the logo in the middle, and the bell with its burgundy unread dot in
 * the right corner, both in the logo's burgundy. The two corners are the same round buttons, so the
 * wordmark sits truly centred.
 */
export function ExploreHeader({
  brandName,
  mapAccessibilityLabel,
  onMap,
  bellLabel,
  unread,
  onBell,
}: ExploreHeaderProps) {
  const press = usePressScale();
  return (
    <View style={styles.header}>
      <Animated.View style={press.style}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mapAccessibilityLabel}
          onPress={onMap}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          style={({ pressed }) => [styles.round, pressed && styles.pressed]}
        >
          <Ionicons name={actionIcon.map} size={20} color={colors.logoInk} />
        </Pressable>
      </Animated.View>
      <View style={styles.brand}>
        <Image
          source={WORDMARK}
          style={styles.wordmark}
          resizeMode="contain"
          accessibilityRole="header"
          accessibilityLabel={brandName}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={bellLabel}
        onPress={onBell}
        style={({ pressed }) => [styles.round, pressed && styles.pressed]}
      >
        <Ionicons name="notifications-outline" size={21} color={colors.logoInk} />
        {unread ? <View pointerEvents="none" style={styles.unreadDot} /> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: layout.screenPadding,
    // Right under the status bar: on a phone the row sat a full step lower and looked dropped.
    paddingTop: 0,
  },
  brand: { flex: 1, minWidth: 0, alignItems: 'center' },
  // The R's and J's tails hang below the capitals: moved down by that much, the
  // capitals' middle is level with the map's and the bell's.
  wordmark: {
    width: WORDMARK_WIDTH,
    height: WORDMARK_HEIGHT,
    transform: [{ translateY: Math.round(WORDMARK_HEIGHT * CAPS_LIFT * 10) / 10 }],
  },
  round: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.logoInk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
  unreadDot: {
    position: 'absolute',
    top: 9 - DOT_RING,
    right: 10 - DOT_RING,
    width: DOT + 2 * DOT_RING,
    height: DOT + 2 * DOT_RING,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    // A white ring, so the dot reads where it overlaps the bell's stroke.
    borderWidth: DOT_RING,
    borderColor: colors.surface,
  },
});
