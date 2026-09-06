import {
  color,
  fontFamily,
  fontWeight,
  radius,
  space,
  tableStatusStyle,
  type TableStatus,
} from '@yalla/tokens';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
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
import { AreaSwitcher, OVERVIEW, type AreaSelection } from './AreaSwitcher';
import { floorAreas, shouldUseAreaMode } from './areas';
import { FITTED, useFloorGestures, type FloorViewport } from './gestures';
import {
  AREA_MODE_MAX_WIDTH_PX,
  AUTO_SCALE_CAP,
  computeFloorLayout,
  MIN_ZOOM,
  scaleToClearHitRects,
  type LaidOutTable,
} from './layout';
import type { FloorFeature, FloorPlanData, FloorPlanMode, Rect as FloorRect } from './types';

/** Opacity applied to a table a diner cannot pick. */
const DIMMED_OPACITY = 0.35;

/** Overview is a map, not a control surface: its tables are drawn back. */
const OVERVIEW_TABLE_OPACITY = 0.75;

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
  /**
   * A table was tapped.
   *
   * The second argument is where that table was drawn, in this component's own
   * pixel space with the area switcher's height already added. Staff surfaces
   * anchor an action panel beside the table, and computing the rectangle again
   * outside the component would mean re-deriving area mode, zoom and pan — three
   * things only the component knows. A caller that does not need it ignores it.
   */
  readonly onTableTap?: (tableId: string, anchor: FloorRect) => void;
  /** Pixel box to draw into. Apps pass this from an onLayout / ResizeObserver measurement. */
  readonly viewport: { readonly width: number; readonly height: number };
  /**
   * Per-table secondary line, already translated and formatted by the app
   * (e.g. "42 min" for an occupied table). The package holds no copy of its own.
   */
  readonly tableAnnotation?: (table: LaidOutTable) => string | null;
  /** Accessible name for the whole plan, already translated. */
  readonly accessibilityLabel?: string;
  /**
   * Resolves the handful of strings area mode needs. Required only when area
   * mode can actually engage; without it the plan renders whole.
   */
  readonly translate?: ((key: string, params?: Record<string, unknown>) => string) | undefined;
  /**
   * `auto` (the default) falls back to one area at a time when the room does
   * not survive the viewport. `off` always draws the whole room — the editor
   * and its preview need the room entire.
   */
  readonly areaMode?: 'auto' | 'off';
  readonly areaModeMaxWidthPx?: number;
  /** Pinch, pan and double-tap. Off for a decorative or embedded plan. */
  readonly enableZoom?: boolean;
  /**
   * Ceiling on the scale an area may be *opened* at to clear its tap targets.
   * Only the tests and the dev harness pass it; see {@link AUTO_SCALE_CAP}.
   */
  readonly autoScaleCapPx?: number;
  /**
   * Drive zoom and pan from outside instead — the dev harness and the editor
   * preview do, so the values can be shown and reproduced.
   */
  readonly transform?: FloorViewport | undefined;
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
 * paints and decides *what* to lay out. That split is what keeps the scaling
 * rules testable without a renderer, and it is why the editor can share the
 * same function — see the package README.
 *
 * ## Why this component sometimes shows one area at a time
 *
 * Thirty tables each owed a 44pt tap target do not fit in a 380pt-wide phone.
 * The targets overlap three deep, taps resolve to the nearest centre, and a
 * diner selects table 11 while pointing at table 12 — on the screen the whole
 * product hangs on. So when the fitted layout reports overlapping hit regions
 * and the room has areas to divide it by, this renders one area at a time,
 * fitted to that area's own bounds. Eight tables then get the space thirty were
 * fighting over. A small or undivided room never sees any of it.
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
  translate,
  areaMode = 'auto',
  areaModeMaxWidthPx = AREA_MODE_MAX_WIDTH_PX,
  enableZoom = true,
  autoScaleCapPx = AUTO_SCALE_CAP,
  transform,
  testID,
}: FloorPlanProps) {
  const areas = useMemo(() => floorAreas(plan), [plan]);
  const [switcherHeight, setSwitcherHeight] = useState(0);

  /*
   * Does the whole room survive this viewport? The rule — divided room, narrow
   * viewport, copy in hand, and tap targets that actually collide at the fit —
   * lives in `shouldUseAreaMode` rather than here, because a caller budgeting
   * space for the switcher has to be able to ask the same question and get the
   * same answer. See that function for why overlap is the deciding term.
   */
  const areaModeAvailable = useMemo(
    () =>
      shouldUseAreaMode({
        plan,
        viewport,
        mode,
        partySize,
        areaMode,
        areaModeMaxWidthPx,
        canTranslate: Boolean(translate),
      }),
    [plan, viewport, mode, partySize, areaMode, areaModeMaxWidthPx, translate],
  );

  // Opens on the first area rather than the overview: a diner arriving wants
  // tables they can tap, and orientation is one tap away.
  const [chosen, setSelection] = useState<AreaSelection>(() => areas[0]?.name ?? OVERVIEW);

  /*
   * A selection is only meaningful for the plan it was made in. Switching
   * branch — or fixture, in the dev harness — can leave it naming an area this
   * room does not have, which would render an empty plan under a highlighted
   * tab. Deriving it rather than repairing it in an effect avoids a frame of
   * exactly that.
   */
  const selection: AreaSelection =
    chosen === OVERVIEW || areas.some((area) => area.name === chosen)
      ? chosen
      : (areas[0]?.name ?? OVERVIEW);
  const isOverview = selection === OVERVIEW;

  const gestures = useFloorGestures({ enabled: enableZoom && transform === undefined });
  const active: FloorViewport = transform ?? (enableZoom ? gestures.viewport : FITTED);
  // Stable across renders, unlike `gestures` itself, so the open effect below
  // is driven by the view it is opening rather than by every frame.
  const { openAt: openArea } = gestures;

  // The switcher takes real height off the top; laying the plan out against the
  // whole box would push the room under it.
  const planViewport = useMemo(
    () => ({ width: viewport.width, height: Math.max(0, viewport.height - switcherHeight) }),
    [viewport.width, viewport.height, switcherHeight],
  );

  // Hoisted: the auto-scale probe below and the layout itself must ask about
  // the same region, or the plan opens at a scale computed for a different one.
  const areaFilter = areaModeAvailable && !isOverview ? selection : null;

  /*
   * The whole room as a map rather than a control surface: tables are drawn
   * back and `handleTap` is withheld entirely below, so nothing in it can be
   * mis-tapped.
   *
   * That is why it is exempt from the auto-scale. A diner taps Overview to see
   * where the areas are in relation to each other, and this fixture's whole-room
   * view would otherwise open at 1.97x — showing a quarter of the room, which
   * is the one thing Overview exists not to do. Solving a tap-target problem on
   * a view that takes no taps would be solving it in the wrong place.
   */
  const overviewMode = areaModeAvailable && isOverview;

  /*
   * The scale this view has to open at for its tap targets to be distinguishable.
   *
   * Twice now an area has shipped opening with overlapping hit rects — eight bar
   * stools 2px short of the floor, then ten two-tops 8% short — and twice the
   * resolution was "pinch-zoom exists". It does, and nobody uses it, because
   * nobody pinches a floor plan that looks fine. The mis-tap is silent: the
   * diner selects the neighbouring table and finds out at the door.
   *
   * So the component computes the crossing point rather than reporting the
   * collision. Staff are excluded deliberately — a waiter needs the whole room
   * at a glance and taps it with context a stranger does not have, so that
   * screen keeps fit-to-viewport.
   */
  const autoScale = useMemo(() => {
    if (mode === 'staff') return MIN_ZOOM;
    if (overviewMode) return MIN_ZOOM;
    if (planViewport.width <= 0 || planViewport.height <= 0) return MIN_ZOOM;
    return scaleToClearHitRects(
      {
        canvasWidth: plan.canvasWidth,
        canvasHeight: plan.canvasHeight,
        tables: plan.tables,
        viewport: planViewport,
        mode,
        partySize,
        areaFilter,
      },
      { cap: autoScaleCapPx },
    );
  }, [
    plan.canvasWidth,
    plan.canvasHeight,
    plan.tables,
    planViewport,
    mode,
    partySize,
    areaFilter,
    overviewMode,
    autoScaleCapPx,
  ]);

  /*
   * Applied when a view *opens*, and never again.
   *
   * Keyed on what the scale was computed from, so switching area re-opens at
   * that area's own scale while a pinch — which changes the gesture viewport and
   * nothing in the key — is left alone. Re-applying on every render would make
   * the plan un-zoomable: each pinch would be overwritten on the next frame.
   */
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!enableZoom || transform !== undefined) return;
    if (planViewport.width <= 0 || planViewport.height <= 0) return;

    const key = [
      plan.branchId,
      areaFilter ?? (overviewMode ? ' overview' : ' whole'),
      Math.round(planViewport.width),
      Math.round(planViewport.height),
      mode,
      partySize,
    ].join('|');

    if (openedFor.current === key) return;
    openedFor.current = key;
    openArea(autoScale);
  }, [
    enableZoom,
    transform,
    plan.branchId,
    areaFilter,
    overviewMode,
    planViewport,
    mode,
    partySize,
    autoScale,
    openArea,
  ]);

  const layout = useMemo(
    () =>
      computeFloorLayout({
        canvasWidth: plan.canvasWidth,
        canvasHeight: plan.canvasHeight,
        tables: plan.tables,
        viewport: planViewport,
        mode,
        partySize,
        // Overview is the whole room; an area selection is that area alone.
        areaFilter,
        zoom: active.zoom,
        panX: active.panX,
        panY: active.panY,
      }),
    [
      plan.canvasWidth,
      plan.canvasHeight,
      plan.tables,
      planViewport,
      mode,
      partySize,
      areaFilter,
      active.zoom,
      active.panX,
      active.panY,
    ],
  );

  const areaLabels = useMemo(
    () => areaCentroids(layout.tables, layout.areaFilter !== null),
    [layout.tables, layout.areaFilter],
  );

  // In Overview the tables are a map. Tapping one would select a table the
  // diner cannot see the state of properly; tapping its *area* is the action.
  const overviewAreas = useMemo(
    () => (overviewMode ? areaOutlines(layout.tables) : []),
    [overviewMode, layout.tables],
  );

  const handleTap = gestures.isGesturing || overviewMode ? undefined : onTableTap;

  const body =
    layout.scale === 0 ? (
      // Before the first layout pass the viewport is 0x0. Drawing nothing is
      // correct; an unguarded divide would put NaN into every coordinate.
      <View style={{ width: planViewport.width, height: planViewport.height }} />
    ) : (
      <View
        style={{ width: planViewport.width, height: planViewport.height }}
        {...(enableZoom && transform === undefined ? gestures.panHandlers : {})}
      >
        <Svg width={planViewport.width} height={planViewport.height}>
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

          {/* Fixed features first, so tables sit on top of the bar counter.
              Only in the whole-room view: an area's own bounds rarely contain
              them, and half a bar counter is worse than none. */}
          {layout.areaFilter === null
            ? (plan.features ?? []).map((feature) => (
                <FeatureShape
                  key={feature.id}
                  feature={feature}
                  scale={layout.scale}
                  offsetX={layout.offsetX}
                  offsetY={layout.offsetY}
                />
              ))
            : null}

          {/* Overview: the areas themselves are the targets. */}
          {overviewAreas.map((outline) => (
            <G key={String(outline.name)}>
              <Rect
                x={outline.bounds.x}
                y={outline.bounds.y}
                width={outline.bounds.width}
                height={outline.bounds.height}
                rx={radius.soft}
                fill="none"
                stroke={outline.name === selection ? color.foreground : color.borderStrong}
                strokeWidth={outline.name === selection ? 2 : 1}
                strokeDasharray="4,4"
              />
              <Rect
                x={outline.bounds.x}
                y={outline.bounds.y}
                width={outline.bounds.width}
                height={outline.bounds.height}
                fill="transparent"
                onPress={() => setSelection(outline.name)}
                {...(outline.name ? { accessibilityLabel: outline.name } : {})}
              />
            </G>
          ))}

          {/* Area captions are context, not the primary read — no boxes, low
              contrast. Suppressed inside a single area, where the tab above
              already says which one you are in. */}
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
              onTap={handleTap}
              anchorOffsetY={areaModeAvailable ? switcherHeight : 0}
              faded={overviewMode}
            />
          ))}
        </Svg>
      </View>
    );

  if (!areaModeAvailable) {
    return (
      <View
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        style={{ width: viewport.width, height: viewport.height }}
      >
        {body}
      </View>
    );
  }

  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      style={{ width: viewport.width, height: viewport.height }}
    >
      <View
        onLayout={(event: LayoutChangeEvent) => setSwitcherHeight(event.nativeEvent.layout.height)}
      >
        <AreaSwitcher
          areas={areas}
          selected={selection}
          onSelect={setSelection}
          translate={translate!}
        />
      </View>
      {body}
    </View>
  );
}

interface TableShapeProps {
  readonly laid: LaidOutTable;
  readonly selected: boolean;
  readonly annotation: string | null;
  readonly onTap: ((tableId: string, anchor: FloorRect) => void) | undefined;
  /** Added to the anchor's `y`; the area switcher sits above the plan. */
  readonly anchorOffsetY: number;
  readonly faded: boolean;
}

function TableShape({ laid, selected, annotation, onTap, faded, anchorOffsetY }: TableShapeProps) {
  const { table, rect, center, hitRect } = laid;

  // Selection is its own visual treatment, distinct from all five states, so a
  // selected free table and a selected reservedSoon table read the same as
  // "your pick" rather than as two different things.
  const style = tableStatusStyle[selected ? 'yourPick' : (table.state as TableStatus)];
  const opacity = laid.dimmed ? DIMMED_OPACITY : faded ? OVERVIEW_TABLE_OPACITY : 1;
  const rotation = table.rotationDegrees;
  const transform = rotation === 0 ? undefined : `rotate(${rotation} ${center.x} ${center.y})`;

  const press =
    laid.selectable && onTap
      ? () => onTap(table.id, { ...laid.hitRect, y: laid.hitRect.y + anchorOffsetY })
      : undefined;

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
  suppress: boolean,
): readonly { name: string; x: number; y: number }[] {
  if (suppress) return [];

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

/**
 * A dashed box round each area's tables, in pixels, for the Overview map.
 *
 * Derived from where the tables actually are rather than from any stored
 * rectangle. Areas are a property of a table, not a container that owns one —
 * so a venue can move a table between areas without anyone maintaining
 * geometry, and two areas may legitimately interleave in space.
 */
function areaOutlines(tables: readonly LaidOutTable[]): readonly {
  name: string | null;
  bounds: { x: number; y: number; width: number; height: number };
}[] {
  const groups = new Map<
    string | null,
    { minX: number; minY: number; maxX: number; maxY: number }
  >();

  for (const laid of tables) {
    const name = laid.table.floorAreaName;
    const existing = groups.get(name) ?? {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    };
    for (const corner of laid.corners) {
      existing.minX = Math.min(existing.minX, corner.x);
      existing.minY = Math.min(existing.minY, corner.y);
      existing.maxX = Math.max(existing.maxX, corner.x);
      existing.maxY = Math.max(existing.maxY, corner.y);
    }
    groups.set(name, existing);
  }

  const pad = space.sm;
  return [...groups.entries()].map(([name, b]) => ({
    name,
    bounds: {
      x: b.minX - pad,
      y: b.minY - pad,
      width: b.maxX - b.minX + pad * 2,
      height: b.maxY - b.minY + pad * 2,
    },
  }));
}
