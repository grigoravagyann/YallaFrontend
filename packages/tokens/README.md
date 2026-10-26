# @yalla/tokens

The single source of design tokens for every Yalla surface: the diner phone
app, the staff floor screen and the web console. Plain TypeScript objects, no
framework imports. React Native imports them directly; the web app consumes them
as CSS custom properties written by `scripts/generate-css.mjs` from the same
source, so the two cannot drift.

The colours are **SHURJ** (`DESIGN.md` at the repo root is the full system):
a white page, charcoal text, the Black Cherry for the one thing to press, and
the state hues that carry meaning. Nothing else is coloured, and there is no
blue: `noBlue.test.ts` fails on a blue in any token file here or in the diner
theme, except the Telegram button and the map's "you" dot.

## Two palettes

- **`console.ts`** (`consoleColor`, `--console-*`) is the source of truth for
  the console, the venue console, the floor tablet and the public page.
- **`color.ts`** (`color`, `--color-*`) is what the older web screens read. Its
  neutrals and its action colour are `console.ts` values, so it cannot drift
  from SHURJ: `paper` is `canvas`, `foreground` is `ink`, `primary` and
  `primaryInk` are `brand`, `primaryForeground` is the ivory, `greenTint` is
  `brandTint`, `info` is the waiting burgundy.

The diner app has its own palette, `apps/diner/src/theme/colors.ts`.

Three rules in `color.ts`, each enforced in `contrast.test.ts`:

1. **The cherry is fill and line.** It is 15.39:1 on white, so `primaryInk`
   is `primary`, and ivory reads 14.47:1 on it.
2. **Feedback colours reuse the state hues.** `color.danger` _is_ the occupied
   red, `color.warning` the reserved amber, `color.success` the free green,
   `color.info` the held burgundy. A second red would be a second thing red
   means.
3. **Two text weights.** `subtleForeground` is `mutedForeground`.

### The protected six

The six table states are the only colours in the product that carry
information. Every one carries a **fill treatment as well as a hue**, because
hue alone fails for red/green colour blindness and fails again on a sunlit
terrace:

| State          | Fill      | Treatment                    | Label |
| -------------- | --------- | ---------------------------- | ----- |
| `free`         | `#35B37E` | solid, hairline outline      | ink   |
| `reservedSoon` | `#C98A0E` | 45° diagonal stripes         | ink   |
| `held`         | `#6B1121` | dotted outline               | white |
| `occupied`     | `#B93B3B` | solid, no pattern            | white |
| `outOfService` | `#8B95A1` | cross-hatch at 70% opacity   | ink   |
| `yourPick`     | `#2D2927` | ink fill, 3px `surface` ring | white |

The label colour is chosen per state by contrast, not assumed: white on the
free green is 2.66:1, white on occupied red is 5.60:1. `compositedFill()`
composites the one translucent state over the canvas so its label is checked
against what is actually on screen. **Tables stay rectilinear**: `radius.table`
is 2px. The web emits `--table-*` for the four states the public page's pins
draw; held pins wear the reserved-soon fill there.

Shadows (`elevation`) are the charcoal at low alpha, never black and never the
cherry: `soft`, `float`, `lift`, and `sheet` (`float` mirrored upward). Each
has a `web` and a `native` form.

## Type

Two faces, three scripts. The hard constraint is coverage: the type must set
Armenian, Cyrillic and Latin, and Armenian in a fallback face is the fastest way
for the product to look foreign in its home city. That rules out most faces a
designer would reach for first (Fraunces, Nunito, Quicksand), so both faces are
Noto:

| Face            | Built from                       | Weights       | Carries               |
| --------------- | -------------------------------- | ------------- | --------------------- |
| **Yalla Serif** | Noto Serif + Noto Serif Armenian | 600, 700      | the two display steps |
| **Yalla Sans**  | Noto Sans + Noto Sans Armenian   | 400, 500, 700 | everything else       |

Each is merged rather than stacked because neither half is sufficient alone
(Google's Latin faces have no Armenian and no `֏`; the Armenian faces have no
Cyrillic) and React Native does not fall through a font stack per character.
`scripts/build-fonts.py` downloads, subsets, merges, verifies and writes woff2
to `apps/web/public/fonts` and ttf to `apps/diner/assets/fonts`. The verify step
is what confirms the dram sign survived.

Three scales, because the surfaces are read at different distances:

| Surface                               | Base | Steps                       | Body / display leading |
| ------------------------------------- | ---- | --------------------------- | ---------------------- |
| `diner`: phone, arm's length          | 16   | 12 / 14 / 16 / 20 / 26 / 34 | 1.5 / 1.2              |
| `staff`: tablet, two metres, standing | 18   | 14 / 16 / 18 / 22 / 30 / 40 | 1.4 / 1.15             |
| `console`: desktop, dense tables      | 15   | 11 / 13 / 15 / 18 / 22 / 28 | 1.45 / 1.25            |

`xl` and `xxl` are the display steps (`displaySteps`, `isDisplayStep()`). Tabular
figures are a token (`fontFeature.tabularNumbers`); this product is made of
numbers. Sentence case throughout: no all-caps labels, no accenting one word
inside a heading.

## Shape, texture, motion

**Radius is hierarchy.** `table` 2 · `soft` 12 · `card` 24 · `sheet` 28 (top
corners) · `cardAccent` 48 (the one swollen corner of an asymmetric card) ·
`pill` for buttons, inputs, chips and avatars. The test holds the order.

**Paper grain** (`paperGrain`) at 2.5% with a multiply blend, on `paper`
grounds. **Blobs** (`blob`) as ambient background forms: large, blurred, low
opacity, in `greenTint` (the brand tint). Both are allowed on the diner app's browse and empty
screens and on public pages. **Neither is ever over a floor plan or on a staff
screen**: grain reduces contrast, and the staff tablet is read at two metres on
a counter that may be in direct sun.

**Motion answers a person's action.** `duration.control` 220ms for press and
hover, `stateChange` 200ms for a table changing colour on a live floor,
`floorPlanDraw` 400ms for the one orchestrated moment, the plan drawing in by
area, once per branch. `scale.press` 0.97 and `scale.hover` 1.03, each with a
deepened shadow. No rotation on any functional element. `reducedDuration`
resolves everything to zero.

**Touch targets:** `touchTarget.regular` 48 for buttons and inputs, `small` 40,
`large` 56, `minimum` 44 on the diner app, `staff` 56 on every staff control.
`icon`: Lucide at 24 with a 2px stroke, in a 56px container.

## What is in here

| Module          | Exports                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `color.ts`      | `color` (built from `console.ts`); `textBackgrounds`, `subtleTextBackgrounds`, `tintedFills` for the tests                                                   |
| `console.ts`    | `consoleColor`, `consoleSize`, `consoleRadius`, `consoleText`, `consoleShadow`                                                                               |
| `tableState.ts` | `tableStatusStyle`, the six states with their full treatment; `tableStatusLegendOrder`; `compositedFill`                                                     |
| `typography.ts` | `typeScale.diner / .staff / .console`; `fontFamily.body / .display`; `fontWeight`, `displayWeight`; `nativeFontFace`, `nativeDisplayFontFace`; `fontFeature` |
| `space.ts`      | `space` (4px scale), `stepUp()`, `radius`, `touchTarget`, `icon`                                                                                             |
| `elevation.ts`  | `elevation.soft / .float / .lift / .sheet`, each in web and native form                                                                                      |
| `motion.ts`     | `duration`, `reducedDuration`, `durations(prefersReduced)`, `scale`, `easing`                                                                                |
| `ambient.ts`    | `paperGrain`, `blob`                                                                                                                                         |
| `contrast.ts`   | WCAG `contrastRatio` and helpers; the palette asserts its own legibility                                                                                     |
| `css.ts`        | `renderTokenCss()`, the web stylesheet                                                                                                                       |

### Regenerating

```bash
pnpm tokens:css                                  # writes apps/web/src/tokens.generated.css
pnpm --filter @yalla/tokens test                 # contrast, rule and no-blue assertions
python packages/tokens/scripts/build-fonts.py    # both families; --only YallaSerif for one
```

`apps/web` runs the CSS generator before `dev` and `build`. The font build
needs `fonttools` and `brotli` from pip. `/dev/tokens` in the web app renders
every value on this page, including the six states through the real renderer
and all three scales in all three scripts ending in `֏`.
