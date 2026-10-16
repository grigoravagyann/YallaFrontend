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
import { useDialogFocus } from '../../../components/useDialogFocus';
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
  roomOfPhoto,
  toSaveCommand,
  type DraftRoom,
  type DraftTable,
  type RoomsAction,
} from './roomsModel';

/**
 * The actions that are the person's own edits, as against the server's
 * answers (`loaded`, `deleted`, `qrReplaced`, `versionMoved`). An edit makes
 * "Rooms saved." and a refused save's reasons stale.
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
]);

export interface RoomsEditorProps {
  /** From the token's scope, or the platform route — never a parameter the user typed. */
  readonly branchId: string | undefined;
}

/**
 * The rooms editor: rooms, their photos, and a pin for every table.
 *
 * A diner picks a room, swipes its photos and taps a table to book it, so
 * this is where a venue says what its rooms look like and where each table
 * stands in them. Add a room, add its photos, then click a photo where a
 * table stands to add it there; drag a pin, or nudge it with the arrow keys,
 * to move it.
 *
 * It saves **explicitly**, against the `version` it loaded (K6): rooms, photos
 * and pins land together or not at all, and a plan somebody else saved in the
 * meantime is refused and offered, never overwritten. Deleting a table is the
 * exception — it is its own call, which removes a table that was never used
 * and takes one with history out of service, and the editor says which.
 */
export function RoomsEditor({ branchId }: RoomsEditorProps) {
  const { t } = useTranslation(['admin', 'common']);
  const query = useEditorFloorPlan(branchId);
  const save = useSaveFloorPlan();
  const remove = useDeleteTable(branchId);
  const regenerate = useRegenerateTableQr();

  const [state, apply] = useReducer(reducer, undefined, initialState);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [photoByRoom, setPhotoByRoom] = useState<Record<string, string>>({});
  const [tableId, setTableId] = useState<string | null>(null);
  const [focusTableId, setFocusTableId] = useState<string | null>(null);
  const [draftPin, setDraftPin] = useState<EditorTablePin | null>(null);
  const [newRoomName, setNewRoomName] = useState('');
  const [pickerKey, setPickerKey] = useState(0);
  const [removingRoom, setRemovingRoom] = useState<DraftRoom | null>(null);
  const [deleting, setDeleting] = useState<DraftTable | null>(null);
  const [regenerating, setRegenerating] = useState<DraftTable | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [savedResult, setSavedResult] = useState<{
    deactivated: readonly string[];
    removed: readonly string[];
    warnings: readonly string[];
  } | null>(null);
  const [reloadFailed, setReloadFailed] = useState(false);
  const [focusListTableId, setFocusListTableId] = useState<string | null>(null);
  const [removingPhoto, setRemovingPhoto] = useState<{
    readonly roomId: string;
    readonly photoId: string;
    readonly position: number;
    readonly labels: readonly string[];
  } | null>(null);
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
  const unpinned = bookableUnpinned(state);
  const duplicates = duplicateLabels(state);
  const duplicateRooms = duplicateRoomNames(state);

  const select = useCallback((id: string | null) => {
    setTableId(id);
    setDraftPin(null);
  }, []);

  function showPhoto(nextRoomId: string, nextPhotoId: string) {
    setPhotoByRoom((current) => ({ ...current, [nextRoomId]: nextPhotoId }));
    // A table half-added on the photo going off screen would be pinned on it unseen.
    setDraftPin(null);
  }

  function removePhoto(fromRoomId: string, removedPhotoId: string, position: number) {
    dispatch({ type: 'removePhoto', roomId: fromRoomId, photoId: removedPhotoId });
    setDraftPin(null);
    // The photo that slides into its place, else the one before it, else the heading.
    focusAfter.current = [
      `room-photo-${position + 1}`,
      `room-photo-${position - 1}`,
      'room-photos-title',
    ];
  }

  function onClickPhoto(pin: EditorTablePin) {
    setNotice(null);
    if (placing) {
      dispatch({ type: 'placeTable', id: placing.id, pin });
      return;
    }
    setTableId(null);
    setDraftPin(pin);
  }

  async function onSave() {
    if (!branchId) return;
    setSavedResult(null);
    setNotice(null);
    const command = toSaveCommand(state);
    const keepRoom = room?.name ?? null;
    try {
      const result = await save.mutateAsync({ branchId, command });
      dispatch({ type: 'loaded', plan: result.plan });
      // New rooms and tables have server ids now: keep the room on screen by name.
      setRoomId(result.plan.areas.find((area) => area.name === keepRoom)?.id ?? null);
      select(null);
      setSavedResult({
        deactivated: result.deactivatedTables,
        removed: result.removedTables,
        warnings: result.warnings,
      });
    } catch {
      // Rendered below from the mutation's own error.
    }
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
  }

  async function onConfirmDelete(table: DraftTable) {
    setNotice(null);
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
      setNotice(
        result.deleted
          ? t('rooms.delete.removed', { label: result.label })
          : t('rooms.delete.deactivated', { label: result.label }),
      );
      setDeleting(null);
      // Its panel and its pin went with it.
      focusAfter.current = ['stage-title', 'room-title', 'rooms-list-title'];
    } catch {
      // Shown in the dialog from the mutation's own error.
    }
  }

  if (!branchId) {
    return (
      <section className="page">
        <h1>{t('nav.floorplan')}</h1>
        <p className="muted">{t('rooms.noBranch')}</p>
      </section>
    );
  }

  if (isOfflinePaused(query)) {
    return (
      <section className="page">
        <h1>{t('nav.floorplan')}</h1>
        <QueryFailureNotice offline onRetry={() => void query.refetch()} />
      </section>
    );
  }

  if (query.isLoading || (!loaded && query.isFetching)) {
    return (
      <section className="page">
        <h1>{t('nav.floorplan')}</h1>
        <p className="muted">{t('loading')}</p>
      </section>
    );
  }

  // Once loaded, the draft is the screen: a failed read later must not hide it.
  if (!loaded && (query.isError || !query.data)) {
    return (
      <section className="page">
        <h1>{t('nav.floorplan')}</h1>
        <QueryFailureNotice error={query.error} onRetry={() => void query.refetch()} />
      </section>
    );
  }

  const conflict = save.error instanceof FloorPlanChangedError ? save.error : null;
  const roomTables = room ? active.filter((table) => table.roomId === room.id) : [];
  const onPhoto = photo ? active.filter((table) => table.pin?.photoId === photo.photoId) : [];
  const roomUnpinned = roomTables.filter((table) => !table.pin);
  const noRoom = active.filter((table) => table.roomId === null);
  const inactive = state.tables.filter((table) => !table.isActive);
  const roomNameTaken = (name: string) =>
    duplicateRooms.some(
      (duplicate) => duplicate.toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
    );

  return (
    <section className="page editor rooms-editor">
      <header className="page-head">
        <div>
          <h1>{t('nav.floorplan')}</h1>
          <p className="muted small">
            {t('rooms.summary', { rooms: state.rooms.length, tables: active.length })}
            {dirty ? ` · ${t('rooms.unsaved')}` : ''}
          </p>
        </div>
        <div className="actions">
          <button
            type="button"
            className="button button-primary"
            // The server refuses these; the notices below say why.
            disabled={!dirty || busy || duplicateRooms.length > 0 || duplicates.length > 0}
            onClick={() => void onSave()}
          >
            {save.isPending ? t('rooms.saving') : t('rooms.save')}
          </button>
        </div>
      </header>

      <p className="muted">{t('rooms.intro')}</p>

      {conflict ? (
        <div className="notice notice-error" role="alert">
          <p>
            <strong>{t('rooms.conflict.title')}</strong> {t('rooms.conflict.body')}
          </p>
          <button type="button" className="button button-small" onClick={() => void onReload()}>
            {t('rooms.conflict.reload')}
          </button>
          {reloadFailed ? <p className="error">{t('rooms.conflict.reloadFailed')}</p> : null}
        </div>
      ) : save.isError ? (
        <SaveRefusal
          error={save.error}
          sent={save.variables?.command ?? null}
          onRetry={() => void onSave()}
        />
      ) : null}

      {duplicates.length > 0 ? (
        <div className="notice notice-error" role="alert">
          <p>{t('rooms.warning.duplicates', { labels: duplicates.join(', ') })}</p>
        </div>
      ) : null}

      {duplicateRooms.length > 0 ? (
        <div className="notice notice-error" role="alert">
          <p>{t('rooms.warning.duplicateRooms', { names: duplicateRooms.join(', ') })}</p>
        </div>
      ) : null}

      {unpinned.length > 0 ? (
        <div className="notice notice-warning" role="status" data-testid="unpinned-warning">
          <p>
            {t('rooms.warning.unpinned', {
              count: unpinned.length,
              labels: unpinned.map((table) => table.label).join(', '),
            })}
          </p>
        </div>
      ) : null}

      {savedResult ? (
        <div className="notice notice-offline" role="status">
          <p>
            {t('rooms.saved')}
            {savedResult.deactivated.length > 0
              ? ` ${t('rooms.result.deactivated', { labels: savedResult.deactivated.join(', ') })}`
              : ''}
            {savedResult.removed.length > 0
              ? ` ${t('rooms.result.removed', { labels: savedResult.removed.join(', ') })}`
              : ''}
          </p>
          {savedWarnings(t, savedResult.warnings).length > 0 ? (
            <ul className="small">
              {savedWarnings(t, savedResult.warnings).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {notice ? (
        <div className="notice notice-offline" role="status">
          <p>{notice}</p>
        </div>
      ) : null}

      <fieldset className="editor-body rooms-body" disabled={busy} aria-busy={busy}>
        <aside className="editor-areas rooms-list" aria-labelledby="rooms-list-title">
          <h2 id="rooms-list-title" tabIndex={-1}>
            {t('rooms.list.title')}
          </h2>
          {state.rooms.length === 0 ? (
            <p className="muted small">{t('rooms.list.empty')}</p>
          ) : (
            <ol className="rooms-list-items">
              {state.rooms.map((candidate, index) => (
                <li key={candidate.id} className={candidate === room ? 'is-current' : undefined}>
                  <button
                    type="button"
                    className={`chip${candidate === room ? ' is-on' : ''}`}
                    aria-pressed={candidate === room}
                    onClick={() => {
                      setRoomId(candidate.id);
                      select(null);
                    }}
                  >
                    {candidate.name.trim() || t('rooms.list.unnamed')} ·{' '}
                    {t('rooms.list.photoCount', { count: candidate.photos.length })}
                  </button>
                  <span className="rooms-list-actions">
                    <button
                      type="button"
                      className="button button-small"
                      disabled={index === 0}
                      aria-label={`${t('rooms.list.moveUp')} (${candidate.name})`}
                      onClick={() => dispatch({ type: 'moveRoom', id: candidate.id, delta: -1 })}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="button button-small"
                      disabled={index === state.rooms.length - 1}
                      aria-label={`${t('rooms.list.moveDown')} (${candidate.name})`}
                      onClick={() => dispatch({ type: 'moveRoom', id: candidate.id, delta: 1 })}
                    >
                      ↓
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          )}
          <form
            className="rooms-add"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              const name = newRoomName.trim();
              if (!name) return;
              dispatch({ type: 'addRoom', name });
              setNewRoomName('');
              // The new room is the last one; show it.
              setRoomId(`new-room-${state.sequence + 1}`);
              select(null);
            }}
          >
            <label className="labelled">
              {t('rooms.list.newName')}
              <input
                className="field"
                value={newRoomName}
                placeholder={t('rooms.list.newPlaceholder')}
                onChange={(event) => setNewRoomName(event.target.value)}
              />
            </label>
            <button type="submit" className="button button-small" disabled={!newRoomName.trim()}>
              {t('rooms.list.add')}
            </button>
          </form>
        </aside>

        {room ? (
          <div className="rooms-room">
            <section className="editor-panel" aria-labelledby="room-title">
              <h2 id="room-title" tabIndex={-1}>
                {room.name.trim() || t('rooms.list.unnamed')}
              </h2>
              <div className="rooms-room-head">
                <label className="labelled">
                  {t('rooms.room.name')}
                  <input
                    className="field"
                    value={room.name}
                    aria-invalid={roomNameTaken(room.name) || room.name.trim() === ''}
                    onChange={(event) =>
                      dispatch({ type: 'renameRoom', id: room.id, name: event.target.value })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="button button-small button-danger"
                  onClick={() => setRemovingRoom(room)}
                >
                  {t('rooms.room.remove')}
                </button>
              </div>
              {room.name.trim() === '' ? (
                <p className="error small">{t('rooms.room.noName')}</p>
              ) : null}
              {roomNameTaken(room.name) ? (
                <p className="error small">{t('rooms.room.duplicateName')}</p>
              ) : null}

              <h3 id="room-photos-title" tabIndex={-1}>
                {t('rooms.photos.title')}
              </h3>
              <p className="small muted">
                {t('rooms.photos.summary', { used: room.photos.length, max: MAX_ROOM_PHOTOS })}
              </p>
              {room.photos.length === 0 ? (
                <p className="muted small">{t('rooms.photos.empty')}</p>
              ) : (
                <ol className="gallery-grid rooms-photos">
                  {room.photos.map((candidate, index) => (
                    <li
                      key={candidate.photoId}
                      className={`gallery-tile${candidate === photo ? ' is-current' : ''}`}
                    >
                      <button
                        type="button"
                        id={`room-photo-${index + 1}`}
                        className="rooms-photo-thumb"
                        aria-pressed={candidate === photo}
                        aria-label={t('rooms.photos.show', { position: index + 1 })}
                        onClick={() => showPhoto(room.id, candidate.photoId)}
                      >
                        <img src={candidate.cardUrl} alt="" />
                      </button>
                      <div className="gallery-tile-actions">
                        <button
                          type="button"
                          className="button button-small"
                          disabled={index === 0}
                          aria-label={`${t('rooms.photos.moveEarlier')} (${index + 1})`}
                          onClick={() =>
                            dispatch({
                              type: 'movePhoto',
                              roomId: room.id,
                              photoId: candidate.photoId,
                              delta: -1,
                            })
                          }
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          className="button button-small"
                          disabled={index === room.photos.length - 1}
                          aria-label={`${t('rooms.photos.moveLater')} (${index + 1})`}
                          onClick={() =>
                            dispatch({
                              type: 'movePhoto',
                              roomId: room.id,
                              photoId: candidate.photoId,
                              delta: 1,
                            })
                          }
                        >
                          →
                        </button>
                        <button
                          type="button"
                          className="button button-small button-danger"
                          aria-label={`${t('rooms.photos.remove')} (${index + 1})`}
                          onClick={() => {
                            const pinned = active.filter(
                              (table) => table.pin?.photoId === candidate.photoId,
                            );
                            // Its tables come off it, bookable or not: asked
                            // first, by name, when there are any.
                            if (pinned.length > 0) {
                              setRemovingPhoto({
                                roomId: room.id,
                                photoId: candidate.photoId,
                                position: index + 1,
                                labels: pinned.map((table) => table.label),
                              });
                              return;
                            }
                            removePhoto(room.id, candidate.photoId, index + 1);
                          }}
                        >
                          {t('rooms.photos.remove')}
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {room.photos.length < MAX_ROOM_PHOTOS ? (
                <div>
                  <p className="small">{t('rooms.photos.add')}</p>
                  <PhotoPicker
                    key={pickerKey}
                    branchId={branchId}
                    photo={null}
                    onChange={(uploaded) => {
                      dispatch({ type: 'addPhoto', roomId: room.id, photo: uploaded });
                      showPhoto(room.id, uploaded.photoId);
                      setPickerKey((key) => key + 1);
                    }}
                  />
                </div>
              ) : (
                <p className="muted small">{t('rooms.photos.full', { max: MAX_ROOM_PHOTOS })}</p>
              )}
            </section>

            {photo ? (
              <section className="editor-panel" aria-labelledby="stage-title">
                <h2 id="stage-title" tabIndex={-1}>
                  {t('rooms.stage.title', { position: photoIndex + 1, name: room.name })}
                </h2>
                <p className="muted small" role="status">
                  {placing
                    ? t('rooms.stage.placing', { label: placing.label })
                    : t('rooms.stage.hint')}
                </p>
                <PhotoStage
                  photo={photo}
                  label={t('rooms.stage.label', { position: photoIndex + 1, name: room.name })}
                  tables={onPhoto}
                  selectedTableId={selected?.id ?? null}
                  placing={placing}
                  focusTableId={focusTableId}
                  onFocused={() => setFocusTableId(null)}
                  onClickAt={onClickPhoto}
                  onSelect={select}
                  onMove={(id, pin) => dispatch({ type: 'placeTable', id, pin })}
                  onUnpin={(id) => {
                    dispatch({ type: 'placeTable', id, pin: null });
                    // The pin had focus and is gone; the table is in the list below now.
                    setFocusListTableId(id);
                  }}
                  readOnly={busy}
                />
                <Legend />
                <div className="actions">
                  {placing ? (
                    <button
                      type="button"
                      className="button button-small"
                      onClick={() => {
                        dispatch({
                          type: 'placeTable',
                          id: placing.id,
                          pin: freeSpot(state, photo.photoId),
                        });
                        setFocusTableId(placing.id);
                      }}
                    >
                      {t('rooms.stage.placeInMiddle', { label: placing.label })}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button button-small"
                      onClick={() => {
                        setTableId(null);
                        // Beside any pin already in the middle, never on top of it.
                        setDraftPin(freeSpot(state, photo.photoId));
                      }}
                    >
                      {t('rooms.stage.addInMiddle')}
                    </button>
                  )}
                </div>
                {draftPin ? (
                  <NewTableForm
                    key={`${draftPin.photoId}:${draftPin.x}:${draftPin.y}`}
                    suggestedLabel={nextLabel(state)}
                    onCancel={() => setDraftPin(null)}
                    onAdd={(input) => {
                      setDraftPin(null);
                      // The reducer adds nothing for a photo no room holds any more.
                      if (!roomOfPhoto(state.rooms, draftPin.photoId)) return;
                      dispatch({ type: 'addTable', table: input, pin: draftPin });
                      setFocusTableId(`new-table-${state.sequence + 1}`);
                      setTableId(`new-table-${state.sequence + 1}`);
                    }}
                  />
                ) : null}
              </section>
            ) : null}

            {roomUnpinned.length > 0 ? (
              <UnpinnedList
                title={t('rooms.unpinned.title')}
                tables={roomUnpinned}
                selectedId={selected?.id ?? null}
                onSelect={select}
                focusTableId={focusListTableId}
                onFocused={() => setFocusListTableId(null)}
              />
            ) : null}
          </div>
        ) : null}

        <div className="editor-side">
          {selected ? (
            <TablePanel
              key={selected.id}
              table={selected}
              roomName={state.rooms.find((r) => r.id === selected.roomId)?.name ?? null}
              duplicate={duplicates.some(
                (label) => label.toLocaleLowerCase() === selected.label.trim().toLocaleLowerCase(),
              )}
              onChange={(patch) => dispatch({ type: 'updateTable', id: selected.id, patch })}
              onUnpin={() => {
                dispatch({ type: 'placeTable', id: selected.id, pin: null });
                // The button went with the pin; the table is in the list below now.
                setFocusListTableId(selected.id);
              }}
              onDelete={() => {
                if (!isServerId(selected.id)) {
                  dispatch({ type: 'discardTable', id: selected.id });
                  select(null);
                  return;
                }
                remove.reset();
                setDeleting(selected);
              }}
              onRegenerateQr={() => {
                regenerate.reset();
                setRegenerating(selected);
                setConfirmText('');
              }}
            />
          ) : (
            <aside className="editor-panel">
              <h2>{t('rooms.table.panelTitle')}</h2>
              <p className="muted small">{t('rooms.table.none')}</p>
            </aside>
          )}

          {noRoom.length > 0 ? (
            <UnpinnedList
              title={t('rooms.unpinned.noRoom')}
              tables={noRoom}
              selectedId={selected?.id ?? null}
              onSelect={select}
            />
          ) : null}

          {inactive.length > 0 ? (
            <aside className="editor-panel" aria-labelledby="inactive-title">
              <h2 id="inactive-title">{t('rooms.inactive.title')}</h2>
              <p className="muted small">{t('rooms.inactive.body')}</p>
              <ul className="rooms-table-list">
                {inactive.map((table) => (
                  <li key={table.id}>
                    <span>{t('rooms.table.title', { label: table.label })}</span>
                    <button
                      type="button"
                      className="button button-small"
                      onClick={() => {
                        dispatch({ type: 'restoreTable', id: table.id });
                        // Unlike the delete, this waits for Save: said, so it is not missed.
                        setNotice(t('rooms.inactive.restored', { label: table.label }));
                      }}
                      aria-label={`${t('rooms.inactive.restore')} (${table.label})`}
                    >
                      {t('rooms.inactive.restore')}
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}
        </div>
      </fieldset>

      {removingRoom ? (
        <RoomsDialog
          title={t('rooms.room.removeTitle', { name: removingRoom.name })}
          onCancel={() => setRemovingRoom(null)}
        >
          <p>
            {removingRoom.photos.length > 0
              ? t('rooms.room.removePhotos', { count: removingRoom.photos.length })
              : t('rooms.room.removeNoPhotos')}{' '}
            {(() => {
              const count = active.filter((table) => table.roomId === removingRoom.id).length;
              return count > 0
                ? t('rooms.room.removeTables', { count })
                : t('rooms.room.removeNoTables');
            })()}
          </p>
          <div className="actions">
            <button type="button" className="button" onClick={() => setRemovingRoom(null)}>
              {t('common:action.cancel')}
            </button>
            <button
              type="button"
              className="button button-danger"
              onClick={() => {
                dispatch({ type: 'removeRoom', id: removingRoom.id });
                setRemovingRoom(null);
                setRoomId(null);
                select(null);
                // The opener went with the room.
                focusAfter.current = ['room-title', 'rooms-list-title'];
              }}
            >
              {t('rooms.room.removeConfirm')}
            </button>
          </div>
        </RoomsDialog>
      ) : null}

      {removingPhoto ? (
        <RoomsDialog
          title={t('rooms.photos.removeTitle', { position: removingPhoto.position })}
          onCancel={() => setRemovingPhoto(null)}
        >
          <p>
            {t('rooms.photos.removeBody', {
              count: removingPhoto.labels.length,
              labels: removingPhoto.labels.join(', '),
            })}
          </p>
          <div className="actions">
            <button type="button" className="button" onClick={() => setRemovingPhoto(null)}>
              {t('common:action.cancel')}
            </button>
            <button
              type="button"
              className="button button-danger"
              onClick={() => {
                const { roomId: fromRoomId, photoId: removedPhotoId, position } = removingPhoto;
                setRemovingPhoto(null);
                removePhoto(fromRoomId, removedPhotoId, position);
              }}
            >
              {t('rooms.photos.removeConfirm')}
            </button>
          </div>
        </RoomsDialog>
      ) : null}

      {deleting ? (
        <RoomsDialog
          title={t('rooms.delete.title', { label: deleting.label })}
          onCancel={() => setDeleting(null)}
          escapeEnabled={!remove.isPending}
        >
          {/* Said before it happens: a table with history is kept for its
              records and taken out of service, and the person should know
              which of the two this click does. */}
          <p>
            {deleting.isDeletable ? t('rooms.delete.removeBody') : t('rooms.delete.deactivateBody')}
          </p>
          {remove.isError ? (
            remove.error instanceof ConcurrencyConflictError &&
            remove.error.code === 'conflicting-state' ? (
              <p className="error" role="alert">
                {t('rooms.delete.seated', { label: deleting.label })}
              </p>
            ) : remove.error instanceof ApiError &&
              remove.error.status === 409 &&
              remove.error.problem?.detail ? (
              // Any other refusal (upcoming bookings on the table, say) names
              // the tables and bookings itself: its own sentence is the answer.
              <p className="error" role="alert">
                {remove.error.problem.detail}
              </p>
            ) : (
              <QueryFailureNotice
                error={remove.error}
                onRetry={() => void onConfirmDelete(deleting)}
              />
            )
          ) : null}
          <div className="actions">
            <button
              type="button"
              className="button"
              disabled={remove.isPending}
              onClick={() => setDeleting(null)}
            >
              {t('common:action.cancel')}
            </button>
            <button
              type="button"
              className="button button-danger"
              disabled={remove.isPending}
              onClick={() => void onConfirmDelete(deleting)}
            >
              {t('rooms.delete.confirm')}
            </button>
          </div>
        </RoomsDialog>
      ) : null}

      {regenerating ? (
        <RoomsDialog
          title={t('rooms.qr.regenerate')}
          onCancel={() => setRegenerating(null)}
          escapeEnabled={!regenerate.isPending}
        >
          {/* Typed confirmation, because the consequence is physical: the
              sticker already on that table stops working the moment this
              lands, and somebody has to go and replace it. */}
          <p>{t('rooms.qr.regenerateWarning', { label: regenerating.label })}</p>
          <label className="labelled">
            {t('rooms.qr.typeLabel', { label: regenerating.label })}
            <input
              className="field"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
            />
          </label>
          {regenerate.isError ? <QueryFailureNotice error={regenerate.error} /> : null}
          <div className="actions">
            <button
              type="button"
              className="button button-danger"
              disabled={confirmText.trim() !== regenerating.label.trim() || regenerate.isPending}
              onClick={() => {
                const table = regenerating;
                void regenerate
                  .mutateAsync({ tableId: table.id })
                  .then(({ qrToken }) => {
                    dispatch({ type: 'qrReplaced', id: table.id, qrToken });
                    setNotice(t('rooms.qr.regenerated', { label: table.label }));
                    setRegenerating(null);
                  })
                  .catch(() => undefined);
              }}
            >
              {t('rooms.qr.regenerateConfirm')}
            </button>
            <button type="button" className="button" onClick={() => setRegenerating(null)}>
              {t('common:action.cancel')}
            </button>
          </div>
        </RoomsDialog>
      ) : null}
    </section>
  );
}

/**
 * A confirmation over the editor, as a modal: focus moves in and stays in,
 * Escape cancels, and focus goes back to the control that opened it.
 */
function RoomsDialog({
  title,
  onCancel,
  escapeEnabled = true,
  children,
}: {
  readonly title: string;
  readonly onCancel: () => void;
  readonly escapeEnabled?: boolean;
  readonly children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, { onEscape: onCancel, escapeEnabled });
  return (
    <div className="editor-dialog" role="presentation">
      <div
        ref={dialogRef}
        className="card confirm-danger"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** The live palette the pins are drawn in, in words as well as colour. */
function Legend() {
  const { t } = useTranslation(['admin', 'common']);
  const states = ['free', 'walk-in', 'held', 'occupied', 'outOfService', 'new'] as const;
  return (
    <ul className="rooms-legend" aria-label={t('rooms.legend')}>
      {states.map((state) => (
        <li key={state}>
          <span className={`rooms-legend-dot is-${state}`} aria-hidden="true" />
          {state === 'new'
            ? t('rooms.pin.unsaved')
            : state === 'walk-in'
              ? t('rooms.pin.walkInOnly')
              : t(`common:tableStatus.${state}`)}
        </li>
      ))}
    </ul>
  );
}

function NewTableForm({
  suggestedLabel,
  onAdd,
  onCancel,
}: {
  readonly suggestedLabel: string;
  readonly onAdd: (input: { label: string; seats: number; isBookable: boolean }) => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const [label, setLabel] = useState(suggestedLabel);
  const labelRef = useRef<HTMLInputElement>(null);
  // The form opens where the photo was clicked; typing the label is the next
  // thing. Again after the click has finished: a pointer press on the photo
  // moves focus to the page once its own handler has run.
  useEffect(() => {
    labelRef.current?.focus();
    const later = window.setTimeout(() => labelRef.current?.focus(), 0);
    return () => window.clearTimeout(later);
  }, []);
  // Text while typing, so the field can be cleared; read as a number on submit.
  const [seats, setSeats] = useState('2');
  const seatCount = Number.parseInt(seats, 10);
  const valid = label.trim() !== '' && Number.isInteger(seatCount) && seatCount >= 1;
  const [isBookable, setIsBookable] = useState(true);

  return (
    <form
      className="rooms-new-table"
      aria-label={t('rooms.newTable.title')}
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        onAdd({ label: label.trim(), seats: seatCount, isBookable });
      }}
    >
      <h3>{t('rooms.newTable.title')}</h3>
      <div className="editor-fields">
        <label className="labelled">
          {t('rooms.field.label')}
          <input
            className="field"
            ref={labelRef}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <label className="labelled">
          {t('rooms.field.seats')}
          <input
            className="field"
            type="number"
            min={1}
            max={99}
            value={seats}
            onChange={(event) => setSeats(event.target.value)}
          />
        </label>
      </div>
      <label className="labelled inline">
        <input
          type="checkbox"
          checked={isBookable}
          onChange={(event) => setIsBookable(event.target.checked)}
        />
        {t('rooms.field.bookable')}
      </label>
      <div className="actions">
        <button type="submit" className="button button-primary" disabled={!valid}>
          {t('rooms.newTable.add')}
        </button>
        <button type="button" className="button" onClick={onCancel}>
          {t('common:action.cancel')}
        </button>
      </div>
    </form>
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
  readonly roomName: string | null;
  readonly duplicate: boolean;
  readonly onChange: (patch: { label?: string; seats?: number; isBookable?: boolean }) => void;
  readonly onUnpin: () => void;
  readonly onDelete: () => void;
  readonly onRegenerateQr: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <aside className="editor-panel" aria-labelledby="table-title">
      <h2 id="table-title">{t('rooms.table.title', { label: table.label })}</h2>
      <p className="muted small">
        {roomName ? t('rooms.table.inRoom', { name: roomName }) : t('rooms.table.noRoom')}
        {table.status ? ` · ${t(`common:tableStatus.${table.status}`)}` : ''}
      </p>
      <div className="editor-fields">
        <label className="labelled">
          {t('rooms.field.label')}
          <input
            className="field"
            value={table.label}
            aria-invalid={duplicate || table.label.trim() === ''}
            onChange={(event) => onChange({ label: event.target.value })}
          />
        </label>
        <label className="labelled">
          {t('rooms.field.seats')}
          <input
            className="field"
            type="number"
            min={1}
            max={99}
            value={table.seats}
            onChange={(event) => {
              // A cleared field is someone about to type; only a real count is kept.
              const value = Number.parseInt(event.target.value, 10);
              if (Number.isInteger(value) && value >= 1) onChange({ seats: value });
            }}
          />
        </label>
      </div>
      {duplicate ? <p className="error small">{t('rooms.table.duplicateLabel')}</p> : null}
      {table.label.trim() === '' ? <p className="error small">{t('rooms.table.noLabel')}</p> : null}
      <label className="labelled inline">
        <input
          type="checkbox"
          checked={table.isBookable}
          onChange={(event) => onChange({ isBookable: event.target.checked })}
        />
        {t('rooms.field.bookable')}
      </label>
      {table.pin ? (
        <button type="button" className="button button-small" onClick={onUnpin}>
          {t('rooms.table.unpin')}
        </button>
      ) : (
        <p className="muted small">{t('rooms.table.notPinned')}</p>
      )}
      <button type="button" className="button button-small button-danger" onClick={onDelete}>
        {t('rooms.table.delete')}
      </button>
      <TableQr label={table.label} qrToken={table.qrToken} onRegenerate={onRegenerateQr} />
    </aside>
  );
}

function UnpinnedList({
  title,
  tables,
  selectedId,
  onSelect,
  focusTableId = null,
  onFocused,
}: {
  readonly title: string;
  readonly tables: readonly DraftTable[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  /** The table whose button should take focus once drawn: its pin just went. */
  readonly focusTableId?: string | null;
  readonly onFocused?: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const listRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!focusTableId) return;
    const button = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-table-id]') ?? [],
    ).find((candidate) => candidate.dataset['tableId'] === focusTableId);
    if (!button) return;
    button.focus();
    onFocused?.();
  });

  return (
    <section ref={listRef} className="editor-panel" aria-label={title}>
      <h2>{title}</h2>
      <p className="muted small">{t('rooms.unpinned.hint')}</p>
      <ul className="rooms-table-list">
        {tables.map((table) => (
          <li key={table.id}>
            <button
              type="button"
              data-table-id={table.id}
              className={`chip${table.id === selectedId ? ' is-on' : ''}`}
              aria-pressed={table.id === selectedId}
              onClick={() => onSelect(table.id)}
            >
              {t('rooms.table.title', { label: table.label })}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * What a save warned about, in the person's language where the warning is one
 * the editor knows, and in the server's own sentence otherwise.
 *
 * The bookable-but-unpinned warning is left out: the notice above the editor
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
 * A refused save, in the person's language.
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

  if (isFloorPlanInvalid(error)) {
    return (
      <div className="notice notice-error" role="alert">
        <p>
          {error.duplicateLabels.length > 0
            ? t('rooms.warning.duplicates', { labels: error.duplicateLabels.join(', ') })
            : t('rooms.error.invalid')}
        </p>
        {/* The server's own sentences name the tables and rooms involved. */}
        <ul className="small">
          {error.errors.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (error instanceof ValidationError && error.violations.length > 0) {
    const lines = [...new Set(error.violations.map((v) => violationLine(t, v, sent)))];
    return (
      <div className="notice notice-error" role="alert">
        <ul>
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (error instanceof NotFoundError) {
    return (
      <div className="notice notice-error" role="alert">
        <p>{t('rooms.error.photoNotFound')}</p>
      </div>
    );
  }

  return (
    <QueryFailureNotice
      error={error}
      offline={describeFailure(error) === 'offline'}
      onRetry={onRetry}
    />
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
