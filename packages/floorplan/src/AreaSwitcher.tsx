import { color, fontSize, fontWeight, radius, space, touchTarget } from '@yalla/tokens';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { FloorAreaSummary } from './areas';

/** The pseudo-area that draws the whole room for orientation. */
export const OVERVIEW = '__overview__' as const;

/** What the switcher is currently showing: an area name, or the overview. */
export type AreaSelection = string | null | typeof OVERVIEW;

export interface AreaSwitcherProps {
  readonly areas: readonly FloorAreaSummary[];
  readonly selected: AreaSelection;
  readonly onSelect: (selection: AreaSelection) => void;
  /**
   * Resolves the two strings this control needs — the overview tab and the
   * name for tables in no area — plus the free count. The package holds no
   * copy of its own; the app passes `t` bound to its namespace.
   */
  readonly translate: (key: string, params?: Record<string, unknown>) => string;
  readonly testID?: string;
}

/**
 * The tabs across the top of a floor plan on a narrow screen.
 *
 * Each tab carries its own free-table count, which is the number a diner is
 * scanning for. Without it, choosing between "Windows" and "Terrace" is a
 * guess, and the usual outcome is tapping through every area to find the one
 * with a table free.
 *
 * Horizontally scrollable rather than wrapping: a venue with five areas would
 * otherwise take two rows out of the plan itself, and the plan is the screen.
 */
export function AreaSwitcher({ areas, selected, onSelect, translate, testID }: AreaSwitcherProps) {
  const options: { key: AreaSelection; label: string; free: number | null }[] = [
    { key: OVERVIEW, label: translate('floorPlan.overview'), free: null },
    ...areas.map((area) => ({
      key: area.name,
      label: area.name ?? translate('floorPlan.otherTables'),
      free: area.freeCount,
    })),
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      testID={testID}
    >
      {options.map((option) => {
        const active = option.key === selected;
        return (
          <Pressable
            key={String(option.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={
              option.free === null
                ? option.label
                : translate('floorPlan.areaFree', { area: option.label, count: option.free })
            }
            onPress={() => onSelect(option.key)}
            style={({ pressed }) => [
              styles.tab,
              active && styles.tabActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {option.label}
            </Text>
            {option.free === null ? null : (
              <Text style={[styles.count, active && styles.countActive]}>
                {translate('floorPlan.freeCount', { count: option.free })}
              </Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
  },
  tab: {
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  // The plan is on screen, so the beige fill carries an ink edge: the fill
  // alone is 1.03:1 from an out-of-service table, the edge 3.13:1.
  tabActive: {
    borderColor: color.primaryInk,
    backgroundColor: color.primaryOnFloorPlan,
  },
  pressed: { transform: [{ scale: 0.97 }] },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: color.foreground,
  },
  labelActive: { color: color.primaryForeground },
  count: {
    fontSize: fontSize.xs,
    color: color.mutedForeground,
  },
  countActive: { color: color.primaryForeground },
});
