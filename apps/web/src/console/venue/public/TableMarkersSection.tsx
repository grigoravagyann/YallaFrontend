import type { EditorFloorPlan, Photo } from '@yalla/api';
import { useEditorFloorPlan, useSaveFloorPlan } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard';
import {
  positionsFromPlan,
  toFraction,
  withPhotoPositions,
  type PhotoPosition,
} from './photoMarkers';

/**
 * Where each table is on the cover photo, for the diner app's tap-to-book view.
 *
 * Positions are 0–1 fractions of the photo and are saved through the floor
 * plan's `PUT`, which replaces the whole room — so the save sends the plan back
 * as it was read and changes only `photoX`/`photoY`. The picture is the
 * **saved** cover: placing tables on a photo nobody has saved yet would put
 * them on the wrong picture in the app.
 */
export function TableMarkersSection({
  branchId,
  cover,
}: {
  readonly branchId: string;
  readonly cover: Photo | null;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const query = useEditorFloorPlan(branchId);

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
    // Keyed on what was loaded, so a save or a floor-plan edit elsewhere starts a fresh draft.
    body = (
      <MarkerEditor
        key={`${branchId}:${cover.photoId}`}
        branchId={branchId}
        cover={cover}
        plan={query.data}
      />
    );
  }

  return (
    <section className="card" aria-labelledby="markers-title">
      <div className="field-group">
        <h3 id="markers-title">{t('publicPage.markers.title')}</h3>
        <p className="muted small">{t('publicPage.markers.intro')}</p>
      </div>
      {body}
    </section>
  );
}

const NUDGE = 0.01;

function MarkerEditor({
  branchId,
  cover,
  plan,
}: {
  readonly branchId: string;
  readonly cover: Photo;
  readonly plan: EditorFloorPlan;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const save = useSaveFloorPlan();
  const stageRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<string | null>(null);

  const tables = plan.tables.filter((table) => table.isActive);
  const [savedPositions, setSavedPositions] = useState(() => positionsFromPlan(plan));
  const [positions, setPositions] = useState(() => positionsFromPlan(plan));
  const [selected, setSelected] = useState<string | null>(
    () => tables.find((table) => !positionsFromPlan(plan).get(table.id))?.id ?? null,
  );
  const [outcome, setOutcome] = useState<'saved' | 'failed' | null>(null);

  const dirty = tables.some((table) => {
    const a = positions.get(table.id) ?? null;
    const b = savedPositions.get(table.id) ?? null;
    return a?.x !== b?.x || a?.y !== b?.y;
  });
  useUnsavedChangesGuard(dirty);

  const placedCount = tables.filter((table) => positions.get(table.id)).length;
  const selectedTable = tables.find((table) => table.id === selected) ?? null;

  function place(tableId: string, position: PhotoPosition | null) {
    setOutcome(null);
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

  async function submit() {
    setOutcome(null);
    try {
      const result = await save.mutateAsync({
        branchId,
        command: withPhotoPositions(plan, positions),
      });
      const fresh = positionsFromPlan(result.plan);
      setSavedPositions(fresh);
      setPositions(fresh);
      setOutcome('saved');
    } catch {
      setOutcome('failed');
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
              ? t('publicPage.markers.selected', { label: selectedTable.label })
              : t('publicPage.markers.pickTable')}
          </p>
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
          <span className="error">{t('publicPage.markers.failed')}</span>
        ) : null}
      </div>
    </div>
  );
}
