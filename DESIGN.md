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
service. One hue carries action: a violet on the primary button and the active
navigation item, and nowhere else. Everything in between — body text, headings,
metrics, chart fills, progress bars, borders — is achromatic.

The thing a person should remember after using Yalla once is _the room, live_ —
that you can see which tables are free right now. So the room keeps most of the
colour budget, and the one hue spent outside it is spent on the one place a
person is being asked to do something.

### Why the accent is a violet, and why it is that violet

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
to act on. Built side by side, the ink dashboard read flat and the violet one
read alive, while the two floor plans differed by exactly one button.

So the rule narrowed instead of the palette. The accent is `#6A38C7`:

- **Hue 261.** The nearest state hue is `held` blue at 220, 41 degrees away. It
  is nowhere near the green/amber/red band a person actually scans a floor plan
  for, and no table is ever violet — so the one violet on a floor screen is the
  button in the corner.
- **Chroma 0.56, 6.99:1 with white on it.** Deliberately not `#7C3AED`, the
  violet every tool reaches for first: that one is 0.70 chroma and 5.70:1, loud
  enough to compete with the room and too weak to carry a label on a tint.
  `contrast.test.ts` holds a chroma _ceiling_ so it cannot drift back.

`primaryOnFloorPlan` survives as a token because four screens import it, and it
is still a no-op — the accent needs no swap. It is now correct for a measured
reason rather than a remembered one.

**What the move off ink cost, stated plainly.** Ink was 17.52:1 on white, so
every state fill was separated from the accent by lightness for free. Violet is
not: `occupied` red is 1.25:1 from it, the same value in greyscale. Hue and
shape carry that separation instead — 40+ degrees, plus a pill button against a
rectilinear table. Both are asserted in `contrast.test.ts`, and the lost
guarantee is asserted as lost so nobody re-derives it.

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
cool ground agrees with the violet and keeps the five state hues looking like
the only other colour on screen.

`subtleForeground` clears AA on `surface` and `paper` and **fails on both
tints** (4.31:1 on `greenTint`, 4.24:1 on `accentTint`). That is deliberate and
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

| Token               | Value                                                         |
| ------------------- | ------------------------------------------------------------- |
| `primary`           | `#6A38C7` — violet, hue 261, chroma 0.56. White clears 6.99:1 |
| `primaryPressed`    | `#552CA0` — pressed. White clears 9.32:1                      |
| `primaryForeground` | `#FFFFFF`                                                     |
| `accentTint`        | `#EDE7FA` — the accent's own light ground                     |
| `greenTint`         | `#E7ECF3` — kept under its old name, neutral, not the accent  |

The two tints are not interchangeable: `greenTint` is the neutral fill behind a
selected row or an icon tile, `accentTint` is the light ground for something in
the accent's role that is not the primary action itself — a hovered nav item, a
selected chip in an accent context. The active nav item is a **solid** violet
with a white label; the tint is the quieter step below it. Text clears AA on
both tints — accent 5.80:1 and ink 14.53:1 on `accentTint` — and
`subtleForeground` is banned from both.

`greenTint` is neither green nor violet. The name survives because nineteen
screens import it and this was a change to one package. Renaming it is a
follow-up.

### Data

Charts are neutral. The accent marks the one bar that is current, and nothing
else in a chart is allowed to carry it.

| Token            | Value                                                             |
| ---------------- | ----------------------------------------------------------------- |
| `dataFill`       | `#7D8896` — every bar, line and progress fill that is not current |
| `dataFillActive` | `#6A38C7` — the accent. The current bar, and only that            |
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

### Why each hue survives beside the accent

This guarantee used to come free. With ink as the accent it was achromatic, so
nothing could be mistaken for it and nothing had to be measured. A violet accent
has to earn the same thing, so `contrast.test.ts` now measures it against **all
six** states rather than the four that happen to carry a hue.

**The four chromatic states are separated by hue.** Every one carries a real hue
(chroma > 0.4) and every one is at least 40 degrees from the accent:

| State          | Hue | Degrees from the accent (261) |
| -------------- | --- | ----------------------------- |
| `held`         | 220 | **41** — the near miss        |
| `occupied`     | 0   | 99                            |
| `free`         | 155 | 106                           |
| `reservedSoon` | 40  | 139                           |

`held` blue is the reason this violet is not bluer. One degree of headroom is
not slack, it is the constraint, and the test holds the 40-degree floor.

**The two hueless states are separated by chroma.** `outOfService` (0.09) and
`yourPick` (0.06) both land near hue 213 on paper, but at that chroma the angle
describes nothing a person can see. The real gap is saturation: 0.56 against
0.09 and 0.06. `outOfService` is also checked at the opacity it is actually
drawn at — `#8B95A1` at 70% resolves to `#AEB5BD`, 3.38:1 from the accent, where
the raw hex would have measured a colour nobody ever sees.

**What is not separated is lightness**, and the tests say so out loud.
`occupied` red is 1.25:1 from the accent and `held` blue 1.47:1 — in greyscale
they are the same value. Hue carries it, and shape carries the rest: a button is
a pill (`radius.pill`), a table is rectilinear (`radius.table` ≤ 2), and no
amount of colour confusion turns one into the other.

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
headings, a solid violet active item and secondary actions pinned to the bottom.
Three metric cards across the top at `metric` 52, set in ink — a number is read,
not pressed. Card padding `xl` (24).

The console carries exactly two violets: the active nav item and the primary
button. Everything else on the screen is ink, neutral or a table state.

This is the surface the accent was moved off ink for. Sparklines and progress
bars draw in `dataFill`, with `dataFillActive` on the one current bar, so a card
reads as filled-versus-empty instead of as a block of redacted text.

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
  non-colour signal and why the accent is a dark violet rather than a bright one:
  white has to clear AA on it at full brightness on a terrace.

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
  perfectly and cost the console its data viz. The violet keeps the rule too —
  it is 41 degrees from the nearest state and fills no table — and gives the
  dashboard back a colour that means "act here".

---

## Verification

`packages/tokens/src/contrast.test.ts` — **60 assertions, all passing**, up from
32 in the system this replaces and 46 in its first ink-accent draft. It covers
text contrast on every ground including both tints, the state labels against
their composited fills, control boundaries at 3:1, the accent's hue separation
from all six states, the chroma ceiling that keeps it off the default violet,
the chart-fill rules, the pairwise distinctness of the six state treatments, the
metric hierarchy, and reduced motion.

The accent rules were checked red before being trusted. Nudging the accent 20
degrees toward `held` blue fails three tests; setting it to `#7C3AED` fails the
chroma ceiling; putting the chart fill back to ink fails two; leaking the accent
into a chart's default fill fails three.

Run it with `pnpm --filter @yalla/tokens test`. It runs in CI with the rest.

## Seeing it

`~/.gstack/projects/grigoravagyann-YallaFrontend/designs/` holds
`yalla-system.html` and a render of it. The page loads
`tokens.generated.css` — the file this package emits, byte for byte — so every
colour, radius, shadow, space and type size in it resolves through a token.
Nothing there is a hand-picked hex, which is the point: it demonstrates that the
tokens produce the look, which a rendered image cannot.
