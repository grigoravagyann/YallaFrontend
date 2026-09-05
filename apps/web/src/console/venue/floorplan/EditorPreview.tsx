import { FloorPlan, Legend } from '@yalla/floorplan';
import type { DerivedTableState, FloorPlanData } from '@yalla/floorplan/types';
import { useTranslation } from '@yalla/i18n';
import { useMemo, useState } from 'react';
import type { PlanSnapshot } from './reducer';

/** The phone the diner app is designed at. */
const PHONE = { width: 380, height: 620 };

export interface EditorPreviewProps {
  readonly plan: PlanSnapshot;
  readonly timeZoneId: string;
  readonly onClose: () => void;
}

/**
 * What the diner will see, before you leave the cafe.
 *
 * The actual viewer component at actual phone width — not a mock-up of it. The
 * person drawing the room needs to know two things while they can still move a
 * table: whether the labels survive at 380pt, and whether the room is dense
 * enough that area mode kicks in. Both are answers only the real renderer can
 * give, and both are cheap to fix on the spot and expensive to fix from
 * another building.
 *
 * States are sampled rather than real. A stored plan has no live occupancy —
 * and a preview that showed every table free would hide exactly the case where
 * a busy room's labels stop reading.
 */
export function EditorPreview({ plan, timeZoneId, onClose }: EditorPreviewProps) {
  const { t } = useTranslation(['admin', 'common']);
  const [partySize, setPartySize] = useState(2);
  const [busy, setBusy] = useState(true);

  const preview: FloorPlanData = useMemo(() => {
    const areaById = new Map(plan.areas.map((area) => [area.id, area.name]));
    // A spread of states so the preview shows a working Friday rather than an
    // empty room. Deterministic, so the same plan previews the same way twice.
    const states: readonly DerivedTableState[] = [
      'free',
      'free',
      'occupied',
      'free',
      'reservedSoon',
      'free',
      'held',
      'free',
    ];

    return {
      branchId: 'preview',
      canvasWidth: plan.floorWidth,
      canvasHeight: plan.floorHeight,
      timeZoneId,
      tables: plan.tables
        .filter((table) => table.isActive)
        .map((table, index) => ({
          id: table.id,
          label: table.label,
          seats: table.seats,
          x: table.x,
          y: table.y,
          width: table.width,
          height: table.height,
          rotationDegrees: table.rotationDegrees,
          shape: table.shape,
          floorAreaName: table.floorAreaId ? (areaById.get(table.floorAreaId) ?? null) : null,
          isBookable: table.isBookable,
          state: busy ? (states[index % states.length] ?? 'free') : 'free',
          nextReservationStartUtc: null,
        })),
    };
  }, [plan, timeZoneId, busy]);

  return (
    <div className="editor-dialog" role="dialog" aria-label={t('floorPlan.preview.title')}>
      <div className="card editor-preview">
        <header className="page-head">
          <div>
            <h2>{t('floorPlan.preview.title')}</h2>
            <p className="muted small">{t('floorPlan.preview.body')}</p>
          </div>
          <button type="button" className="button button-small" onClick={onClose}>
            {t('common:action.close')}
          </button>
        </header>

        <div className="actions">
          <label className="labelled inline">
            {t('floorPlan.preview.partySize')}
            <select
              value={partySize}
              onChange={(event) => setPartySize(Number(event.target.value))}
            >
              {[1, 2, 4, 6, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="labelled inline">
            <input
              type="checkbox"
              checked={busy}
              onChange={(event) => setBusy(event.target.checked)}
            />
            {t('floorPlan.preview.busy')}
          </label>
        </div>

        {/* Exactly the width the diner app is designed at, so "the labels fit"
            means the same thing here as it does on a phone. */}
        <div className="editor-preview-phone" style={{ width: PHONE.width, height: PHONE.height }}>
          <Legend mode="diner" translate={(key) => t(`common:${key}`)} />
          <FloorPlan
            plan={preview}
            mode="diner"
            partySize={partySize}
            viewport={{ width: PHONE.width, height: PHONE.height - 44 }}
            translate={(key, params) => t(`common:${key}`, params ?? {})}
            accessibilityLabel={t('floorPlan.preview.title')}
          />
        </div>
      </div>
    </div>
  );
}
