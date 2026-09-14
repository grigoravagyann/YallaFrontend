import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps, BottomTabNavigationOptions } from 'expo-router/js-tabs';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  colors,
  fontWeight,
  iconSize,
  navIcons,
  radius,
  shadows,
  space,
  typography,
  type IconPair,
  type NavRouteName,
} from '../../theme';
import { Text } from '../Text';
import { tabBarMetrics } from './metrics';
import { ScanFab } from './ScanFab';

export { NAV_CLEARANCE, tabBarMetrics } from './metrics';

/** The route whose slot is the FAB rather than an icon + label. */
const SCAN_ROUTE: NavRouteName = 'scan';

const FALLBACK_ICONS: IconPair = { outline: 'ellipse-outline', filled: 'ellipse' };

/**
 * The floating bottom navigation: a white pill inset from the edges, five
 * slots, labels always on, Scan as a brown circle rising out of the middle.
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
      style={[styles.wrap, { paddingBottom: insets.bottom + tabBarMetrics.bottomGap }]}
    >
      {/* `box-none` on the stage and the row: only the pill and the pressables
          take touches, so the transparent band beside the FAB lets taps and
          scrolls through to the screen underneath. */}
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
  const [lift] = useState(() => new Animated.Value(focused ? 1 : 0));

  useEffect(() => {
    Animated.spring(lift, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      speed: 24,
      bounciness: 5,
    }).start();
  }, [focused, lift]);

  const translateY = lift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -tabBarMetrics.activeLift],
  });

  const icons = (navIcons as Record<string, IconPair | undefined>)[routeName] ?? FALLBACK_ICONS;
  const tint = focused ? colors.primary : colors.textMuted;

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
      <Animated.View
        style={[styles.pair, { transform: [{ translateY }] }, focused && styles.pairLifted]}
      >
        <View>
          <Ionicons
            name={focused ? icons.filled : icons.outline}
            size={iconSize.nav}
            color={tint}
          />
          {badge !== undefined ? (
            <View style={styles.badge}>
              <Text numberOfLines={1} style={styles.badgeText}>
                {String(badge)}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          numberOfLines={1}
          style={[typography.navLabel, { color: tint }, focused && styles.labelActive]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

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
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadows.float,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: STAGE_HEIGHT,
  },
  item: {
    flex: 1,
    height: tabBarMetrics.height,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemPressed: { opacity: 0.7 },
  pair: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.xs,
    borderRadius: radius.tile,
  },
  pairLifted: {},
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
    backgroundColor: colors.errorInk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, lineHeight: 12, fontWeight: fontWeight.bold, color: colors.onPrimary },
});
