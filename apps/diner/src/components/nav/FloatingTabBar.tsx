import type { BottomTabBarProps, BottomTabNavigationOptions } from 'expo-router/js-tabs';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { colors, fontWeight, radius, shadows, type NavRouteName } from '../../theme';
import { Text } from '../Text';
import { SCAN_RISE, navBottomOffset, tabBarMetrics } from './metrics';
import { MAX_NAV_LABEL_SCALE, navLabelActiveStyle, navLabelStyle } from './navLabel';
import { NavGlyph } from './NavGlyph';
import { ScanFab } from './ScanFab';

export { NAV_CLEARANCE, SCAN_RISE, navBottomOffset, tabBarMetrics } from './metrics';

/** The route whose slot is the raised Scan circle rather than an icon + label. */
const SCAN_ROUTE: NavRouteName = 'scan';

/**
 * The floating bottom navigation: a white glass pill inset from the edges,
 * five slots — Explore · Bookings · Scan · Orders · Profile — labels always on
 * and all on one baseline, Scan as a white circle rising out of the middle.
 *
 * The current tab's glyph turns burgundy on a soft burgundy highlight sized to
 * the glyph, and its label is set in the brand ink. There is no blur library in
 * the app, so the "glass" is white at 96% — near enough opaque that a list
 * scrolling under it never shows through the labels — with a hairline edge and
 * a soft drop.
 *
 * Passed to expo-router as `tabBar={(props) => <FloatingTabBar {...props} />}`.
 * It reads the route names under `app/(tabs)/` to pick glyphs, the screen
 * `title` for labels, and honours `href: null` (expo-router hides such a route
 * by giving it `tabBarItemStyle: { display: 'none' }`).
 */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const press = (routeKey: string, routeName: string, focused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigation.navigate(routeName);
  };
  const longPress = (routeKey: string) => {
    navigation.emit({ type: 'tabLongPress', target: routeKey });
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: navBottomOffset(insets.bottom) }]}
    >
      {/* `box-none` on the stage and the row: only the pill and the pressables
          take touches, so the transparent band beside the Scan circle lets taps
          and scrolls through to the screen underneath. */}
      <View pointerEvents="box-none" style={styles.stage}>
        <View style={styles.pill} />
        <View pointerEvents="box-none" style={styles.row}>
          {state.routes.map((route, index) => {
            const descriptor = descriptors[route.key];
            const options: BottomTabNavigationOptions = descriptor?.options ?? {};
            if (isHidden(options)) return null;

            const focused = state.index === index;
            const label = labelOf(options, route.name);
            const a11yLabel = options.tabBarAccessibilityLabel ?? label;

            if (route.name === SCAN_ROUTE) {
              return (
                <ScanFab
                  key={route.key}
                  label={label}
                  active={focused}
                  accessibilityLabel={a11yLabel}
                  {...(options.tabBarButtonTestID ? { testID: options.tabBarButtonTestID } : {})}
                  onPress={() => press(route.key, route.name, focused)}
                  onLongPress={() => longPress(route.key)}
                  style={styles.scanSlot}
                />
              );
            }

            return (
              <TabItem
                key={route.key}
                routeName={route.name}
                label={label}
                accessibilityLabel={a11yLabel}
                focused={focused}
                {...(options.tabBarBadge !== undefined ? { badge: options.tabBarBadge } : {})}
                {...(options.tabBarButtonTestID ? { testID: options.tabBarButtonTestID } : {})}
                onPress={() => press(route.key, route.name, focused)}
                onLongPress={() => longPress(route.key)}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

function isHidden(options: BottomTabNavigationOptions): boolean {
  const flat = StyleSheet.flatten(options.tabBarItemStyle);
  return flat?.display === 'none';
}

function labelOf(options: BottomTabNavigationOptions, routeName: string): string {
  if (typeof options.tabBarLabel === 'string') return options.tabBarLabel;
  return options.title ?? routeName;
}

interface TabItemProps {
  readonly routeName: string;
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly focused: boolean;
  readonly badge?: number | string;
  readonly testID?: string;
  readonly onPress: () => void;
  readonly onLongPress: () => void;
}

function TabItem({
  routeName,
  label,
  accessibilityLabel,
  focused,
  badge,
  testID,
  onPress,
  onLongPress,
}: TabItemProps) {
  const reducedMotion = useReducedMotion();
  // The highlight fades and settles in under the glyph, so a change of tab is
  // a small movement rather than a blink.
  const [lit] = useState(() => new Animated.Value(focused ? 1 : 0));
  useEffect(() => {
    Animated.timing(lit, {
      toValue: focused ? 1 : 0,
      duration: reducedMotion ? 0 : 180,
      useNativeDriver: true,
    }).start();
  }, [focused, lit, reducedMotion]);
  const scale = lit.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      // The web build reads none of accessibilityState.
      aria-selected={focused}
      accessibilityLabel={accessibilityLabel}
      {...(testID ? { testID } : {})}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
    >
      <View style={styles.pair}>
        <View style={styles.iconBox}>
          <Animated.View
            pointerEvents="none"
            style={[styles.highlight, { opacity: lit, transform: [{ scale }] }]}
          />
          {/* In a positioned View of its own, so it paints above the
              highlight on the web build as well as on a phone. */}
          <View style={styles.glyph}>
            <NavGlyph
              routeName={routeName}
              size={tabBarMetrics.iconSize}
              color={focused ? colors.accent : colors.text}
            />
          </View>
          {badge !== undefined ? (
            <View style={styles.badge}>
              <Text numberOfLines={1} style={styles.badgeText}>
                {String(badge)}
              </Text>
            </View>
          ) : null}
        </View>
        {/* Held to the slot: a long label (Armenian at 360px) shrinks a little
            on a phone and is cut short, never into its neighbour. */}
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          maxFontSizeMultiplier={MAX_NAV_LABEL_SCALE}
          style={[styles.label, focused && styles.labelActive]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const STAGE_HEIGHT = tabBarMetrics.height + SCAN_RISE;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: tabBarMetrics.inset,
  },
  // Taller than the pill so the Scan circle's upper part is inside a parent's
  // bounds — Android drops touches that land outside the ancestor view. A
  // minimum, not a height: a large system font grows the Scan label, and the
  // circle above it must rise with it rather than push the label off the baseline.
  stage: { minHeight: STAGE_HEIGHT, justifyContent: 'flex-end' },
  pill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: tabBarMetrics.height,
    borderRadius: tabBarMetrics.radius,
    backgroundColor: colors.navBar,
    borderWidth: 1,
    borderColor: colors.navBorder,
    ...shadows.float,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: STAGE_HEIGHT,
    paddingHorizontal: tabBarMetrics.sidePadding,
  },
  item: {
    flex: 1,
    minWidth: 0,
    height: tabBarMetrics.height,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: tabBarMetrics.labelBottom,
  },
  itemPressed: { opacity: 0.7 },
  pair: {
    maxWidth: '100%',
    alignItems: 'center',
    gap: tabBarMetrics.labelGap,
  },
  iconBox: {
    width: tabBarMetrics.iconBoxWidth,
    height: tabBarMetrics.iconBoxHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  glyph: { position: 'relative' },
  label: { ...navLabelStyle, maxWidth: '100%' },
  labelActive: navLabelActiveStyle,
  scanSlot: { minHeight: STAGE_HEIGHT },
  badge: {
    position: 'absolute',
    top: -2,
    right: 0,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    // The ink as a fill: white on the bright red is 4.3:1, on this 6.5.
    backgroundColor: colors.errorStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: fontWeight.bold,
    color: colors.onErrorStrong,
  },
});
