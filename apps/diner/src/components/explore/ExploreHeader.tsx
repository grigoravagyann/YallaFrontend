import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Animated, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { initialsOf } from '../../lib/initials';
import { actionIcon, colors, displayWeight, fontWeight, layout, radius, space } from '../../theme';
import { usePressScale } from '../motion/usePressScale';
import { PhotoImage } from '../PhotoImage';
import { Text } from '../Text';
import { AVATAR, mapPillCompact } from './headerFit';

/** The unread dot on the bell, and the white ring round it. */
const DOT = 9;
const DOT_RING = 2;
export interface ExploreHeaderProps {
  readonly greeting: string;
  readonly name: string;
  /** The name is the app's own (nobody signed in): set as the wordmark, letter-spaced. */
  readonly nameIsBrand: boolean;
  readonly photoUrl: string | undefined;
  readonly mapLabel: string;
  readonly mapAccessibilityLabel: string;
  readonly onMap: () => void;
  readonly bellLabel: string;
  readonly unread: boolean;
  readonly onBell: () => void;
}

/**
 * The top of Explore, on the ivory ground: the diner's initial in a white
 * circle, "Good evening," over their name in the serif, the Map pill and the
 * bell with its burgundy unread dot.
 */
export function ExploreHeader({
  greeting,
  name,
  nameIsBrand,
  photoUrl,
  mapLabel,
  mapAccessibilityLabel,
  onMap,
  bellLabel,
  unread,
  onBell,
}: ExploreHeaderProps) {
  const [rowWidth, setRowWidth] = useState(0);
  const [greetingWidth, setGreetingWidth] = useState(0);
  const [labelWidth, setLabelWidth] = useState(0);
  const widthOf = (set: (width: number) => void) => (event: LayoutChangeEvent) =>
    set(Math.ceil(event.nativeEvent.layout.width));
  const compact = mapPillCompact(rowWidth, greetingWidth, labelWidth);
  return (
    <View style={styles.header} onLayout={widthOf(setRowWidth)}>
      {/* Unseen copies at their natural width, to decide whether the pill keeps its word. */}
      <View
        pointerEvents="none"
        style={styles.measure}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text numberOfLines={1} style={styles.greeting} onLayout={widthOf(setGreetingWidth)}>
          {greeting}
        </Text>
        <Text numberOfLines={1} style={styles.pillLabel} onLayout={widthOf(setLabelWidth)}>
          {mapLabel}
        </Text>
      </View>
      <Avatar photoUrl={photoUrl} name={name} />
      <View
        style={styles.hello}
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${greeting} ${name}`}
      >
        <Text numberOfLines={1} style={styles.greeting}>
          {greeting}
        </Text>
        <Text display numberOfLines={1} style={[styles.name, nameIsBrand && styles.wordmark]}>
          {name}
        </Text>
      </View>
      <MapPill
        label={mapLabel}
        accessibilityLabel={mapAccessibilityLabel}
        compact={compact}
        onPress={onMap}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={bellLabel}
        onPress={onBell}
        style={({ pressed }) => [styles.round, pressed && styles.pressed]}
      >
        <Ionicons name="notifications-outline" size={21} color={colors.text} />
        {unread ? <View pointerEvents="none" style={styles.unreadDot} /> : null}
      </Pressable>
    </View>
  );
}

/**
 * The diner's photo, or their initial in the serif on a white circle — also
 * when the photo will not load, rather than a broken-image glyph where a face
 * should be.
 */
function Avatar({
  photoUrl,
  name,
}: {
  readonly photoUrl: string | undefined;
  readonly name: string;
}) {
  // The photo that failed, not a flag, so a new photo gets its own attempt.
  const [failed, setFailed] = useState<string | null>(null);
  if (photoUrl && failed !== photoUrl) {
    return (
      <PhotoImage
        source={photoUrl}
        style={styles.avatar}
        onLoad={(size) => {
          if (!size) setFailed(photoUrl);
        }}
      />
    );
  }
  return (
    <View
      style={[styles.avatar, styles.avatarInitial]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Text display style={styles.initial}>
        {initialsOf(name).charAt(0)}
      </Text>
    </View>
  );
}

/** The way to the map: a white pill with its glyph and a short label, or the glyph alone. */
function MapPill({
  label,
  accessibilityLabel,
  compact,
  onPress,
}: {
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly compact: boolean;
  readonly onPress: () => void;
}) {
  const press = usePressScale();
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) => [compact ? styles.round : styles.pill, pressed && styles.pressed]}
      >
        <Ionicons name={actionIcon.map} size={20} color={colors.text} />
        {compact ? null : (
          <Text numberOfLines={1} style={styles.pillLabel}>
            {label}
          </Text>
        )}
      </Pressable>
    </Animated.View>
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
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.controlBorder,
  },
  avatarInitial: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontSize: 21,
    lineHeight: 26,
    fontWeight: displayWeight.bold,
    color: colors.text,
  },
  hello: { flex: 1, minWidth: 0 },
  measure: { position: 'absolute', left: 0, top: 0, opacity: 0, alignItems: 'flex-start' },
  greeting: { fontSize: 14, lineHeight: 18, color: colors.greeting },
  name: {
    fontSize: 25,
    lineHeight: 30,
    fontWeight: displayWeight.semibold,
    color: colors.text,
  },
  wordmark: { letterSpacing: 2.5 },
  pill: {
    height: layout.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingLeft: 13,
    paddingRight: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.controlBorder,
  },
  pillLabel: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.medium, color: colors.text },
  round: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.controlBorder,
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
