import { FloorPlan } from '@yalla/floorplan';
import type { DerivedTableState, FloorPlanData } from '@yalla/floorplan/types';
import {
  AA_BODY,
  color,
  compositedFill,
  contrastRatio,
  duration,
  elevation,
  radius,
  space,
  tableStatusLegendOrder,
  tableStatusStyle,
  typeScale,
  type SurfaceName,
} from '@yalla/tokens';
import { useMemo } from 'react';

/**
 * Every token, rendered. Not a product screen.
 *
 * Copy here is intentionally untranslated English: this route never ships to a
 * venue, and its purpose is to let a designer and an engineer look at the same
 * value at the same time. The sample sentences *are* in all three scripts, and
 * every one ends in the dram sign — if `֏` renders as a box anywhere on this
 * page, the font pipeline has regressed.
 */

const SAMPLES = {
  hy: 'Սեղան 7 · պահված է մինչև 21:45 · 5 610 ֏',
  ru: 'Стол 7 · держим до 21:45 · 5 610 ֏',
  en: 'Table 7 · held until 21:45 · 5,610 ֏',
} as const;

const STEPS = ['xxl', 'xl', 'lg', 'md', 'sm', 'xs'] as const;

const SURFACES: readonly { key: SurfaceName; title: string; distance: string }[] = [
  { key: 'diner', title: 'Diner', distance: 'phone, arm’s length — base 16' },
  { key: 'staff', title: 'Staff', distance: 'tablet on a counter, two metres — base 18' },
  { key: 'console', title: 'Console', distance: 'desktop, dense tables — base 15' },
];

/**
 * One table per state, drawn by the real renderer at a real size. This is the
 * treatment a waiter sees, not a swatch that approximates it.
 */
function statePlan(): FloorPlanData {
  const states: readonly DerivedTableState[] = [
    'free',
    'reservedSoon',
    'held',
    'occupied',
    'outOfService',
    // `yourPick` is a selection, not a state; the sixth table is free and selected.
    'free',
  ];
  return {
    branchId: 'dev-tokens',
    canvasWidth: 70 * 2 + states.length * 130,
    canvasHeight: 70 * 2 + 90,
    timeZoneId: 'Asia/Yerevan',
    tables: states.map((state, i) => ({
      id: `state-${i}`,
      label: String(i + 1),
      seats: 4,
      x: 70 + i * 130,
      y: 70,
      width: 110,
      height: 80,
      rotationDegrees: 0,
      shape: i % 2 === 0 ? 'rectangle' : 'round',
      floorAreaName: null,
      isBookable: state !== 'outOfService',
      state,
      nextReservationStartUtc: null,
    })),
  };
}

export function DevTokensRoute() {
  const plan = useMemo(() => statePlan(), []);
  const viewport = useMemo(() => ({ width: 960, height: 230 }), []);

  const textPairs = useMemo(() => {
    const backgrounds = [
      ['surface', color.surface],
      ['paper', color.paper],
      ['greenTint', color.greenTint],
    ] as const;
    const foregrounds = [
      ['foreground', color.foreground],
      ['mutedForeground', color.mutedForeground],
      ['subtleForeground', color.subtleForeground],
      ['primary', color.primary],
    ] as const;
    const pairs: { fg: string; bg: string; ratio: number }[] = [];
    for (const [bg, bgHex] of backgrounds) {
      for (const [fg, fgHex] of foregrounds) {
        pairs.push({ fg, bg, ratio: contrastRatio(fgHex, bgHex) });
      }
    }
    pairs.push(
      {
        fg: 'primaryForeground',
        bg: 'primary',
        ratio: contrastRatio(color.primaryForeground, color.primary),
      },
      {
        fg: 'primaryForeground',
        bg: 'primaryPressed',
        ratio: contrastRatio(color.primaryForeground, color.primaryPressed),
      },
      {
        fg: 'dangerForeground',
        bg: 'danger',
        ratio: contrastRatio(color.dangerForeground, color.danger),
      },
      {
        fg: 'primaryForeground',
        bg: 'primaryOnFloorPlan',
        ratio: contrastRatio(color.primaryForeground, color.primaryOnFloorPlan),
      },
    );
    for (const status of tableStatusLegendOrder) {
      pairs.push({
        fg: `${status} label`,
        bg: `${status} fill`,
        ratio: contrastRatio(tableStatusStyle[status].label, compositedFill(status)),
      });
    }
    return pairs;
  }, []);

  return (
    <section className="tokens-page">
      <header>
        <h1>Design tokens</h1>
        <p className="muted">
          Everything below is read from <code>@yalla/tokens</code>. The web sheet is generated from
          the same objects the diner app imports.
        </p>
        <p className="signature">
          <span className="signature-number">14</span>
          <span className="muted">tables free now — the numbers are the typographic signature</span>
        </p>
      </header>

      <div>
        <h2>Colour</h2>
        <div className="swatches">
          {Object.entries(color).map(([name, hex]) => (
            <div key={name} className="swatch">
              <div className="swatch-fill" style={{ background: hex }} />
              <div className="swatch-meta">
                <span className="swatch-name">{name}</span>
                <span className="swatch-hex num">{hex}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2>Table states — the protected six</h2>
        <p className="muted small">
          Drawn by the real <code>FloorPlan</code> in staff mode. Table 6 is free and selected,
          which is what <code>yourPick</code> is. Hue is never the only signal: each state also
          differs in pattern, outline, opacity or ring.
        </p>
        <div className="floor-plan-frame" style={{ height: viewport.height, marginTop: space.md }}>
          <FloorPlan
            plan={plan}
            mode="staff"
            viewport={viewport}
            selectedTableId="state-5"
            accessibilityLabel="Table state samples"
          />
        </div>
        <div className="states" style={{ marginTop: space.md }}>
          {tableStatusLegendOrder.map((status) => {
            const s = tableStatusStyle[status];
            return (
              <div key={status} className="state">
                <div className="state-canvas">
                  <span
                    style={{
                      display: 'inline-block',
                      width: 72,
                      height: 48,
                      borderRadius: radius.table,
                      background: s.fill,
                      opacity: s.fillOpacity,
                      border: `${s.strokeWidth}px ${s.strokeDash ? 'dotted' : 'solid'} ${s.stroke}`,
                      boxShadow: s.ring ? `0 0 0 ${s.ring.width}px ${s.ring.color}` : undefined,
                      color: s.label,
                      fontWeight: 700,
                      textAlign: 'center',
                      lineHeight: '48px',
                    }}
                  >
                    7
                  </span>
                </div>
                <span className="swatch-name">{status}</span>
                <span className="swatch-hex num small">
                  {s.fill}
                  {s.fillOpacity < 1 ? ` @ ${Math.round(s.fillOpacity * 100)}%` : ''}
                </span>
                <span className="muted small">
                  {s.pattern === 'none' ? 'solid' : `${s.pattern} ${s.patternAngleDegrees}°`}
                  {s.strokeDash ? ' · dotted outline' : ''}
                  {s.ring ? ` · ${s.ring.width}px ring` : ''}
                  {' · label '}
                  {s.label === color.surface ? 'white' : 'ink'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h2>Contrast</h2>
        <p className="muted small">
          WCAG 2.1. Body text owes {AA_BODY}:1. Rows in red fail; <code>contrast.test.ts</code>{' '}
          makes a failure here a failing build.
        </p>
        <table className="table contrast-table" style={{ marginTop: space.md, maxWidth: 640 }}>
          <thead>
            <tr>
              <th>Foreground</th>
              <th>Background</th>
              <th className="num">Ratio</th>
            </tr>
          </thead>
          <tbody>
            {textPairs.map((pair) => (
              <tr key={`${pair.fg}-${pair.bg}`}>
                <td>{pair.fg}</td>
                <td>{pair.bg}</td>
                <td className={`num ${pair.ratio < AA_BODY ? 'fail' : ''}`}>
                  {pair.ratio.toFixed(2)}:1
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2>Type — one family, three scales</h2>
        <p className="muted small">
          Yalla Sans: Noto Sans merged with Noto Sans Armenian. Every sample ends in <code>֏</code>;
          a box there means the subset dropped it.
        </p>
        {SURFACES.map((surface) => {
          const scale = typeScale[surface.key];
          return (
            <div key={surface.key}>
              <h3>
                {surface.title} <span className="muted">— {surface.distance}</span>
              </h3>
              {STEPS.map((step) => (
                <div key={step} className="type-sample">
                  <span className="type-sample-meta">
                    {step}
                    <br />
                    {scale.size[step]} / {scale.lineHeight[step]}
                  </span>
                  <p
                    className="type-sample-text"
                    style={{
                      fontSize: scale.size[step],
                      lineHeight: `${scale.lineHeight[step]}px`,
                      fontWeight: step === 'xxl' || step === 'xl' ? 700 : 400,
                    }}
                  >
                    <span lang="hy">{SAMPLES.hy}</span>
                    <span lang="ru">{SAMPLES.ru}</span>
                    <span lang="en">{SAMPLES.en}</span>
                  </p>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div>
        <h2>Spacing — 4px scale</h2>
        {Object.entries(space).map(([name, value]) => (
          <div key={name} className="spacing-row">
            <span className="num" style={{ width: 48 }}>
              {name}
            </span>
            <span className="spacing-bar" style={{ width: value }} />
            <span className="muted num">{value}px</span>
          </div>
        ))}
      </div>

      <div>
        <h2>Radius — hierarchy, not one value</h2>
        <div className="radii">
          {Object.entries(radius)
            .filter(([name]) => name !== 'none')
            .map(([name, value]) => (
              <div key={name} className="radius-sample">
                <div
                  className="radius-box"
                  style={{
                    borderRadius: name === 'sheet' ? `${value}px ${value}px 0 0` : value,
                    width: name === 'full' ? 56 : 80,
                  }}
                />
                <span>
                  {name} · {value === 999 ? 'round' : `${value}px`}
                </span>
              </div>
            ))}
        </div>
      </div>

      <div>
        <h2>Elevation and motion</h2>
        <div className="card" style={{ maxWidth: 420, boxShadow: elevation.sheet.web }}>
          <span className="swatch-name">elevation.sheet</span>
          <span className="swatch-hex num small">{elevation.sheet.web}</span>
          <span className="muted small">
            The only shadow in the product. Everything else is a hairline.
          </span>
        </div>
        <div className="spacing-row" style={{ marginTop: space.md }}>
          {Object.entries(duration).map(([name, ms]) => (
            <span key={name} className="pill num">
              {name} {ms}ms
            </span>
          ))}
          <span className="muted small">→ all 0ms under prefers-reduced-motion</span>
        </div>
      </div>
    </section>
  );
}
