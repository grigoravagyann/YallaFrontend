import { color, space } from '@yalla/tokens';
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { G, Rect } from 'react-native-svg';
import { fitCanvas } from './geometry';
import type { FloorPlanProps } from './types';

/**
 * The shared top-down floor plan.
 *
 * One implementation, three surfaces: the diner phone, the staff tablet, and the
 * admin panel — the last via `react-native-web`, which maps `View` to a `div`
 * and `react-native-svg` to real SVG. Keeping a single implementation is the
 * point of this package: two copies would drift, and a diner tapping a table
 * that the staff tablet draws somewhere else is a booking dispute.
 *
 * This task ships the component signature and the scaling pipeline only. Tables
 * are not drawn yet — a later task fills in the shapes, labels, status colours
 * and hit areas, all of which consume {@link fitCanvas} rather than re-deriving
 * their own geometry.
 */
export function FloorPlan({
  tables,
  canvas,
  viewport,
  selectedTableId: _selectedTableId,
  onTableTap: _onTableTap,
  padding = space.md,
  accessibilityLabel,
  tableAccessibilityLabel: _tableAccessibilityLabel,
  testID,
}: FloorPlanProps) {
  const fit = useMemo(() => fitCanvas(canvas, viewport, padding), [canvas, viewport, padding]);

  // Before the first layout pass the viewport is 0x0. Drawing nothing is correct;
  // an unguarded divide would put NaN into every coordinate.
  if (fit.scale === 0) {
    return <View testID={testID} style={{ width: viewport.width, height: viewport.height }} />;
  }

  return (
    <View
      testID={testID}
      accessible={false}
      accessibilityLabel={accessibilityLabel}
      style={{ width: viewport.width, height: viewport.height }}
    >
      <Svg width={viewport.width} height={viewport.height}>
        {/* Canvas units in, pixels out. Every child below draws in canvas units. */}
        <G x={fit.offsetX} y={fit.offsetY} scale={fit.scale}>
          <Rect
            x={0}
            y={0}
            width={canvas.width}
            height={canvas.height}
            fill={color.surface}
            stroke={color.border}
            strokeWidth={1 / fit.scale}
          />

          {/*
            Tables render here in a later task, keyed by `table.id` and styled from
            `tableStatusStyle` in @yalla/tokens. `tables` is destructured above so
            the prop contract is exercised by the typechecker in the meantime.
          */}
          {tables.length === 0 ? null : null}
        </G>
      </Svg>
    </View>
  );
}
