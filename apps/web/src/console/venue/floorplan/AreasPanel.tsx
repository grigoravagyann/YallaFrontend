import { useTranslation } from '@yalla/i18n';
import { useState } from 'react';
import type { EditorAction, PlanSnapshot } from './reducer';

export interface AreasPanelProps {
  readonly plan: PlanSnapshot;
  readonly dispatch: (action: EditorAction) => void;
  readonly selection: readonly string[];
}

/**
 * Floor areas: create, rename, reorder, delete.
 *
 * Areas are **context, not containers**. A table belongs to one by property,
 * never by sitting inside a rectangle that owns it — which is why there is no
 * geometry here, why deleting an area keeps its tables, and why assigning is a
 * button on a selection rather than a drag into a box. Two areas may
 * legitimately interleave in space; a container model cannot express that.
 */
export function AreasPanel({ plan, dispatch, selection }: AreasPanelProps) {
  const { t } = useTranslation(['admin', 'common']);
  const [name, setName] = useState('');

  const counts = new Map<string | null, number>();
  for (const table of plan.tables) {
    counts.set(table.floorAreaId, (counts.get(table.floorAreaId) ?? 0) + 1);
  }

  return (
    <section className="editor-areas">
      <h3>{t('floorPlan.areas.title')}</h3>

      <ul className="rows">
        {plan.areas.map((area, index) => (
          <li key={area.id} className="row">
            <input
              className="field"
              value={area.name}
              aria-label={t('floorPlan.areas.rename')}
              onChange={(event) =>
                dispatch({ type: 'renameArea', areaId: area.id, name: event.target.value })
              }
            />
            <span className="muted small">
              {t('floorPlan.areas.tableCount', { count: counts.get(area.id) ?? 0 })}
            </span>
            <div className="actions">
              {selection.length > 0 ? (
                <button
                  type="button"
                  className="button button-small"
                  onClick={() =>
                    dispatch({ type: 'assignArea', ids: selection, floorAreaId: area.id })
                  }
                >
                  {t('floorPlan.areas.assign', { count: selection.length })}
                </button>
              ) : null}
              <button
                type="button"
                className="button button-small"
                disabled={index === 0}
                aria-label={t('floorPlan.areas.moveUp')}
                onClick={() => dispatch({ type: 'moveArea', areaId: area.id, direction: -1 })}
              >
                ↑
              </button>
              <button
                type="button"
                className="button button-small"
                disabled={index === plan.areas.length - 1}
                aria-label={t('floorPlan.areas.moveDown')}
                onClick={() => dispatch({ type: 'moveArea', areaId: area.id, direction: 1 })}
              >
                ↓
              </button>
              <button
                type="button"
                className="button button-small button-danger"
                onClick={() => dispatch({ type: 'removeArea', areaId: area.id })}
              >
                {t('floorPlan.areas.remove')}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {plan.areas.length === 0 ? <p className="muted small">{t('floorPlan.areas.none')}</p> : null}

      <form
        className="actions"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          dispatch({ type: 'addArea', name: name.trim() });
          setName('');
        }}
      >
        <input
          className="field"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('floorPlan.areas.newPlaceholder')}
          aria-label={t('floorPlan.areas.newPlaceholder')}
        />
        <button type="submit" className="button button-small">
          {t('floorPlan.areas.add')}
        </button>
      </form>

      {/* Deleting an area leaves its tables with none, so it is worth saying
          how many that would be before somebody presses it. */}
      {counts.get(null) ? (
        <p className="muted small">
          {t('floorPlan.areas.unassigned', { count: counts.get(null) ?? 0 })}
        </p>
      ) : null}
    </section>
  );
}
