# Yalla — design system

Table reservation and in-app ordering for restaurants and cafés in Yerevan.
Four surfaces, one token package: `@yalla/tokens`. Everything in this document
is expressed there as plain TypeScript, with no framework imports, because
React Native and the web both consume it.

---

## The thesis

**Chroma means one of two things: what state a table is in, or the single
element you are meant to act on. Nothing else in the product is coloured.**

Five hues carry table state — free, reserved soon, held, occupied, out of
service. The accent carries action: a beige fill on the primary button, the
active navigation item and a selected option, and nowhere else. Everything in
between — body text, headings, metrics, chart fills, borders — is neutral.

The thing a person should remember after using Yalla once is _the room, live_ —
that you can see which tables are free right now. So the room keeps most of the
colour budget, and the one hue spent outside it is spent on the one place a
person is being asked to do something.

### Why the accent is beige, and why it is a fill and never a line

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

The first version of this system deleted the exception by making **ink** the
accent: no hue at all, so nothing to confuse. That was correct about the floor
plan and wrong about the console. A progress bar filled with `#131A22` reads as
a redaction rather than a measure, an ink nav item does not announce itself, and
the strongest value in the palette ended up spent on data nobody is being asked
to act on. A violet accent (`#6A38C7`) followed; it has since been replaced by
the brand beige.

The accent is `#C3B59F`, and one number decides how it may be used: it is
**2.01:1 on white** and 1.86:1 on `paper`. So it splits into two tokens:

- **`primary` `#C3B59F` is only ever a fill** — primary buttons, the active nav
  item, selected options, progress. The label on it is always ink `#131A22`
  (8.70:1). **White is never set on it** (2.01:1).
- **`primaryInk` `#6B5C45` is the same hue darkened** for everything that is a
  line: text, icons, links, outlines, focused-field edges, rules. 6.48:1 on
  white, 5.99 on paper, 5.49 on `accentTint` — past 4.5 for text, so past 3
  for UI boundaries too.

At 0.14 chroma the beige is a warm neutral rather than a hue, below the 0.15
line the tests call grey. That is what keeps it off the floor plan's colour
channel: every chromatic table state is above 0.4. Its hue (37) is 3 degrees
from `reservedSoon` amber, so hue separates nothing — saturation and shape do,
and both are asserted in `contrast.test.ts`.

`primaryOnFloorPlan` survives as a token because screens import it. It is the
same beige fill; what a control beside a plan adds is a `primaryInk` edge,
because the fill alone is 1.03:1 from the composited out-of-service grey and the
edge is 3.13:1.

---

## Palette

Every value below is in `packages/tokens/src/color.ts`. Nothing outside that
file references a hex literal.

### Ground and ink

| Token              | Value     | Notes                                   |
| ------------------ | --------- | --------------------------------------- |
| `surface`          | `#FFFFFF` | Cards, sheets, the floor plan canvas    |
| `paper`            | `#F4F6FA` | The page. Near-white, faint cool cast   |
| `foreground`       | `#131A22` | Text. 17.52:1 on white. Not the accent  |
| `mutedForeground`  | `#55606E` | Secondary. 6.39 on white, 5.91 on paper |
| `subtleForeground` | `#646F7C` | Tertiary. 5.11 on white, 4.73 on paper  |

`paper` is never pure white, because a white card has to read as lifted off the
page and it cannot do that against white. The cast is blue rather than green: a
cool ground sets off the warm accent and keeps the five state hues looking like
the only other colour on screen.

`subtleForeground` clears AA on `surface` and `paper` and **fails on both
tints** (4.31:1 on `greenTint`, 4.34:1 on `accentTint`). That is deliberate and
tested: tertiary text is never set on a tinted fill. Darkening it until it
passed everywhere would collapse it into `mutedForeground` and leave the product
with two text weights pretending to be three.

### Lines

| Token               | Value     | Owes                                                          |
| ------------------- | --------- | ------------------------------------------------------------- |
| `border`            | `#E2E8F0` | Nothing — a divider is decoration                             |
| `borderSoft`        | `#EEF2F7` | The exception edge, see _Cards_                               |
| `borderStrong`      | `#C4CCD8` | Outer edge of nested structure                                |
| `borderInteractive` | `#79838F` | 3:1. A control boundary owes it: 3.85 on white, 3.56 on paper |

### The accent

| Token               | Value                                                               |
| ------------------- | ------------------------------------------------------------------- |
| `primary`           | `#C3B59F` — beige, a fill only. Ink on it 8.70:1; white 2.01, never |
| `primaryPressed`    | `#AD9C80` — hover and pressed fill. Ink on it 6.54:1                |
| `primaryForeground` | `#131A22` — ink, the label on both fills                            |
| `primaryInk`        | `#6B5C45` — text, icons, borders, focus. 6.48 white, 5.99 paper     |
| `accentTint`        | `#EFECE6` — hover and selected ground. Ink 14.86, `primaryInk` 5.49 |
| `greenTint`         | `#E7ECF3` — kept under its old name, neutral, not the accent        |

The two tints are not interchangeable: `greenTint` is the neutral fill behind a
selected row or an icon tile, `accentTint` is the light ground for something in
the accent's role that is not the primary action itself — a hovered nav item, a
selected chip in an accent context. The active nav item is a **solid** beige
with an ink label; the tint is the quieter step below it. The two tints are
1.01:1 apart, so the tint is never the only signal that something is selected —
a selected option also carries a border, weight or a visible control.
`subtleForeground` is banned from both.

`greenTint` is neither green nor beige. The name survives because nineteen
screens import it and this was a change to one package. Renaming it is a
follow-up.

### Data

Charts are neutral. The accent marks the one bar that is current, and nothing
else in a chart is allowed to carry it.

| Token            | Value                                                             |
| ---------------- | ----------------------------------------------------------------- |
| `dataFill`       | `#7D8896` — every bar, line and progress fill that is not current |
| `dataFillActive` | `#C3B59F` — the accent fill. The current bar or progress, only    |
| `dataTrack`      | `#E7ECF3` — the empty remainder of a bar. Nothing is read off it  |

`dataFill` exists because the alternative was ink, and an ink progress fill
reads as a redaction rather than a measure. A chart recedes, so the value is
pushed as light as the rules allow and then stopped by one of them.

**The track is the pin.** A bar owes 3:1 as a meaningful graphic, and it owes it
against every ground it sits on — including `dataTrack`, the strip drawn behind
a progress fill, which is the tightest of the three. `dataFill` reads 3.60:1 on
white and 3.33 on paper but **3.03:1 on the track**, and one step lighter
(`#7E8997`) measures 2.99 and fails. This is the lightest a bar can be and still
be a bar; `contrast.test.ts` checks all three grounds, so the floor cannot be
crossed by accident.

Chroma 0.10, so it is not a table state either. It lands close to
`borderInteractive` in value (3.60 against 3.85 on white) and that is fine —
one is a 1px control boundary, the other a filled bar, and no text sits on
either.

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

Two of these hues also exist as **text**, the way `primaryInk` does for the
beige. The fills are fills: `free` green reads 2.46:1 on paper and the amber
2.72, and the diner app was setting "4 tables free now" and "Paid 4 000 ֏" in
them anyway. So each has an ink:

| Token        | Value                                                                    |
| ------------ | ------------------------------------------------------------------------ |
| `successInk` | `#1E7350` — `free` darkened until it is text. 5.36 white, 5.80 paper     |
| `warningInk` | `#8A5E08` — `reservedSoon` darkened the same way. 5.27 white, 5.70 paper |

Both clear 4.5 on white, paper and both tints and keep the hue, so a green
sentence still means a free table. A table on the plan and a badge fill keep the
bright ones; a sentence about free tables or money already paid is set in the
ink.

### Why each hue survives beside the accent

`contrast.test.ts` measures the accent against **all six** states.

**The four chromatic states are separated by saturation, not hue.** Every one
carries a real hue (chroma > 0.4); the beige is 0.14, a warm neutral, and the
test holds a gap of more than 0.25 to each. Hue angle would be the wrong
measure: the beige sits at 37, 3 degrees from `reservedSoon` amber at 40.

**The two hueless states are separated by value.** `outOfService` (0.09) and
`yourPick` (0.06) are greys too. `yourPick` is ink, 8.70:1 from the beige.
`outOfService`, checked at the opacity it is drawn at (`#8B95A1` at 70%
resolves to `#AEB5BD`), is **1.03:1** from the beige fill — so every accent
control beside a plan carries a `primaryInk` edge, 3.13:1 from it. The test pins
both numbers.

**What is not separated is lightness against the chromatic states**, and the
tests say so out loud: `free` green is 1.32:1 from the beige. Saturation carries
it, and shape carries the rest: a button is a pill (`radius.pill`), a table is
rectilinear (`radius.table` ≤ 2).

`yourPick` is **ink, deliberately not the accent.** It used to be the accent,
back when the accent was ink. Keeping it ink is the stronger arrangement: the
table a diner has chosen and the button that confirms the choice now differ in
hue rather than in shape and position alone, so the two can sit on the same
sheet without either explaining itself.

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
headings, a solid beige active item with an ink label and secondary actions
pinned to the bottom. Three metric cards across the top at `metric` 52, set in
ink — a number is read, not pressed. Card padding `xl` (24).

The console carries the beige fill on the active nav item, the primary button
and selected options. Links, outlined buttons and focused fields use
`primaryInk`. Everything else on the screen is ink, neutral or a table state.

Sparklines, report charts and progress bars draw in `dataFill`, with
`dataFillActive` on the one current bar, so a card reads as filled-versus-empty
instead of as a block of redacted text.

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
  non-colour signal and why the label on the beige accent is ink (8.70:1), not
  white (2.01:1): it has to clear AA at full brightness on a terrace.

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
fold. Everything else on the page is ink on near-white, with the accent on the
single "Book a table" button and nowhere else.

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
- **Ink as the accent**, the first draft of that rule. It kept the rule
  perfectly and cost the console its data viz.
- **The violet accent** (`#6A38C7`), the second. Replaced by the brand beige,
  which keeps the rule by being a low-chroma fill with an ink label and fills no
  table.

---

## Verification

`packages/tokens/src/contrast.test.ts` — **68 tests, all passing**. It covers
text contrast on every ground including both tints, the state labels against
their composited fills, `successInk` and `warningInk` as text on every ground
(and that the fills they darken do not pass), control boundaries at 3:1, the accent's contrast
minimums (ink on the fill ≥ 4.5, `primaryInk` ≥ 4.5 on white and paper and ≥ 3
as a border on every control ground, white never on the fill), its saturation
separation from all six states, the chart-fill rules, the pairwise distinctness
of the six state treatments, the metric hierarchy, and reduced motion.

The accent rules were checked red before being trusted: lightening
`primaryInk` to `#978463` (3.62:1 on white, fine for a border, too light for
text) fails the text and minimums tests.

Run it with `pnpm --filter @yalla/tokens test`. It runs in CI with the rest.

## Seeing it

`~/.gstack/projects/grigoravagyann-YallaFrontend/designs/` holds
`yalla-system.html` and a render of it. The page loads
`tokens.generated.css` — the file this package emits, byte for byte — so every
colour, radius, shadow, space and type size in it resolves through a token.
Nothing there is a hand-picked hex, which is the point: it demonstrates that the
tokens produce the look, which a rendered image cannot.
