import {
  FloorPlan,
  Legend,
  floorAreas,
  MOCK_NOW,
  availabilityWindow,
  mockFloorPlans,
  seatedMinutes,
  type FloorPlanMode,
  type LaidOutTable,
  type MockFloorPlanKey,
} from '@yalla/floorplan';
import { formatDuration } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useCallback, useMemo, useState } from 'react';

/**
 * Viewport presets. These are the three shapes the component actually ships
 * into, so the harness constrains to them rather than to the browser window —
 * the phone case is the one that breaks, and it is invisible on a desktop.
 */
const VIEWPORTS = {
  phone: { label: 'Phone 380×700', width: 380, height: 700 },
  tablet: { label: 'Tablet 1024×768', width: 1024, height: 768 },
  desktop: { label: 'Desktop 1280×720', width: 1280, height: 720 },
} as const;

type ViewportKey = keyof typeof VIEWPORTS;

const FIXTURES: Readonly<Record<MockFloorPlanKey, string>> = {
  cafe: 'Cafe — 11 tables, 2 areas',
  terrace: 'Terrace strip — extreme aspect ratio',
  dense: 'Dense cluster — overlapping hit targets',
  restaurant: 'Restaurant — 30 tables, 3 areas (breaks at phone width)',
  twoFloor: 'Two floors — areas far apart in space',
};

/**
 * Development harness for the floor plan.
 *
 * Not a product screen: it is how the renderer gets looked at during
 * development, and it stays useful when the drag-and-drop editor arrives.
 * Copy here is intentionally untranslated English — this route never ships to a
 * venue, and translating developer tooling would bloat the locale bundles.
 */
export function DevFloorPlanRoute() {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();

  const [fixture, setFixture] = useState<MockFloorPlanKey>('cafe');
  const [mode, setMode] = useState<FloorPlanMode>('diner');
  const [viewportKey, setViewportKey] = useState<ViewportKey>('phone');
  const [partySize, setPartySize] = useState(2);
  const [zoom, setZoom] = useState(1);
  const [areaMode, setAreaMode] = useState<'auto' | 'off'>('auto');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [lastTap, setLastTap] = useState<string | null>(null);

  const plan = mockFloorPlans[fixture];
  const viewport = VIEWPORTS[viewportKey];

  // Stable identity so FloorPlan's useMemo is not defeated by a fresh object
  // literal on every render — the exact thing that would break under SignalR.
  const viewportSize = useMemo(
    () => ({ width: viewport.width, height: viewport.height }),
    [viewport.width, viewport.height],
  );

  const handleTap = useCallback(
    (tableId: string) => {
      setSelectedTableId((current) => (current === tableId ? null : tableId));

      const table = plan.tables.find((x) => x.id === tableId);
      if (!table) return;

      const window = availabilityWindow(table, MOCK_NOW, plan.timeZoneId, locale);
      if (window) {
        // The product's answer to "how long will you stay?": tell the limit
        // before the diner commits, rather than asking them to guess.
        setLastTap(
          `Table ${table.label} — available ${window.range}` + (window.isTight ? ' (tight)' : ''),
        );
        return;
      }
      const sat = seatedMinutes(table, MOCK_NOW);
      setLastTap(
        sat === null
          ? `Table ${table.label} — ${table.state}`
          : `Table ${table.label} — seated ${formatDuration(sat, locale)}`,
      );
    },
    [plan, locale],
  );

  // Staff see occupancy density on the plan itself. Never money.
  const annotate = useCallback(
    (laid: LaidOutTable): string | null => {
      if (mode !== 'staff') return null;
      const sat = seatedMinutes(laid.table, MOCK_NOW);
      if (sat !== null) return formatDuration(sat, locale);
      return `${laid.table.seats}`;
    },
    [mode, locale],
  );

  return (
    <section className="placeholder">
      <h1>{t('nav.floorplan')} — dev harness</h1>

      <div className="dev-controls">
        <label>
          <span>Fixture</span>
          <select
            value={fixture}
            onChange={(e) => {
              setFixture(e.target.value as MockFloorPlanKey);
              setSelectedTableId(null);
              setLastTap(null);
            }}
          >
            {Object.entries(FIXTURES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Mode</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as FloorPlanMode)}>
            <option value="diner">diner</option>
            <option value="staff">staff</option>
          </select>
        </label>

        <label>
          <span>Viewport</span>
          <select
            value={viewportKey}
            onChange={(e) => setViewportKey(e.target.value as ViewportKey)}
          >
            {Object.entries(VIEWPORTS).map(([key, v]) => (
              <option key={key} value={key}>
                {v.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Zoom {zoom.toFixed(2)}×</span>
          <input
            type="range"
            min={1}
            max={4}
            step={0.25}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>

        <label>
          <span>Area mode</span>
          <select value={areaMode} onChange={(e) => setAreaMode(e.target.value as 'auto' | 'off')}>
            <option value="auto">auto (falls back when hit rects collide)</option>
            <option value="off">off (always the whole room)</option>
          </select>
        </label>

        <label>
          <span>Party size</span>
          <select
            value={partySize}
            onChange={(e) => setPartySize(Number(e.target.value))}
            disabled={mode === 'staff'}
          >
            {[1, 2, 4, 6, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Legend mode={mode} translate={(key) => t(`common:${key}`)} />

      {/* The two facts this harness exists to make visible without a device:
          whether the room's own areas can divide it, and how many free tables
          each holds. */}
      <p className="dev-status">
        {floorAreas(plan)
          .map((area) => `${area.name ?? 'no area'}: ${area.freeCount}/${area.tableCount} free`)
          .join('  ·  ')}
      </p>

      <p className="dev-status">{lastTap ?? 'Tap a table.'}</p>

      {/* The frame is exactly the target device size, so what you see is what a
          phone sees — not a desktop-width render scaled down in your head. */}
      <div className="dev-viewport" style={{ width: viewport.width, height: viewport.height }}>
        <FloorPlan
          plan={plan}
          mode={mode}
          partySize={partySize}
          selectedTableId={selectedTableId}
          onTableTap={handleTap}
          viewport={viewportSize}
          tableAnnotation={annotate}
          accessibilityLabel={t('nav.floorplan')}
          translate={(key, params) => t(`common:${key}`, params ?? {})}
          areaMode={areaMode}
          transform={{ zoom, panX: 0, panY: 0 }}
        />
      </div>
    </section>
  );
}
