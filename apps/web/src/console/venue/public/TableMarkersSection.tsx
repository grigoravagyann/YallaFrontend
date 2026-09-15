import { CoverChangedError, NotFoundError, type EditorFloorPlan, type Photo } from '@yalla/api';
import {
  queryKeys,
  useEditorFloorPlan,
  usePublicProfile,
  useSaveTablePhotoPositions,
} from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard';
import {
  changedPositions,
  positionsCommand,
  positionsFromAnswer,
  positionsFromPlan,
  toFraction,
  type PhotoPosition,
} from './photoMarkers';

/**
 * Where each table is on the cover photo, for the diner app's tap-to-book view.
 *
 * Positions are 0–1 fractions of the photo, saved through their own route
 * (`PUT …/table-photo-positions`, K7) in **one call** carrying only the pins
 * moved here and the cover they were placed on. Nothing about the room travels
 * with them, so a table added or relabelled in the floor plan editor since this
 * page opened cannot be undone by a pin save, and nothing is read first.
 *
 * The picture is the **saved** cover: placing tables on a photo nobody has
 * saved yet would put them on the wrong picture in the app. It is read from the
 * public profile's cache, which the form above writes. Changing it takes every
 * table off the photo on the server, so a draft made on the old picture is
 * dropped and the person is told. If the cover was changed somewhere else, the
 * server refuses the save with nothing written; this says so once, and the new
 * cover is read.
 */
export function TableMarkersSection({ branchId }: { readonly branchId: string }) {
  const { t } = useTranslation(['admin', 'common']);
  const profile = usePublicProfile(branchId);
  const query = useEditorFloorPlan(branchId);
  const cover = profile.data?.coverPhoto ?? null;
  const coverId = cover?.photoId ?? null;

  // The cover the draft on screen was made on, and whether it holds unsaved
  // pins. Adjusted during render, not from an effect, so the render that shows
  // the new cover is the same one that says the old draft was dropped.
  const [draft, setDraft] = useState({ coverId, dirty: false });
  const [discarded, setDiscarded] = useState(false);
  const [coverChanged, setCoverChanged] = useState(false);
  if (draft.coverId !== coverId) {
    setDraft({ coverId, dirty: false });
    setDiscarded(draft.dirty);
  }

  const onDirtyChange = useCallback((dirty: boolean) => {
    setDraft((current) => (current.dirty === dirty ? current : { ...current, dirty }));
  }, []);
  const onEdit = useCallback(() => {
    setDiscarded(false);
    setCoverChanged(false);
  }, []);
  const onCoverChanged = useCallback(() => setCoverChanged(true), []);

  let body;
  if (!cover) {
    body = <p className="muted">{t('publicPage.markers.noCover')}</p>;
  } else if (query.isLoading || !query.data) {
    body = query.isError ? (
      <QueryFailureNotice error={query.error} onRetry={() => void query.refetch()} />
    ) : (
      <p className="muted">{t('publicPage.markers.loading')}</p>
    );
  } else if (!query.data.tables.some((table) => table.isActive)) {
    body = <p className="muted">{t('publicPage.markers.noTables')}</p>;
  } else {
    // Keyed on the branch and the saved cover: a new cover starts a fresh draft.
    body = (
      <MarkerEditor
        key={`${branchId}:${cover.photoId}`}
        branchId={branchId}
        cover={cover}
        plan={query.data}
        onDirtyChange={onDirtyChange}
        onEdit={onEdit}
        onCoverChanged={onCoverChanged}
      />
    );
  }

  return (
    <section className="card" aria-labelledby="markers-title">
      <div className="field-group">
        <h3 id="markers-title">{t('publicPage.markers.title')}</h3>
        <p className="muted small">{t('publicPage.markers.intro')}</p>
      </div>
      {/* One sentence, not two: the cover-changed notice already says the pins
          were not saved, so the "discarded" line would repeat it. */}
      {coverChanged ? (
        <p className="error" role="alert">
          {t('publicPage.markers.coverChanged')}
        </p>
      ) : discarded ? (
        <p className="muted" role="status">
          {t('publicPage.markers.discarded')}
        </p>
      ) : null}
      {body}
    </section>
  );
}

const NUDGE = 0.01;

function MarkerEditor({
  branchId,
  cover,
  plan,
  onDirtyChange,
  onEdit,
  onCoverChanged,
}: {
  readonly branchId: string;
  readonly cover: Photo;
  readonly plan: EditorFloorPlan;
  /** Told whether unsaved pins are on screen, so a cover change can say it dropped them. */
  readonly onDirtyChange: (dirty: boolean) => void;
  /** A pin was placed, moved or taken off. */
  readonly onEdit: () => void;
  /** The server refused a save because the cover is no longer the one these pins are on. */
  readonly onCoverChanged: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const queryClient = useQueryClient();
  const save = useSaveTablePhotoPositions(branchId);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<string | null>(null);
  // The pin to move focus to once it has been drawn: a keyboard user who places
  // a table goes straight on to nudging it with the arrow keys.
  const pendingFocus = useRef<string | null>(null);

  const tables = plan.tables.filter((table) => table.isActive);
  const [savedPositions, setSavedPositions] = useState(() => positionsFromPlan(plan));
  const [positions, setPositions] = useState(() => positionsFromPlan(plan));
  const [selected, setSelected] = useState<string | null>(
    () => tables.find((table) => !positionsFromPlan(plan).get(table.id))?.id ?? null,
  );
  const [outcome, setOutcome] = useState<'saved' | 'failed' | null>(null);

  useEffect(() => {
    const tableId = pendingFocus.current;
    if (!tableId) return;
    const pin = Array.from(
      stageRef.current?.querySelectorAll<HTMLButtonElement>('button[data-table-id]') ?? [],
    ).find((button) => button.dataset['tableId'] === tableId);
    if (!pin) return;
    pendingFocus.current = null;
    pin.focus();
  });

  const dirty = tables.some((table) => {
    const a = positions.get(table.id) ?? null;
    const b = savedPositions.get(table.id) ?? null;
    return a?.x !== b?.x || a?.y !== b?.y;
  });
  useUnsavedChangesGuard(dirty);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const placedCount = tables.filter((table) => positions.get(table.id)).length;
  const selectedTable = tables.find((table) => table.id === selected) ?? null;

  function place(tableId: string, position: PhotoPosition | null) {
    setOutcome(null);
    onEdit();
    setPositions((current) => {
      const next = new Map(current);
      next.set(tableId, position ? { x: toFraction(position.x), y: toFraction(position.y) } : null);
      return next;
    });
  }

  function fractionAt(event: PointerEvent): PhotoPosition | null {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }

  function onStagePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || !selected) return;
    const position = fractionAt(event);
    if (!position) return;
    place(selected, position);
    // On to the next table that is not on the photo yet: placing a whole room
    // is a run of clicks, not a click and a trip to the list each time.
    const next = tables.find((table) => table.id !== selected && !positions.get(table.id));
    setSelected(next?.id ?? selected);
  }

  function onPinPointerDown(event: PointerEvent<HTMLButtonElement>, tableId: string) {
    event.stopPropagation();
    setSelected(tableId);
    dragging.current = tableId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPinPointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!dragging.current) return;
    const position = fractionAt(event);
    if (position) place(dragging.current, position);
  }

  function onPinPointerUp(event: PointerEvent<HTMLButtonElement>) {
    dragging.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function onPinKeyDown(event: KeyboardEvent<HTMLButtonElement>, tableId: string) {
    const current = positions.get(tableId);
    if (!current) return;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-NUDGE, 0],
      ArrowRight: [NUDGE, 0],
      ArrowUp: [0, -NUDGE],
      ArrowDown: [0, NUDGE],
    };
    const step = delta[event.key];
    if (!step) {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        place(tableId, null);
      }
      return;
    }
    event.preventDefault();
    place(tableId, { x: current.x + step[0], y: current.y + step[1] });
  }

  /** Without a mouse: the selected table goes to the middle of the photo, and its pin takes focus. */
  function placeInMiddle(tableId: string) {
    pendingFocus.current = tableId;
    place(tableId, { x: 0.5, y: 0.5 });
  }

  async function submit() {
    setOutcome(null);
    try {
      const answer = await save.mutateAsync(
        positionsCommand(cover.photoId, changedPositions(positions, savedPositions)),
      );
      const fresh = positionsFromAnswer(answer);
      setSavedPositions(fresh);
      setPositions(fresh);
      setOutcome('saved');
    } catch (error) {
      if (error instanceof CoverChangedError) {
        // Nothing was written. The mutation reads the cover and the room again,
        // which swaps this draft for a fresh one on the new picture; the
        // section says why, once.
        onCoverChanged();
        return;
      }
      setOutcome('failed');
      // A table taken out of service since this page opened: read the room
      // again, so the list and the next try start from it.
      if (error instanceof NotFoundError) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.editorFloorPlan(branchId) });
      }
    }
  }

  return (
    <div className="field-group">
      <div className="marker-editor">
        <div>
          <div
            ref={stageRef}
            className="marker-stage"
            role="group"
            aria-label={t('publicPage.markers.stage')}
            data-testid="marker-stage"
            onPointerDown={onStagePointerDown}
          >
            <img src={cover.fullUrl || cover.cardUrl} alt="" draggable={false} />
            {tables.map((table) => {
              const position = positions.get(table.id);
              if (!position) return null;
              return (
                <button
                  key={table.id}
                  type="button"
                  data-table-id={table.id}
                  className={`marker-pin${table.id === selected ? ' is-selected' : ''}`}
                  style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}
                  aria-label={t('publicPage.markers.pin', { label: table.label })}
                  aria-pressed={table.id === selected}
                  onPointerDown={(event) => onPinPointerDown(event, table.id)}
                  onPointerMove={onPinPointerMove}
                  onPointerUp={onPinPointerUp}
                  onPointerCancel={onPinPointerUp}
                  onKeyDown={(event) => onPinKeyDown(event, table.id)}
                  onClick={() => setSelected(table.id)}
                >
                  {table.label}
                </button>
              );
            })}
          </div>
          <p className="muted small" role="status">
            {selectedTable
              ? positions.get(selectedTable.id)
                ? t('publicPage.markers.selected', { label: selectedTable.label })
                : t('publicPage.markers.selectedUnplaced', { label: selectedTable.label })
              : t('publicPage.markers.pickTable')}
          </p>
          {selectedTable && !positions.get(selectedTable.id) ? (
            <button
              type="button"
              className="button button-small"
              onClick={() => placeInMiddle(selectedTable.id)}
            >
              {t('publicPage.markers.placeInMiddle', { label: selectedTable.label })}
            </button>
          ) : null}
        </div>

        <div className="field-group">
          <p className="small">
            {t('publicPage.markers.summary', { placed: placedCount, total: tables.length })}
          </p>
          <ul className="marker-list">
            {tables.map((table) => {
              const placed = Boolean(positions.get(table.id));
              return (
                <li key={table.id}>
                  <button
                    type="button"
                    className={`chip${table.id === selected ? ' is-on' : ''}`}
                    aria-pressed={table.id === selected}
                    onClick={() => setSelected(table.id)}
                  >
                    {t('publicPage.markers.pin', { label: table.label })} ·{' '}
                    {placed ? t('publicPage.markers.placed') : t('publicPage.markers.unplaced')}
                  </button>
                  {placed ? (
                    <button
                      type="button"
                      className="button button-small"
                      onClick={() => place(table.id, null)}
                      aria-label={`${t('publicPage.markers.clear')} (${table.label})`}
                    >
                      {t('publicPage.markers.clear')}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="actions">
        <button
          type="button"
          className="button button-primary"
          disabled={save.isPending || !dirty}
          onClick={() => void submit()}
        >
          {save.isPending ? t('publicPage.markers.saving') : t('publicPage.markers.save')}
        </button>
        {outcome === 'saved' ? (
          <span className="muted" role="status">
            {t('publicPage.markers.saved')}
          </span>
        ) : null}
        {outcome === 'failed' ? (
          <span className="error" role="alert">
            {t('publicPage.markers.failed')}
          </span>
        ) : null}
      </div>
    </div>
  );
}
