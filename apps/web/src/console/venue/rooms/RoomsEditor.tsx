import { FloorPlanChangedError } from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { PageHeader } from '../../ui/PageHeader';
import { useToast } from '../../ui/toast';
import { RoomsBanners } from './RoomsBanners';
import {
  AddPhotoDialog,
  DeleteTableDialog,
  RegenerateDialog,
  RemovePhotoDialog,
  RemoveRoomDialog,
  RenameRoomDialog,
  SeatedTableDialog,
} from './RoomsDialogs';
import { sameName } from './roomsMessages';
import { freeSpot, isServerId } from './roomsModel';
import { InactiveTablesCard, RoomsListCard, UnpinnedTablesCard } from './RoomsSidebar';
import { RoomStageCard } from './RoomStageCard';
import { NoTablePanel, TablePanel } from './TablePanel';
import { useRoomsEditor } from './useRoomsEditor';

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
 *
 * The working copy and what is done to it live in `useRoomsEditor`.
 */
export function RoomsEditor({ branchId, branchName = null, layout = 'console' }: RoomsEditorProps) {
  const { t } = useTranslation(['admin', 'common']);
  const toast = useToast();
  const editor = useRoomsEditor(branchId);
  const {
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
    duplicates,
    select,
    setRoomId,
    setTableId,
    dialog,
    setDialog,
    focusAfter,
    showPhoto,
    removePhoto,
  } = editor;

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

      <RoomsBanners
        conflict={conflict !== null}
        reloadFailed={editor.reloadFailed}
        onReload={() => void editor.onReload()}
        saveFailed={save.isError}
        saveError={save.error}
        sent={save.variables?.command ?? null}
        onRetrySave={() => void editor.onSave()}
        unpinnedBookable={editor.unpinnedBookable}
        onPlace={editor.startPlacing}
        duplicates={duplicates}
        duplicateRooms={editor.duplicateRooms}
        savedResult={editor.savedResult}
      />

      <fieldset className="yc-rm" disabled={busy} aria-busy={busy}>
        <legend className="yc-sr">{t('nav.floorplan')}</legend>
        <div className="yc-rm-col">
          <RoomsListCard
            rooms={state.rooms}
            current={room}
            active={active}
            menuFor={editor.menuFor}
            onMenuFor={editor.setMenuFor}
            onPick={(id) => {
              setRoomId(id);
              select(null);
            }}
            onMove={(id, delta) => dispatch({ type: 'moveRoom', id, delta })}
            onRename={(candidate) => setDialog({ kind: 'renameRoom', room: candidate })}
            onRemove={(candidate) => setDialog({ kind: 'removeRoom', room: candidate })}
            newRoomId={editor.newRoomId}
            newRoomName={editor.newRoomName}
            onNewRoomName={editor.setNewRoomName}
            onAddRoom={editor.addRoom}
          />

          <UnpinnedTablesCard
            tables={unpinned}
            selectedId={selected?.id ?? null}
            roomName={roomName}
            onPlace={editor.startPlacing}
          />

          <InactiveTablesCard
            tables={inactive}
            onRestore={(table) => {
              dispatch({ type: 'restoreTable', id: table.id });
              // Unlike the delete, this waits for Save: said, so it is not missed.
              toast.say(t('rooms.inactive.restored', { label: table.label }));
            }}
          />
        </div>

        <div className="yc-rm-col">
          <RoomStageCard
            room={room}
            photo={photo}
            photoIndex={photoIndex}
            placing={placing}
            menuFor={editor.menuFor}
            onMenuFor={editor.setMenuFor}
            onAddInMiddle={() => {
              if (photo) editor.addAt(freeSpot(state, photo.photoId));
            }}
            onMovePhoto={(delta) => {
              if (room && photo) {
                dispatch({ type: 'movePhoto', roomId: room.id, photoId: photo.photoId, delta });
              }
            }}
            onRemovePhoto={() => {
              if (!room || !photo) return;
              const pinned = active.filter((table) => table.pin?.photoId === photo.photoId);
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
            }}
            tables={onPhoto}
            selectedTableId={selected?.id ?? null}
            focusTableId={editor.focusTableId}
            onFocused={() => editor.setFocusTableId(null)}
            onClickAt={editor.addAt}
            onSelect={select}
            onMoveTable={(id, pin) => dispatch({ type: 'placeTable', id, pin })}
            onUnpinTable={(id) => {
              dispatch({ type: 'placeTable', id, pin: null });
              // The pin had focus and is gone; the table is in the list on the left now.
              focusAfter([`place-${id}`]);
              setTableId(null);
            }}
            readOnly={busy}
            onShowPhoto={(id) => {
              if (room) showPhoto(room.id, id);
            }}
            onAddPhoto={() => {
              if (room) setDialog({ kind: 'addPhoto', roomId: room.id });
            }}
          />
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
                focusAfter([`place-${selected.id}`]);
                setTableId(null);
              }}
              onDelete={() => {
                if (!isServerId(selected.id)) {
                  dispatch({ type: 'discardTable', id: selected.id });
                  select(null);
                  focusAfter(['stage-title']);
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
            <NoTablePanel />
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
            onClick={editor.onDiscard}
          >
            {t('rooms.saveBar.discard')}
          </button>
        ) : null}
        <button
          type="button"
          className="yc-btn yc-btn-pri yc-btn-sm"
          aria-busy={busy}
          onClick={() => void editor.onSave()}
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
        <RemoveRoomDialog
          room={dialog.room}
          tableCount={active.filter((table) => table.roomId === dialog.room.id).length}
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            dispatch({ type: 'removeRoom', id: dialog.room.id });
            setDialog(null);
            setRoomId(null);
            select(null);
            // The opener went with the room.
            focusAfter(['stage-title', 'rooms-list-title']);
          }}
        />
      ) : null}

      {dialog?.kind === 'removePhoto' ? (
        <RemovePhotoDialog
          position={dialog.position}
          labels={dialog.labels}
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            const { roomId: fromRoomId, photoId: removedPhotoId, position } = dialog;
            setDialog(null);
            removePhoto(fromRoomId, removedPhotoId, position);
          }}
        />
      ) : null}

      {dialog?.kind === 'seated' ? (
        <SeatedTableDialog table={dialog.table} onClose={() => setDialog(null)} />
      ) : null}

      {dialog?.kind === 'deleteTable' ? (
        <DeleteTableDialog
          table={dialog.table}
          pending={remove.isPending}
          error={remove.isError ? remove.error : null}
          onCancel={() => setDialog(null)}
          onConfirm={() => void editor.onConfirmDelete(dialog.table)}
        />
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
        <AddPhotoDialog
          branchId={branchId}
          onCancel={() => setDialog(null)}
          onUploaded={(uploaded) => {
            const target = dialog.roomId;
            dispatch({ type: 'addPhoto', roomId: target, photo: uploaded });
            showPhoto(target, uploaded.photoId);
            setDialog(null);
          }}
        />
      ) : null}
    </div>
  );
}
