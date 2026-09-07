# Yalla — design system

Table reservation and in-app ordering for restaurants and cafés in Yerevan.
Four surfaces, one token package: `@yalla/tokens`. Everything in this document
is expressed there as plain TypeScript, with no framework imports, because
React Native and the web both consume it.

---

## The thesis

**Colour means table state. Nothing else in the product is coloured.**

Five hues carry meaning — free, reserved soon, held, occupied, out of service —
and they are the only chroma a person sees. The primary action, the active
navigation item, the progress fill, the big numbers: all ink on near-white.

The thing a person should remember after using Yalla once is _the room, live_ —
that you can see which tables are free right now. So the room is the only place
in the product where colour appears, and everywhere a colour does appear it is
answering that one question.

### Why the accent is ink, and not a colour

The reference this system follows leads with a confident mint-green accent. We
cannot use it, and the reason is the most important constraint in the product.

`free` on a floor plan is green. A green primary button beside green free tables
teaches people that green means nothing in particular, and the floor plan is the
one screen where a colour has to mean exactly one thing.

The system this replaces knew that. It used a _deep_ green for the brand and a
_bright_ green for free tables, kept apart by lightness, plus a
`primaryOnFloorPlan` token that swapped the button to ink whenever a floor plan
was on screen. It worked. It also meant the accent was never confident on the
screens that mattered most, and every new screen had to remember the swap.

The five states already occupy green, amber, blue, red and grey — most of the
wheel. Rather than hunt for the one leftover hue, we inverted the rule: **ink is
the accent everywhere.** There is now no context in which the primary action and
a table state can be confused, because the primary action has no hue at all.

`primaryOnFloorPlan` survives as a token, because four screens import it. It
resolves to the same ink as `primary`, so those call sites are correct by
construction rather than by remembering a rule.

The cost is real and worth naming: outside its logo, Yalla has no brand colour.
That is austere for hospitality. We think it buys more than it costs, because
the alternative spends the product's one colour budget on chrome instead of on
the room.

---

## Palette

Every value below is in `packages/tokens/src/color.ts`. Nothing outside that
file references a hex literal.

### Ground and ink

| Token              | Value     | Notes                                     |
| ------------------ | --------- | ----------------------------------------- |
| `surface`          | `#FFFFFF` | Cards, sheets, the floor plan canvas      |
| `paper`            | `#F4F6FA` | The page. Near-white, faint cool cast     |
| `foreground`       | `#131A22` | Text **and** the accent. 17.52:1 on white |
| `mutedForeground`  | `#55606E` | Secondary. 6.39 on white, 5.91 on paper   |
| `subtleForeground` | `#646F7C` | Tertiary. 5.11 on white, 4.73 on paper    |

`paper` is never pure white, because a white card has to read as lifted off the
page and it cannot do that against white. The cast is blue rather than the green
it used to be: with ink as the accent there is no green in the chrome for a warm
ground to agree with, and a cool ground keeps the five state hues looking like
the only colour on screen.

`subtleForeground` clears AA on `surface` and `paper` and **fails on the tint**
(4.31:1). That is deliberate and tested: tertiary text is never set on a tinted
fill. Darkening it until it passed everywhere would collapse it into
`mutedForeground` and leave the product with two text weights pretending to be
three.

### Lines

| Token               | Value     | Owes                                                          |
| ------------------- | --------- | ------------------------------------------------------------- |
| `border`            | `#E2E8F0` | Nothing — a divider is decoration                             |
| `borderSoft`        | `#EEF2F7` | The exception edge, see _Cards_                               |
| `borderStrong`      | `#C4CCD8` | Outer edge of nested structure                                |
| `borderInteractive` | `#79838F` | 3:1. A control boundary owes it: 3.85 on white, 3.56 on paper |

### The accent

| Token               | Value                                                |
| ------------------- | ---------------------------------------------------- |
| `primary`           | `#131A22` — ink                                      |
| `primaryPressed`    | `#2A3644` — ink, lifted. White clears 12.28:1        |
| `primaryForeground` | `#FFFFFF`                                            |
| `greenTint`         | `#E7ECF3` — kept under its old name, no longer green |

`greenTint` is now a neutral tint. The name survives because nineteen screens
import it and this was a change to one package. Renaming it is a follow-up.

---

## The protected six

These are semantic, not decorative. They render identically on the diner phone,
the staff tablet and the public page, and a legend on three surfaces is driven
from these same tokens so it cannot drift from what the room draws.

| State          | Hue             | Non-colour signal                             | Label |
| -------------- | --------------- | --------------------------------------------- | ----- |
| `free`         | `#35B37E` green | Flat fill, 1px hairline in the neutral border | ink   |
| `reservedSoon` | `#C98A0E` amber | **Diagonal stripes**, 45°                     | ink   |
| `held`         | `#3B6FD4` blue  | **Dotted border**, 1.5px, `[1,3]`             | white |
| `occupied`     | `#B93B3B` red   | **2px border in its own darker hue**          | white |
| `outOfService` | `#8B95A1` grey  | **Crosshatch** + 70% fill opacity             | ink   |
| `yourPick`     | ink             | **Outside ring** in the canvas colour         | white |

### Why each hue survives beside the accent

The accent is achromatic (chroma 0.06). Every state that carries a hue carries a
real one (chroma > 0.4). There is no lightness-based near-miss to reason about,
because there is no chromatic accent to miss against. This is asserted, not
assumed: `contrast.test.ts` measures the accent's chroma and each state's.

Two states are close to grey, and lightness separates them: `outOfService` is a
pale dead table, the accent is a near-black control, and they clear AA against
each other.

`yourPick` is deliberately the accent colour. It marks the table the diner's
next action applies to, it is diner-only, it never co-occurs with a button in the
same role, and it is the only state carrying a ring.

### Why every state also works in greyscale

A terrace in Yerevan in July is bright enough to wash out hue on any phone at any
brightness, and roughly one man in twelve has a red/green deficiency. So hue is
never the only signal: strip it and a pattern, a dash, a border weight, an
opacity or a ring still names six different things. A test asserts the six
treatments are pairwise distinct.

`free` and `occupied` are why that test exists. Both are a flat unpatterned fill,
and until `occupied` took a heavier edge in its own hue, the two states a floor
screen shows most often were separable by colour alone.

---

## Typography

**One family. Hierarchy from size, weight and colour.**

| Face          | Composition                                    | Weights                            |
| ------------- | ---------------------------------------------- | ---------------------------------- |
| `Yalla Sans`  | Noto Sans **merged with** Noto Sans Armenian   | 400, 500, 700                      |
| `Yalla Serif` | Noto Serif **merged with** Noto Serif Armenian | 600, 700 — built, not in the scale |

### Script coverage, and why this is not a compromise

The product ships in Armenian, Russian and English from day one, and Armenian is
the priority on the staff and owner surfaces. Armenian set in a fallback face is
the fastest way for this product to look foreign and badly translated in the city
it launches in.

The faces are **merged, not stacked**, and that is the load-bearing decision.
React Native does not fall through a font stack per character: a Latin-first face
with an Armenian fallback silently renders boxes or a substitute in the diner
app. Google's Latin Noto faces carry no Armenian and no `֏`; the Armenian faces
carry no Cyrillic. Merging is the only way one family covers all three scripts.

`scripts/build-fonts.py` performs the merge, and its verify step is what confirms
the dram sign survived the subset. That verification is the reason this claim is
a fact rather than an intention.

Web fallback stack, for the seconds before the self-hosted face loads — chosen to
be metrically close so the reflow is not a jolt:

```
'Yalla Sans', 'Noto Sans Armenian', 'Noto Sans', system-ui, -apple-system, 'Segoe UI', sans-serif
```

Any "nicer" Latin-first display face — Satoshi, General Sans, Fraunces — would be
a downgrade here, not an upgrade. They have no Armenian.

### The serif is retired from the scale

`displaySteps` is now empty. The serif is still built and still exported, so
bringing it back is a one-line change rather than a font rebuild. It is out of
the scale because a serif heading above a metric card is the clearest tell that
two design directions are fighting, and this system takes its hierarchy from size
and weight inside one family.

### Scale

Three scales, because the three surfaces are read at different distances. Sizes
in px; line heights rounded to whole pixels, because half-pixel leading blurs on
Android.

| Step         | console | diner  | staff  |
| ------------ | ------- | ------ | ------ |
| `xs`         | 11      | 12     | 14     |
| `sm`         | 13      | 14     | 16     |
| `md`         | 15      | 16     | 18     |
| `lg`         | 18      | 20     | 22     |
| `xl`         | 22      | 26     | 30     |
| `xxl`        | 28      | 34     | 40     |
| **`metric`** | **52**  | **40** | **44** |

### Numbers are the hero

`metric` sits outside the step scale on purpose. It is not the next heading size
up; it is a different kind of thing, and giving it a step would invite its use as
one. A metric is a figure with a small label above it and a change indicator
beside it: covers taken, revenue, free tables, average tab.

It is always set in `tabularNumbers` (`'tnum' 1`). Dram is whole-integer and
commonly four to six digits, so a column of totals has to align on the digit — a
bill where the digits do not line up looks wrong to everyone who reads one.

The three metric sizes are deliberately **not** proportional to their surfaces'
body sizes:

- **console 52** is the largest. A dashboard leads with three numbers and has the
  room for them.
- **staff 44** is smaller than its body scale would imply, because on that
  surface the floor plan is the hero and a 52px counter beside it would compete.
- **diner 40** exists for a bill total. The diner surface never leads with a
  figure.

Tests assert that each surface's metric exceeds every step in its own body scale,
that it leads tighter than body text, and that staff never outgrows console.

**A money metric above five digits steps down to `xxl`.** This came out of the
mockup rather than out of theory: `1 284 500 ֏` at the console metric of 52px
does not fit a third-width card and wraps to two lines, and a hero number that
wraps is not a hero number. Dram has no subunit, so six-digit weekly revenue is
the normal case rather than the outlier — a system that only works for `240` has
not been checked against the product's actual numbers. Group digits with a thin
space, keep the `֏` on the same line, and never let the figure wrap.

---

## Spacing

A 4px base. `0, 4, 8, 12, 16, 24, 32, 48, 64`, named `none` through `huge`.

The rhythm never varies, which is what lets a dense screen stay readable. Cards
take `xl` (24) of internal padding on console and diner, and `xxl` (32) on staff
where a finger needs the margin.

## Radius

| Token        | Value | Use                                                            |
| ------------ | ----- | -------------------------------------------------------------- |
| `table`      | 2     | The floor plan stays rectilinear — a room is not made of pills |
| `soft`       | 10    | Icon tiles, banners, code cells                                |
| `card`       | 14    | Cards, every surface                                           |
| `sheet`      | 20    | Bottom sheets, top corners only                                |
| `cardAccent` | 28    | Retired — retained for one dev screen                          |
| `pill`       | 999   | Buttons, inputs, chips, avatars                                |

`card` came down from 24. A 24px corner on a 200px metric card is a lozenge; at
14 a grid of cards reads as a grid. `cardAccent` was the swelling asymmetric
corner of the organic direction this replaces, and nothing in the new system asks
a card to be asymmetric.

## Elevation

Four recipes, ink-tinted at low alpha, never pure black. A pure-black shadow
under a white card reads as a component library.

| Token   | Use                                                                 |
| ------- | ------------------------------------------------------------------- |
| `soft`  | Resting cards, primary buttons, icon containers                     |
| `float` | Things that genuinely float: the web nav pill, popovers             |
| `lift`  | A hovered card or a pressed button                                  |
| `sheet` | `float` mirrored upward — a bottom sheet rises from the bottom edge |

The alphas are lower than the system they replace (0.08–0.12, down from
0.14–0.20), because the ground moved closer to white and a shadow tuned for a
tinted page is too heavy on this one.

---

## Cards

**A card is white, on near-white, separated by elevation — not by a border.**

This is the primary structural unit on every surface. A soft shadow on near-white
is what lets a dense dashboard stay calm; a grid of outlined boxes reads as a
form.

`borderSoft` exists for the one exception: a card that must sit on `surface`
rather than `paper` has no contrast for a shadow to work against and needs an
edge after all. It is the softest line in the system so the exception never reads
as the rule.

### This is not fully delivered yet

`.card` in `apps/web/src/index.css` currently sets _both_ a `soft` shadow and a
`1px solid` border, and that file carries 71 `border:` declarations against 15
`box-shadow`s. That is why the product reads as border-led today.

Those lines live in screen CSS, and this task changed one package. **The screen
migration is the next task**, and it is small: drop the border from `.card`, then
work down the 71 and keep only the ones that are genuinely dividers or control
boundaries. Until then the tokens describe the intended card and the screens do
not yet draw it.

---

## Per-surface degradation

The reference is a desktop dashboard. Here is what each decision does on a phone
and on a tablet held at arm's length.

### Console — desktop browser, owners and managers, sitting down

The reference direction lands here directly. Sidebar with quiet section
headings, a solid-ink active item and secondary actions pinned to the bottom.
Three metric cards across the top at `metric` 52. Card padding `xl` (24).

### Staff floor screen — 10-inch tablet, landscape, standing, during service

- **Type floors at `md` 18.** Nothing on this surface is smaller than 14
  (`xs`), and body never drops below 18. It is read from about two metres.
- **Every control steps up to 56px** (`touchTarget.staff`), well beyond the 44
  platform minimum. No control relies on hover; this surface has none.
- **Card padding widens to `xxl` (32)**, because a finger needs the margin that a
  cursor does not.
- **The metric shrinks to 44**, against the console's 52. The floor plan is the
  hero here and a bigger counter would compete with it.
- **Portrait must not break.** Cards stack in one column; the floor plan keeps
  its aspect and scales down rather than cropping.
- **Destructive actions never sit adjacent to frequent ones.** A "void" beside a
  "seat" is a mis-tap during a Friday rush. Separate them with at least `xl` (24)
  or put them behind a confirm.
- **Direct sunlight is the design condition**, which is why every state carries a
  non-colour signal and why the ink accent is near-black rather than mid-grey.

### Diner app — phone, portrait, ~380pt, often poor mobile data

- **Cards stack to a single column** below roughly 480pt. They keep `card` 14 and
  `xl` padding; the page gutter tightens to `lg` (16).
- **Elevation stays but lightens in effect**, because a phone screen is closer to
  the eye. No token change: the same `soft` reads lighter at that distance.
- **Touch targets floor at 44** (`touchTarget.minimum`).
- **The floor plan switches to area mode** on a narrow viewport rather than
  shrinking the whole room — a thirty-table restaurant on a 380pt phone is
  unreadable whole.
- Poor data is a loading-state problem, not a token problem, but it is why the
  system has no web fonts on the critical path beyond the two faces and why the
  fallback stack is metrically close.

### Public branch page — phone, from a shared link, a stranger's first impression

Same phone rules as the diner app. One difference that matters: this page is
often the first thing anyone sees of the product, and it is the surface where the
thesis has to land in three seconds. The room, with its colours, sits above the
fold. Everything else on the page is ink on near-white.

---

## Motion

Minimal and functional: only transitions that aid comprehension. Every duration
resolves to zero under `prefers-reduced-motion`, and a test asserts it.

## What this system deliberately drops

- **The serif from the type scale** — one family now.
- **The paper grain and the background blobs** (`ambient.ts`). They are the
  organic direction's texture. The exports remain because a dev screen imports
  them; the screens should stop applying them, which is part of the same
  follow-up as the card border.
- **The asymmetric card corner** (`cardAccent`).
- **The green-tinted shadow.**
- **The brand/free green distinction and the floor-plan swap**, replaced by a
  rule that needs no exception.

---

## Verification

`packages/tokens/src/contrast.test.ts` — **46 assertions, all passing**, up from 32. It covers text contrast on every ground, the state labels against their
composited fills, control boundaries at 3:1, the achromatic accent, the pairwise
distinctness of the six state treatments, the metric hierarchy, and reduced
motion.

Run it with `pnpm --filter @yalla/tokens test`. It runs in CI with the rest.

## Seeing it

`~/.gstack/projects/grigoravagyann-YallaFrontend/designs/` holds
`yalla-system.html` and a render of it. The page loads
`tokens.generated.css` — the file this package emits, byte for byte — so every
colour, radius, shadow, space and type size in it resolves through a token.
Nothing there is a hand-picked hex, which is the point: it demonstrates that the
tokens produce the look, which a rendered image cannot.
