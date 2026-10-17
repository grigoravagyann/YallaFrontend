import type { BottomTabBarProps, BottomTabNavigationOptions } from 'expo-router/js-tabs';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  colors,
  fontWeight,
  iconSize,
  radius,
  shadows,
  space,
  typography,
  type NavRouteName,
} from '../../theme';
import { Text } from '../Text';
import { tabBarMetrics } from './metrics';
import { NavGlyph } from './NavGlyph';
import { ScanFab } from './ScanFab';

export { NAV_CLEARANCE, tabBarMetrics } from './metrics';

/** The route whose slot is the FAB rather than an icon + label. */
const SCAN_ROUTE: NavRouteName = 'scan';

/**
 * The floating bottom navigation: a dark espresso pill inset from the edges,
 * five slots, labels always on, Scan as a glowing circle rising out of the
 * middle. The current tab sits on a brand-brown highlight that slides from
 * slot to slot, so a change of tab is a movement, not a blink.
 *
 * Passed to expo-router as `tabBar={(props) => <FloatingTabBar {...props} />}`.
 * It reads the route names under `app/(tabs)/` to pick glyphs, the screen
 * `title` for labels, and honours `href: null` (expo-router hides such a route
 * by giving it `tabBarItemStyle: { display: 'none' }`).
 */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [rowWidth, setRowWidth] = useState(0);

  const visible = state.routes.filter((route) => {
    const options: BottomTabNavigationOptions = descriptors[route.key]?.options ?? {};
    return !isHidden(options);
  });
  const focusedRoute = state.routes[state.index];
  const focusedSlot = visible.findIndex((route) => route.key === focusedRoute?.key);
  // The highlight sits under an icon tab. Scan has its own circle and the
  // highlight steps aside (fades out) while it is the current screen.
  const highlightOn = focusedSlot >= 0 && focusedRoute?.name !== SCAN_ROUTE;
  const slotWidth = visible.length > 0 ? rowWidth / visible.length : 0;

  const [slide] = useState(() => new Animated.Value(Math.max(0, focusedSlot)));
  const [shown] = useState(() => new Animated.Value(highlightOn ? 1 : 0));
  // One node per width, not one per render: a new node mid-spring is re-attached.
  const slideX = useMemo(() => Animated.multiply(slide, slotWidth), [slide, slotWidth]);
  useEffect(() => {
    if (highlightOn) {
      if (reducedMotion) slide.setValue(focusedSlot);
      else
        Animated.spring(slide, {
          toValue: focusedSlot,
          useNativeDriver: true,
          speed: 18,
          bounciness: 6,
        }).start();
    }
    Animated.timing(shown, {
      toValue: highlightOn ? 1 : 0,
      duration: reducedMotion ? 0 : 160,
      useNativeDriver: true,
    }).start();
  }, [focusedSlot, highlightOn, reducedMotion, shown, slide]);

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
      style={[styles.wrap, { paddingBottom: insets.bottom + tabBarMetrics.bottomGap }]}
    >
      {/* `box-none` on the stage and the row: only the pill and the pressables
          take touches, so the transparent band beside the FAB lets taps and
          scrolls through to the screen underneath. */}
      <View pointerEvents="box-none" style={styles.stage}>
        <View style={styles.pill} />
        <View
          pointerEvents="box-none"
          style={styles.row}
          onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}
        >
          {/* Under the items and deaf to touches, so a press always lands on
              the tab itself. Drawn only once the row has been measured. */}
          {slotWidth > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.highlight,
                {
                  width: slotWidth - 2 * HIGHLIGHT_INSET,
                  opacity: shown,
                  transform: [{ translateX: slideX }],
                },
              ]}
            />
          ) : null}
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
  const tint = focused ? colors.onPrimary : colors.textMuted;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={accessibilityLabel}
      {...(testID ? { testID } : {})}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
    >
      <View style={styles.pair}>
        <View>
          <NavGlyph routeName={routeName} size={iconSize.nav} color={tint} />
          {badge !== undefined ? (
            <View style={styles.badge}>
              <Text numberOfLines={1} style={styles.badgeText}>
                {String(badge)}
              </Text>
            </View>
          ) : null}
        </View>
        {/* Held to the slot: a long label (Armenian at 375px) shrinks a little
            on a phone and is cut short, never into its neighbour. */}
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          style={[
            typography.navLabel,
            styles.label,
            { color: tint },
            focused && styles.labelActive,
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

/** Gap between the highlight and the edges of its slot and of the pill. */
const HIGHLIGHT_INSET = 3;

const STAGE_HEIGHT = tabBarMetrics.height + tabBarMetrics.fabRise;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: tabBarMetrics.inset,
  },
  // Taller than the pill so the FAB's upper half is inside a parent's bounds —
  // Android drops touches that land outside the ancestor view.
  stage: { height: STAGE_HEIGHT, justifyContent: 'flex-end' },
  pill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: tabBarMetrics.height,
    borderRadius: tabBarMetrics.radius,
    backgroundColor: colors.navBar,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadows.float,
  },
  highlight: {
    position: 'absolute',
    left: HIGHLIGHT_INSET,
    bottom: HIGHLIGHT_INSET,
    height: tabBarMetrics.height - 2 * HIGHLIGHT_INSET,
    borderRadius: tabBarMetrics.radius - HIGHLIGHT_INSET,
    backgroundColor: colors.brand,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: STAGE_HEIGHT,
  },
  item: {
    flex: 1,
    minWidth: 0,
    height: tabBarMetrics.height,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemPressed: { opacity: 0.7 },
  pair: {
    maxWidth: '100%',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: space.xs,
    paddingVertical: space.xs,
    borderRadius: radius.tile,
  },
  label: { maxWidth: '100%' },
  labelActive: { fontWeight: fontWeight.medium },
  scanSlot: { height: STAGE_HEIGHT },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
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
