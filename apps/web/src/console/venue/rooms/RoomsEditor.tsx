import {
  ApiError,
  ConcurrencyConflictError,
  FloorPlanChangedError,
  MAX_ROOM_PHOTOS,
  NotFoundError,
  ValidationError,
  describeFailure,
  isFloorPlanInvalid,
  type EditorTablePin,
  type ReplaceFloorPlanCommand,
} from '@yalla/api';
import {
  isOfflinePaused,
  useDeleteTable,
  useEditorFloorPlan,
  useRegenerateTableQr,
  useSaveFloorPlan,
} from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import type { TFunction } from 'i18next';
import {
  useCallback,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { Dialog } from '../../ui/Dialog';
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  PlusIcon,
  TrashIcon,
  WarningIcon,
} from '../../ui/icons';
import { PageHeader } from '../../ui/PageHeader';
import { RowMenu } from '../../ui/RowMenu';
import { useToast } from '../../ui/toast';
import { PhotoPicker } from '../menu/PhotoPicker';
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard';
import { PhotoStage } from './PhotoStage';
import { TableQr } from './TableQr';
import {
  bookableUnpinned,
  duplicateLabels,
  duplicateRoomNames,
  freeSpot,
  initialState,
  isDirty,
  isServerId,
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

export interface RoomsEditorProps {
  /** From the token's scope, or the platform route — never a parameter the user typed. */
  readonly branchId: string | undefined;
  /** For the header's "Cascade · 3 rooms · 12 tables". */
  readonly branchName?: string | null;
  /**
   * `platform`: inside the platform admin's branch page (BranchRooms
   * artboard), whose header already names the page — so no title of its own.
   * `console`, the default, is the venue console's screen (Rooms artboard).
   * Both save from the sticky bar at the foot.
   */
  readonly layout?: 'console' | 'platform';
}

type Dialogs =
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
 * Rooms and tables (Rooms artboard): rooms on the left with the tables on no
 * photo and the ones out of service, the room's photo in the middle with a
 * pin for every table on it, the selected table on the right.
 *
 * A diner picks a room, swipes its photos and taps a table to book it, so
 * this is where a venue says what its rooms look like and where each table
 * stands in them. A click on the photo adds a table there — the next free
 * number, four seats, bookable — and puts the focus on its number; a pin is
 * dragged, or nudged with the arrow keys (Shift for steps of five).
 *
 * It saves **explicitly**, from the bar at the foot, against the `version` it
 * loaded (K6): rooms, photos and pins land together or not at all, and a plan
 * somebody else saved in the meantime is refused and offered, never
 * overwritten. Deleting a table is the exception — its own call, which
 * removes a table that was never used and takes one with history out of
 * service, says which, and offers an undo that puts it back as an unsaved
 * change.
 */
export function RoomsEditor({ branchId, branchName = null, layout = 'console' }: RoomsEditorProps) {
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
  const [dialog, setDialog] = useState<Dialogs | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [savedResult, setSavedResult] = useState<readonly string[] | null>(null);
  const [reloadFailed, setReloadFailed] = useState(false);

  /**
   * Where focus goes once the control that had it is gone: a photo removed,
   * a table deleted. The first of these ids on the page wins.
   */
  const focusAfter = useRef<readonly string[] | null>(null);
  // After every render: whatever set it also changed state, so one follows.
  useEffect(() => {
    const ids = focusAfter.current;
    if (!ids) return;
    focusAfter.current = null;
    for (const id of ids) {
      const target = document.getElementById(id);
      if (target) {
        target.focus();
        break;
      }
    }
  });

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
    focusAfter.current = ['stage-title'];
  }

  function removePhoto(fromRoomId: string, removedPhotoId: string, position: number) {
    dispatch({ type: 'removePhoto', roomId: fromRoomId, photoId: removedPhotoId });
    // The photo that slides into its place, else the one before it, else the heading.
    focusAfter.current = [
      `room-photo-${position + 1}`,
      `room-photo-${position - 1}`,
      'stage-title',
    ];
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
    focusAfter.current = ['rm-t-label'];
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
      const lines = [
        ...(result.deactivatedTables.length > 0
          ? [t('rooms.result.deactivated', { labels: result.deactivatedTables.join(', ') })]
          : []),
        ...(result.removedTables.length > 0
          ? [t('rooms.result.removed', { labels: result.removedTables.join(', ') })]
          : []),
        ...savedWarnings(t, result.warnings),
      ];
      setSavedResult(lines.length > 0 ? lines : null);
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
      focusAfter.current = ['stage-title', 'rooms-list-title'];
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

  if (!branchId || isOfflinePaused(query) || query.isLoading || !loaded) {
    const failed =
      !loaded && !query.isLoading && !query.isFetching && (query.isError || !query.data);
    return (
      <div className="yc-page">
        {layout === 'platform' ? null : <PageHeader title={t('nav.floorplan')} />}
        {!branchId ? (
          <p className="yc-card yc-empty-line">{t('rooms.noBranch')}</p>
        ) : isOfflinePaused(query) ? (
          <div className="yc-card yc-ov-pad">
            <QueryFailureNotice offline onRetry={() => void query.refetch()} />
          </div>
        ) : failed ? (
          // Once loaded, the draft is the screen: a failed read later must not hide it.
          <div className="yc-card yc-ov-pad">
            <QueryFailureNotice error={query.error} onRetry={() => void query.refetch()} />
          </div>
        ) : (
          <p className="yc-card yc-empty-line" role="status">
            {t('loading')}
          </p>
        )}
      </div>
    );
  }

  const conflict = save.error instanceof FloorPlanChangedError ? save.error : null;
  const onPhoto = photo ? active.filter((table) => table.pin?.photoId === photo.photoId) : [];
  const unpinned = active.filter((table) => !table.pin);
  const inactive = state.tables.filter((table) => !table.isActive);
  const roomName = (id: string | null) =>
    state.rooms.find((candidate) => candidate.id === id)?.name.trim() || t('rooms.table.noRoom');
  const summary = t('rooms.summary', { rooms: state.rooms.length, tables: active.length });

  return (
    <div
      className="yc-page yc-rooms-page"
      onKeyDown={(event) => {
        // Placing a table: Escape stops, without a dialog to close.
        if (event.key === 'Escape' && placing && !dialog) {
          select(null);
        }
      }}
    >
      {layout === 'platform' ? (
        <p className="yc-sub yc-rm-intro">{t('rooms.intro')}</p>
      ) : (
        <PageHeader
          title={t('nav.floorplan')}
          sub={t('rooms.intro')}
          actions={
            <span className="yc-muted yc-rm-sum">
              {branchName ? `${branchName} · ${summary}` : summary}
            </span>
          }
        />
      )}

      {conflict ? (
        <div className="yc-banner yc-banner-red" role="alert">
          <WarningIcon />
          <span className="yc-grow">
            <b>{t('rooms.conflict.title')}</b> {t('rooms.conflict.body')}
            {reloadFailed ? <> {t('rooms.conflict.reloadFailed')}</> : null}
          </span>
          <button
            type="button"
            className="yc-btn yc-btn-sec yc-btn-sm"
            onClick={() => void onReload()}
          >
            {t('rooms.conflict.reload')}
          </button>
        </div>
      ) : save.isError ? (
        <SaveRefusal
          error={save.error}
          sent={save.variables?.command ?? null}
          onRetry={() => void onSave()}
        />
      ) : null}

      {unpinnedBookable.length > 0 ? (
        <div className="yc-banner yc-banner-amber" role="status" data-testid="unpinned-warning">
          <AlertCircleIcon />
          <span className="yc-grow">
            {t('rooms.warning.unpinned', {
              count: unpinnedBookable.length,
              labels: unpinnedBookable.map((table) => table.label).join(', '),
            })}
          </span>
          <button
            type="button"
            className="yc-btn yc-btn-sec yc-btn-sm"
            onClick={() => startPlacing(unpinnedBookable[0]!)}
          >
            {t('rooms.warning.place', { label: unpinnedBookable[0]!.label })}
          </button>
        </div>
      ) : null}
      {duplicates.length > 0 ? (
        <div className="yc-banner yc-banner-amber" role="status">
          <AlertCircleIcon />
          <span className="yc-grow">
            {t('rooms.warning.duplicates', { labels: duplicates.join(', ') })}
          </span>
        </div>
      ) : null}
      {duplicateRooms.length > 0 ? (
        <div className="yc-banner yc-banner-amber" role="status">
          <AlertCircleIcon />
          <span className="yc-grow">
            {t('rooms.warning.duplicateRooms', { names: duplicateRooms.join(', ') })}
          </span>
        </div>
      ) : null}
      {savedResult ? (
        <div className="yc-banner yc-banner-amber" role="status" data-testid="save-result">
          <AlertCircleIcon />
          <ul className="yc-grow yc-rm-lines">
            {savedResult.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <fieldset className="yc-rm" disabled={busy} aria-busy={busy}>
        <legend className="yc-sr">{t('nav.floorplan')}</legend>
        <div className="yc-rm-col">
          <section className="yc-card" aria-labelledby="rooms-list-title">
            <div className="yc-card-h yc-card-h-tight">
              <h2 className="yc-h2" id="rooms-list-title" tabIndex={-1}>
                {t('rooms.list.title')}
              </h2>
            </div>
            {state.rooms.length === 0 ? (
              <p className="yc-empty-p">{t('rooms.list.empty')}</p>
            ) : (
              <ul className="yc-rooms">
                {state.rooms.map((candidate, index) => {
                  const current = candidate === room;
                  const name = candidate.name.trim() || t('rooms.list.unnamed');
                  const tables = active.filter((table) => table.roomId === candidate.id).length;
                  return (
                    <li key={candidate.id} className={current ? 'is-on' : undefined}>
                      <button
                        type="button"
                        className="yc-rpick"
                        aria-current={current}
                        onClick={() => {
                          setRoomId(candidate.id);
                          select(null);
                        }}
                      >
                        <b>{name}</b>
                        <span>
                          {t('rooms.list.meta', {
                            photos: t('rooms.list.photoCount', { count: candidate.photos.length }),
                            tables: t('rooms.list.tableCount', { count: tables }),
                          })}
                        </span>
                      </button>
                      <span className="yc-ordc">
                        <button
                          type="button"
                          className="yc-mini"
                          aria-label={t('rooms.list.moveUpAria', { name })}
                          aria-disabled={index === 0}
                          onClick={() =>
                            index > 0 && dispatch({ type: 'moveRoom', id: candidate.id, delta: -1 })
                          }
                        >
                          <ChevronUpIcon />
                        </button>
                        <button
                          type="button"
                          className="yc-mini"
                          aria-label={t('rooms.list.moveDownAria', { name })}
                          aria-disabled={index === state.rooms.length - 1}
                          onClick={() =>
                            index < state.rooms.length - 1 &&
                            dispatch({ type: 'moveRoom', id: candidate.id, delta: 1 })
                          }
                        >
                          <ChevronDownIcon />
                        </button>
                      </span>
                      <RowMenu
                        id={`room-${candidate.id}`}
                        label={t('rooms.room.menu', { name })}
                        open={menuFor === `room-${candidate.id}`}
                        onOpenChange={(open) => setMenuFor(open ? `room-${candidate.id}` : null)}
                        items={[
                          {
                            key: 'rename',
                            label: t('rooms.room.rename'),
                            icon: <ChevronRightIcon />,
                            onSelect: () => setDialog({ kind: 'renameRoom', room: candidate }),
                          },
                          {
                            key: 'remove',
                            label: t('rooms.room.remove'),
                            icon: <TrashIcon />,
                            danger: true,
                            onSelect: () => setDialog({ kind: 'removeRoom', room: candidate }),
                          },
                        ]}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
            <form className="yc-addroom" noValidate onSubmit={addRoom}>
              <label htmlFor={newRoomId} className="yc-sr">
                {t('rooms.list.newName')}
              </label>
              <input
                id={newRoomId}
                className="yc-ctl"
                placeholder={t('rooms.list.newPlaceholder')}
                value={newRoomName}
                onChange={(event) => setNewRoomName(event.target.value)}
              />
              <button type="submit" className="yc-btn yc-btn-sec yc-btn-sm">
                {t('rooms.list.add')}
              </button>
            </form>
          </section>

          <section className="yc-card" aria-labelledby="rm-unp-h">
            <div className="yc-card-h yc-card-h-tight">
              <h2 className="yc-h2 yc-h2-sm" id="rm-unp-h">
                {t('rooms.unpinned.title')}
              </h2>
            </div>
            {unpinned.length === 0 ? (
              <p className="yc-empty-p">{t('rooms.unpinned.none')}</p>
            ) : (
              <ul className="yc-tlist">
                {unpinned.map((table) => (
                  <li key={table.id} className={table.id === selected?.id ? 'is-on' : undefined}>
                    <span className="yc-ttag">{table.label}</span>
                    <span className="yc-grow yc-tl-where">{roomName(table.roomId)}</span>
                    <button
                      type="button"
                      id={`place-${table.id}`}
                      className="yc-btn yc-btn-sec yc-btn-sm"
                      aria-label={t('rooms.unpinned.placeAria', { label: table.label })}
                      onClick={() => startPlacing(table)}
                    >
                      {t('rooms.unpinned.place')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="yc-card" aria-labelledby="rm-off-h">
            <div className="yc-card-h yc-card-h-tight">
              <div>
                <h2 className="yc-h2 yc-h2-sm" id="rm-off-h">
                  {t('rooms.inactive.title')}
                </h2>
                <p className="yc-cap">{t('rooms.inactive.cap')}</p>
              </div>
            </div>
            {inactive.length === 0 ? (
              <p className="yc-empty-p">{t('rooms.inactive.none')}</p>
            ) : (
              <ul className="yc-tlist">
                {inactive.map((table) => (
                  <li key={table.id}>
                    <span className="yc-ttag">{table.label}</span>
                    <span className="yc-grow yc-tl-where">
                      {t('rooms.inactive.seats', { count: table.seats })}
                    </span>
                    <button
                      type="button"
                      className="yc-lnk"
                      aria-label={t('rooms.inactive.restoreAria', { label: table.label })}
                      onClick={() => {
                        dispatch({ type: 'restoreTable', id: table.id });
                        // Unlike the delete, this waits for Save: said, so it is not missed.
                        toast.say(t('rooms.inactive.restored', { label: table.label }));
                      }}
                    >
                      {t('rooms.inactive.restore')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="yc-rm-col">
          <section className="yc-card yc-stagecard" aria-labelledby="stage-title">
            <div className="yc-card-h yc-card-h-tight">
              <h2 className="yc-h2 yc-h2-sm" id="stage-title" tabIndex={-1}>
                {room
                  ? photo
                    ? t('rooms.stage.title', { name: room.name, position: photoIndex + 1 })
                    : room.name.trim() || t('rooms.list.unnamed')
                  : t('rooms.list.title')}
              </h2>
              {room && photo ? (
                <span className="yc-rm-stage-acts">
                  <button
                    type="button"
                    className="yc-btn yc-btn-ghost yc-btn-sm"
                    onClick={() => addAt(freeSpot(state, photo.photoId))}
                  >
                    {placing
                      ? t('rooms.stage.placeInMiddle', { label: placing.label })
                      : t('rooms.stage.addInMiddle')}
                  </button>
                  <RowMenu
                    id="room-photo"
                    label={t('rooms.photos.menu', { position: photoIndex + 1 })}
                    open={menuFor === 'room-photo'}
                    onOpenChange={(open) => setMenuFor(open ? 'room-photo' : null)}
                    items={[
                      {
                        key: 'earlier',
                        label: t('rooms.photos.moveEarlier'),
                        icon: <ArrowLeftIcon />,
                        disabled: photoIndex === 0,
                        onSelect: () =>
                          dispatch({
                            type: 'movePhoto',
                            roomId: room.id,
                            photoId: photo.photoId,
                            delta: -1,
                          }),
                      },
                      {
                        key: 'later',
                        label: t('rooms.photos.moveLater'),
                        icon: <ChevronRightIcon />,
                        disabled: photoIndex === room.photos.length - 1,
                        onSelect: () =>
                          dispatch({
                            type: 'movePhoto',
                            roomId: room.id,
                            photoId: photo.photoId,
                            delta: 1,
                          }),
                      },
                      {
                        key: 'remove',
                        label: t('rooms.photos.remove'),
                        icon: <TrashIcon />,
                        danger: true,
                        onSelect: () => {
                          const pinned = active.filter(
                            (table) => table.pin?.photoId === photo.photoId,
                          );
                          // Its tables come off it, bookable or not: asked
                          // first, by name, when there are any.
                          if (pinned.length > 0) {
                            setDialog({
                              kind: 'removePhoto',
                              roomId: room.id,
                              photoId: photo.photoId,
                              position: photoIndex + 1,
                              labels: pinned.map((table) => table.label),
                            });
                            return;
                          }
                          removePhoto(room.id, photo.photoId, photoIndex + 1);
                        },
                      },
                    ]}
                  />
                </span>
              ) : null}
            </div>

            {room && photo ? (
              <>
                <PhotoStage
                  photo={photo}
                  label={t('rooms.stage.label', { position: photoIndex + 1, name: room.name })}
                  tables={onPhoto}
                  selectedTableId={selected?.id ?? null}
                  placing={placing}
                  focusTableId={focusTableId}
                  onFocused={() => setFocusTableId(null)}
                  onClickAt={addAt}
                  onSelect={select}
                  onMove={(id, pin) => dispatch({ type: 'placeTable', id, pin })}
                  onUnpin={(id) => {
                    dispatch({ type: 'placeTable', id, pin: null });
                    // The pin had focus and is gone; the table is in the list on the left now.
                    focusAfter.current = [`place-${id}`];
                    setTableId(null);
                  }}
                  readOnly={busy}
                />
                <div className="yc-hintbar">
                  <span role="status">
                    {placing
                      ? t('rooms.stage.placing', { label: placing.label })
                      : t('rooms.stage.hint')}
                  </span>
                  <ul className="yc-pinkey" aria-label={t('rooms.legend')}>
                    <li>
                      <i className="yc-leg-book" aria-hidden="true" />
                      {t('rooms.pin.bookable')}
                    </li>
                    <li>
                      <i className="yc-leg-walk" aria-hidden="true" />
                      {t('rooms.pin.walkInOnly')}
                    </li>
                    <li>
                      <i className="yc-leg-new" aria-hidden="true" />
                      {t('rooms.pin.unsaved')}
                    </li>
                  </ul>
                </div>
              </>
            ) : room ? (
              <div className="yc-empty">
                <p>{t('rooms.photos.empty')}</p>
              </div>
            ) : (
              <div className="yc-empty">
                <p>{t('rooms.list.empty')}</p>
              </div>
            )}

            {room ? (
              <div className="yc-strip" role="group" aria-label={t('rooms.photos.strip')}>
                {room.photos.map((candidate, index) => (
                  <button
                    key={candidate.photoId}
                    type="button"
                    id={`room-photo-${index + 1}`}
                    className={candidate === photo ? 'yc-thumbb is-on' : 'yc-thumbb'}
                    aria-pressed={candidate === photo}
                    aria-label={t('rooms.photos.show', { position: index + 1 })}
                    onClick={() => showPhoto(room.id, candidate.photoId)}
                  >
                    <img src={candidate.cardUrl} alt="" />
                    <span className="yc-tn">{index + 1}</span>
                  </button>
                ))}
                {room.photos.length < MAX_ROOM_PHOTOS ? (
                  <button
                    type="button"
                    className="yc-addph"
                    onClick={() => setDialog({ kind: 'addPhoto', roomId: room.id })}
                  >
                    <PlusIcon />
                    {t('rooms.photos.addShort')}
                  </button>
                ) : null}
                <span className="yc-help yc-strip-n">
                  {t('rooms.photos.summary', { used: room.photos.length, max: MAX_ROOM_PHOTOS })}
                </span>
              </div>
            ) : null}
          </section>
        </div>

        <div className="yc-rm-col">
          {selected ? (
            <TablePanel
              key={selected.id}
              table={selected}
              roomName={roomName(selected.roomId)}
              duplicate={duplicates.some((label) => sameName(label, selected.label))}
              onChange={(patch) => dispatch({ type: 'updateTable', id: selected.id, patch })}
              onUnpin={() => {
                dispatch({ type: 'placeTable', id: selected.id, pin: null });
                toast.say(t('rooms.table.unpinned', { label: selected.label }));
                // The link went with the pin; the table is on the left now.
                focusAfter.current = [`place-${selected.id}`];
                setTableId(null);
              }}
              onDelete={() => {
                if (!isServerId(selected.id)) {
                  dispatch({ type: 'discardTable', id: selected.id });
                  select(null);
                  focusAfter.current = ['stage-title'];
                  return;
                }
                remove.reset();
                setDialog(
                  selected.status === 'occupied'
                    ? { kind: 'seated', table: selected }
                    : { kind: 'deleteTable', table: selected },
                );
              }}
              onRegenerateQr={() => {
                regenerate.reset();
                setDialog({ kind: 'regenerate', table: selected });
              }}
            />
          ) : (
            <section className="yc-card yc-rm-panel" aria-labelledby="rm-tp-h">
              <h2 className="yc-h2 yc-h2-sm" id="rm-tp-h">
                {t('rooms.table.panelTitle')}
              </h2>
              <p className="yc-muted yc-rm-none">{t('rooms.table.none')}</p>
            </section>
          )}
        </div>
      </fieldset>

      <div className="yc-savebar" role="region" aria-label={t('rooms.saveBar.label')}>
        <span className="yc-grow" aria-live="polite">
          {duplicates.length > 0
            ? t('rooms.saveBar.duplicates')
            : dirty
              ? t('rooms.saveBar.dirty', { summary })
              : t('rooms.saveBar.clean')}
        </span>
        {dirty ? (
          <button
            type="button"
            className="yc-btn yc-btn-sec yc-btn-sm"
            disabled={busy}
            onClick={onDiscard}
          >
            {t('rooms.saveBar.discard')}
          </button>
        ) : null}
        <button
          type="button"
          className="yc-btn yc-btn-pri yc-btn-sm"
          aria-busy={busy}
          onClick={() => void onSave()}
        >
          {busy ? <span className="yc-spin" aria-hidden="true" /> : null}
          {busy ? t('rooms.saving') : t('rooms.save')}
        </button>
      </div>

      {dialog?.kind === 'renameRoom' ? (
        <RenameRoomDialog
          room={dialog.room}
          taken={(name) =>
            state.rooms.some(
              (candidate) => candidate.id !== dialog.room.id && sameName(candidate.name, name),
            )
          }
          onCancel={() => setDialog(null)}
          onRename={(name) => {
            dispatch({ type: 'renameRoom', id: dialog.room.id, name });
            setDialog(null);
            toast.say(t('rooms.room.renamed', { name }));
          }}
        />
      ) : null}

      {dialog?.kind === 'removeRoom' ? (
        <Dialog
          alert
          title={t('rooms.room.removeTitle', { name: dialog.room.name })}
          description={`${
            dialog.room.photos.length > 0
              ? t('rooms.room.removePhotos', { count: dialog.room.photos.length })
              : t('rooms.room.removeNoPhotos')
          } ${(() => {
            const count = active.filter((table) => table.roomId === dialog.room.id).length;
            return count > 0
              ? t('rooms.room.removeTables', { count })
              : t('rooms.room.removeNoTables');
          })()}`}
          onClose={() => setDialog(null)}
          returnFocusTo={() =>
            document.querySelector<HTMLElement>(`[data-kebab="room-${dialog.room.id}"]`)
          }
        >
          <div className="yc-acts">
            <button
              type="button"
              className="yc-btn yc-btn-sec"
              data-autofocus=""
              onClick={() => setDialog(null)}
            >
              {t('common:action.cancel')}
            </button>
            <button
              type="button"
              className="yc-btn yc-btn-danger"
              onClick={() => {
                dispatch({ type: 'removeRoom', id: dialog.room.id });
                setDialog(null);
                setRoomId(null);
                select(null);
                // The opener went with the room.
                focusAfter.current = ['stage-title', 'rooms-list-title'];
              }}
            >
              {t('rooms.room.removeConfirm')}
            </button>
          </div>
        </Dialog>
      ) : null}

      {dialog?.kind === 'removePhoto' ? (
        <Dialog
          alert
          title={t('rooms.photos.removeTitle', { position: dialog.position })}
          description={t('rooms.photos.removeBody', {
            count: dialog.labels.length,
            labels: dialog.labels.join(', '),
          })}
          onClose={() => setDialog(null)}
          returnFocusTo={() => document.querySelector<HTMLElement>('[data-kebab="room-photo"]')}
        >
          <div className="yc-acts">
            <button
              type="button"
              className="yc-btn yc-btn-sec"
              data-autofocus=""
              onClick={() => setDialog(null)}
            >
              {t('common:action.cancel')}
            </button>
            <button
              type="button"
              className="yc-btn yc-btn-danger"
              onClick={() => {
                const { roomId: fromRoomId, photoId: removedPhotoId, position } = dialog;
                setDialog(null);
                removePhoto(fromRoomId, removedPhotoId, position);
              }}
            >
              {t('rooms.photos.removeConfirm')}
            </button>
          </div>
        </Dialog>
      ) : null}

      {dialog?.kind === 'seated' ? (
        <Dialog
          alert
          title={t('rooms.delete.seatedTitle', { label: dialog.table.label })}
          description={t('rooms.delete.seated', { label: dialog.table.label })}
          onClose={() => setDialog(null)}
        >
          <div className="yc-acts">
            <button
              type="button"
              className="yc-btn yc-btn-pri"
              data-autofocus=""
              onClick={() => setDialog(null)}
            >
              {t('rooms.delete.understood')}
            </button>
          </div>
        </Dialog>
      ) : null}

      {dialog?.kind === 'deleteTable' ? (
        <Dialog
          alert
          title={t('rooms.delete.title', { label: dialog.table.label })}
          description={
            // Said before it happens: a table with history is kept for its
            // records and taken out of service, and the person should know
            // which of the two this click does.
            dialog.table.isDeletable
              ? t('rooms.delete.removeBody')
              : t('rooms.delete.deactivateBody')
          }
          onClose={() => setDialog(null)}
          dismissible={!remove.isPending}
        >
          {remove.isError ? (
            remove.error instanceof ConcurrencyConflictError &&
            remove.error.code === 'conflicting-state' ? (
              <p className="yc-alert" role="alert">
                {t('rooms.delete.seated', { label: dialog.table.label })}
              </p>
            ) : remove.error instanceof ApiError &&
              remove.error.status === 409 &&
              remove.error.problem?.detail ? (
              // Any other refusal (upcoming bookings on the table, say) names
              // the tables and bookings itself: its own sentence is the answer.
              <p className="yc-alert" role="alert">
                {remove.error.problem.detail}
              </p>
            ) : (
              <QueryFailureNotice
                error={remove.error}
                onRetry={() => void onConfirmDelete(dialog.table)}
              />
            )
          ) : null}
          <div className="yc-acts">
            <button
              type="button"
              className="yc-btn yc-btn-sec"
              data-autofocus=""
              disabled={remove.isPending}
              onClick={() => setDialog(null)}
            >
              {t('common:action.cancel')}
            </button>
            <button
              type="button"
              className="yc-btn yc-btn-danger"
              aria-busy={remove.isPending}
              onClick={() => !remove.isPending && void onConfirmDelete(dialog.table)}
            >
              {dialog.table.isDeletable
                ? t('rooms.delete.confirm')
                : t('rooms.delete.confirmDeactivate')}
            </button>
          </div>
        </Dialog>
      ) : null}

      {dialog?.kind === 'regenerate' ? (
        <RegenerateDialog
          table={dialog.table}
          busy={regenerate.isPending}
          error={regenerate.isError ? regenerate.error : null}
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            const table = dialog.table;
            void regenerate
              .mutateAsync({ tableId: table.id })
              .then(({ qrToken }) => {
                dispatch({ type: 'qrReplaced', id: table.id, qrToken });
                setDialog(null);
                toast.say(t('rooms.qr.regenerated', { label: table.label }));
              })
              .catch(() => undefined);
          }}
        />
      ) : null}

      {dialog?.kind === 'addPhoto' ? (
        <Dialog
          title={t('rooms.photos.addTitle')}
          description={t('rooms.photos.addBody')}
          onClose={() => setDialog(null)}
          wide
        >
          <PhotoPicker
            branchId={branchId}
            photo={null}
            onChange={(uploaded) => {
              const target = dialog.roomId;
              dispatch({ type: 'addPhoto', roomId: target, photo: uploaded });
              showPhoto(target, uploaded.photoId);
              setDialog(null);
            }}
          />
          <div className="yc-acts">
            <button type="button" className="yc-btn yc-btn-sec" onClick={() => setDialog(null)}>
              {t('common:action.cancel')}
            </button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

/** Two names the same to a reader: case and the spaces round them do not count. */
function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

/** A room's new name: not blank, and not another room's. */
function RenameRoomDialog({
  room,
  taken,
  onCancel,
  onRename,
}: {
  readonly room: DraftRoom;
  readonly taken: (name: string) => boolean;
  readonly onCancel: () => void;
  readonly onRename: (name: string) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const fieldId = useId();
  const [name, setName] = useState(room.name);
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    const refusal = !trimmed
      ? t('rooms.room.noName')
      : taken(trimmed)
        ? t('rooms.room.duplicateName')
        : null;
    if (refusal) {
      setProblem(refusal);
      document.getElementById(fieldId)?.focus();
      return;
    }
    onRename(trimmed);
  }

  return (
    <Dialog
      title={t('rooms.room.renameTitle', { name: room.name })}
      onClose={onCancel}
      returnFocusTo={() => document.querySelector<HTMLElement>(`[data-kebab="room-${room.id}"]`)}
    >
      <form className="yc-dialog-form" noValidate onSubmit={submit}>
        <div className="yc-fld">
          <label htmlFor={fieldId}>{t('rooms.room.name')}</label>
          <input
            id={fieldId}
            className="yc-ctl"
            value={name}
            maxLength={80}
            data-autofocus=""
            aria-invalid={problem !== null}
            {...(problem ? { 'aria-describedby': `${fieldId}-err` } : {})}
            onChange={(event) => {
              setName(event.target.value);
              setProblem(null);
            }}
          />
          {problem ? (
            <span className="yc-err" id={`${fieldId}-err`}>
              {problem}
            </span>
          ) : null}
        </div>
        <div className="yc-acts">
          <button type="button" className="yc-btn yc-btn-sec" onClick={onCancel}>
            {t('common:action.cancel')}
          </button>
          <button type="submit" className="yc-btn yc-btn-pri">
            {t('common:action.save')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Typed confirmation, because the consequence is physical: the sticker
 * already on that table stops working the moment this lands, and somebody
 * has to go and replace it.
 */
function RegenerateDialog({
  table,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  readonly table: DraftTable;
  readonly busy: boolean;
  readonly error: unknown;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const fieldId = useId();
  const [typed, setTyped] = useState('');
  const matches = typed.trim() === table.label.trim();
  return (
    <Dialog
      alert
      title={t('rooms.qr.regenerateTitle', { label: table.label })}
      description={t('rooms.qr.regenerateWarning', { label: table.label })}
      onClose={onCancel}
      dismissible={!busy}
      returnFocusTo={() => document.getElementById('rm-regen')}
    >
      <form
        className="yc-dialog-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!matches) {
            document.getElementById(fieldId)?.focus();
            return;
          }
          if (!busy) onConfirm();
        }}
      >
        <div className="yc-fld">
          <label htmlFor={fieldId}>{t('rooms.qr.typeLabel', { label: table.label })}</label>
          <input
            id={fieldId}
            className="yc-ctl"
            autoComplete="off"
            data-autofocus=""
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>
        {error ? <QueryFailureNotice error={error} /> : null}
        <div className="yc-acts">
          <button type="button" className="yc-btn yc-btn-sec" disabled={busy} onClick={onCancel}>
            {t('common:action.cancel')}
          </button>
          <button
            type="submit"
            className="yc-btn yc-btn-danger"
            aria-disabled={!matches || busy}
            aria-busy={busy}
          >
            {t('rooms.qr.regenerateConfirm')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function TablePanel({
  table,
  roomName,
  duplicate,
  onChange,
  onUnpin,
  onDelete,
  onRegenerateQr,
}: {
  readonly table: DraftTable;
  readonly roomName: string;
  readonly duplicate: boolean;
  readonly onChange: (patch: { label?: string; seats?: number; isBookable?: boolean }) => void;
  readonly onUnpin: () => void;
  readonly onDelete: () => void;
  readonly onRegenerateQr: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const noLabel = table.label.trim() === '';
  const labelError = noLabel
    ? t('rooms.table.noLabel')
    : duplicate
      ? t('rooms.table.duplicateLabel')
      : null;
  const where = [
    roomName,
    table.pin ? null : t('rooms.table.notOnPhoto'),
    table.status && table.status !== 'free' ? t(`common:tableStatus.${table.status}`) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <section className="yc-card yc-rm-panel" aria-labelledby="rm-tp-h">
      <div>
        <h2 className="yc-h2 yc-h2-sm" id="rm-tp-h">
          {t('rooms.table.title', { label: table.label })}
        </h2>
        <p className="yc-cap">{where}</p>
      </div>
      <div className="yc-row2">
        <div className="yc-fld">
          <label htmlFor="rm-t-label">
            {t('rooms.field.label')}
            <span className="yc-req" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id="rm-t-label"
            className="yc-ctl"
            value={table.label}
            aria-invalid={labelError !== null}
            {...(labelError ? { 'aria-describedby': 'rm-t-label-err' } : {})}
            onChange={(event) => onChange({ label: event.target.value })}
          />
        </div>
        <div className="yc-fld">
          <label htmlFor="rm-t-seats">{t('rooms.field.seats')}</label>
          <input
            id="rm-t-seats"
            className="yc-ctl"
            type="number"
            min={1}
            max={99}
            inputMode="numeric"
            value={table.seats}
            onChange={(event) => {
              // A cleared field is someone about to type; only a real count is kept.
              const value = Number.parseInt(event.target.value, 10);
              if (Number.isInteger(value) && value >= 1) onChange({ seats: value });
            }}
          />
        </div>
      </div>
      {labelError ? (
        <span className="yc-err" id="rm-t-label-err">
          {labelError}
        </span>
      ) : null}
      <label className="yc-chk">
        <input
          type="checkbox"
          checked={table.isBookable}
          onChange={(event) => onChange({ isBookable: event.target.checked })}
        />
        {t('rooms.field.bookable')}
      </label>
      <div className="yc-sep" />
      <TableQr label={table.label} qrToken={table.qrToken} />
      {table.qrToken ? (
        <button type="button" id="rm-regen" className="yc-lnk yc-lnk-l" onClick={onRegenerateQr}>
          {t('rooms.qr.regenerate')}
        </button>
      ) : null}
      <div className="yc-sep" />
      {table.pin ? (
        <button type="button" className="yc-lnk yc-lnk-l" onClick={onUnpin}>
          {t('rooms.table.unpin')}
        </button>
      ) : null}
      <button type="button" className="yc-lnk yc-lnk-l yc-lnk-red" onClick={onDelete}>
        {t('rooms.table.delete')}
      </button>
    </section>
  );
}

/**
 * What a save warned about, in the person's language where the warning is one
 * the editor knows, and in the server's own sentence otherwise.
 *
 * The bookable-but-unpinned warning is left out: the banner above the editor
 * says the same thing from the same draft, live.
 */
function savedWarnings(t: TFunction, warnings: readonly string[]): string[] {
  const lines: string[] = [];
  for (const warning of warnings) {
    if (UNPINNED_BOOKABLE.test(warning)) continue;
    const removed = UNPINNED_BY_REMOVAL.exec(warning);
    const moved = UNPINNED_BY_MOVE.exec(warning);
    if (removed) lines.push(t('rooms.result.unpinnedByRemoval', { labels: removed[1] }));
    else if (moved) lines.push(t('rooms.result.unpinnedByMove', { labels: moved[1] }));
    else lines.push(warning);
  }
  return lines;
}

// The server's sentences (`FloorPlanRules.Validate`, `ReplaceFloorPlanAsync`).
const UNPINNED_BOOKABLE =
  /^Bookable table\(s\) .+ are not pinned on a room photo, so diners are not offered them\.$/u;
const UNPINNED_BY_REMOVAL =
  /^Table\(s\) (.+) were taken off photos this plan removed from every room\.$/u;
const UNPINNED_BY_MOVE =
  /^Table\(s\) (.+) were taken off photos this plan moved to another room\.$/u;

/**
 * A refused save, in the person's language, as a red banner.
 *
 * The server names photo and pin problems by their place in the payload —
 * `areas[1].photoIds[3]`, `tables[4].photoId` — so they are read back against
 * the command that was sent to name the room or the table.
 */
function SaveRefusal({
  error,
  sent,
  onRetry,
}: {
  readonly error: unknown;
  readonly sent: ReplaceFloorPlanCommand | null;
  readonly onRetry: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);

  const banner = (children: ReactNode) => (
    <div className="yc-banner yc-banner-red" role="alert">
      {children}
    </div>
  );

  if (isFloorPlanInvalid(error)) {
    return banner(
      <div className="yc-grow">
        <p className="yc-rm-p">
          {error.duplicateLabels.length > 0
            ? t('rooms.warning.duplicates', { labels: error.duplicateLabels.join(', ') })
            : t('rooms.error.invalid')}
        </p>
        {/* The server's own sentences name the tables and rooms involved. */}
        <ul className="yc-rm-lines">
          {error.errors.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>,
    );
  }

  if (error instanceof ValidationError && error.violations.length > 0) {
    const lines = [...new Set(error.violations.map((v) => violationLine(t, v, sent)))];
    return banner(
      <ul className="yc-grow yc-rm-lines">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>,
    );
  }

  // A refusal the server explains itself, naming tables and bookings: a
  // table left out of the plan that still has upcoming bookings, say.
  if (error instanceof ApiError && error.status === 409 && error.problem?.detail) {
    return banner(<span className="yc-grow">{error.problem.detail}</span>);
  }

  if (error instanceof NotFoundError) {
    return banner(<span className="yc-grow">{t('rooms.error.photoNotFound')}</span>);
  }

  return (
    <div className="yc-card yc-ov-pad">
      <QueryFailureNotice
        error={error}
        offline={describeFailure(error) === 'offline'}
        onRetry={onRetry}
      />
    </div>
  );
}

function violationLine(
  t: TFunction,
  violation: { field: string; bound?: string | undefined },
  sent: ReplaceFloorPlanCommand | null,
): string {
  const area = /^areas\[(\d+)\]\.photoIds(\[\d+\])?$/u.exec(violation.field);
  if (area) {
    const name = sent?.areas[Number(area[1])]?.name ?? '';
    return area[2]
      ? t('rooms.error.photoInTwoRooms', { name })
      : t('rooms.error.tooManyPhotos', { name, max: MAX_ROOM_PHOTOS });
  }
  const table = /^tables\[(\d+)\]\.(photoId|photoX|photoY)$/u.exec(violation.field);
  if (table) {
    const label = sent?.tables[Number(table[1])]?.label ?? '';
    return violation.bound === 'conflict'
      ? t('rooms.error.pinOtherRoom', { label })
      : t('rooms.error.pinInvalid', { label });
  }
  return t('rooms.error.invalid');
}
