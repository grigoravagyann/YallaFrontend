import { FloorPlanChangedError, type EditorTablePin } from '@yalla/api';
import {
  useDeleteTable,
  useEditorFloorPlan,
  useRegenerateTableQr,
  useSaveFloorPlan,
} from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useId, useReducer, useRef, useState, type FormEvent } from 'react';
import { useToast } from '../../ui/toast';
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard';
import { sameName, saveResultLines } from './roomsMessages';
import {
  bookableUnpinned,
  duplicateLabels,
  duplicateRoomNames,
  initialState,
  isDirty,
  nextLabel,
  reducer,
  toSaveCommand,
  type DraftRoom,
  type DraftTable,
  type RoomsAction,
} from './roomsModel';

/**
 * The actions that are the person's own edits, as against the server's
 * answers (`loaded`, `deleted`, `qrReplaced`, `versionMoved`). An edit makes
 * a save's warnings and a refused save's reasons stale.
 */
const EDITS = new Set<RoomsAction['type']>([
  'addRoom',
  'renameRoom',
  'moveRoom',
  'removeRoom',
  'addPhoto',
  'movePhoto',
  'removePhoto',
  'addTable',
  'updateTable',
  'placeTable',
  'discardTable',
  'restoreTable',
  'reAddTable',
]);

/** A table added by a click on the photo: the artboard's four seats, bookable. */
const NEW_TABLE_SEATS = 4;

/** The dialog the editor has open, if any. */
export type RoomsDialog =
  | { readonly kind: 'removeRoom'; readonly room: DraftRoom }
  | { readonly kind: 'renameRoom'; readonly room: DraftRoom }
  | {
      readonly kind: 'removePhoto';
      readonly roomId: string;
      readonly photoId: string;
      readonly position: number;
      readonly labels: readonly string[];
    }
  | { readonly kind: 'deleteTable'; readonly table: DraftTable }
  | { readonly kind: 'seated'; readonly table: DraftTable }
  | { readonly kind: 'regenerate'; readonly table: DraftTable }
  | { readonly kind: 'addPhoto'; readonly roomId: string };

/**
 * The rooms editor's working copy and everything done to it: the draft and
 * what is selected, the load, the save against the loaded `version`, the
 * delete with its undo, and where focus goes when its control is gone.
 */
export function useRoomsEditor(branchId: string | undefined) {
  const { t } = useTranslation(['admin', 'common']);
  const toast = useToast();
  const query = useEditorFloorPlan(branchId);
  const save = useSaveFloorPlan();
  const remove = useDeleteTable(branchId);
  const regenerate = useRegenerateTableQr();
  const newRoomId = useId();

  const [state, apply] = useReducer(reducer, undefined, initialState);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [photoByRoom, setPhotoByRoom] = useState<Record<string, string>>({});
  const [tableId, setTableId] = useState<string | null>(null);
  const [focusTableId, setFocusTableId] = useState<string | null>(null);
  const [newRoomName, setNewRoomName] = useState('');
  const [dialog, setDialog] = useState<RoomsDialog | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [savedResult, setSavedResult] = useState<readonly string[] | null>(null);
  const [reloadFailed, setReloadFailed] = useState(false);

  /**
   * Where focus goes once the control that had it is gone: a photo removed,
   * a table deleted. The first of these ids on the page wins.
   */
  const [focusRequest, setFocusRequest] = useState<{ readonly ids: readonly string[] } | null>(
    null,
  );
  /*
   * State, not a ref read after every render: a click that lands before the
   * last render's effects have run (a busy machine, a background read) had
   * those effects take the request and look for a field that render never
   * drew. As state it comes with the render that draws its target.
   */
  const focusAfter = (ids: readonly string[]) => setFocusRequest({ ids });
  useEffect(() => {
    if (!focusRequest) return;
    for (const id of focusRequest.ids) {
      const target = document.getElementById(id);
      if (target) {
        target.focus();
        break;
      }
    }
  }, [focusRequest]);

  const { reset: resetSave, error: saveError } = save;
  const dispatch = useCallback(
    (action: RoomsAction) => {
      if (EDITS.has(action.type)) {
        setSavedResult(null);
        // A refusal's reasons are about the draft as it was sent. A conflict
        // stays: editing does not make the newer plan go away.
        if (saveError && !(saveError instanceof FloorPlanChangedError)) resetSave();
      }
      apply(action);
    },
    [resetSave, saveError],
  );

  // Load once into the working copy. Re-running on every refetch would throw
  // away whatever the person is placing. Not while a read is in flight: the
  // editor opens with a fresh read (`refetchOnMount: 'always'`), and a cached
  // copy loaded meanwhile could show — and print — a QR code replaced since.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!query.data || query.isFetching || loadedFor.current === query.data.branchId) return;
    loadedFor.current = query.data.branchId;
    apply({ type: 'loaded', plan: query.data });
  }, [query.data, query.isFetching]);

  /**
   * Whether a delete's undo can still land here: the editor is on screen, and
   * no save is on its way that the restored table would miss. A toast
   * outlives the screen, so its Undo asks.
   */
  const undoable = useRef(true);
  useEffect(() => {
    undoable.current = true;
    return () => {
      undoable.current = false;
    };
  }, []);
  const savingRef = useRef(false);
  useEffect(() => {
    savingRef.current = save.isPending;
  }, [save.isPending]);

  const loaded = state.version !== '';
  // Inert while a save is in flight: the save sends the draft as it was, and
  // its answer replaces the draft, so an edit made meanwhile would be lost.
  const busy = save.isPending;
  const dirty = isDirty(state);
  useUnsavedChangesGuard(dirty);

  const room = state.rooms.find((candidate) => candidate.id === roomId) ?? state.rooms[0] ?? null;
  const photoId = room ? photoByRoom[room.id] : undefined;
  const photo = room?.photos.find((p) => p.photoId === photoId) ?? room?.photos[0] ?? null;
  const photoIndex = room && photo ? room.photos.indexOf(photo) : -1;
  const active = state.tables.filter((table) => table.isActive);
  const selected = active.find((table) => table.id === tableId) ?? null;
  const placing = selected && !selected.pin ? selected : null;
  const unpinnedBookable = bookableUnpinned(state);
  const duplicates = duplicateLabels(state);
  const duplicateRooms = duplicateRoomNames(state);

  const select = useCallback((id: string | null) => setTableId(id), []);

  function showPhoto(nextRoomId: string, nextPhotoId: string) {
    setPhotoByRoom((current) => ({ ...current, [nextRoomId]: nextPhotoId }));
  }

  /** "Place": to the table's room and its first photo, with the table selected to drop. */
  function startPlacing(table: DraftTable) {
    const target = state.rooms.find((candidate) => candidate.id === table.roomId) ?? room;
    if (target) {
      setRoomId(target.id);
      const first = target.photos[0];
      if (first) showPhoto(target.id, first.photoId);
    }
    select(table.id);
    focusAfter(['stage-title']);
  }

  function removePhoto(fromRoomId: string, removedPhotoId: string, position: number) {
    dispatch({ type: 'removePhoto', roomId: fromRoomId, photoId: removedPhotoId });
    // The photo that slides into its place, else the one before it, else the heading.
    focusAfter([`room-photo-${position + 1}`, `room-photo-${position - 1}`, 'stage-title']);
  }

  /** A click on the photo: the table being placed goes there, or a new one. */
  function addAt(pin: EditorTablePin) {
    if (placing) {
      dispatch({ type: 'placeTable', id: placing.id, pin });
      setFocusTableId(placing.id);
      return;
    }
    const id = `new-table-${state.sequence + 1}`;
    dispatch({
      type: 'addTable',
      table: { label: nextLabel(state), seats: NEW_TABLE_SEATS, isBookable: true },
      pin,
    });
    select(id);
    // Its number is the next thing to type.
    focusAfter(['rm-t-label']);
  }

  function addRoom(event: FormEvent) {
    event.preventDefault();
    const name = newRoomName.trim();
    if (!name) {
      document.getElementById(newRoomId)?.focus();
      return;
    }
    if (state.rooms.some((candidate) => sameName(candidate.name, name))) {
      toast.say(t('rooms.list.duplicate'), { tone: 'error' });
      return;
    }
    dispatch({ type: 'addRoom', name });
    setNewRoomName('');
    // The new room is the last one; show it.
    setRoomId(`new-room-${state.sequence + 1}`);
    select(null);
  }

  async function onSave() {
    if (!branchId || busy) return;
    if (duplicates.length > 0) {
      toast.say(t('rooms.warning.duplicates', { labels: duplicates.join(', ') }), {
        tone: 'error',
      });
      return;
    }
    if (duplicateRooms.length > 0) {
      toast.say(t('rooms.warning.duplicateRooms', { names: duplicateRooms.join(', ') }), {
        tone: 'error',
      });
      return;
    }
    if (!dirty) {
      toast.say(t('rooms.noChanges'));
      return;
    }
    setSavedResult(null);
    const command = toSaveCommand(state);
    const keepRoom = room?.name ?? null;
    try {
      const result = await save.mutateAsync({ branchId, command });
      dispatch({ type: 'loaded', plan: result.plan });
      // New rooms and tables have server ids now: keep the room on screen by name.
      setRoomId(result.plan.areas.find((area) => area.name === keepRoom)?.id ?? null);
      select(null);
      setSavedResult(saveResultLines(t, result));
      toast.say(t('rooms.saved'));
    } catch {
      // Rendered below from the mutation's own error.
    }
  }

  /** Back to the plan as last loaded or saved. */
  function onDiscard() {
    if (!query.data || busy) return;
    dispatch({ type: 'loaded', plan: query.data });
    save.reset();
    select(null);
    setSavedResult(null);
    toast.say(t('rooms.saveBar.discarded'));
  }

  async function onReload() {
    setReloadFailed(false);
    const fresh = await query.refetch();
    // A failed read still hands back the copy it had: the stale one, which
    // the draft must not be swapped for.
    if (!fresh.isSuccess) {
      setReloadFailed(true);
      return;
    }
    loadedFor.current = fresh.data.branchId;
    dispatch({ type: 'loaded', plan: fresh.data });
    save.reset();
    select(null);
    setSavedResult(null);
    toast.say(t('rooms.conflict.reloaded'));
  }

  async function onConfirmDelete(table: DraftTable) {
    try {
      const result = await remove.mutateAsync(table.id);
      dispatch({ type: 'deleted', result });
      select(null);
      // The delete moved the plan's version: take it, or this editor's next
      // save would be refused as if somebody else had changed the rooms. A
      // server that does not say it yet is asked by reading the plan back.
      if (result.floorPlanVersion !== undefined) {
        dispatch({ type: 'versionAfterDelete', version: result.floorPlanVersion });
      } else {
        void query.refetch().then((fresh) => {
          if (fresh.isSuccess) dispatch({ type: 'versionMoved', plan: fresh.data });
        });
      }
      setDialog(null);
      // Its panel and its pin went with it.
      focusAfter(['stage-title', 'rooms-list-title']);
      toast.say(
        result.deleted
          ? t('rooms.delete.removed', { label: result.label })
          : t('rooms.delete.deactivated', { label: result.label }),
        {
          fallbackFocus: () => document.getElementById('stage-title'),
          // Back as an unsaved change: kept tables come back into service,
          // removed ones as new tables with the same number, room and pin.
          undo: () => {
            if (!undoable.current || savingRef.current) {
              toast.say(t('rooms.delete.undoGone', { label: table.label }), { tone: 'error' });
              return;
            }
            if (result.deleted) {
              dispatch({
                type: 'reAddTable',
                table: { label: table.label, seats: table.seats, isBookable: table.isBookable },
                roomId: table.roomId,
                pin: table.pin,
              });
            } else {
              dispatch({ type: 'restoreTable', id: table.id });
            }
            toast.say(t('rooms.delete.undone', { label: table.label }));
          },
        },
      );
    } catch {
      // Shown in the dialog from the mutation's own error.
    }
  }

  return {
    query,
    save,
    remove,
    regenerate,
    state,
    dispatch,
    loaded,
    busy,
    dirty,
    room,
    photo,
    photoIndex,
    active,
    selected,
    placing,
    unpinnedBookable,
    duplicates,
    duplicateRooms,
    select,
    setRoomId,
    setTableId,
    focusTableId,
    setFocusTableId,
    newRoomId,
    newRoomName,
    setNewRoomName,
    dialog,
    setDialog,
    menuFor,
    setMenuFor,
    savedResult,
    reloadFailed,
    focusAfter,
    showPhoto,
    startPlacing,
    removePhoto,
    addAt,
    addRoom,
    onSave,
    onDiscard,
    onReload,
    onConfirmDelete,
  };
}
