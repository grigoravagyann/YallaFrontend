import { computeFloorLayout, type LaidOutTable } from '@yalla/floorplan';
import type { FloorTable } from '@yalla/floorplan/types';
import { color, radius, tableStatusStyle } from '@yalla/tokens';
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { EditorAction, EditorTable, PlanSnapshot } from './reducer';

/**
 * The editor canvas.
 *
 * It lays out through the **same `computeFloorLayout` the diner and staff apps
 * use**. That is not tidiness: a second geometry implementation is how the
 * editor and the viewer end up disagreeing about where table 7 is, and the
 * person who finds out is a diner standing next to the wrong table. The editor
 * adds interaction on top and converts pixels back into floor units through
 * `layout.scale` — it never does its own fitting.
 *
 * Interaction is previewed locally and committed once, on release. Dispatching
 * a reducer action per pointer frame would put sixty steps on the undo stack
 * for one drag, and an undo stack you have to press sixty times is one nobody
 * trusts.
 */

const HANDLE_PX = 9;
const ROTATE_HANDLE_OFFSET_PX = 26;

type ResizeHandle = 'nw' | 'ne' | 'se' | 'sw';

type Drag =
  | { kind: 'move'; fromX: number; fromY: number; dx: number; dy: number }
  | {
      kind: 'resize';
      id: string;
      handle: ResizeHandle;
      fromX: number;
      fromY: number;
      rect: { x: number; y: number; width: number; height: number };
    }
  | { kind: 'rotate'; id: string; degrees: number; free: boolean }
  | { kind: 'marquee'; fromX: number; fromY: number; toX: number; toY: number };

export interface EditorCanvasProps {
  readonly plan: PlanSnapshot;
  readonly selection: readonly string[];
  readonly dispatch: (action: EditorAction) => void;
  readonly gridEnabled: boolean;
  readonly gridSize: number;
  readonly width: number;
  readonly height: number;
  /** Labels the server refused; drawn with a warning outline. */
  readonly invalidLabels?: readonly string[];
  readonly zoom?: number;
}

/**
 * The editor draws every table in its `free` treatment, whatever state it is
 * in right now. A plan is a drawing of furniture, not a live floor — colouring
 * a table red here would mean "somebody is sitting at it", which is not a fact
 * about the layout and not something the editor can change.
 */
function toViewerTable(table: EditorTable): FloorTable {
  return {
    id: table.id,
    label: table.label,
    seats: table.seats,
    x: table.x,
    y: table.y,
    width: table.width,
    height: table.height,
    rotationDegrees: table.rotationDegrees,
    shape: table.shape,
    floorAreaName: null,
    isBookable: table.isBookable,
    state: 'free',
    nextReservationStartUtc: null,
  };
}

export function EditorCanvas({
  plan,
  selection,
  dispatch,
  gridEnabled,
  gridSize,
  width,
  height,
  invalidLabels = [],
  zoom = 1,
}: EditorCanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const layout = useMemo(
    () =>
      computeFloorLayout({
        canvasWidth: plan.floorWidth,
        canvasHeight: plan.floorHeight,
        tables: plan.tables.map(toViewerTable),
        viewport: { width, height },
        // Staff mode: everything is selectable and nothing is dimmed, which is
        // what an editor needs. Tap-target expansion is irrelevant here — a
        // mouse has no fingertip — so the floor is set to zero.
        mode: 'staff',
        minTapTargetPx: 0,
        zoom,
      }),
    [plan.floorWidth, plan.floorHeight, plan.tables, width, height, zoom],
  );

  const byId = useMemo(() => new Map(layout.tables.map((t) => [t.id, t])), [layout.tables]);
  const selected = useMemo(() => new Set(selection), [selection]);
  const invalid = useMemo(() => new Set(invalidLabels), [invalidLabels]);

  /** Pixels on screen to floor-plan units. The one conversion the editor owns. */
  const toUnits = useCallback(
    (px: number) => (layout.scale > 0 ? px / layout.scale : 0),
    [layout.scale],
  );

  const pointAt = useCallback((event: ReactPointerEvent): { x: number; y: number } => {
    const rect = svgRef.current?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  }, []);

  const startTableDrag = useCallback(
    (event: ReactPointerEvent, laid: LaidOutTable) => {
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      const point = pointAt(event);

      // Clicking an unselected table selects it first, so a drag always moves
      // what you are pointing at. Shift adds to the selection instead.
      if (!selected.has(laid.id)) {
        dispatch({ type: 'select', ids: [laid.id], additive: event.shiftKey });
      } else if (event.shiftKey) {
        dispatch({ type: 'select', ids: selection.filter((id) => id !== laid.id) });
        return;
      }

      setDrag({ kind: 'move', fromX: point.x, fromY: point.y, dx: 0, dy: 0 });
    },
    [dispatch, pointAt, selected, selection],
  );

  const startResize = useCallback(
    (event: ReactPointerEvent, laid: LaidOutTable, handle: ResizeHandle) => {
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      const point = pointAt(event);
      const table = plan.tables.find((t) => t.id === laid.id);
      if (!table) return;
      dispatch({ type: 'select', ids: [laid.id] });
      setDrag({
        kind: 'resize',
        id: laid.id,
        handle,
        fromX: point.x,
        fromY: point.y,
        rect: { x: table.x, y: table.y, width: table.width, height: table.height },
      });
    },
    [dispatch, pointAt, plan.tables],
  );

  const startRotate = useCallback(
    (event: ReactPointerEvent, laid: LaidOutTable) => {
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      dispatch({ type: 'select', ids: [laid.id] });
      setDrag({ kind: 'rotate', id: laid.id, degrees: laid.table.rotationDegrees, free: false });
    },
    [dispatch],
  );

  const onBackgroundDown = useCallback(
    (event: ReactPointerEvent) => {
      const point = pointAt(event);
      event.currentTarget.setPointerCapture(event.pointerId);
      if (!event.shiftKey) dispatch({ type: 'clearSelection' });
      setDrag({ kind: 'marquee', fromX: point.x, fromY: point.y, toX: point.x, toY: point.y });
    },
    [dispatch, pointAt],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      if (!drag) return;
      const point = pointAt(event);

      if (drag.kind === 'move') {
        setDrag({ ...drag, dx: point.x - drag.fromX, dy: point.y - drag.fromY });
        return;
      }
      if (drag.kind === 'marquee') {
        setDrag({ ...drag, toX: point.x, toY: point.y });
        return;
      }
      if (drag.kind === 'resize') {
        const dx = toUnits(point.x - drag.fromX);
        const dy = toUnits(point.y - drag.fromY);
        setDrag({ ...drag, rect: resizedRect(drag, dx, dy) });
        return;
      }
      // Rotate: the angle from the table's centre to the pointer. Alt frees it
      // from the 15-degree snap the reducer otherwise applies.
      const laid = byId.get(drag.id);
      if (!laid) return;
      const degrees =
        (Math.atan2(point.y - laid.center.y, point.x - laid.center.x) * 180) / Math.PI + 90;
      setDrag({ ...drag, degrees, free: event.altKey });
    },
    [drag, pointAt, toUnits, byId],
  );

  const onPointerUp = useCallback(() => {
    if (!drag) return;

    // One action per gesture: one undo step per gesture.
    if (drag.kind === 'move' && (drag.dx !== 0 || drag.dy !== 0)) {
      dispatch({ type: 'move', dx: toUnits(drag.dx), dy: toUnits(drag.dy) });
    } else if (drag.kind === 'resize') {
      dispatch({ type: 'resize', id: drag.id, rect: drag.rect });
    } else if (drag.kind === 'rotate') {
      dispatch({ type: 'rotate', id: drag.id, degrees: drag.degrees, free: drag.free });
    } else if (drag.kind === 'marquee') {
      const box = marqueeBox(drag);
      // A marquee has to be a deliberate drag, not a stray click.
      if (box.width > 3 || box.height > 3) {
        const hits = layout.tables
          .filter((laid) => intersects(box, boundsOfCorners(laid)))
          .map((laid) => laid.id);
        if (hits.length > 0) dispatch({ type: 'select', ids: hits, additive: true });
      }
    }

    setDrag(null);
  }, [drag, dispatch, toUnits, layout.tables]);

  const previewDelta = drag?.kind === 'move' ? { dx: drag.dx, dy: drag.dy } : { dx: 0, dy: 0 };

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="editor-canvas"
      onPointerDown={onBackgroundDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="application"
    >
      {/* The room */}
      <rect
        x={layout.offsetX}
        y={layout.offsetY}
        width={layout.renderedWidth}
        height={layout.renderedHeight}
        fill={color.surface}
        stroke={color.borderStrong}
        strokeWidth={1}
        rx={radius.table}
      />

      {gridEnabled && layout.scale > 0 ? (
        <GridLines layout={layout} gridSize={gridSize} plan={plan} />
      ) : null}

      {layout.tables.map((laid) => {
        const table = plan.tables.find((t) => t.id === laid.id);
        if (!table) return null;
        const isSelected = selected.has(laid.id);
        const moving = isSelected && drag?.kind === 'move';
        const resizing = drag?.kind === 'resize' && drag.id === laid.id;
        const rotating = drag?.kind === 'rotate' && drag.id === laid.id;

        const rect = resizing
          ? {
              x: layout.offsetX + drag.rect.x * layout.scale,
              y: layout.offsetY + drag.rect.y * layout.scale,
              width: drag.rect.width * layout.scale,
              height: drag.rect.height * layout.scale,
            }
          : {
              x: laid.rect.x + (moving ? previewDelta.dx : 0),
              y: laid.rect.y + (moving ? previewDelta.dy : 0),
              width: laid.rect.width,
              height: laid.rect.height,
            };
        const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        const degrees = rotating ? drag.degrees : table.rotationDegrees;

        return (
          <g key={laid.id}>
            <g transform={`rotate(${degrees} ${centre.x} ${centre.y})`}>
              {table.shape === 'round' ? (
                <ellipse
                  cx={centre.x}
                  cy={centre.y}
                  rx={rect.width / 2}
                  ry={rect.height / 2}
                  {...tableSkin(table, isSelected, invalid.has(table.label))}
                  onPointerDown={(event) => startTableDrag(event, laid)}
                />
              ) : (
                <rect
                  x={rect.x}
                  y={rect.y}
                  width={rect.width}
                  height={rect.height}
                  rx={radius.table}
                  {...tableSkin(table, isSelected, invalid.has(table.label))}
                  onPointerDown={(event) => startTableDrag(event, laid)}
                />
              )}
            </g>

            <text
              x={centre.x}
              y={centre.y + 4}
              textAnchor="middle"
              fontSize={12}
              fontWeight={700}
              fill={table.isActive ? color.foreground : color.mutedForeground}
              pointerEvents="none"
            >
              {table.label}
            </text>

            {isSelected && !moving ? (
              <SelectionChrome
                rect={rect}
                degrees={degrees}
                onResize={(event, handle) => startResize(event, laid, handle)}
                onRotate={(event) => startRotate(event, laid)}
              />
            ) : null}
          </g>
        );
      })}

      {drag?.kind === 'marquee'
        ? (() => {
            const box = marqueeBox(drag);
            return (
              <rect
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                fill={color.greenTint}
                fillOpacity={0.35}
                stroke={color.primary}
                strokeDasharray="4,3"
                pointerEvents="none"
              />
            );
          })()
        : null}
    </svg>
  );
}

/**
 * The editor's own table skin.
 *
 * `free` for a live table, whatever the floor is doing right now, and visibly
 * struck through for a deactivated one — a table the server kept because it
 * has bookings against it. A person who deletes table 7 and sees it still
 * there with no explanation deletes it again.
 */
function tableSkin(table: EditorTable, isSelected: boolean, isInvalid: boolean) {
  const free = tableStatusStyle.free;
  if (!table.isActive) {
    return {
      fill: color.outOfService,
      fillOpacity: 0.35,
      stroke: color.borderStrong,
      strokeWidth: 1,
      strokeDasharray: '5,4',
      cursor: 'pointer',
    };
  }
  return {
    fill: free.fill,
    fillOpacity: table.isBookable ? 1 : 0.5,
    stroke: isInvalid ? color.danger : isSelected ? color.foreground : free.stroke,
    strokeWidth: isInvalid || isSelected ? 2 : 1,
    cursor: 'move',
  };
}

function SelectionChrome({
  rect,
  degrees,
  onResize,
  onRotate,
}: {
  rect: { x: number; y: number; width: number; height: number };
  degrees: number;
  onResize: (event: ReactPointerEvent, handle: ResizeHandle) => void;
  onRotate: (event: ReactPointerEvent) => void;
}) {
  const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const corners: { handle: ResizeHandle; x: number; y: number }[] = [
    { handle: 'nw', x: rect.x, y: rect.y },
    { handle: 'ne', x: rect.x + rect.width, y: rect.y },
    { handle: 'se', x: rect.x + rect.width, y: rect.y + rect.height },
    { handle: 'sw', x: rect.x, y: rect.y + rect.height },
  ];

  return (
    <g transform={`rotate(${degrees} ${centre.x} ${centre.y})`}>
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        fill="none"
        stroke={color.foreground}
        strokeWidth={1}
        strokeDasharray="3,3"
        pointerEvents="none"
      />
      {corners.map((corner) => (
        <rect
          key={corner.handle}
          x={corner.x - HANDLE_PX / 2}
          y={corner.y - HANDLE_PX / 2}
          width={HANDLE_PX}
          height={HANDLE_PX}
          fill={color.surface}
          stroke={color.foreground}
          strokeWidth={1.5}
          style={{ cursor: 'nwse-resize' }}
          onPointerDown={(event) => onResize(event, corner.handle)}
        />
      ))}
      <line
        x1={centre.x}
        y1={rect.y}
        x2={centre.x}
        y2={rect.y - ROTATE_HANDLE_OFFSET_PX}
        stroke={color.foreground}
        strokeWidth={1}
        pointerEvents="none"
      />
      <circle
        cx={centre.x}
        cy={rect.y - ROTATE_HANDLE_OFFSET_PX}
        r={HANDLE_PX / 2 + 1}
        fill={color.surface}
        stroke={color.foreground}
        strokeWidth={1.5}
        style={{ cursor: 'grab' }}
        onPointerDown={onRotate}
      />
    </g>
  );
}

function GridLines({
  layout,
  gridSize,
  plan,
}: {
  layout: ReturnType<typeof computeFloorLayout>;
  gridSize: number;
  plan: PlanSnapshot;
}) {
  const step = gridSize * layout.scale;
  // Below about four pixels a grid is a grey wash rather than a guide.
  if (step < 4) return null;

  const verticals = Math.floor(plan.floorWidth / gridSize);
  const horizontals = Math.floor(plan.floorHeight / gridSize);

  return (
    <g pointerEvents="none" opacity={0.5}>
      {Array.from({ length: verticals + 1 }, (_, i) => (
        <line
          key={`v${i}`}
          x1={layout.offsetX + i * step}
          y1={layout.offsetY}
          x2={layout.offsetX + i * step}
          y2={layout.offsetY + layout.renderedHeight}
          stroke={color.border}
          strokeWidth={i % 5 === 0 ? 1 : 0.5}
        />
      ))}
      {Array.from({ length: horizontals + 1 }, (_, i) => (
        <line
          key={`h${i}`}
          x1={layout.offsetX}
          y1={layout.offsetY + i * step}
          x2={layout.offsetX + layout.renderedWidth}
          y2={layout.offsetY + i * step}
          stroke={color.border}
          strokeWidth={i % 5 === 0 ? 1 : 0.5}
        />
      ))}
    </g>
  );
}

function resizedRect(
  drag: Extract<Drag, { kind: 'resize' }>,
  dx: number,
  dy: number,
): { x: number; y: number; width: number; height: number } {
  const { rect, handle } = drag;
  const west = handle === 'nw' || handle === 'sw';
  const north = handle === 'nw' || handle === 'ne';
  return {
    x: west ? rect.x + dx : rect.x,
    y: north ? rect.y + dy : rect.y,
    width: west ? rect.width - dx : rect.width + dx,
    height: north ? rect.height - dy : rect.height + dy,
  };
}

function marqueeBox(drag: Extract<Drag, { kind: 'marquee' }>) {
  return {
    x: Math.min(drag.fromX, drag.toX),
    y: Math.min(drag.fromY, drag.toY),
    width: Math.abs(drag.toX - drag.fromX),
    height: Math.abs(drag.toY - drag.fromY),
  };
}

function boundsOfCorners(laid: LaidOutTable) {
  const xs = laid.corners.map((c) => c.x);
  const ys = laid.corners.map((c) => c.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
