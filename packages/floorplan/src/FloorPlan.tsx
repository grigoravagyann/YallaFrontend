import {
  color,
  fontFamily,
  fontWeight,
  radius,
  space,
  tableStatusStyle,
  type TableStatus,
} from '@yalla/tokens';
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  Pattern,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import { computeFloorLayout, type LaidOutTable } from './layout';
import type { FloorFeature, FloorPlanData, FloorPlanMode } from './types';

/** Opacity applied to a table a diner cannot pick. */
const DIMMED_OPACITY = 0.35;

/**
 * `exactOptionalPropertyTypes` forbids passing an explicit `undefined` for an
 * optional prop, so an absent dash pattern must omit the key entirely rather
 * than set it to undefined.
 */
function dashProps(dash: readonly number[] | null): { strokeDasharray?: string } {
  return dash ? { strokeDasharray: dash.join(',') } : {};
}

export interface FloorPlanProps {
  readonly plan: FloorPlanData;
  readonly mode: FloorPlanMode;
  /** Diner mode: tables seating fewer than this are dimmed. Ignored for staff. */
  readonly partySize?: number;
  readonly selectedTableId?: string | null;
  readonly onTableTap?: (tableId: string) => void;
  /** Pixel box to draw into. Apps pass this from an onLayout / ResizeObserver measurement. */
  readonly viewport: { readonly width: number; readonly height: number };
  /**
   * Per-table secondary line, already translated and formatted by the app
   * (e.g. "42 min" for an occupied table). The package holds no copy of its own.
   */
  readonly tableAnnotation?: (table: LaidOutTable) => string | null;
  /** Accessible name for the whole plan, already translated. */
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

/**
 * The shared top-down floor plan.
 *
 * One implementation, three surfaces: the diner phone, the staff tablet and the
 * admin panel (the last via `react-native-web`). A second implementation would
 * drift, and a diner tapping a table the staff tablet draws somewhere else is a
 * booking dispute rather than a rendering bug.
 *
 * All geometry comes from {@link computeFloorLayout}; this component only
 * paints. That split is what keeps the scaling rules testable without a
 * renderer.
 */
export function FloorPlan({
  plan,
  mode,
  partySize = 1,
  selectedTableId = null,
  onTableTap,
  viewport,
  tableAnnotation,
  accessibilityLabel,
  testID,
}: FloorPlanProps) {
  // Memoised on the inputs that actually change the geometry. This component
  // will later re-render on live SignalR pushes — several per second in a busy
  // venue — and none of those should trigger a full relayout unless the plan
  // itself or the viewport changed.
  const layout = useMemo(
    () =>
      computeFloorLayout({
        canvasWidth: plan.canvasWidth,
        canvasHeight: plan.canvasHeight,
        tables: plan.tables,
        viewport,
        mode,
        partySize,
      }),
    [plan.canvasWidth, plan.canvasHeight, plan.tables, viewport, mode, partySize],
  );

  const areaLabels = useMemo(() => areaCentroids(layout.tables), [layout.tables]);

  // Before the first layout pass the viewport is 0x0. Drawing nothing is
  // correct; an unguarded divide would put NaN into every coordinate.
  if (layout.scale === 0) {
    return <View testID={testID} style={{ width: viewport.width, height: viewport.height }} />;
  }

  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      style={{ width: viewport.width, height: viewport.height }}
    >
      <Svg width={viewport.width} height={viewport.height}>
        <Defs>{uniquePatterns()}</Defs>

        {/* Room floor */}
        <Rect
          x={layout.offsetX}
          y={layout.offsetY}
          width={layout.renderedWidth}
          height={layout.renderedHeight}
          fill={color.surface}
          stroke={color.borderStrong}
          strokeWidth={1}
          rx={radius.table}
        />

        {/* Fixed features first, so tables sit on top of the bar counter. */}
        {(plan.features ?? []).map((feature) => (
          <FeatureShape
            key={feature.id}
            feature={feature}
            scale={layout.scale}
            offsetX={layout.offsetX}
            offsetY={layout.offsetY}
          />
        ))}

        {/* Area labels are context, not the primary read — no boxes, low contrast. */}
        {areaLabels.map((area) => (
          <SvgText
            key={area.name}
            x={area.x}
            y={area.y}
            fontSize={11}
            fontFamily={fontFamily.body.web}
            fill={color.mutedForeground}
            opacity={0.75}
            textAnchor="middle"
          >
            {area.name}
          </SvgText>
        ))}

        {layout.tables.map((laid) => (
          <TableShape
            key={laid.id}
            laid={laid}
            selected={laid.id === selectedTableId}
            annotation={tableAnnotation?.(laid) ?? null}
            onTap={onTableTap}
          />
        ))}
      </Svg>
    </View>
  );
}

interface TableShapeProps {
  readonly laid: LaidOutTable;
  readonly selected: boolean;
  readonly annotation: string | null;
  readonly onTap: ((tableId: string) => void) | undefined;
}

function TableShape({ laid, selected, annotation, onTap }: TableShapeProps) {
  const { table, rect, center, hitRect } = laid;

  // Selection is its own visual treatment, distinct from all five states, so a
  // selected free table and a selected reservedSoon table read the same as
  // "your pick" rather than as two different things.
  const style = tableStatusStyle[selected ? 'yourPick' : (table.state as TableStatus)];
  const opacity = laid.dimmed ? DIMMED_OPACITY : 1;
  const rotation = table.rotationDegrees;
  const transform = rotation === 0 ? undefined : `rotate(${rotation} ${center.x} ${center.y})`;

  const press = laid.selectable && onTap ? () => onTap(table.id) : undefined;

  // The ring sits *outside* the shape in the canvas colour: the selected table
  // reads as lifted off the plan without a shadow, which this system does not
  // have. Drawn as a wider stroke underneath the shape so it needs no geometry.
  const ring = style.ring;
  const ringStrokeWidth = ring ? style.strokeWidth + ring.width * 2 : 0;

  return (
    <G>
      {/* Shape and pattern rotate with the table. */}
      <G transform={transform} opacity={opacity}>
        {ring ? (
          table.shape === 'round' ? (
            <Ellipse
              cx={center.x}
              cy={center.y}
              rx={rect.width / 2}
              ry={rect.height / 2}
              fill="none"
              stroke={ring.color}
              strokeWidth={ringStrokeWidth}
            />
          ) : (
            <Rect
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              rx={radius.table}
              fill="none"
              stroke={ring.color}
              strokeWidth={ringStrokeWidth}
            />
          )
        ) : null}

        {table.shape === 'round' ? (
          <Ellipse
            cx={center.x}
            cy={center.y}
            rx={rect.width / 2}
            ry={rect.height / 2}
            fill={style.fill}
            fillOpacity={style.fillOpacity}
            stroke={style.stroke}
            strokeWidth={style.strokeWidth}
            {...dashProps(style.strokeDash)}
          />
        ) : (
          <Rect
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            rx={radius.table}
            fill={style.fill}
            fillOpacity={style.fillOpacity}
            stroke={style.stroke}
            strokeWidth={style.strokeWidth}
            {...dashProps(style.strokeDash)}
          />
        )}

        {style.pattern === 'none' ? null : table.shape === 'round' ? (
          <Ellipse
            cx={center.x}
            cy={center.y}
            rx={rect.width / 2}
            ry={rect.height / 2}
            fill={`url(#fp-${style.pattern})`}
            pointerEvents="none"
          />
        ) : (
          <Rect
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            rx={radius.table}
            fill={`url(#fp-${style.pattern})`}
            pointerEvents="none"
          />
        )}
      </G>

      {/* Label is deliberately OUTSIDE the rotation group: a table rotated 45
          degrees still has to be readable without tilting your head. */}
      {laid.labelVisible ? (
        <SvgText
          x={center.x}
          y={center.y + (laid.seatsVisible ? -1 : laid.labelFontSize / 3)}
          fontSize={laid.labelFontSize}
          fontWeight={fontWeight.bold}
          fontFamily={fontFamily.body.web}
          fill={style.label}
          opacity={opacity}
          textAnchor="middle"
          pointerEvents="none"
        >
          {table.label}
        </SvgText>
      ) : null}

      {laid.seatsVisible ? (
        <SvgText
          x={center.x}
          y={center.y + laid.labelFontSize + 1}
          fontSize={laid.labelFontSize - 1}
          fontFamily={fontFamily.body.web}
          fill={color.mutedForeground}
          opacity={opacity}
          textAnchor="middle"
          pointerEvents="none"
        >
          {annotation ?? `${table.seats}`}
        </SvgText>
      ) : null}

      {/*
        Invisible hit region, painted last so it sits above the shape. At least
        44pt (64pt for staff) even when the table draws far smaller — a two-top
        in a big room can shrink below a fingertip, and shrinking the target
        with it would make the plan untappable on a phone.

        Rendered only when the table is actually tappable. An inert rect here
        would be dead weight, and relying on `pointerEvents="none"` to disable
        it does not survive react-native-svg's web build, which does not map
        that prop onto the DOM node.
      */}
      {press ? (
        <Rect
          x={hitRect.x}
          y={hitRect.y}
          width={hitRect.width}
          height={hitRect.height}
          fill="transparent"
          onPress={press}
          accessibilityLabel={table.label}
        />
      ) : null}
    </G>
  );
}

function FeatureShape({
  feature,
  scale,
  offsetX,
  offsetY,
}: {
  feature: FloorFeature;
  scale: number;
  offsetX: number;
  offsetY: number;
}) {
  const x = offsetX + feature.x * scale;
  const y = offsetY + feature.y * scale;
  const width = feature.width * scale;
  const height = feature.height * scale;

  // An entrance reads as a gap in the wall; a bar as a solid block. Both are
  // drawn low-contrast so they orient without competing with the tables.
  const isEntrance = feature.kind === 'entrance';

  return (
    <G opacity={0.55} pointerEvents="none">
      <Rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={radius.table}
        fill={isEntrance ? 'transparent' : color.paper}
        stroke={color.borderStrong}
        strokeWidth={isEntrance ? 2 : 1}
        {...(isEntrance ? { strokeDasharray: '5,4' } : {})}
      />
    </G>
  );
}

/**
 * One `<Pattern>` per distinct pattern kind, shared by every table using it.
 *
 * Patterns are ink at low opacity rather than a colour of their own, so the
 * same stripe reads on an amber fill and on a grey one. The pattern is the
 * redundant channel; it must not introduce a new hue to interpret.
 */
function uniquePatterns() {
  const styles = Object.values(tableStatusStyle);
  const kinds = new Set(styles.map((s) => s.pattern));
  kinds.delete('none');

  return [...kinds].map((kind) => {
    const id = `fp-${kind}`;
    const stroke = color.foreground;
    const angle = styles.find((s) => s.pattern === kind)?.patternAngleDegrees ?? 45;

    if (kind === 'dots') {
      return (
        <Pattern key={id} id={id} patternUnits="userSpaceOnUse" width={6} height={6}>
          <Circle cx={2} cy={2} r={1} fill={stroke} opacity={0.35} />
        </Pattern>
      );
    }
    if (kind === 'crosshatch') {
      return (
        <Pattern
          key={id}
          id={id}
          patternUnits="userSpaceOnUse"
          width={7}
          height={7}
          patternTransform={`rotate(${angle})`}
        >
          <Line x1={0} y1={3.5} x2={7} y2={3.5} stroke={stroke} strokeWidth={1} opacity={0.3} />
          <Line x1={3.5} y1={0} x2={3.5} y2={7} stroke={stroke} strokeWidth={1} opacity={0.3} />
        </Pattern>
      );
    }
    // Diagonal stripes: a horizontal rule rotated to the token's angle.
    return (
      <Pattern
        key={id}
        id={id}
        patternUnits="userSpaceOnUse"
        width={7}
        height={7}
        patternTransform={`rotate(${angle})`}
      >
        <Line x1={0} y1={3.5} x2={7} y2={3.5} stroke={stroke} strokeWidth={1.5} opacity={0.3} />
      </Pattern>
    );
  });
}

/** Centroid of each floor area, for the subtle area caption. */
function areaCentroids(
  tables: readonly LaidOutTable[],
): readonly { name: string; x: number; y: number }[] {
  const groups = new Map<string, { sumX: number; minY: number; count: number }>();

  for (const laid of tables) {
    const name = laid.table.floorAreaName;
    if (!name) continue;
    const existing = groups.get(name);
    if (existing) {
      existing.sumX += laid.center.x;
      existing.minY = Math.min(existing.minY, laid.rect.y);
      existing.count += 1;
    } else {
      groups.set(name, { sumX: laid.center.x, minY: laid.rect.y, count: 1 });
    }
  }

  return [...groups.entries()].map(([name, g]) => ({
    name,
    x: g.sumX / g.count,
    // Sit the caption just above the topmost table in the area.
    y: Math.max(g.minY - space.sm, 12),
  }));
}
