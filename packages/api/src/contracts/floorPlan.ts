import type { TableShape } from '@yalla/floorplan/types';

/**
 * The floor plan as the **editor** sees it.
 *
 * Deliberately not `FloorPlanData`, which is what the viewer sees. The viewer
 * gets derived state — is this table free right now — and no identity it could
 * use to change anything. The editor gets the stored shape instead: area ids,
 * the active flag, and the QR token it must display and must never send back.
 */

export interface EditorFloorArea {
  readonly id: string;
  readonly name: string;
  /** The order the venue thinks of its own room in, front of house first. */
  readonly displayOrder: number;
}

export interface EditorFloorTable {
  readonly id: string;
  readonly label: string;
  readonly seats: number;
  /** Floor-plan units, top-left origin. Not pixels. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotationDegrees: number;
  readonly shape: TableShape;
  readonly floorAreaId: string | null;
  readonly isBookable: boolean;
  /**
   * False for a table that was removed from the plan but had history, so the
   * server deactivated it instead of deleting it. It stays on the canvas,
   * visibly marked — a person who deletes table 7 and sees it still there with
   * no explanation deletes it again.
   */
  readonly isActive: boolean;
  /**
   * The token behind the QR sticker on the physical table. **Read-only.**
   * Editing a table never changes it and the client never sends it back; the
   * printed code has to keep working. `POST /api/tables/{id}/regenerate-qr` is
   * the one thing that changes it, and it is its own guarded action.
   */
  readonly qrToken: string;
}

export interface EditorFloorPlan {
  readonly branchId: string;
  readonly floorWidth: number;
  readonly floorHeight: number;
  readonly areas: readonly EditorFloorArea[];
  readonly tables: readonly EditorFloorTable[];
}

/** One table in the payload. Note what is absent: `qrToken` and `isActive`. */
export interface ReplaceFloorTableInput {
  /** Absent for a table the editor has only ever held locally. */
  readonly id?: string | undefined;
  readonly label: string;
  readonly seats: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotationDegrees: number;
  readonly shape: TableShape;
  /** The backend matches an area by **name**, not by id, on this payload. */
  readonly floorAreaName?: string | null | undefined;
  readonly isBookable: boolean;
}

export interface ReplaceFloorAreaInput {
  readonly id?: string | undefined;
  readonly name: string;
  readonly displayOrder: number;
}

/**
 * The whole plan, replaced atomically.
 *
 * Canvas, areas and tables land together or not at all. That is why the editor
 * holds a working copy and saves explicitly: a partially applied plan is a
 * broken room, and an autosave mid-drag would produce exactly one.
 */
export interface ReplaceFloorPlanCommand {
  readonly floorWidth: number;
  readonly floorHeight: number;
  readonly areas: readonly ReplaceFloorAreaInput[];
  readonly tables: readonly ReplaceFloorTableInput[];
}

export interface FloorPlanSaveResult {
  readonly plan: EditorFloorPlan;
  /** Overlapping tables and the like. Advisory: the save already happened. */
  readonly warnings: readonly string[];
  /** Labels of tables kept but deactivated because they had history. */
  readonly deactivatedTables: readonly string[];
  /** Labels of tables that had never been used and were removed outright. */
  readonly removedTables: readonly string[];
}

export interface TableDeletionResult {
  readonly tableId: string;
  readonly label: string;
  readonly deleted: boolean;
  readonly deactivated: boolean;
  /** The server's own words, shown as-is: it knows why it refused. */
  readonly message: string;
}
