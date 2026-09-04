# @yalla/tokens

The single source of design tokens for every Yalla surface — the diner phone
app, the staff floor screen and the web console. Plain TypeScript objects, no
framework imports. React Native imports them directly; the web app consumes them
as CSS custom properties written by `scripts/generate-css.mjs` from the same
source, so the two cannot drift.

The style is **solid white and green**: flat, precise, nothing decorative.
Colour is a solid fill, structure is a 1px hairline, and hierarchy comes from
weight and space rather than depth. Two rules govern everything in this
package, and they are the two things to check before changing any value.

## Rule 1 — brand green is deep; free-table green is bright; no green goes near the floor plan

The product has two greens and they must never be confused.

|            | Token                        | Hex       | Lightness | Meaning                              |
| ---------- | ---------------------------- | --------- | --------- | ------------------------------------ |
| Brand      | `color.primary`              | `#1B5638` | ~30       | Identity: buttons, links, active nav |
| Free table | `tableStatusStyle.free.fill` | `#35B37E` | ~58       | Information: this table is free      |

They stay distinguishable because of three constraints, each of which the code
enforces:

1. **Brand green is deep and desaturated; free-table green is bright and
   saturated.** `contrast.test.ts` asserts that brand green's contrast against
   white is more than double free-table green's. Move them closer and the test
   fails.
2. **No green fill appears inside or immediately beside the floor plan
   canvas.** On any screen that shows a floor plan, the primary action renders
   in ink — `color.primaryOnFloorPlan` (`#12211A`) with
   `primaryOnFloorPlanPressed` for the pressed state. This is a token, not an
   override inside one component, because the rule applies to every control on
   such a screen. The floor plan renderer itself draws fixed features (a bar
   counter) in `paper`, never in `greenTint`.
3. **Feedback colours reuse the state hues.** `color.danger` _is_ the occupied
   red, `color.warning` _is_ the reserved amber, `color.success` _is_ the free
   green, `color.info` _is_ the held blue. One green, one red, one amber and one
   blue in the whole product. A second red would be a second thing red means.

Break rule 2 and a green "Reserve" button beside green free tables teaches
everyone that green means nothing in particular — on the one screen where a
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
| `yourPick`     | `#12211A` | ink fill, 3px `surface` ring | white |

The label colour is chosen per state by contrast, not assumed: white on the
free green is 2.66:1, white on occupied red is 5.60:1. `compositedFill()`
composites the one translucent state over the canvas so its label is checked
against what is actually on screen.

## Rule 2 — structure comes from hairlines, and exactly one elevation exists

Cards, panels, headers and table rows are separated by a 1px `color.border`.
Nested structure uses `color.borderStrong` for the outer boundary and `border`
inside it. Nothing casts a shadow as decoration.

**`elevation.sheet` is the only shadow in the product** — for the bottom sheet
that rises over the floor plan, because it genuinely floats over content the
diner still needs to see:

```
0 -2px 16px rgba(18, 33, 26, 0.10)
```

If a second elevation is ever proposed, the question is whether the thing
actually floats over content the user still needs. If it does not, it wants a
border.

Related, because they express the same idea:

- **No pills, no blob radii.** Radius is hierarchy: `table` 2px, `control` 6px,
  `card` 10px, `sheet` 14px (top corners only), `full` for avatars and nothing
  else. A single shared radius everywhere is the surest sign of a component
  kit rather than a design.
- **Pressed is a fill change, not a scale.** Motion animates colour only, in
  120–180ms. The two exceptions — the plan drawing in by area, a table
  changing state — carry information. `prefers-reduced-motion` resolves every
  duration to zero.

## What is in here

| Module          | Exports                                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `color.ts`      | `color` — surface, paper, three text weights, three border weights, `greenTint`, `primary` and its pressed/foreground/on-floor-plan variants, feedback aliases               |
| `tableState.ts` | `tableStatusStyle` — the six states with their full treatment; `compositedFill`                                                                                              |
| `typography.ts` | `typeScale.diner / .staff / .console`; `fontWeight` (400/500/700 only); `fontFamily.web`; `nativeFontFace` and `nativeFont()` for React Native; `fontFeature.tabularNumbers` |
| `space.ts`      | `space` (4px scale), `stepUp()` for staff screens, `radius` hierarchy, `touchTarget`                                                                                         |
| `elevation.ts`  | `elevation.sheet`, in web and native form                                                                                                                                    |
| `motion.ts`     | `duration`, `reducedDuration`, `durations(prefersReduced)`, `easing`                                                                                                         |
| `contrast.ts`   | WCAG `contrastRatio` and helpers — the palette asserts its own legibility                                                                                                    |
| `css.ts`        | `renderTokenCss()` — the web stylesheet                                                                                                                                      |

### Type

One family — **Yalla Sans**, which is Noto Sans merged with Noto Sans Armenian.
The type must set Armenian, Cyrillic and Latin, and Armenian in a fallback face
is the fastest way for the product to look foreign in its home city. It is
merged rather than stacked because neither half is sufficient alone (Google's
Noto Sans has no Armenian and no `֏`; Noto Sans Armenian has no Cyrillic) and
React Native does not fall through a font stack per character. Weights 400, 500
and 700; there is no 600, and asking for one synthesises.

Three scales, because the surfaces are read at different distances:

| Surface                                | Base | Steps                       |
| -------------------------------------- | ---- | --------------------------- |
| `diner` — phone, arm's length          | 16   | 12 / 14 / 16 / 20 / 26 / 34 |
| `staff` — tablet, two metres, standing | 18   | 14 / 16 / 18 / 22 / 30 / 40 |
| `console` — desktop, dense tables      | 15   | 11 / 13 / 15 / 18 / 22 / 28 |

The numbers are the typographic signature: table labels, dram prices, times,
free-table counts. Set them large, tight and bold, and use tabular figures
wherever they align in a column.

### Regenerating

```bash
pnpm tokens:css        # writes apps/web/src/tokens.generated.css
pnpm --filter @yalla/tokens test   # the contrast assertions
```

`apps/web` runs the generator before `dev` and `build`. The font build is three
scripts under `scripts/` (subset, merge, verify) and needs `fonttools` and
`brotli` from pip; the verify step is what confirms the dram sign survived.

## Two deviations from the brief, both for legibility

- **`subtleForeground`** was specified as `#8A9990`, which scores 2.58–2.98:1
  against every background it is used on. It ships as `#616E65` (≥4.62:1). The
  cost is that the three text weights compress towards two; the brief asked for
  the standard to win, and it does.
- **`borderInteractive`** (`#7E8D84`, ≥3.24:1) is an addition. The brief's
  `border` is 1.35:1 against white — fine for a divider, which WCAG treats as
  decoration, but an input outline is a control boundary and owes 3:1. Inputs
  and outlined buttons use it; dividers keep the lighter hairline.
