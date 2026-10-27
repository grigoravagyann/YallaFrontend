# SHURJ — design system

Table reservation, ordering and the bill for restaurants and cafés in Yerevan,
under the SHURJ brand (the code and packages are still named Yalla). Five
surfaces read two sets of tokens:

| Surface                                                                 | Colours, sizes, radii, type                                  |
| ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| Platform console, venue console, floor tablet, staff phone, public page | `packages/tokens/src/console.ts` → `--console-*` CSS         |
| Diner app (Expo, React Native)                                          | `apps/diner/src/theme/*` (`colors`, `radius`, `typography`…) |

Both share the rest of `@yalla/tokens`: the 4px `space` scale, `touchTarget`,
the font families and weights, motion, and the contrast helpers. This file
describes those tokens. When it and a token file disagree, the token file is
right and this file is out of date. Every hex below is a value one of those
files assigns, and `packages/tokens/src/designDoc.test.ts` fails if one is not.

---

## The thesis

**Chroma means one of two things: what state something is in, or the single
element you are meant to act on. Nothing else is coloured.**

The page is white, text is charcoal, lines are warm hairlines. The Black Cherry
fills the one thing to press and marks where you are. Green, amber, red,
burgundy and grey say what state a booking, a table, a ticket or a venue is
in. Headings, metrics, a chart's resting bars and cards are neutral.

There is **no blue in SHURJ**. Waiting and held are burgundy, confirmed is
green. Only two blues exist, and each is a convention people already know:
the map's "you are here" dot (`colors.location` `#4C8DFF`) and the "Confirm
with Telegram" button (`consoleColor.publicTelegram` `#2A6FB0`).
`packages/tokens/src/noBlue.test.ts` fails on any other blue in a token file.

## The brand

| Role             | Token                                                  | Value     |
| ---------------- | ------------------------------------------------------ | --------- |
| Black Cherry     | `consoleColor.brand`, `colors.brand` / `primary`       | `#4B0C18` |
| Ivory on cherry  | `consoleColor.brandForeground`, `colors.onPrimary`     | `#FFF7EA` |
| Logo burgundy    | `colors.logoInk`, `consoleColor.control` / `brandBusy` | `#6B1121` |
| Cherry, pressed  | `consoleColor.brandHover`, `colors.brandPressed`       | `#3A0912` |
| Cherry tint      | `consoleColor.brandTint`, `colors.primarySoft`         | `#F2E4E6` |
| Ground           | `consoleColor.canvas` / `surface`, `colors.background` | `#FFFFFF` |
| Text             | `consoleColor.ink`, `colors.text`                      | `#2D2927` |
| Done / confirmed | `consoleColor.green`                                   | `#0F6A4B` |

**The cherry is a fill or a line.** As a fill it carries ivory (14.47:1). As
text or a glyph on white it is 15.39:1, so a link, a price or the active tab's
label can be cherry too.

**The logo burgundy is an edge.** On the web, every input's and secondary
button's edge is `#6B1121`: 12.16:1 on white, far past the 3:1 a control
boundary owes. A hovered edge darkens to the cherry. In the diner app the same
burgundy draws the wordmark, the Explore header's glyphs, and the edges of the
search, the category chips and the "Awaiting venue" pill.

**Ivory, not white, sits on dark grounds**: the sidebar, the bars, the toast,
a photo. Pure white is kept for the page and for the label on red or on the
Telegram blue.

### The wordmark

The name is always the logo's own lettering as an image, never typed in a font.

- **Web**: `apps/web/src/components/Wordmark.tsx` renders
  `src/assets/shurj-wordmark.png` in ivory, with `t('appName')` as its `alt`.
  It always sits on a dark ground: the console sidebar (`sidebar`
  `#3A0912`), the floor tablet's and the staff phone's bar, the public page's
  bar, and the sign-in photo.
- **Diner**: `ExploreHeader` draws `assets/images/explore-wordmark.png` in the
  logo burgundy on the white Explore header. It is 28px high and centred
  between two round buttons of equal width.

---

## Console palette

`console.ts` covers the platform console, the venue console, the floor tablet,
the staff phone and the public page. `css.ts` writes each entry as a custom
property (`consoleColor.brand` → `--console-brand`), and the stylesheets read
only those. `consoleStyles.test.ts`, `staffStyles.test.ts` and
`publicStyles.test.ts` fail on a colour typed into them.

| Token                                | Value                             | Role                                             |
| ------------------------------------ | --------------------------------- | ------------------------------------------------ |
| `canvas` / `surface`                 | `#FFFFFF`                         | The page; cards, dialogs, inputs                 |
| `surfaceMuted` / `hover`             | `#FBF8F8` / `#F8F0F1`             | Table heads and inset boxes; a hovered row       |
| `ink` / `muted`                      | `#2D2927` / `#605954`             | Text and secondary text                          |
| `brand` / `brandHover` / `brandBusy` | `#4B0C18` / `#3A0912` / `#6B1121` | The primary button, links, the focus outline     |
| `line` / `lineSoft`                  | `#EAE4E1` / `#F4F0EE`             | A card's edge; the divider inside a card         |
| `control` / `buttonEdge`             | `#6B1121`                         | Input and secondary-button edges                 |
| `switchOff`                          | `#8A817C`                         | A switch's track when off                        |
| `sidebar` / `sidebarActive`          | `#3A0912` / `#5A1220`             | The sidebar and every dark bar; the current item |
| `sidebarText` / `sidebarTextStrong`  | `#E3C7CC` / `#FFF7EA`             | Nav links; the current item, the name            |
| `sidebarMuted`                       | `#D9B8BE`                         | The role line, group headings                    |
| `sidebarField` / `sidebarFieldEdge`  | `#4B0C18` / `#B98F97`             | The branch switcher                              |
| `navBadge` / `navBadgeForeground`    | `#E2B77A` / `#3A0912`             | A count on a nav link                            |
| `green` on `greenBg`                 | `#0F6A4B` on `#E4F2EA`            | Done, active, saved, confirmed                   |
| `amber` on `amberBg`                 | `#8A4B08` on `#FDF1DE`            | Not ready yet, needs attention. **Never red**    |
| `red` on `redBg`, `redForeground`    | `#A8261B` on `#FCEAE7`, `#FFFFFF` | Real failures and destructive buttons only       |
| `grey` on `greyBg`                   | `#57534E` on `#EEE8E1`            | Suspended, off, cancelled                        |
| `waiting` on `waitingBg`             | `#6B1121` on `#F2E4E6`            | Waiting: the logo burgundy, never blue           |
| `stepDone`, `star`                   | `#8A2335`                         | A finished step; a review's lit star             |
| `chartBar`, `reportBar`              | `#6B1121`, `#A0717B`              | Chart bars; a peak is `brand`                    |
| `toast` / `toastForeground`          | `#2D2927` / `#FFF7EA`             | Toasts and the rooms page's save bar             |
| `photoGround` / `photoText`          | `#1A0508` / `#FFF7EA`             | Behind the sign-in photo; the text over it       |
| `publicTelegram` / `…Foreground`     | `#2A6FB0` / `#FFFFFF`             | "Confirm with Telegram": one of the two blues    |

`waiting` was named `blue` before the rebrand. The public page's pending badge
and dashed pending code box read it.

The floor tablet adds its table cards on top (`floor*`): a tint per state, an
edge in the state hue and an ink for the words. Held is the one state drawn in
the brand: a white card with a dashed cherry edge.

| State          | Card      | Edge               | Words             |
| -------------- | --------- | ------------------ | ----------------- |
| Free           | `#E6F5EC` | `#35B37E`          | `#1E7350`         |
| Booked soon    | `#FBF0DA` | `#C98A0E`, striped | `#8A5E08`         |
| Held           | `#FFFFFF` | `#4B0C18`, dashed  | `#4B0C18`         |
| Occupied       | `#F7E1E0` | `#B93B3B`          | `red` `#A8261B`   |
| Out of service | `#ECEEF0` | `#8B95A1`, hatched | `muted` `#605954` |

The tablet's bar shows the connection: `floorLive` `#5BC78F` when connected,
`floorOffline` `#E2B77A` when offline (amber, never red), and `floorFailure`
`#F08A80` when polls keep failing or a conflict needs deciding.

## Diner palette

`apps/diner/src/theme/colors.ts`. Light only: every screen, card, row, input
and sheet is white, held by the `border` hairline. There are no grey fills.
Screens import `colors` from `src/theme`, never the shared colour tokens;
ESLint refuses them.

| Token                                    | Value                             | Role                                                 |
| ---------------------------------------- | --------------------------------- | ---------------------------------------------------- |
| `background` / `surface` / `sheet`       | `#FFFFFF`                         | Every ground                                         |
| `border` / `borderStrong`                | `#E7E0D7` / `#D9CFC3`             | Hairlines                                            |
| `controlBorder`                          | `#CFC6C1`                         | The Explore avatar, Map pill, bell and search edge   |
| `text` / `textMuted`                     | `#2D2927` / `#6E675F`             | Text and secondary text                              |
| `textSubtle`                             | `#8A827A`                         | Placeholders and decoration only, never a sentence   |
| `navLabel`                               | `#5E5750`                         | An idle tab's label                                  |
| `brand` / `primary` / `accent`           | `#4B0C18`                         | The fill to press; cherry text; the active-tab glyph |
| `onPrimary`                              | `#FFF7EA`                         | The label on a brand fill                            |
| `primarySoft` / `secondary`              | `#F2E4E6`                         | The Preparing pill, pressed rows, initials avatars   |
| `logoInk`                                | `#6B1121`                         | The wordmark and the Explore header's lines          |
| `success` / `successSoft` / `successInk` | `#2FA352` / `#E3F2E7` / `#1F6B3A` | Open, free, confirmed, ready                         |
| `warning` / `warningSoft` / `warningInk` | `#F09A2E` / `#FBEBD9` / `#8A4E12` | Reserved, in progress                                |
| `error` / `errorSoft` / `errorInk`       | `#E5484D` / `#FDE7E6` / `#B42318` | Occupied, failed, the notification count             |
| `info` / `infoSoft` / `infoInk`          | `#8A2335` / `#F2E4E6` / `#6B1121` | Waiting, pending, new. Burgundy, not blue            |
| `neutralBadge` / `neutralSoft`           | `#6F6860` / `#EFEAE4`             | Closed, completed                                    |
| `ratingStar` / `photoStar`               | `#B5772B` / `#F0B866`             | The star on white; the star on a photo's scrim       |
| `onImage`                                | `#FFF8EF`                         | Text on a photo, over its dark scrim                 |
| `location`                               | `#4C8DFF`                         | The map's "you" dot: one of the two blues            |

**Fill, ink, strong.** Each state hue comes three ways:

- **The bright fill** (`success`, `warning`, `error`, `info`) is a table
  marker, a dot or a border. It is never text.
- **Its `*Ink`** is the text colour, dark enough for 4.5:1 on white and on its
  own `*Soft` tint.
- **Its `*Strong`** (`#2F7A4B`, `#8A4A26`, `#B3282D`, `#4B0C18`, and
  `neutralStrong` `#625C56`) is a solid badge's fill under its pale
  `on*Strong` label.

`badges.ts` maps every badge variant to one of these.

---

## Semantic colour roles

One meaning, one hue, on every surface.

| Meaning                                       | Web (`consoleColor`)                                 | Diner (`colors`)                                                       |
| --------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| The one action; the current place             | `brand` fill, `brandForeground`                      | `brand` fill, `onPrimary`; `accent` glyph                              |
| Done, saved, active, confirmed, free          | `green` on `greenBg`; free tables `floorFree*`       | `success*`                                                             |
| Not ready, needs attention, reserved, offline | `amber` on `amberBg`; `floorBooked*`, `floorOffline` | `warning*`                                                             |
| Waiting on someone, held, pending, new        | `waiting` on `waitingBg`; `floorHeld*`               | `info*`; Preparing is `primarySoft`; Awaiting venue is edged `logoInk` |
| Real failure, destructive, occupied           | `red` on `redBg`; `floorOccupied*`, `floorFailure`   | `error*`                                                               |
| Off, suspended, closed, past                  | `grey` on `greyBg`                                   | `neutral*`                                                             |

### Never red for not-ready

Red means something failed or is about to be destroyed. Using it for "not yet"
teaches people to ignore it before the day it matters.

- **Red is only for real failures**:
  - a dead letter in the outbox, a server error, a wrong PIN or code;
  - a table taken by someone else, a sync conflict, an allergen;
  - a deadline about to be missed (a late kitchen ticket, an approval's last
    minutes);
  - a destructive button.

  On a floor, occupied is red too: it is the state hue the room has always
  used.

- **Not ready is amber**: a venue missing its dishes or hours, a sold-out
  dish, a time that is only on request.
- **Offline is amber.** A dead connection is a state, not a fault, and the
  tablet keeps the actions to send later. Only polls that keep failing, or a
  conflict someone has to decide, turn the bar's chip red.
- **Waiting is burgundy**, never blue and never red: a booking awaiting the
  venue, a held table, a code the venue has not answered yet.
- **Who cancelled matters.** In the diner app, a booking the diner cancelled
  is grey; one the venue cancelled, or a no-show, is red.

`console.test.ts` asserts that amber and the brand are not red, and that no
floor state except occupied is drawn in red.

### Colour is never the only signal

A terrace in July washes out hue on any screen, and about one man in twelve
has a red/green deficiency. Every state also says itself in words, and on the
floor in its edge: booked cards are striped, held cards dashed, out-of-service
cards hatched. Diner table markers carry their number in `onFill` `#1E0E07`,
and a legend names each state.

---

## Contrast

WCAG 2.1 AA: **4.5:1 for text; 3:1 for a glyph that carries meaning or a
control's boundary.** Every ratio below was computed with the package's own
`contrastRatio`. A translucent token is checked composited over the
brightest ground it can sit on. The tests hold each pair, so a hex cannot
change underneath these numbers without a test failing.

### Web

| Pair                                                                  | Ratio                 |
| --------------------------------------------------------------------- | --------------------- |
| `ink` `#2D2927` on white                                              | 14.40                 |
| `muted` `#605954` on white / on `surfaceMuted`                        | 6.88 / 6.51           |
| `brand` `#4B0C18` as a link on white                                  | 15.39                 |
| Ivory `#FFF7EA` on `brand` / `brandHover` / `brandBusy`               | 14.47 / 16.08 / 11.43 |
| `control` `#6B1121`, an input's edge, on white                        | 12.16                 |
| `sidebarText` / ivory on `sidebar` `#3A0912`                          | 10.84 / 16.08         |
| Ivory on `sidebarActive` `#5A1220`                                    | 12.80                 |
| `sidebarMuted` / `sidebarFocus` `#F5D3D9` on the sidebar              | 9.41 / 12.38          |
| `sidebarFieldEdge` on the sidebar / on its own field                  | 6.06 / 5.45           |
| `navBadgeForeground` on `navBadge`                                    | 9.19                  |
| `green` on `greenBg` / on white                                       | 5.71 / 6.60           |
| `amber` on `amberBg` / on white                                       | 6.09 / 6.79           |
| `red` on `redBg` / on white                                           | 6.11 / 7.10           |
| White on `red` / on `redHover` `#8C1F16`                              | 7.10 / 9.04           |
| `grey` on `greyBg` / on white                                         | 6.27 / 7.63           |
| `waiting` `#6B1121` on `waitingBg` `#F2E4E6`                          | 9.85                  |
| Ivory / `toastIcon` `#9FD9BD` / `toastAction` `#F5D3D9` on `toast`    | 13.54 / 9.01 / 10.43  |
| `floorBarText` `#F3E8E9` on the bar                                   | 14.28                 |
| `floorLive` / `floorOffline` / `floorFailure` on the bar              | 8.15 / 9.19 / 7.05    |
| Each floor state's words on its own card (table above)                | 5.04 to 15.39         |
| White on `publicTelegram` / on `publicTelegramHover` `#235D94`        | 5.25 / 6.85           |
| `publicStar` `#8A5E08` on white                                       | 5.70                  |
| Graphics on white: `switchOff`, `reportPreviousLine` (both `#8A817C`) | 3.81                  |
| Graphics on white: `reportBar` / `publicOpenDot` `#2E9E5B`            | 4.08 / 3.41           |
| Graphic: `publicStateIcon` `#8A807B` on `lineSoft`                    | 3.40                  |

### Diner

| Pair                                                     | Ratio                         |
| -------------------------------------------------------- | ----------------------------- |
| `text` / `textMuted` on white                            | 14.40 / 5.57                  |
| `navLabel` on the 72% white bar, over white              | 7.11                          |
| `primary` on white / on `primarySoft`                    | 15.39 / 12.47                 |
| `onPrimary` on `brand` / on `brandPressed`               | 14.47 / 16.08                 |
| `logoInk` on white / `infoInk` on `infoSoft`             | 12.16 / 9.85                  |
| `successInk` on white / on `successSoft`                 | 6.52 / 5.62                   |
| `warningInk` on white / on `warningSoft`                 | 6.61 / 5.66                   |
| `errorInk` on white / on `errorSoft`                     | 6.57 / 5.56                   |
| `neutralBadge` on white / on `neutralSoft`               | 5.49 / 4.59                   |
| Strong badges: success, warning, error, info, neutral    | 5.10, 6.09, 6.45, 14.47, 5.97 |
| `onFill` `#1E0E07` on `success` / `warning` / `error`    | 5.78 / 8.36 / 4.79            |
| `onImage` on the deepest photo scrim, over a white photo | 10.82                         |
| Glyph: `ratingStar` on white                             | 3.72                          |

What deliberately does **not** pass, and so is never text:

- **`textSubtle` is 3.78:1** on white. It is for placeholders, a chevron, an
  empty photo's glyph. Darkened until it passed, it would be `textMuted`, and
  the app would have two text weights pretending to be three.
- **The bright state fills are not text.** `success` `#2FA352` is 3.24:1 on
  white: a marker or a dot, never a sentence. "4 tables free" is set in
  `successInk`.
- **Hairlines owe nothing.** `border` (1.31:1) and `line` divide; they do not
  identify a control. The diner's `controlBorder` is 1.68:1, so the Explore
  controls it rings are recognised by their glyphs, drawn in `logoInk` at
  12.16:1.

`colors.ts` exports `textColors` (allowed as text) and `glyphColors` (allowed
as a glyph that carries meaning). Adding a colour to either is a claim the
contrast test checks.

---

## Typography

**Two faces, three scripts.** The product ships in Armenian, Russian and
English, and Armenian set in a fallback face is the fastest way to look
foreign in the city it launches in.

| Face          | Composition                                    | Weights       |
| ------------- | ---------------------------------------------- | ------------- |
| `Yalla Sans`  | Noto Sans **merged with** Noto Sans Armenian   | 400, 500, 700 |
| `Yalla Serif` | Noto Serif **merged with** Noto Serif Armenian | 600, 700      |

The faces are merged, not stacked. React Native does not fall through a font
stack per character, Google's Latin Noto faces have no Armenian and no `֏`,
and the Armenian ones have no Cyrillic. `packages/tokens/scripts/build-fonts.py`
performs the merge and verifies that the dram sign survived the subset.

The sans has no 600; asking for one synthesises it. React Native selects a
face by name (`nativeFontFace`, `nativeDisplayFontFace`), and the diner's
`Text` picks the face from the style's weight, so styles never set
`fontFamily`.

**The serif is for titles only**: page and section titles in the consoles,
the venue's name and section titles on the public page, and the big screen
titles and the place name in the diner app (`<Text display>`). Everything else
is the sans. The shared step scale has no serif step (`displaySteps` is
empty); the serif is reached by name.

| Where        | Sizes (px)                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------- |
| Consoles     | title 28 and section 17 (serif); body 14, label 13, caption 12, nav 15, KPI 26, booking time 20   |
| Public page  | venue name 30, 40 from 960px, section 22, page state 26 (serif); body 16, meta 15, label 14       |
| Diner        | title 32/38 and heading 22/28 (serif); h3 18/24, body 16/24 or 14/20, caption 12/16, metric 40/44 |
| Floor tablet | the staff scale: base 18, steps 14, 16, 18, 22, 30, 40, metric 44                                 |

Nothing on the web is under 12px. Public-page inputs are 16px so iOS does not
zoom on focus, and so is every console field on a touch screen. The generated CSS sets the console scale on `:root`, the staff
scale under `[data-surface='staff']`, and the diner scale under
`[data-surface='diner']` (the public page).

**Numbers are tabular.** Prices, times, table numbers and totals sit in
columns, so they use `tabularNumbers` (`'tnum' 1`). Dram has no subunit and
runs to six digits. Money is always `formatDram` ("1 400 ֏" in hy and ru,
"1,400 ֏" in en), with the sign on the same line and a figure that never wraps.

---

## Spacing

A 4px base, `space`: `none 0`, `xs 4`, `sm 8`, `md 12`, `lg 16`, `xl 24`,
`xxl 32`, `xxxl 48`, `huge 64`. Staff screens take one step up for anything
tappable (`stepUp`), computed from the scale so the two cannot drift.

- **Consoles**: the main column pads 32 top and 40 at the sides on a desktop,
  24 and 16 on a phone. The sidebar is 232px, or 248px for the venue console's
  grouped sidebar.
- **Diner** (`layout`): 16 page padding and tab-bar inset, 14 between stacked
  cards, and 320px as the widest a centred paragraph runs.
- **Public page**: mobile first at 390px, two columns from 960px, a 1180px
  page with a 400px booking column, and 600px for single-column pages.

## Radius

Radius is hierarchy: soft on what a person holds or presses, near-square on a
table drawn as furniture.

| Surface     | Values (px)                                                                 |
| ----------- | --------------------------------------------------------------------------- |
| Consoles    | card 12, control 10, small 8, dialog 14, sign-in card 16, tile 20, pill 999 |
| Floor       | table card 14, button 12, tab 9                                             |
| Public page | card 20, status card 16, control 12                                         |
| Diner       | card 16, hero 20, sheet 24, tile 14, chip 12, search 22, small 8, pill 999  |
| Shared      | `table` 2, `soft` 10, `card` 14, `sheet` 20, `pill` 999                     |

## Elevation

**A card is held by its hairline, not lifted by a shadow.** On a white page an
outline reads as calm; a shadow reads as a component kit.

- **Consoles**: cards are outlined in `line`. Only things that float cast a
  shadow (`consoleShadow`): a dialog, a toast, a row's menu, the phone around
  the app-card preview, and a hovered card that opens something. The shadows
  are the ink at low alpha, never black.
- **Diner** (`shadows.ts`): `card` barely settles a card, `float` lifts the
  tab bar and bottom cards, `sheet` rises from the bottom edge, `lift` holds a
  map pin, and `brand` gives a cherry fill a soft cherry glow. They are all
  the text colour `#2D2927` at low alpha, except `brand`, which is `brandGlow`
  `#4B0C18`.

## Touch targets

| Surface             | Rule                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Diner               | 44 minimum (`layout.touchTarget`); controls 48, the one big press 56, action tiles 72                                    |
| Floor tablet, phone | the staff sizes (`--touch-*`): primary actions 56 to 64 tall, every target at least 44×44 with 8 between; PIN keys 96×76 |
| Public page         | buttons and controls 48, a page state's action 52, language buttons at least 48, table pins 44                           |
| Consoles (pointer)  | buttons 40, small 32, 44 on the sign-in pages; nav links 44, or 40 in the grouped sidebar; chips 36, kebabs 36           |
| Consoles (touch)    | under `(pointer: coarse)` or a phone: every button, chip, kebab, step arrow, menu item and nav link 44; fields 16px      |

The shared `touchTarget` is `minimum 44`, `small 40`, `regular 48`,
`large 56`, `staff 56`. The tablet is used standing, in a hurry, often
one-handed, so it has no hover and every control has a pressed state. Buttons
there take `min-height`, never a fixed `height`, which collapses inside a flex
column. Destructive actions never sit next to frequent ones: a "void" beside a
"seat" is a mis-tap during a Friday rush.

## Console on a phone

Every console role works on a phone, and the console installs from Safari's
"Add to Home Screen" like the staff app. A desktop with a mouse is drawn
exactly as before: every phone rule sits under one of two queries
(`consoleMedia` in `console.ts`).

- **`(max-width: 799px)` is the layout.** The sidebar becomes a drawer
  behind a sticky top bar, 56px plus the status bar's safe area: the menu
  button, the wordmark, the branch chip (venue roles) and the avatar. The
  drawer is the sidebar itself, so everything on it is reachable: the grouped
  links in 48px rows, the venue panel with the branch switcher, the person and
  sign-out. It is a modal dialog: the focus stays inside, Escape or a tap on
  the scrim closes it, and so does any navigation; reduced motion drops its
  slide. A count on any link puts a dot on the menu button.
- **`(pointer: coarse), (max-width: 799px)` is the sizing**, so a touch
  iPad with the desktop layout gets it too. `consoleTouchSize` and
  `consoleTouchText` are written over the same `--console-*` properties:
  buttons, small buttons, chips, kebabs, step arrows, menu items and nav
  links 44, fields 16px (under 16, iOS zooms the page on focus). A switch
  keeps its 40x24 track inside a 44x44 hit area.
- **Words wrap.** On a phone buttons and pills may run to two lines rather
  than off the screen, with a `min-height`, never a fixed height.
- **Tables are cards.** The primary cell is the title, the rest are
  label: value lines, and the row's actions and status stay in sight; no
  action is ever scrolled off-screen.
- **Tab strips scroll** with a fade on the overflowing edge, the active tab in
  view. A messages screen shows the list or the thread, never both.
- **Nothing is hover-only.** What a tooltip says is in the text or a tap away.
- **Installing.** `manifest-console.webmanifest` ("SHURJ Console", scope
  and start URL `/`, which sends each role home) on the console's paths, the
  staff manifest on `/staff`, and none on a diner's pages
  (`public/manifest-link.js`).

## Motion

Gentle, eased, and always an answer to a person's action. Nothing overshoots,
and nothing functional rotates.

- **Durations** (`duration`): `control 220` (press, hover, colour),
  `stateChange 200` (a table changing state), `floorPlanDraw 400`.
- **One curve**: `easing.standard`, `cubic-bezier(0.2, 0, 0, 1)`.
- **Scale**: pressed shrinks to 0.97. On the web, behind
  `@media (hover: hover)`, hover may lift to 1.03.
- **Reduced motion is no motion.** Under `prefers-reduced-motion` every
  duration resolves to zero (`reducedDuration`), and the generated CSS zeroes
  every animation and transition. The diner's motion components
  (`src/components/motion/*` and the launch animation) read the system setting
  and jump to their end state.

---

## Before SHURJ

Before the SHURJ rebrand on 2026-10-22 the product went through an ink accent,
a violet one, a beige fill and a dark-brown console; none of those colours is
drawn on a SHURJ screen. The artboards under `docs/design/*` were made in the
brown era and recoloured afterwards, so where a `HANDOFF.md` names a colour,
`console.ts` wins.

`packages/tokens/src/color.ts`, the shared `--color-*` palette the older
screens read, kept the old system's cool paper, blue-black ink, beige accent
and blue "held" until 2026-10-26. Its neutrals and its action colour are now
`console.ts` values (`paper` is `canvas`, `foreground` is `ink`, `primary` is
`brand`, `info` and held are `waiting`), and the unused ones are gone. Its
state fills, through `tableState.ts` (`#35B37E`, `#C98A0E`, `#B93B3B`,
`#8B95A1`), are still the public page's table pins and the floor cards' edges.
New screens use `console.ts` or the diner theme, not `--color-*`.

## Verification

| Test                                                 | Holds                                                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `packages/tokens/src/console.test.ts`                | Every web text pair at AA, focus and graphics at 3:1, red only for failures, the sizes, and every token reaching the CSS |
| `packages/tokens/src/contrast.test.ts`               | The shared palette, the table states in greyscale, the metric hierarchy, reduced motion                                  |
| `apps/diner/src/theme/contrast.test.ts`              | Every diner badge, text and glyph colour on every ground; no screen sets text in a bright fill                           |
| `consoleStyles`, `staffStyles`, `publicStyles` tests | No colour typed into a stylesheet or a redesigned component                                                              |
| `packages/tokens/src/designDoc.test.ts`              | Every hex in this file is a value a token file assigns                                                                   |
| `packages/tokens/src/noBlue.test.ts`                 | No blue in any token file except the two named above                                                                     |

Run them with `pnpm -r test`.
