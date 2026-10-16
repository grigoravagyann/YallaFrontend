import type { Photo } from './menuAdmin';

/**
 * The rooms as the **editor** sees them.
 *
 * A branch is a set of rooms (Hall, Terrace, VIP), each with up to ten photos,
 * and every table is a pin on one of its own room's photos. There is no drawn
 * floor plan any more: no canvas, no geometry. The editor gets the stored
 * shape — room ids, the active flag, and the QR token it must display and must
 * never send back.
 */

/** A room holds at most this many photos (`FloorAreaPhoto.MaxPhotos`). */
export const MAX_ROOM_PHOTOS = 10;

export interface EditorFloorArea {
  readonly id: string;
  readonly name: string;
  /** The order the venue thinks of its own rooms in, front of house first. */
  readonly displayOrder: number;
  /** In the order a diner swipes them. Empty for a room nobody has photographed yet. */
  readonly photos: readonly Photo[];
}

/** Where a table sits: one of its room's photos, and fractions of it (0 left/top to 1). */
export interface EditorTablePin {
  readonly photoId: string;
  readonly x: number;
  readonly y: number;
}

/**
 * The **physical** state of a table, as the plan read carries it — what
 * somebody did to it, not the booking overlay. Values: 1 Free, 2 Held,
 * 4 Occupied, 5 OutOfService.
 */
export type EditorTableStatus = 'free' | 'held' | 'occupied' | 'outOfService';

export interface EditorFloorTable {
  readonly id: string;
  readonly label: string;
  readonly seats: number;
  readonly floorAreaId: string | null;
  readonly isBookable: boolean;
  /**
   * False for a table that was removed but had history, so the server
   * deactivated it instead of deleting it.
   */
  readonly isActive: boolean;
  /** Whether a delete would remove it outright rather than deactivate it. */
  readonly isDeletable: boolean;
  readonly status: EditorTableStatus;
  /**
   * The token behind the QR sticker on the physical table. **Read-only.**
   * Editing a table never changes it and the client never sends it back; the
   * printed code has to keep working. `POST /api/tables/{id}/regenerate-qr` is
   * the one thing that changes it, and it is its own guarded action.
   */
  readonly qrToken: string;
  /** The table's pin, or `null` when it is on no photo — and then diners are not offered it. */
  readonly pin: EditorTablePin | null;
}

export interface EditorFloorPlan {
  readonly branchId: string;
  /** Lowest `displayOrder` first. */
  readonly areas: readonly EditorFloorArea[];
  /** Every table, inactive ones included. */
  readonly tables: readonly EditorFloorTable[];
  /**
   * Opaque. Send it back as `expectedVersion` on the next save (K6); a save
   * somebody else made in between is refused rather than overwritten.
   */
  readonly version: string;
}

/** One table in the payload. Note what is absent: `qrToken` and `isActive`. */
export interface ReplaceFloorTableInput {
  /** Absent for a table the editor has only ever held locally. */
  readonly id?: string | undefined;
  readonly label: string;
  readonly seats: number;
  /** The backend matches a room by **name**, not by id, on this payload. */
  readonly floorAreaName?: string | null | undefined;
  readonly isBookable: boolean;
  /** On one of **its own room's** photos in this same plan, or `null`. */
  readonly pin: EditorTablePin | null;
}

export interface ReplaceFloorAreaInput {
  readonly id?: string | undefined;
  readonly name: string;
  readonly displayOrder: number;
  /** The whole list, in order, replacing what was there. At most {@link MAX_ROOM_PHOTOS}. */
  readonly photoIds: readonly string[];
}

/**
 * Rooms, their photos and every table's pin, replaced atomically.
 *
 * They land together or not at all. That is why the editor holds a working
 * copy and saves explicitly: a half-applied plan is a pin on a photo its room
 * no longer has.
 */
export interface ReplaceFloorPlanCommand {
  readonly areas: readonly ReplaceFloorAreaInput[];
  readonly tables: readonly ReplaceFloorTableInput[];
  /** The `version` the editor loaded (K6). Stale: `FloorPlanChangedError`, nothing written. */
  readonly expectedVersion: string;
}

export interface FloorPlanSaveResult {
  readonly plan: EditorFloorPlan;
  /**
   * Advisory: the save already happened. Today, bookable tables with no pin
   * (diners are not offered them) and tables taken off a photo the plan removed.
   */
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
  /**
   * The floor plan's version after the delete, which moves it: an editor that
   * loaded the plan before takes it, or its next save is refused as stale.
   */
  readonly floorPlanVersion: string;
}
