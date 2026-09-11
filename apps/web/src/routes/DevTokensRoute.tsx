import { FloorPlan } from '@yalla/floorplan';
import type { DerivedTableState, FloorPlanData } from '@yalla/floorplan/types';
import {
  AA_BODY,
  blob,
  color,
  compositedFill,
  contrastRatio,
  displayWeight,
  duration,
  elevation,
  fontFamily,
  fontWeight,
  icon,
  isDisplayStep,
  paperGrain,
  radius,
  scale,
  space,
  subtleTextBackgrounds,
  tableStatusLegendOrder,
  tableStatusStyle,
  touchTarget,
  typeScale,
  type SurfaceName,
  type TypeStep,
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

const STEPS: readonly TypeStep[] = ['xxl', 'xl', 'lg', 'md', 'sm', 'xs'];

const SURFACES: readonly { key: SurfaceName; title: string; distance: string }[] = [
  { key: 'diner', title: 'Diner', distance: 'phone, arm’s length — base 16' },
  { key: 'staff', title: 'Staff', distance: 'tablet on a counter, two metres — base 18' },
  { key: 'console', title: 'Console', distance: 'desktop, dense tables — base 15' },
];

type ColorName = keyof typeof color;

interface ContrastPair {
  readonly fg: string;
  readonly bg: string;
  readonly ratio: number;
  /** `false` for the one pair the token set forbids rather than passes. */
  readonly required: boolean;
}

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

function contrastPairs(): ContrastPair[] {
  const pair = (fg: ColorName, bg: ColorName, required = true): ContrastPair => ({
    fg,
    bg,
    ratio: contrastRatio(color[fg], color[bg]),
    required,
  });

  const grounds: readonly ColorName[] = ['surface', 'paper', 'greenTint'];
  const pairs: ContrastPair[] = [];

  for (const bg of grounds) {
    for (const fg of ['foreground', 'mutedForeground', 'primaryInk'] as const) {
      pairs.push(pair(fg, bg));
    }
  }
  for (const bg of grounds) {
    // Tertiary text is allowed on surface and paper only — see `color.ts`.
    const allowed = (subtleTextBackgrounds as readonly string[]).includes(color[bg]);
    pairs.push(pair('subtleForeground', bg, allowed));
  }

  pairs.push(
    pair('primaryForeground', 'primary'),
    pair('primaryForeground', 'primaryPressed'),
    pair('primaryForeground', 'primaryOnFloorPlan'),
    pair('primaryForeground', 'primaryOnFloorPlanPressed'),
    pair('dangerForeground', 'danger'),
    pair('dangerForeground', 'dangerPressed'),
    pair('danger', 'greenTint'),
  );

  for (const status of tableStatusLegendOrder) {
    pairs.push({
      fg: `${status} label`,
      bg: `${status} fill`,
      ratio: contrastRatio(tableStatusStyle[status].label, compositedFill(status)),
      required: true,
    });
  }
  return pairs;
}

const RADIUS_NOTES: Readonly<Record<keyof typeof radius, string>> = {
  none: '',
  table: 'floor plan tables — rectilinear, a map of real furniture',
  soft: 'icon tiles, code cells, banners, data tables',
  card: 'cards',
  cardAccent: 'the one swollen corner of an asymmetric card',
  sheet: 'bottom sheets, top corners only',
  pill: 'buttons, inputs, chips, avatars',
};

const SHADOW_NOTES: Readonly<Record<keyof typeof elevation, string>> = {
  soft: 'resting cards, primary buttons',
  float: 'the web nav pill, popovers',
  lift: 'hover and press — the shadow deepens',
  sheet: 'float, mirrored upward for a bottom sheet',
};

function radiusSample(name: keyof typeof radius): {
  borderRadius: string | number;
  width: number;
  height: number;
} {
  const value = radius[name];
  if (name === 'sheet') {
    return { borderRadius: `${value}px ${value}px 0 0`, width: 96, height: 64 };
  }
  if (name === 'cardAccent') {
    return {
      borderRadius: `${radius.card}px ${value}px ${radius.card}px ${radius.card}px`,
      width: 160,
      height: 96,
    };
  }
  if (name === 'pill') {
    return { borderRadius: value, width: 160, height: touchTarget.regular };
  }
  return { borderRadius: value, width: 96, height: 64 };
}

export function DevTokensRoute() {
  const plan = useMemo(() => statePlan(), []);
  const viewport = useMemo(() => ({ width: 960, height: 230 }), []);
  const pairs = useMemo(() => contrastPairs(), []);
  const failures = pairs.filter((p) => p.required && p.ratio < AA_BODY);

  return (
    <section className="tokens-page">
      <header>
        <h1>Design tokens</h1>
        <p className="muted">
          Everything below is read from <code>@yalla/tokens</code>. The web sheet is generated from
          the same objects the diner app imports. Organic, in white and green: paper grounds, one
          deep brand green, and six colours that carry meaning.
        </p>
        <p className="signature">
          <span className="signature-number">14</span>
          <span className="muted">tables free now — the display face carries the numbers</span>
        </p>
      </header>

      <div>
        <h2>Colour</h2>
        <p className="muted small">
          Identity above the line, information below it. The three translucent values at the end are
          things text never sits on: a scrim, the focus glow, the frosted nav.
        </p>
        <div className="swatches" style={{ marginTop: space.md }}>
          {Object.entries(color).map(([name, value]) => (
            <div key={name} className="swatch">
              <div className="swatch-fill" style={{ background: value }} />
              <div className="swatch-meta">
                <span className="swatch-name">{name}</span>
                <span className="swatch-hex num">{value}</span>
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
          differs in pattern, outline, opacity or ring. Nothing here is green except the free table
          — the frame, the buttons and the chips on a floor plan screen are ink.
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
        <div className="motion-demo" style={{ marginTop: space.lg }}>
          <button type="button" className="button floor-button">
            Reserve table 7
          </button>
          <span className="muted small">
            primaryOnFloorPlan — the same beige fill, with an ink edge beside a plan
          </span>
        </div>
      </div>

      <div>
        <h2>Contrast</h2>
        <p className="muted small">
          WCAG 2.1. Body text owes {AA_BODY}:1. Rows in red fail; <code>contrast.test.ts</code>{' '}
          makes a failure here a failing build.{' '}
          {failures.length === 0
            ? 'Every required pair passes.'
            : `${failures.length} required pair(s) fail.`}
        </p>
        <table className="table contrast-table" style={{ marginTop: space.md, maxWidth: 760 }}>
          <thead>
            <tr>
              <th>Foreground</th>
              <th>Background</th>
              <th className="num">Ratio</th>
              <th>Rule</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p) => {
              const fails = p.ratio < AA_BODY;
              return (
                <tr key={`${p.fg}-${p.bg}`}>
                  <td>{p.fg}</td>
                  <td>{p.bg}</td>
                  <td className={`num ${fails && p.required ? 'fail' : ''}`}>
                    {p.ratio.toFixed(2)}:1
                  </td>
                  <td className={p.required ? '' : 'excluded'}>
                    {p.required
                      ? fails
                        ? 'fails AA'
                        : 'AA'
                      : 'not allowed — tertiary text never sits on a tint'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div>
        <h2>Type — two faces, three scripts, three scales</h2>
        <p className="muted small">
          Yalla Serif (Noto Serif + Noto Serif Armenian, 600–700) carries the two display steps;
          Yalla Sans (Noto Sans + Noto Sans Armenian, 400/500/700) carries the rest. Every sample
          ends in <code>֏</code>; a box there means the subset dropped it. Sentence case throughout.
        </p>
        {SURFACES.map((surface) => {
          const s = typeScale[surface.key];
          return (
            <div key={surface.key}>
              <h3>
                {surface.title} <span className="muted">— {surface.distance}</span>
              </h3>
              {STEPS.map((step) => {
                const display = isDisplayStep(step);
                return (
                  <div key={step} className="type-sample">
                    <span className="type-sample-meta">
                      {step} · {display ? 'serif' : 'sans'}
                      <br />
                      {s.size[step]} / {s.lineHeight[step]}
                    </span>
                    <p
                      className="type-sample-text"
                      style={{
                        fontFamily: display ? fontFamily.display.web : fontFamily.body.web,
                        fontSize: s.size[step],
                        lineHeight: `${s.lineHeight[step]}px`,
                        fontWeight: display
                          ? step === 'xxl'
                            ? displayWeight.bold
                            : displayWeight.semibold
                          : fontWeight.regular,
                      }}
                    >
                      <span lang="hy">{SAMPLES.hy}</span>
                      <span lang="ru">{SAMPLES.ru}</span>
                      <span lang="en">{SAMPLES.en}</span>
                    </p>
                  </div>
                );
              })}
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
        <p className="muted small" style={{ marginTop: space.sm }}>
          Staff screens step up one level for anything tappable (<code>stepUp()</code>).
        </p>
      </div>

      <div>
        <h2>Radius — hierarchy, not one value</h2>
        <div className="radii">
          {(Object.keys(radius) as (keyof typeof radius)[])
            .filter((name) => name !== 'none')
            .map((name) => (
              <div key={name} className="radius-sample">
                <div className="radius-box" style={radiusSample(name)} />
                <span>
                  {name} · {radius[name] === 999 ? 'round' : `${radius[name]}px`}
                </span>
                <span className="small" style={{ maxWidth: 160, textAlign: 'center' }}>
                  {RADIUS_NOTES[name]}
                </span>
              </div>
            ))}
        </div>
      </div>

      <div>
        <h2>Elevation — green-tinted, never black</h2>
        <div className="shadow-samples">
          {(Object.keys(elevation) as (keyof typeof elevation)[]).map((name) => (
            <div key={name} className="shadow-sample" style={{ boxShadow: elevation[name].web }}>
              <span className="swatch-name">elevation.{name}</span>
              <span className="swatch-hex num small">{elevation[name].web}</span>
              <span className="muted small">{SHADOW_NOTES[name]}</span>
            </div>
          ))}
        </div>
        <div className="shadow-samples">
          <div className="card">
            <span className="swatch-name">card</span>
            <span className="muted small">24px, border-soft, shadow-soft</span>
          </div>
          <div className="card card-accent">
            <span className="swatch-name">card-accent</span>
            <span className="muted small">one corner at 48px</span>
          </div>
          <div className="card card-interactive">
            <span className="swatch-name">card-interactive</span>
            <span className="muted small">lifts on hover, web only — never rotates</span>
          </div>
        </div>
      </div>

      <div>
        <h2>Motion — answers a tap, nothing snaps</h2>
        <div className="motion-demo">
          {Object.entries(duration).map(([name, ms]) => (
            <span key={name} className="pill num">
              {name} {ms}ms
            </span>
          ))}
          <span className="pill num">press ×{scale.press}</span>
          <span className="pill num">hover ×{scale.hover}</span>
          <span className="muted small">→ every duration 0ms under prefers-reduced-motion</span>
        </div>
        <div className="motion-demo" style={{ marginTop: space.lg }}>
          <button type="button" className="button button-primary">
            Reserve table 7
          </button>
          <button type="button" className="button">
            Outline
          </button>
          <button type="button" className="button button-ghost">
            Ghost
          </button>
          <button type="button" className="button button-danger">
            Cancel booking
          </button>
          <button type="button" className="button button-primary button-small">
            Small
          </button>
          <button type="button" className="button button-primary button-large">
            Large
          </button>
          <button type="button" className="icon-tile" aria-label="Feature icon container">
            <svg
              width={icon.size}
              height={icon.size}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={icon.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 11l18-5v12L3 14v-3z" />
              <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
            </svg>
          </button>
        </div>
        <p className="muted small" style={{ marginTop: space.sm }}>
          Press any of them: scale {scale.press} and a deeper shadow. Hover is the same lift the
          other way, and only where a pointer exists. The icon tile fills to solid primary on press.
        </p>
      </div>

      <div>
        <h2>Texture and form — background only</h2>
        <p className="muted small">
          Paper grain at {Math.round(paperGrain.opacity * 1000) / 10}% with a {paperGrain.blendMode}{' '}
          blend, on <code>paper</code> grounds. Blobs at {Math.round(blob.opacity * 100)}% opacity
          behind {blob.blur}px of blur. Neither is ever over a floor plan or on a staff screen.
        </p>
        <div className="grain-demo" style={{ marginTop: space.md }}>
          <div className="grain-swatch">
            <span className="muted small">paper, no grain — what a staff screen gets</span>
          </div>
          <div className="grain-swatch grained">
            <span className="muted small">paper with grain — diner and console</span>
          </div>
        </div>
        <div className="blob-demo" style={{ marginTop: space.lg }}>
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="blob blob-3" />
          <div className="blob-demo-content">
            <p className="display" style={{ margin: 0, fontSize: typeScale.console.size.xl }}>
              No bookings yet
            </p>
            <p className="muted" style={{ marginTop: space.sm }}>
              Find a table near you and we will hold it while you finish your coffee.
            </p>
          </div>
        </div>
      </div>

      <div>
        <h2>Touch targets and icons</h2>
        <div className="target-row">
          {(Object.keys(touchTarget) as (keyof typeof touchTarget)[]).map((name) => (
            <div key={name} className="radius-sample">
              <div
                className="target-box"
                style={{ width: touchTarget[name] * 1.6, height: touchTarget[name] }}
              >
                {touchTarget[name]}
              </div>
              <span>{name}</span>
            </div>
          ))}
          <div className="radius-sample">
            <div className="target-box" style={{ width: icon.container, height: icon.container }}>
              {icon.container}
            </div>
            <span>icon container</span>
          </div>
        </div>
      </div>
    </section>
  );
}
