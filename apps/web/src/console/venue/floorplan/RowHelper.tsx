import { useTranslation } from '@yalla/i18n';
import { useState, type FormEvent } from 'react';
import type { AddRowInput, PlanSnapshot } from './reducer';

export interface RowHelperProps {
  readonly plan: PlanSnapshot;
  readonly onAdd: (row: AddRowInput) => void;
  readonly onClose: () => void;
}

/**
 * Twelve identical two-seaters along a wall, in one action.
 *
 * The slowest part of onboarding a Yerevan cafe is placing a run of identical
 * tables one at a time, and it is also the least interesting: nobody is making
 * a design decision on the eleventh two-top. Everything here has a working
 * default, so the fast path is open it, type a count, press add.
 */
export function RowHelper({ plan, onAdd, onClose }: RowHelperProps) {
  const { t } = useTranslation(['admin', 'common']);

  const [count, setCount] = useState(6);
  const [seats, setSeats] = useState(2);
  const [shape, setShape] = useState<'rectangle' | 'round'>('rectangle');
  const [width, setWidth] = useState(80);
  const [height, setHeight] = useState(80);
  const [spacing, setSpacing] = useState(40);
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [x, setX] = useState(60);
  const [y, setY] = useState(60);
  const [floorAreaId, setFloorAreaId] = useState<string>('');

  const span = count * (orientation === 'horizontal' ? width : height) + (count - 1) * spacing;
  const limit = orientation === 'horizontal' ? plan.floorWidth - x : plan.floorHeight - y;
  const overruns = span > limit;

  function submit(event: FormEvent) {
    event.preventDefault();
    onAdd({
      count,
      seats,
      shape,
      width,
      height,
      spacing,
      orientation,
      x,
      y,
      floorAreaId: floorAreaId || null,
    });
    onClose();
  }

  return (
    <div className="editor-dialog" role="dialog" aria-label={t('floorPlan.row.title')}>
      <form className="card" onSubmit={submit}>
        <h2>{t('floorPlan.row.title')}</h2>
        <p className="muted small">{t('floorPlan.row.body')}</p>

        <div className="editor-fields">
          <label className="labelled">
            {t('floorPlan.row.count')}
            <input
              className="field"
              type="number"
              min={1}
              max={40}
              value={count}
              onChange={(event) => setCount(Math.max(1, Number(event.target.value) || 1))}
            />
          </label>
          <label className="labelled">
            {t('floorPlan.field.seats')}
            <input
              className="field"
              type="number"
              min={1}
              value={seats}
              onChange={(event) => setSeats(Math.max(1, Number(event.target.value) || 1))}
            />
          </label>
          <label className="labelled">
            {t('floorPlan.field.shape')}
            <select
              value={shape}
              onChange={(event) => setShape(event.target.value as typeof shape)}
            >
              <option value="rectangle">{t('floorPlan.shape.rectangle')}</option>
              <option value="round">{t('floorPlan.shape.round')}</option>
            </select>
          </label>
          <label className="labelled">
            {t('floorPlan.row.orientation')}
            <select
              value={orientation}
              onChange={(event) => setOrientation(event.target.value as typeof orientation)}
            >
              <option value="horizontal">{t('floorPlan.row.horizontal')}</option>
              <option value="vertical">{t('floorPlan.row.vertical')}</option>
            </select>
          </label>
          <label className="labelled">
            {t('floorPlan.field.width')}
            <input
              className="field"
              type="number"
              value={width}
              onChange={(event) => setWidth(Number(event.target.value) || width)}
            />
          </label>
          <label className="labelled">
            {t('floorPlan.field.height')}
            <input
              className="field"
              type="number"
              value={height}
              onChange={(event) => setHeight(Number(event.target.value) || height)}
            />
          </label>
          <label className="labelled">
            {t('floorPlan.row.spacing')}
            <input
              className="field"
              type="number"
              min={0}
              value={spacing}
              onChange={(event) => setSpacing(Math.max(0, Number(event.target.value) || 0))}
            />
          </label>
          <label className="labelled">
            {t('floorPlan.row.startX')}
            <input
              className="field"
              type="number"
              value={x}
              onChange={(event) => setX(Number(event.target.value) || 0)}
            />
          </label>
          <label className="labelled">
            {t('floorPlan.row.startY')}
            <input
              className="field"
              type="number"
              value={y}
              onChange={(event) => setY(Number(event.target.value) || 0)}
            />
          </label>
          <label className="labelled">
            {t('floorPlan.field.area')}
            <select value={floorAreaId} onChange={(event) => setFloorAreaId(event.target.value)}>
              <option value="">{t('floorPlan.field.noArea')}</option>
              {plan.areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Said before the row is placed rather than after: a run that runs off
            the wall is obvious on the canvas but annoying to undo. */}
        {overruns ? <p className="warn small">{t('floorPlan.row.overruns')}</p> : null}

        <div className="actions">
          <button type="submit" className="button button-primary">
            {t('floorPlan.row.add', { count })}
          </button>
          <button type="button" className="button" onClick={onClose}>
            {t('common:action.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
