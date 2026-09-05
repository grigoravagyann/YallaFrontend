import type {
  EditorFloorArea,
  EditorFloorPlan,
  EditorFloorTable,
  FloorPlanSaveResult,
  ReplaceFloorPlanCommand,
} from '@yalla/api';
import type { TableShape } from '@yalla/floorplan/types';

/**
 * The floor plan editor's state machine.
 *
 * Pure, and separate from anything that renders, for the same reason
 * `computeFloorLayout` is: a drag-and-drop tool without undo is unusable, and
 * undo is only trustworthy if every mutation goes through one place that
 * snapshots first. Interactions are worth testing here — as state transitions —
 * far more cheaply than as component tests.
 */

/** How many steps back the editor can go. The spec's floor is twenty. */
export const UNDO_LIMIT = 40;

/** Default grid pitch in floor-plan units. A room drawn on a grid looks deliberate. */
export const DEFAULT_GRID_SIZE = 10;

/** Rotation snaps to this unless the caller asks for free rotation. */
export const ROTATION_STEP_DEGREES = 15;

/** The smallest table the editor will let you drag down to, in floor units. */
export const MIN_TABLE_SIZE = 20;

export interface EditorTable extends EditorFloorTable {
  /**
   * The server has told us this table has bookings against it, so removing it
   * from the plan deactivates rather than deletes. Learned from a save result
   * or a delete attempt — never guessed. The server decides either way; this
   * only stops the editor promising something it knows to be untrue.
   */
  readonly hasHistory: boolean;
}

/** Everything undo has to restore. Selection is deliberately not in here. */
export interface PlanSnapshot {
  readonly floorWidth: number;
  readonly floorHeight: number;
  readonly areas: readonly EditorFloorArea[];
  readonly tables: readonly EditorTable[];
}

export interface EditorState {
  readonly branchId: string;
  readonly plan: PlanSnapshot;
  /** Ids of the selected tables. Multi-select is the normal case, not an extra. */
  readonly selection: readonly string[];
  readonly gridEnabled: boolean;
  readonly gridSize: number;
  readonly past: readonly PlanSnapshot[];
  readonly future: readonly PlanSnapshot[];
  /** The plan as last agreed with the server, for the dirty check. */
  readonly saved: PlanSnapshot | null;
}

export type EditorAction =
  | { type: 'loaded'; plan: EditorFloorPlan }
  | { type: 'select'; ids: readonly string[]; additive?: boolean }
  | { type: 'selectAll' }
  | { type: 'clearSelection' }
  | { type: 'move'; dx: number; dy: number }
  | { type: 'resize'; id: string; rect: { x: number; y: number; width: number; height: number } }
  | { type: 'rotate'; id: string; degrees: number; free?: boolean }
  | { type: 'duplicate' }
  | { type: 'delete' }
  | { type: 'addTable'; table?: Partial<EditorTable> }
  | { type: 'addRow'; row: AddRowInput }
  | { type: 'updateTable'; id: string; patch: Partial<EditorTable> }
  | { type: 'assignArea'; ids: readonly string[]; floorAreaId: string | null }
  | { type: 'align'; edge: AlignEdge }
  | { type: 'setCanvas'; width: number; height: number }
  | { type: 'addArea'; name: string }
  | { type: 'renameArea'; areaId: string; name: string }
  | { type: 'moveArea'; areaId: string; direction: -1 | 1 }
  | { type: 'removeArea'; areaId: string }
  | { type: 'reactivate'; id: string }
  | { type: 'setGrid'; enabled?: boolean; size?: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'saved'; result: FloorPlanSaveResult };

export type AlignEdge = 'left' | 'right' | 'top' | 'bottom' | 'horizontalCentre' | 'verticalCentre';

export interface AddRowInput {
  readonly count: number;
  readonly shape: TableShape;
  readonly seats: number;
  /** Gap between table edges, in floor units. */
  readonly spacing: number;
  readonly orientation: 'horizontal' | 'vertical';
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
  readonly floorAreaId: string | null;
}

/** Actions that change the plan, and therefore push an undo step. */
const MUTATIONS: ReadonlySet<EditorAction['type']> = new Set([
  'move',
  'resize',
  'rotate',
  'duplicate',
  'delete',
  'addTable',
  'addRow',
  'updateTable',
  'assignArea',
  'align',
  'setCanvas',
  'addArea',
  'renameArea',
  'moveArea',
  'removeArea',
  'reactivate',
]);

function snap(value: number, size: number, enabled: boolean): number {
  return enabled ? Math.round(value / size) * size : Math.round(value);
}

function toSnapshot(plan: EditorFloorPlan, history: ReadonlySet<string> = new Set()): PlanSnapshot {
  return {
    floorWidth: plan.floorWidth,
    floorHeight: plan.floorHeight,
    areas: [...plan.areas].sort((a, b) => a.displayOrder - b.displayOrder),
    tables: plan.tables.map((table) => ({ ...table, hasHistory: history.has(table.label) })),
  };
}

export function initialState(branchId: string): EditorState {
  return {
    branchId,
    plan: { floorWidth: 0, floorHeight: 0, areas: [], tables: [] },
    selection: [],
    gridEnabled: true,
    gridSize: DEFAULT_GRID_SIZE,
    past: [],
    future: [],
    saved: null,
  };
}

/** A label not already in use: "1", "2", … then the first free number. */
function nextLabel(tables: readonly EditorTable[]): string {
  const used = new Set(tables.map((t) => t.label.trim()));
  for (let n = 1; n <= used.size + 1; n += 1) {
    if (!used.has(String(n))) return String(n);
  }
  return String(used.size + 1);
}

/**
 * An id for a table the editor has just invented.
 *
 * Prefixed, so {@link isServerId} can tell it from a stored one without a
 * registry. The server has no row for it and must be asked to create rather
 * than update.
 */
function makeId(): string {
  const webCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const raw = webCrypto?.randomUUID ? webCrypto.randomUUID() : Math.random().toString(36).slice(2);
  return `new-${raw}`;
}

/**
 * A table the editor has invented. It carries no `qrToken`: the server mints
 * one when the table first lands, and inventing a value here would put a
 * meaningless string under a "copy" button.
 */
function newTable(over: Partial<EditorTable>, tables: readonly EditorTable[]): EditorTable {
  return {
    id: makeId(),
    label: nextLabel(tables),
    seats: 2,
    x: 40,
    y: 40,
    width: 80,
    height: 80,
    rotationDegrees: 0,
    shape: 'rectangle',
    floorAreaId: null,
    isBookable: true,
    isActive: true,
    qrToken: '',
    hasHistory: false,
    ...over,
  };
}

function mapSelected(
  state: EditorState,
  change: (table: EditorTable) => EditorTable,
): readonly EditorTable[] {
  const selected = new Set(state.selection);
  return state.plan.tables.map((table) => (selected.has(table.id) ? change(table) : table));
}

/** Keep a table inside the canvas: the server refuses a plan that leaves it. */
function clampToCanvas(table: EditorTable, plan: PlanSnapshot): EditorTable {
  return {
    ...table,
    x: Math.max(0, Math.min(table.x, plan.floorWidth - table.width)),
    y: Math.max(0, Math.min(table.y, plan.floorHeight - table.height)),
  };
}

function applyPlan(state: EditorState, plan: PlanSnapshot): EditorState {
  return {
    ...state,
    plan,
    past: [...state.past, state.plan].slice(-UNDO_LIMIT),
    // Any new edit abandons the redo branch, as every editor does.
    future: [],
  };
}

export function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'loaded': {
      const snapshot = toSnapshot(action.plan);
      return { ...initialState(action.plan.branchId), plan: snapshot, saved: snapshot };
    }

    case 'saved': {
      // Adopt the server's plan wholesale rather than patching the working
      // copy: it has resolved ids, minted QR tokens for new tables, and turned
      // deleted-but-used tables into deactivated ones. Anything we kept would
      // be a second opinion about what was stored.
      const history = new Set(action.result.deactivatedTables);
      const snapshot = toSnapshot(action.result.plan, history);
      return { ...state, plan: snapshot, saved: snapshot, past: [], future: [] };
    }

    case 'select': {
      const ids = action.additive
        ? [...new Set([...state.selection, ...action.ids])]
        : [...action.ids];
      return { ...state, selection: ids };
    }

    case 'selectAll':
      return { ...state, selection: state.plan.tables.map((t) => t.id) };

    case 'clearSelection':
      return { ...state, selection: [] };

    case 'move': {
      if (state.selection.length === 0) return state;
      const tables = mapSelected(state, (table) =>
        clampToCanvas(
          {
            ...table,
            x: snap(table.x + action.dx, state.gridSize, state.gridEnabled),
            y: snap(table.y + action.dy, state.gridSize, state.gridEnabled),
          },
          state.plan,
        ),
      );
      return applyPlan(state, { ...state.plan, tables });
    }

    case 'resize': {
      const tables = state.plan.tables.map((table) =>
        table.id === action.id
          ? clampToCanvas(
              {
                ...table,
                x: snap(action.rect.x, state.gridSize, state.gridEnabled),
                y: snap(action.rect.y, state.gridSize, state.gridEnabled),
                width: Math.max(
                  MIN_TABLE_SIZE,
                  snap(action.rect.width, state.gridSize, state.gridEnabled),
                ),
                height: Math.max(
                  MIN_TABLE_SIZE,
                  snap(action.rect.height, state.gridSize, state.gridEnabled),
                ),
              },
              state.plan,
            )
          : table,
      );
      return applyPlan(state, { ...state.plan, tables });
    }

    case 'rotate': {
      // Free rotation is the modifier, not the default: a room of tables at
      // 7 and 13 degrees looks like a mistake even when it is deliberate.
      const degrees = action.free
        ? action.degrees
        : Math.round(action.degrees / ROTATION_STEP_DEGREES) * ROTATION_STEP_DEGREES;
      const normalised = ((degrees % 360) + 360) % 360;
      const tables = state.plan.tables.map((table) =>
        table.id === action.id ? { ...table, rotationDegrees: normalised } : table,
      );
      return applyPlan(state, { ...state.plan, tables });
    }

    case 'duplicate': {
      if (state.selection.length === 0) return state;
      const selected = new Set(state.selection);
      const copies: EditorTable[] = [];
      let pool = state.plan.tables;
      for (const table of state.plan.tables) {
        if (!selected.has(table.id)) continue;
        const copy = newTable(
          {
            ...table,
            id: makeId(),
            label: nextLabel(pool),
            // Offset so the copy is visibly a second table rather than hiding
            // exactly on top of the original.
            x: table.x + state.gridSize * 2,
            y: table.y + state.gridSize * 2,
            // A copy is a new table: it has no QR sticker and no history.
            qrToken: '',
            isActive: true,
            hasHistory: false,
          },
          pool,
        );
        const placed = clampToCanvas(copy, state.plan);
        copies.push(placed);
        pool = [...pool, placed];
      }
      return {
        ...applyPlan(state, { ...state.plan, tables: [...state.plan.tables, ...copies] }),
        // Selecting the copies is what makes "duplicate, drag, duplicate" work.
        selection: copies.map((t) => t.id),
      };
    }

    case 'delete': {
      if (state.selection.length === 0) return state;
      const selected = new Set(state.selection);
      const tables: EditorTable[] = [];
      for (const table of state.plan.tables) {
        if (!selected.has(table.id)) {
          tables.push(table);
          continue;
        }
        // A table with bookings against it is deactivated, never removed —
        // deleting it would orphan financial and occupancy records. It stays on
        // the canvas, marked, because a person who deletes table 7 and sees it
        // still there with no explanation deletes it again.
        if (table.hasHistory) tables.push({ ...table, isActive: false });
      }
      return { ...applyPlan(state, { ...state.plan, tables }), selection: [] };
    }

    case 'reactivate': {
      const tables = state.plan.tables.map((table) =>
        table.id === action.id ? { ...table, isActive: true } : table,
      );
      return applyPlan(state, { ...state.plan, tables });
    }

    case 'addTable': {
      const table = clampToCanvas(newTable(action.table ?? {}, state.plan.tables), state.plan);
      return {
        ...applyPlan(state, { ...state.plan, tables: [...state.plan.tables, table] }),
        selection: [table.id],
      };
    }

    case 'addRow': {
      const { row } = action;
      const added: EditorTable[] = [];
      let pool = state.plan.tables;
      for (let i = 0; i < Math.max(0, row.count); i += 1) {
        const step = (row.orientation === 'horizontal' ? row.width : row.height) + row.spacing;
        const table = clampToCanvas(
          newTable(
            {
              label: nextLabel(pool),
              seats: row.seats,
              shape: row.shape,
              width: row.width,
              height: row.height,
              x: snap(
                row.x + (row.orientation === 'horizontal' ? i * step : 0),
                state.gridSize,
                state.gridEnabled,
              ),
              y: snap(
                row.y + (row.orientation === 'vertical' ? i * step : 0),
                state.gridSize,
                state.gridEnabled,
              ),
              floorAreaId: row.floorAreaId,
            },
            pool,
          ),
          state.plan,
        );
        added.push(table);
        pool = [...pool, table];
      }
      return {
        ...applyPlan(state, { ...state.plan, tables: [...state.plan.tables, ...added] }),
        selection: added.map((t) => t.id),
      };
    }

    case 'updateTable': {
      const tables = state.plan.tables.map((table) =>
        table.id === action.id
          ? clampToCanvas(
              {
                ...table,
                ...action.patch,
                // Never editable, whatever a caller passes: the printed sticker
                // has to keep working.
                id: table.id,
                qrToken: table.qrToken,
              },
              state.plan,
            )
          : table,
      );
      return applyPlan(state, { ...state.plan, tables });
    }

    case 'assignArea': {
      const ids = new Set(action.ids);
      const tables = state.plan.tables.map((table) =>
        ids.has(table.id) ? { ...table, floorAreaId: action.floorAreaId } : table,
      );
      return applyPlan(state, { ...state.plan, tables });
    }

    case 'align': {
      const selected = state.plan.tables.filter((t) => state.selection.includes(t.id));
      if (selected.length < 2) return state;

      const lefts = selected.map((t) => t.x);
      const rights = selected.map((t) => t.x + t.width);
      const tops = selected.map((t) => t.y);
      const bottoms = selected.map((t) => t.y + t.height);

      const tables = mapSelected(state, (table) => {
        switch (action.edge) {
          case 'left':
            return { ...table, x: Math.min(...lefts) };
          case 'right':
            return { ...table, x: Math.max(...rights) - table.width };
          case 'top':
            return { ...table, y: Math.min(...tops) };
          case 'bottom':
            return { ...table, y: Math.max(...bottoms) - table.height };
          case 'horizontalCentre': {
            const centre = (Math.min(...lefts) + Math.max(...rights)) / 2;
            return { ...table, x: Math.round(centre - table.width / 2) };
          }
          case 'verticalCentre': {
            const centre = (Math.min(...tops) + Math.max(...bottoms)) / 2;
            return { ...table, y: Math.round(centre - table.height / 2) };
          }
        }
      });
      return applyPlan(state, { ...state.plan, tables });
    }

    case 'setCanvas': {
      const plan: PlanSnapshot = {
        ...state.plan,
        floorWidth: Math.max(MIN_TABLE_SIZE, Math.round(action.width)),
        floorHeight: Math.max(MIN_TABLE_SIZE, Math.round(action.height)),
      };
      // Tables are NOT moved to fit. The screen warns and names them first;
      // silently shoving a room's furniture around to make a number fit is how
      // a plan stops matching the actual cafe.
      return applyPlan(state, plan);
    }

    case 'addArea': {
      const area: EditorFloorArea = {
        id: makeId(),
        name: action.name,
        displayOrder: state.plan.areas.length,
      };
      return applyPlan(state, { ...state.plan, areas: [...state.plan.areas, area] });
    }

    case 'renameArea': {
      const areas = state.plan.areas.map((area) =>
        area.id === action.areaId ? { ...area, name: action.name } : area,
      );
      return applyPlan(state, { ...state.plan, areas });
    }

    case 'moveArea': {
      const index = state.plan.areas.findIndex((a) => a.id === action.areaId);
      const target = index + action.direction;
      if (index === -1 || target < 0 || target >= state.plan.areas.length) return state;
      const areas = [...state.plan.areas];
      const [moved] = areas.splice(index, 1);
      if (moved) areas.splice(target, 0, moved);
      return applyPlan(state, {
        ...state.plan,
        areas: areas.map((area, order) => ({ ...area, displayOrder: order })),
      });
    }

    case 'removeArea': {
      // The area goes; its tables stay, with no area. Areas are context, not
      // containers — a table belongs to one by property, never by geometry.
      return applyPlan(state, {
        ...state.plan,
        areas: state.plan.areas.filter((area) => area.id !== action.areaId),
        tables: state.plan.tables.map((table) =>
          table.floorAreaId === action.areaId ? { ...table, floorAreaId: null } : table,
        ),
      });
    }

    case 'setGrid':
      return {
        ...state,
        gridEnabled: action.enabled ?? state.gridEnabled,
        gridSize: Math.max(1, action.size ?? state.gridSize),
      };

    case 'undo': {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        ...state,
        plan: previous,
        past: state.past.slice(0, -1),
        future: [state.plan, ...state.future].slice(0, UNDO_LIMIT),
        // A selection may name tables the previous plan does not contain.
        selection: state.selection.filter((id) => previous.tables.some((t) => t.id === id)),
      };
    }

    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        plan: next,
        past: [...state.past, state.plan].slice(-UNDO_LIMIT),
        future: state.future.slice(1),
        selection: state.selection.filter((id) => next.tables.some((t) => t.id === id)),
      };
    }
  }
}

/**
 * Wrap the reducer so only plan-changing actions cost an undo step.
 *
 * Selecting a table is not an edit, and an undo stack that has to be pressed
 * six times to walk back one move is a stack nobody trusts.
 */
export function isMutation(action: EditorAction): boolean {
  return MUTATIONS.has(action.type);
}

export function canUndo(state: EditorState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: EditorState): boolean {
  return state.future.length > 0;
}

/** Deep-enough comparison to answer "is there unsaved work?". */
export function isDirty(state: EditorState): boolean {
  if (!state.saved) return false;
  return JSON.stringify(state.plan) !== JSON.stringify(state.saved);
}

/**
 * The payload for the atomic `PUT`.
 *
 * Two things it deliberately never carries. `qrToken`, because the printed
 * sticker on the table has to keep working and only the explicit regenerate
 * action may change it. And deactivated tables, because including one would
 * ask the server to resurrect a table the venue has retired — dropping it is
 * how it stays retired.
 */
export function toSaveCommand(state: EditorState): ReplaceFloorPlanCommand {
  const areaById = new Map(state.plan.areas.map((area) => [area.id, area.name]));

  return {
    floorWidth: state.plan.floorWidth,
    floorHeight: state.plan.floorHeight,
    areas: state.plan.areas.map((area, index) => ({
      // A locally-invented area has an id the server has never seen; sending
      // it would ask the server to update something that does not exist.
      ...(isServerId(area.id) ? { id: area.id } : {}),
      name: area.name,
      displayOrder: index,
    })),
    tables: state.plan.tables
      .filter((table) => table.isActive)
      .map((table) => ({
        ...(isServerId(table.id) ? { id: table.id } : {}),
        label: table.label,
        seats: table.seats,
        x: Math.round(table.x),
        y: Math.round(table.y),
        width: Math.round(table.width),
        height: Math.round(table.height),
        rotationDegrees: table.rotationDegrees,
        shape: table.shape,
        floorAreaName: table.floorAreaId ? (areaById.get(table.floorAreaId) ?? null) : null,
        isBookable: table.isBookable,
      })),
  };
}

/**
 * Has the server seen this id?
 *
 * A table the editor invented carries a `new-` id the server has no row for.
 * The backend matches by id and falls back to label, so sending an unknown id
 * is not fatal — but it is a lie, and it makes the fallback the normal path
 * rather than the recovery one.
 */
function isServerId(id: string): boolean {
  return !id.startsWith('new-');
}

/** Tables the server named as sitting outside the canvas, for highlighting. */
export function tablesOutsideCanvas(plan: PlanSnapshot): readonly EditorTable[] {
  return plan.tables.filter(
    (t) =>
      t.isActive &&
      (t.x < 0 || t.y < 0 || t.x + t.width > plan.floorWidth || t.y + t.height > plan.floorHeight),
  );
}

/** Labels used more than once. The server refuses these; the editor says so first. */
export function duplicateLabels(plan: PlanSnapshot): readonly string[] {
  const counts = new Map<string, number>();
  for (const table of plan.tables) {
    if (!table.isActive) continue;
    const key = table.label.trim().toLocaleLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([label]) => label);
}
