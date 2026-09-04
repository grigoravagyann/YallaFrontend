import { color, fontSize, space, tableStatusStyle, type TableStatus } from '@yalla/tokens';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, Pattern, Rect } from 'react-native-svg';
import type { FloorPlanMode } from './types';

const SWATCH = 18;

/**
 * Which states each surface explains.
 *
 * A diner never sees `held` or `outOfService` as actionable, so listing them
 * would be noise. Staff act on every state and need the full key.
 */
const LEGEND_ITEMS: Readonly<Record<FloorPlanMode, readonly TableStatus[]>> = {
  diner: ['free', 'reservedSoon', 'occupied', 'yourPick'],
  staff: ['free', 'reservedSoon', 'held', 'occupied', 'outOfService', 'yourPick'],
};

export interface LegendProps {
  readonly mode: FloorPlanMode;
  /**
   * Resolves a status token to translated copy. The package holds no strings of
   * its own; the app passes `t` bound to its `common` namespace.
   */
  readonly translate: (legendKey: string) => string;
}

/**
 * The floor plan key, driven entirely by `@yalla/tokens`.
 *
 * Both apps render this same component from the same tokens, so the diner's
 * legend and the waiter's legend cannot drift apart and start describing the
 * same colour differently.
 */
export function Legend({ mode, translate }: LegendProps) {
  return (
    <View style={styles.row} accessibilityRole="list">
      {LEGEND_ITEMS[mode].map((status) => {
        const style = tableStatusStyle[status];
        return (
          <View key={status} style={styles.item} accessibilityRole="text">
            <Svg width={SWATCH} height={SWATCH}>
              <Defs>{patternFor(status)}</Defs>
              <Rect
                x={1}
                y={1}
                width={SWATCH - 2}
                height={SWATCH - 2}
                rx={3}
                fill={style.fill}
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
                {...(style.strokeDash ? { strokeDasharray: style.strokeDash.join(',') } : {})}
              />
              {style.pattern === 'none' ? null : (
                <Rect
                  x={1}
                  y={1}
                  width={SWATCH - 2}
                  height={SWATCH - 2}
                  rx={3}
                  fill={`url(#legend-${status})`}
                />
              )}
            </Svg>
            <Text style={styles.label}>{translate(style.legendKey)}</Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Redundant encoding for the colour channel.
 *
 * Colour is never the only signal: roughly 1 in 12 men has a red/green
 * deficiency, and a sunlit terrace washes out hue on any phone. Every state
 * therefore also carries a distinct pattern and border treatment, so the plan
 * survives being read in greyscale.
 */
function patternFor(status: TableStatus) {
  const style = tableStatusStyle[status];
  if (style.pattern === 'none') return null;
  const id = `legend-${status}`;

  if (style.pattern === 'dots') {
    return (
      <Pattern id={id} patternUnits="userSpaceOnUse" width={5} height={5}>
        <Circle cx={2} cy={2} r={1} fill={style.stroke} opacity={0.55} />
      </Pattern>
    );
  }
  if (style.pattern === 'crosshatch') {
    return (
      <Pattern id={id} patternUnits="userSpaceOnUse" width={6} height={6}>
        <Line x1={0} y1={0} x2={6} y2={6} stroke={style.stroke} strokeWidth={1} opacity={0.5} />
        <Line x1={6} y1={0} x2={0} y2={6} stroke={style.stroke} strokeWidth={1} opacity={0.5} />
      </Pattern>
    );
  }
  return (
    <Pattern id={id} patternUnits="userSpaceOnUse" width={6} height={6}>
      <Line x1={0} y1={6} x2={6} y2={0} stroke={style.stroke} strokeWidth={1.5} opacity={0.5} />
    </Pattern>
  );
}

/** Exported so the plan can reuse the same `<Defs>` without duplicating them. */
export { patternFor as legendPatternFor };

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  label: {
    fontSize: fontSize.xs,
    color: color.textSecondary,
  },
});
