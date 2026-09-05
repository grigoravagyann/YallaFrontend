# @yalla/tokens

The single source of design tokens for every Yalla surface: the diner phone
app, the staff floor screen and the web console. Plain TypeScript objects, no
framework imports. React Native imports them directly; the web app consumes them
as CSS custom properties written by `scripts/generate-css.mjs` from the same
source, so the two cannot drift.

The style is **organic, in white and green**: unbleached paper and living
things. Pill controls, generous card radii, soft green-tinted shadows, a serif
for display, a faint paper grain on the page. Warm on the diner side,
instrument-grade on the staff side, from one token system. One rule protects
the whole thing, and it is the thing to check before changing any value.

## The rule that keeps green safe

The product has two greens and they must never be confused.

|            | Token                        | Hex       | Lightness | Meaning                              |
| ---------- | ---------------------------- | --------- | --------- | ------------------------------------ |
| Brand      | `color.primary`              | `#1E5B3C` | ~33       | Identity: buttons, links, active nav |
| Free table | `tableStatusStyle.free.fill` | `#35B37E` | ~58       | Information: this table is free      |

They stay distinguishable because of three constraints, each of which the code
enforces in `contrast.test.ts`:

1. **Brand green is deep and desaturated; free-table green is bright and
   saturated.** The test asserts that brand green's contrast against white is
   more than double free-table green's. Move them closer and the build fails.
2. **No green fill appears inside or immediately beside the floor plan
   canvas.** On any screen that shows a floor plan, primary buttons and chips
   render in ink: `color.primaryOnFloorPlan` (`#17281F`, which _is_
   `foreground`) with `primaryOnFloorPlanPressed` for the pressed state. This
   is a token, not an override inside one component, because the rule applies
   to every control on such a screen. The floor plan renderer draws fixed
   features in `paper`, never in `greenTint`; no blob and no grain reaches the
   canvas.
3. **Feedback colours reuse the state hues.** `color.danger` _is_ the occupied
   red, `color.warning` _is_ the reserved amber, `color.success` _is_ the free
   green, `color.info` _is_ the held blue. One green, one red, one amber and one
   blue in the whole product. A second red would be a second thing red means.

Break rule 2 and a green "Reserve" button beside green free tables teaches
everyone that green means nothing in particular, on the one screen where a
colour has to mean exactly one thing.

### The protected six

The six table states are the only colours in the product that carry
information. Every one carries a **fill treatment as well as a hue**, because
hue alone fails for red/green colour blindness and fails again on a sunlit
terrace. The treatments are tokens the floor plan consumes, not details buried
inside it:

| State          | Fill      | Treatment                    | Label |
| -------------- | --------- | ---------------------------- | ----- |
| `free`         | `#35B37E` | solid, hairline outline      | ink   |
| `reservedSoon` | `#C98A0E` | 45° diagonal stripes         | ink   |
| `held`         | `#3B6FD4` | dotted outline               | white |
| `occupied`     | `#B93B3B` | solid, no pattern            | white |
| `outOfService` | `#8B95A1` | cross-hatch at 70% opacity   | ink   |
| `yourPick`     | `#17281F` | ink fill, 3px `surface` ring | white |

The label colour is chosen per state by contrast, not assumed: white on the
free green is 2.66:1, white on occupied red is 5.60:1. `compositedFill()`
composites the one translucent state over the canvas so its label is checked
against what is actually on screen. **Tables stay rectilinear**: `radius.table`
is 2px, because the plan is a map of real furniture and a waiter needs to
recognise the shape of table 7.

## Colour

White grounds and green identity. `surface` (`#FFFFFF`) for cards, sheets and
the canvas; `paper` (`#F6F9F7`) for the page. Three text weights in green-black
rather than grey (`foreground`, `mutedForeground`, `subtleForeground`) and
hairlines in `border`, with `borderSoft` for card edges (the brief's "border at
50%", frozen as a solid) and `borderInteractive` for control outlines.

Every fill that text sits on is a solid. Three translucent values exist,
`scrim`, `focusRing` and `surfaceGlass`, and each is something text never sits
on: a veil, a glow, a frosted nav.

Shadows are **green-tinted, soft and diffused**, never black. `elevation.soft`
for resting cards and primary buttons, `float` for things that float, `lift` for
the deepened shadow under a hovered or pressed control, and `sheet`, which is
`float` mirrored upward, under a bottom sheet. Each has a `web` and a `native`
form.

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
opacity, in `greenTint`. Both are allowed on the diner app's browse and empty
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
`icon`: Lucide at 24 with a 2px stroke, in a 56px `greenTint` container.

## Two deviations from the brief, both for legibility

The brief asks for every text-on-fill pair to be reported and anything under
4.5:1 fixed by darkening rather than by lowering the standard. Two pairs needed
it:

- **`mutedForeground`** was specified as `#5F7268`, which is 4.48:1 on
  `greenTint`, the ground of a selected row or an icon container. It ships as
  `#5D7066` (4.61:1 there, 4.98:1 on paper, 5.28:1 on white).
- **`subtleForeground`** was specified as `#93A39A`, which is 2.3–2.6:1 on every
  ground. It ships as `#647569`: 4.89:1 on white and 4.62:1 on paper, the two
  grounds tertiary text is set on. It is **not** legible on `greenTint`
  (4.28:1), so the rule is that tertiary text never sits on a tinted fill, and
  the test suite holds that rule rather than pretending the pair passes.

One addition: **`borderInteractive`** (`#7E8D84`, ≥3.24:1), because the brief's
`border` is 1.28:1 against white. That is fine for a divider, which WCAG treats
as decoration, but a control boundary owes 3:1.

## What is in here

| Module          | Exports                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `color.ts`      | `color`; `textBackgrounds`, `subtleTextBackgrounds` for the tests                                                                                            |
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
pnpm --filter @yalla/tokens test                 # the contrast and rule assertions
python packages/tokens/scripts/build-fonts.py    # both families; --only YallaSerif for one
```

`apps/web` runs the CSS generator before `dev` and `build`. The font build
needs `fonttools` and `brotli` from pip. `/dev/tokens` in the web app renders
every value on this page, including the six states through the real renderer
and all three scales in all three scripts ending in `֏`.
