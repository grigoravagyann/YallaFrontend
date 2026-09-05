import { describeFailure, isFloorPlanInvalid } from '@yalla/api';
import {
  isOfflinePaused,
  useEditorFloorPlan,
  useRegenerateTableQr,
  useSaveFloorPlan,
} from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { useElementSize } from '../../../useElementSize';
import { AreasPanel } from './AreasPanel';
import { EditorCanvas } from './EditorCanvas';
import { EditorPreview } from './EditorPreview';
import { PropertiesPanel } from './PropertiesPanel';
import { RowHelper } from './RowHelper';
import {
  canRedo,
  canUndo,
  duplicateLabels,
  initialState,
  isDirty,
  reducer,
  tablesOutsideCanvas,
  toSaveCommand,
  type EditorAction,
  type EditorTable,
} from './reducer';

export interface FloorPlanEditorRouteProps {
  /** From the token's scope, never from a route parameter the user supplies. */
  readonly branchId: string | undefined;
  readonly timeZoneId: string;
}

/**
 * The floor plan editor.
 *
 * Used by our own team, standing in a cafe, with the owner watching. Drawing a
 * twenty-table room should take a few minutes, so this optimises for speed of
 * first draft: a grid on by default, a row helper for the run of identical
 * two-tops that is most of a Yerevan cafe, duplicate bound to a key, and undo
 * that covers everything.
 *
 * It saves **explicitly**. The `PUT` replaces the whole plan atomically, so a
 * partially applied plan is a broken room and an autosave mid-drag would
 * produce exactly one.
 */
export function FloorPlanEditorRoute({ branchId, timeZoneId }: FloorPlanEditorRouteProps) {
  const { t } = useTranslation(['admin', 'common']);
  const query = useEditorFloorPlan(branchId);
  const save = useSaveFloorPlan();
  const regenerate = useRegenerateTableQr();

  const [state, rawDispatch] = useReducer(reducer, initialState(branchId ?? ''));
  const [canvasRef, canvasSize] = useElementSize<HTMLDivElement>();
  const [showRowHelper, setShowRowHelper] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [regenerating, setRegenerating] = useState<EditorTable | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [saveResult, setSaveResult] = useState<{
    warnings: readonly string[];
    deactivated: readonly string[];
    removed: readonly string[];
  } | null>(null);

  const dispatch = useCallback((action: EditorAction) => rawDispatch(action), []);

  // Load once into the working copy. Re-running on every refetch would throw
  // away whatever the person is drawing.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!query.data) return;
    if (loadedFor.current === query.data.branchId) return;
    loadedFor.current = query.data.branchId;
    dispatch({ type: 'loaded', plan: query.data });
  }, [query.data, dispatch]);

  const dirty = isDirty(state);
  const outside = useMemo(() => tablesOutsideCanvas(state.plan), [state.plan]);
  const duplicates = useMemo(() => duplicateLabels(state.plan), [state.plan]);

  // Unsaved work is protected by a navigation guard, not by persistence: the
  // undo stack lives in memory and nothing here touches web storage.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      // Never steal a key from a field somebody is typing in.
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;

      const meta = event.ctrlKey || event.metaKey;
      const nudge = event.shiftKey ? state.gridSize * 5 : state.gridSize;

      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
        return;
      }
      if (meta && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        dispatch({ type: 'redo' });
        return;
      }
      if (meta && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        dispatch({ type: 'duplicate' });
        return;
      }
      if (meta && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        dispatch({ type: 'selectAll' });
        return;
      }
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          dispatch({ type: 'move', dx: -nudge, dy: 0 });
          break;
        case 'ArrowRight':
          event.preventDefault();
          dispatch({ type: 'move', dx: nudge, dy: 0 });
          break;
        case 'ArrowUp':
          event.preventDefault();
          dispatch({ type: 'move', dx: 0, dy: -nudge });
          break;
        case 'ArrowDown':
          event.preventDefault();
          dispatch({ type: 'move', dx: 0, dy: nudge });
          break;
        case 'Delete':
        case 'Backspace':
          event.preventDefault();
          dispatch({ type: 'delete' });
          break;
        case 'Escape':
          dispatch({ type: 'clearSelection' });
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, state.gridSize]);

  const onSave = useCallback(async () => {
    if (!branchId) return;
    setSaveResult(null);
    try {
      const result = await save.mutateAsync({ branchId, command: toSaveCommand(state) });
      dispatch({ type: 'saved', result });
      setSaveResult({
        warnings: result.warnings,
        deactivated: result.deactivatedTables,
        removed: result.removedTables,
      });
    } catch {
      // Rendered below from the mutation's own error; nothing to do here.
    }
  }, [branchId, save, state, dispatch]);

  const serverInvalid = isFloorPlanInvalid(save.error) ? save.error : null;
  // The server names the offenders, so the canvas can highlight exactly those.
  const invalidLabels = serverInvalid
    ? [...serverInvalid.tablesOutsideCanvas, ...serverInvalid.duplicateLabels]
    : outside.map((table) => table.label);

  if (!branchId) {
    return (
      <section className="page">
        <h1>{t('nav.floorplan')}</h1>
        <p className="muted">{t('floorPlan.noBranch')}</p>
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

  if (query.isLoading) {
    return (
      <section className="page">
        <h1>{t('nav.floorplan')}</h1>
        <p className="muted">{t('loading')}</p>
      </section>
    );
  }

  if (query.isError || !query.data) {
    return (
      <section className="page">
        <h1>{t('nav.floorplan')}</h1>
        <QueryFailureNotice error={query.error} onRetry={() => void query.refetch()} />
      </section>
    );
  }

  return (
    <section className="page editor">
      <header className="page-head">
        <div>
          <h1>{t('nav.floorplan')}</h1>
          <p className="muted small">
            {t('floorPlan.summary', {
              tables: state.plan.tables.filter((table) => table.isActive).length,
              areas: state.plan.areas.length,
            })}
            {dirty ? ` · ${t('floorPlan.unsaved')}` : ''}
          </p>
        </div>
        <div className="actions">
          <button
            type="button"
            className="button"
            onClick={() => setShowPreview((open) => !open)}
            aria-pressed={showPreview}
          >
            {t('floorPlan.preview.toggle')}
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={!dirty || save.isPending}
            onClick={() => void onSave()}
          >
            {save.isPending ? t('floorPlan.saving') : t('floorPlan.save')}
          </button>
        </div>
      </header>

      <Toolbar
        state={state}
        dispatch={dispatch}
        zoom={zoom}
        setZoom={setZoom}
        onOpenRowHelper={() => setShowRowHelper(true)}
      />

      {/* Every server answer surfaced precisely. Errors name the tables, and
          warnings do not block: real rooms have stools under bars. */}
      {serverInvalid ? (
        <div className="notice notice-error" role="alert">
          <p>
            {serverInvalid.errors.join(' ')}
            {serverInvalid.tablesOutsideCanvas.length > 0
              ? ` ${t('floorPlan.error.namedOutside', {
                  labels: serverInvalid.tablesOutsideCanvas.join(', '),
                })}`
              : ''}
          </p>
        </div>
      ) : save.isError ? (
        <QueryFailureNotice
          error={save.error}
          offline={describeFailure(save.error) === 'offline'}
          onRetry={() => void onSave()}
        />
      ) : null}

      {outside.length > 0 && !serverInvalid ? (
        <div className="notice notice-error" role="alert">
          <p>
            {t('floorPlan.error.willBeRejected', {
              labels: outside.map((x) => x.label).join(', '),
            })}
          </p>
          <button
            type="button"
            className="button button-small"
            onClick={() => dispatch({ type: 'select', ids: [outside[0]!.id] })}
          >
            {t('floorPlan.error.showFirst')}
          </button>
        </div>
      ) : null}

      {duplicates.length > 0 ? (
        <div className="notice notice-error" role="alert">
          <p>{t('floorPlan.error.duplicates', { labels: duplicates.join(', ') })}</p>
        </div>
      ) : null}

      {saveResult ? (
        <div className="notice notice-offline" role="status">
          <p>
            {t('floorPlan.saved')}
            {saveResult.deactivated.length > 0
              ? ` ${t('floorPlan.result.deactivated', { labels: saveResult.deactivated.join(', ') })}`
              : ''}
            {saveResult.removed.length > 0
              ? ` ${t('floorPlan.result.removed', { labels: saveResult.removed.join(', ') })}`
              : ''}
            {saveResult.warnings.length > 0 ? ` ${saveResult.warnings.join(' ')}` : ''}
          </p>
        </div>
      ) : null}

      <div className="editor-body">
        <div className="editor-canvas-frame" ref={canvasRef}>
          <EditorCanvas
            plan={state.plan}
            selection={state.selection}
            dispatch={dispatch}
            gridEnabled={state.gridEnabled}
            gridSize={state.gridSize}
            width={canvasSize.width}
            height={canvasSize.height}
            invalidLabels={invalidLabels}
            zoom={zoom}
          />
        </div>

        <div className="editor-side">
          <PropertiesPanel
            plan={state.plan}
            selection={state.selection}
            dispatch={dispatch}
            onRegenerateQr={(table) => {
              setRegenerating(table);
              setConfirmText('');
            }}
            invalidLabels={invalidLabels}
            duplicateLabels={duplicates}
          />
          <AreasPanel plan={state.plan} dispatch={dispatch} selection={state.selection} />
        </div>
      </div>

      {showPreview ? (
        <EditorPreview
          plan={state.plan}
          timeZoneId={timeZoneId}
          onClose={() => setShowPreview(false)}
        />
      ) : null}

      {showRowHelper ? (
        <RowHelper
          plan={state.plan}
          onAdd={(row) => dispatch({ type: 'addRow', row })}
          onClose={() => setShowRowHelper(false)}
        />
      ) : null}

      {regenerating ? (
        <div className="editor-dialog" role="dialog" aria-label={t('floorPlan.qr.regenerate')}>
          <div className="card confirm-danger">
            <h2>{t('floorPlan.qr.regenerate')}</h2>
            {/* Typed confirmation, because the consequence is physical: the
                sticker already on that table stops working the moment this
                lands, and somebody has to go and replace it. */}
            <p>{t('floorPlan.qr.regenerateWarning', { label: regenerating.label })}</p>
            <label className="labelled">
              {t('floorPlan.qr.typeLabel', { label: regenerating.label })}
              <input
                className="field"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
              />
            </label>
            <div className="actions">
              <button
                type="button"
                className="button button-danger"
                disabled={confirmText.trim() !== regenerating.label || regenerate.isPending}
                onClick={() => {
                  const table = regenerating;
                  void regenerate.mutateAsync({ tableId: table.id }).then(() => {
                    void query.refetch();
                    loadedFor.current = null;
                    setRegenerating(null);
                  });
                }}
              >
                {t('floorPlan.qr.regenerateConfirm')}
              </button>
              <button type="button" className="button" onClick={() => setRegenerating(null)}>
                {t('common:action.cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Toolbar({
  state,
  dispatch,
  zoom,
  setZoom,
  onOpenRowHelper,
}: {
  state: ReturnType<typeof reducer>;
  dispatch: (action: EditorAction) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  onOpenRowHelper: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const many = state.selection.length > 1;

  return (
    <div className="editor-toolbar">
      <button
        type="button"
        className="button button-small"
        disabled={!canUndo(state)}
        onClick={() => dispatch({ type: 'undo' })}
      >
        {t('floorPlan.undo')}
      </button>
      <button
        type="button"
        className="button button-small"
        disabled={!canRedo(state)}
        onClick={() => dispatch({ type: 'redo' })}
      >
        {t('floorPlan.redo')}
      </button>

      <span className="editor-divider" />

      <button
        type="button"
        className="button button-small"
        onClick={() => dispatch({ type: 'addTable' })}
      >
        {t('floorPlan.addTable')}
      </button>
      <button type="button" className="button button-small" onClick={onOpenRowHelper}>
        {t('floorPlan.row.open')}
      </button>
      <button
        type="button"
        className="button button-small"
        disabled={state.selection.length === 0}
        onClick={() => dispatch({ type: 'duplicate' })}
        title={t('floorPlan.duplicateShortcut')}
      >
        {t('floorPlan.duplicate')} <kbd>{t('floorPlan.duplicateShortcut')}</kbd>
      </button>
      <button
        type="button"
        className="button button-small button-danger"
        disabled={state.selection.length === 0}
        onClick={() => dispatch({ type: 'delete' })}
      >
        {t('floorPlan.delete')}
      </button>

      <span className="editor-divider" />

      <select
        disabled={!many}
        aria-label={t('floorPlan.align.label')}
        value=""
        onChange={(event) => {
          if (event.target.value) {
            dispatch({ type: 'align', edge: event.target.value as 'left' });
          }
        }}
      >
        <option value="">{t('floorPlan.align.label')}</option>
        <option value="left">{t('floorPlan.align.left')}</option>
        <option value="right">{t('floorPlan.align.right')}</option>
        <option value="top">{t('floorPlan.align.top')}</option>
        <option value="bottom">{t('floorPlan.align.bottom')}</option>
        <option value="horizontalCentre">{t('floorPlan.align.horizontalCentre')}</option>
        <option value="verticalCentre">{t('floorPlan.align.verticalCentre')}</option>
      </select>

      <label className="labelled inline">
        <input
          type="checkbox"
          checked={state.gridEnabled}
          onChange={(event) => dispatch({ type: 'setGrid', enabled: event.target.checked })}
        />
        {t('floorPlan.grid')}
      </label>

      <span className="editor-divider" />

      <label className="labelled inline">
        {t('floorPlan.canvasWidth')}
        <input
          className="field editor-number"
          type="number"
          value={state.plan.floorWidth}
          onChange={(event) =>
            dispatch({
              type: 'setCanvas',
              width: Number(event.target.value) || state.plan.floorWidth,
              height: state.plan.floorHeight,
            })
          }
        />
      </label>
      <label className="labelled inline">
        {t('floorPlan.canvasHeight')}
        <input
          className="field editor-number"
          type="number"
          value={state.plan.floorHeight}
          onChange={(event) =>
            dispatch({
              type: 'setCanvas',
              width: state.plan.floorWidth,
              height: Number(event.target.value) || state.plan.floorHeight,
            })
          }
        />
      </label>

      <label className="labelled inline">
        {t('floorPlan.zoom')}
        <input
          type="range"
          min={1}
          max={4}
          step={0.25}
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
        />
      </label>
    </div>
  );
}
