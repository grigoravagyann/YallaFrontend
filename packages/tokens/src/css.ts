import { blob, paperGrain } from './ambient';
import { color } from './color';
import { elevation } from './elevation';
import { duration, easing, scale } from './motion';
import { icon, radius, space, touchTarget } from './space';
import { tableStatusStyle, type TableStatus } from './tableState';
import {
  displayWeight,
  fontFamily,
  fontFeature,
  fontWeight,
  typeScale,
  type SurfaceName,
} from './typography';

/**
 * The CSS custom properties the web app renders from.
 *
 * `apps/web` used to keep a hand-written copy of a dozen values with a comment
 * asking whoever edited them to remember the other file. This replaces that:
 * the stylesheet is generated from the same objects React Native reads, so the
 * two surfaces cannot drift.
 *
 * Web-only on purpose. React Native styles import the objects directly — piping
 * them through a string and parsing it back would be theatre.
 */

function block(lines: readonly string[], selector = ':root'): string {
  return `${selector} {\n${lines.map((line) => `  ${line}`).join('\n')}\n}`;
}

function colorVars(): string[] {
  return Object.entries(color).map(([name, value]) => `--color-${kebab(name)}: ${value};`);
}

function stateVars(): string[] {
  const out: string[] = [];
  for (const [name, style] of Object.entries(tableStatusStyle) as [
    TableStatus,
    (typeof tableStatusStyle)[TableStatus],
  ][]) {
    const key = kebab(name);
    out.push(
      `--table-${key}-fill: ${style.fill};`,
      `--table-${key}-fill-opacity: ${style.fillOpacity};`,
      `--table-${key}-stroke: ${style.stroke};`,
      `--table-${key}-label: ${style.label};`,
    );
  }
  return out;
}

function scaleVars(surface: SurfaceName): string[] {
  const scale = typeScale[surface];
  return [
    ...Object.entries(scale.size).map(([step, value]) => `--font-size-${step}: ${value}px;`),
    ...Object.entries(scale.lineHeight).map(
      ([step, value]) => `--line-height-${step}: ${value}px;`,
    ),
  ];
}

function fontFace(family: string, file: string, weight: number): string {
  return [
    '@font-face {',
    `  font-family: '${family}';`,
    `  src: url('/fonts/${file}-${weight}.woff2') format('woff2');`,
    `  font-weight: ${weight};`,
    '  font-style: normal;',
    // `swap`: a waiter mid-rush should read the label in a fallback face
    // rather than stare at nothing while 86 KB arrives.
    '  font-display: swap;',
    '}',
  ].join('\n');
}

function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/gu, '$1-$2').toLowerCase();
}

/**
 * Render the whole stylesheet.
 *
 * The console scale is the `:root` default because the console is the larger
 * surface by screen count; the staff scale is applied by a `data-surface`
 * attribute on the floor screen's root. One attribute, and every size on the
 * page steps up for someone reading it standing at a counter.
 */
export function renderTokenCss(): string {
  const header = [
    '/*',
    ' * GENERATED FILE — do not edit.',
    ' *',
    ' * Written by `packages/tokens/scripts/generate-css.mjs` from the same',
    ' * TypeScript objects the diner app imports. Regenerate with:',
    ' *',
    ' *     pnpm tokens:css',
    ' *',
    ' * `apps/web` runs this automatically before `dev` and `build`, so an edit',
    ' * to a token cannot reach one surface and miss the other.',
    ' */',
  ].join('\n');

  const base = block([
    ...colorVars(),
    '',
    ...stateVars(),
    '',
    ...Object.entries(space).map(([name, value]) => `--space-${name}: ${value}px;`),
    ...Object.entries(radius).map(([name, value]) => `--radius-${kebab(name)}: ${value}px;`),
    ...Object.entries(touchTarget).map(([name, value]) => `--touch-${kebab(name)}: ${value}px;`),
    ...Object.entries(icon).map(([name, value]) => `--icon-${kebab(name)}: ${value}px;`),
    '',
    `--font-family: ${fontFamily.body.web};`,
    `--font-family-display: ${fontFamily.display.web};`,
    ...Object.entries(fontWeight).map(([name, value]) => `--font-weight-${name}: ${value};`),
    `--font-weight-semibold: ${displayWeight.semibold};`,
    `--font-feature-tabular: ${fontFeature.tabularNumbers};`,
    '',
    ...Object.entries(duration).map(([name, value]) => `--duration-${kebab(name)}: ${value}ms;`),
    ...Object.entries(scale).map(([name, value]) => `--scale-${name}: ${value};`),
    `--easing-standard: ${easing.standard};`,
    '',
    ...Object.entries(elevation).map(([name, value]) => `--shadow-${name}: ${value.web};`),
    '',
    `--texture-paper-grain: url("${paperGrain.dataUri}");`,
    `--texture-paper-grain-opacity: ${paperGrain.opacity};`,
    `--texture-paper-grain-tile: ${paperGrain.tile}px;`,
    `--texture-paper-grain-blend: ${paperGrain.blendMode};`,
    '',
    ...blob.radii.map((value, i) => `--blob-radius-${i + 1}: ${value};`),
    `--blob-blur: ${blob.blur}px;`,
    `--blob-opacity: ${blob.opacity};`,
    `--blob-fill: ${blob.fill};`,
    '',
    '/* Console scale by default; the floor screen opts into the staff scale. */',
    ...scaleVars('console'),
  ]);

  const staff = block(scaleVars('staff'), "[data-surface='staff']");
  const dinerPreview = block(scaleVars('diner'), "[data-surface='diner']");

  const reducedMotion = [
    '/*',
    ' * Reduced motion resolves every duration to zero rather than shortening it.',
    ' * The only motion in this product that carries information is the floor plan',
    ' * drawing in and a table changing colour, and neither is the only way to',
    ' * learn what it conveys.',
    ' */',
    '@media (prefers-reduced-motion: reduce) {',
    '  :root {',
    ...Object.keys(duration).map((name) => `    --duration-${kebab(name)}: 0ms;`),
    '  }',
    '',
    '  *,',
    '  *::before,',
    '  *::after {',
    '    animation-duration: 0ms !important;',
    '    animation-iteration-count: 1 !important;',
    '    transition-duration: 0ms !important;',
    '    scroll-behavior: auto !important;',
    '  }',
    '}',
  ].join('\n');

  const fontFaces = [
    ...([400, 500, 700] as const).map((w) => fontFace('Yalla Sans', 'YallaSans', w)),
    ...([600, 700] as const).map((w) => fontFace('Yalla Serif', 'YallaSerif', w)),
  ].join('\n\n');

  return [header, '', fontFaces, '', base, '', staff, '', dinerPreview, '', reducedMotion, ''].join(
    '\n',
  );
}
