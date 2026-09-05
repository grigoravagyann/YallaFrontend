# @yalla/floorplan

The shared top-down floor plan: a drawing of a real room seen from above, each
table in its actual position, colour-coded by whether it is free.

It renders in three places from **one** implementation — the diner phone, the
staff tablet, and the admin panel (via `react-native-web`). A second
implementation would drift, and a diner tapping a table that the staff tablet
draws somewhere else is a booking dispute, not a rendering bug.

```tsx
<FloorPlan
  plan={plan}
  mode="diner"          // or "staff"
  partySize={2}
  selectedTableId={id}
  onTableTap={(tableId) => …}
  viewport={{ width, height }}   // measured, not assumed
/>
```

## The data contract

The backend stores only **physical** table state and derives the reservation
overlay server-side. The client receives `state` already derived and **must not
compute it** — whether a table counts as "reserved soon" depends on the branch
clock, the booking grace period and the venue's turn policy, none of which the
client knows.

```ts
type DerivedTableState = 'free' | 'reservedSoon' | 'held' | 'occupied' | 'outOfService';
```

| Field                       | Notes                                                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `x`, `y`, `width`, `height` | Floor-plan units, top-left origin. **Not pixels.**                                                                                                 |
| `rotationDegrees`           | Clockwise, about the table's centre.                                                                                                               |
| `shape`                     | `rectangle` renders as a rounded rect, `round` as an ellipse inscribed in the rect.                                                                |
| `floorAreaName`             | Grouping caption ("Windows", "Bar"). `null` for a single-room venue.                                                                               |
| `isBookable`                | False for tables the venue never books (service station). Staff can still act on them.                                                             |
| `nextReservationStartUtc`   | Drives the availability window on a `reservedSoon` table.                                                                                          |
| `occupiedSinceUtc`          | **Extension.** Not in the original contract; staff mode needs it to show sitting time, and it cannot be derived client-side. Optional.             |
| `features`                  | **Extension.** Optional fixed landmarks (entrance, bar) so the room is orientable. If a branch has none, none are drawn — they are never invented. |

`FloorPlanData.timeZoneId` is the branch's IANA zone. Every time shown must be
formatted through `@yalla/format` with that zone passed explicitly. Never the
device's: a tourist's phone is on Europe/Moscow and their booking is not.

## The scaling rules

All geometry lives in `computeFloorLayout` — a pure function, tested directly,
with no React in sight. The component only paints. That split is what makes the
rules below testable without rendering anything.

### Geometry scales

The room is fitted to the viewport with a single uniform multiplier and the
remainder is letterboxed. Uniform on both axes deliberately: a non-uniform fit
would stretch the room, and a diner comparing the plan to what they can see
would not recognise it. Letterboxing is the correct trade — see the `terrace`
fixture, a 1600×220 strip, for the extreme case.

### Text and touch targets do **not** scale

This is the whole point of the module, and the trap that a naive implementation
falls into. Scaling everything uniformly works fine on a tablet and breaks the
phone: at ~380pt wide a real room scales to roughly a third, which turns a 12pt
label into 4pt and a 60cm two-top into a 20px tap target.

Rectangles can shrink. Fingertips and eyes cannot. So:

- **Minimum font size — 11pt.** Never scaled below.
- **Minimum tap area — 44×44pt** (64pt in staff mode, which is used standing, at
  arm's length, mid-rush). Where a table draws smaller than that, the _visual_
  stays small and the invisible hit region expands about the table's centre.
- **Labels are dropped, not shrunk.** If the drawn table cannot fit its label at
  11pt, the label is hidden and revealed on tap. A clipped "12" reads as "1",
  which is worse than no label at all.

### Overlapping hit regions

Expanding hit rects in a dense cluster necessarily makes them overlap — that is
the cost of guaranteeing a reachable target. When they do, `pickTableAt`
resolves to the table whose **centre is nearest**, not to whichever was painted
last. Paint order is an accident of array order: resolving by it would make the
same tap select different tables depending on how the backend sorted its
response. A direct hit on a drawn shape always outranks a neighbour's halo, so a
deliberate tap on a large table is never stolen.

The `dense` fixture exists to hold this honest: 16 two-seaters that draw at
~22px on a phone, so every hit rect expands and neighbours overlap by ~16px.

## Modes

|                  | diner                                              | staff                      |
| ---------------- | -------------------------------------------------- | -------------------------- |
| Selectable       | `free` / `reservedSoon`, bookable, seats the party | **every** table, any state |
| Dimmed           | everything else                                    | nothing                    |
| Tap target floor | 44pt                                               | 64pt                       |
| Legend entries   | free, reserved, occupied, your pick                | all six                    |
| Extra info       | availability window on tap                         | seats + sitting time       |

Selection is its own visual treatment (`yourPick`), distinct from all five
states, so a selected free table and a selected `reservedSoon` table read the
same — "your pick" — rather than as two different things.

Staff mode shows occupancy density and **never money**.

## Colour is never the only signal

Every state pairs its colour with a distinct border treatment (solid, dashed,
dotted, thick) and fill pattern (none, diagonal stripes, crosshatch, dots).
Roughly 1 in 12 men has a red/green deficiency, and a sunlit Yerevan terrace
washes out hue on any phone at any brightness. The plan has to survive being
read in greyscale.

All colours come from `@yalla/tokens`. This package defines none.

## Performance

`computeFloorLayout` is memoised on `plan` and `viewport`. This component will
re-render on live SignalR pushes — potentially several per second in a busy
venue — and none of those should trigger a relayout unless the geometry actually
changed. Pass a **stable** `viewport` object: a fresh `{width, height}` literal
each render defeats the memo entirely. See `useElementSize` in the admin app.

## Fixtures and harness

`src/mocks/` ships three fixtures: `cafe` (11 tables, two areas, all five states,
one `reservedSoon` closing in 90 minutes), `terrace` (extreme aspect ratio), and
`dense` (overlapping hit targets).

The admin panel serves a dev harness at **`/dev/floorplan`** with controls for
fixture, mode, party size and viewport (phone 380×700 / tablet / desktop). The
viewport frame is exactly the target device size, so the phone case is looked at
rather than imagined.

```bash
pnpm dev:admin   # then open /dev/floorplan
pnpm --filter @yalla/floorplan test
```

## Area mode: why a real restaurant does not fit on a phone

The eleven-table cafe fixture fits a 380pt phone, so nothing here fired for the
first six months of this package's life. A thirty-table restaurant does not, and
the maths is the reason rather than the taste.

Every table is owed a 44pt tap target (64pt on the staff tablet). A 1400x1000
room fitted to a 380pt-wide phone scales to about a quarter, so a 74-unit
two-top draws 18px across and its hit region is expanded to 44. Thirty of those
expanded regions cannot be disjoint in that space: they overlap three and four
deep. `pickTableAt` then resolves by nearest centre — correctly, because that is
the best it can do — and a diner taps table 12 and selects table 11, repeatedly,
on the screen the entire product hangs on.

So `computeFloorLayout` reports the fact:

```ts
const layout = computeFloorLayout({ …, viewport });
layout.hasOverlappingHitRects; // true at 380pt, false at 1024pt
```

**The function only reports; the component decides.** `FloorPlan` falls back to
rendering one floor area at a time when _all_ of these hold: the viewport is
narrower than `AREA_MODE_MAX_WIDTH_PX` (600), the room has more than one area to
divide it by, and the fitted layout actually collides. A small room, an
undivided room, or a tablet never sees the mechanism at all — which matters,
because a control that does nothing for most venues is worse than no control.

In area mode the plan gets a tab strip: each area with **its own free-table
count**, plus an Overview. The count is not decoration. It is the number a diner
is scanning for, and without it choosing between "Windows" and "Terrace" is a
guess whose usual outcome is tapping through every area to find the one with a
table. Overview draws the whole room as a non-interactive map with the areas
outlined; tapping an area switches to it.

Selecting an area fits it to **its own bounds**, not the room's, through
`areaFilter`:

```ts
computeFloorLayout({ …, areaFilter: 'Windows' });
```

Ten window tables then get the space thirty were fighting over — 2.2x larger in
the restaurant fixture — and the overlap is gone.

### Where area mode is not enough

The bar in the restaurant fixture is eight stools at a 96-unit pitch. Fitted
alone on a 380pt phone they draw 42px apart and the tap floor is 44, so they
still collide — by 2px. That is a fact about the room, not a bug: area mode gets
it within two pixels and **zoom closes the rest**, which is why both exist and
why neither alone is the answer. `areaZoom.test.ts` pins that case down
explicitly so nobody later "fixes" area mode by loosening the tap floor.

## Zoom and pan

Pinch to zoom, drag to pan, double-tap to reset — in both diner and staff modes,
handled by `useFloorGestures` inside the package. Gesture handling in the
screens would be written three times and behave three ways.

Both are **inputs to `computeFloorLayout`**, not component state layered on top:

```ts
computeFloorLayout({ …, zoom: 2, panX: -40, panY: 0 });
```

That keeps everything testable without rendering, and it is what makes two
otherwise awkward rules fall out for free:

- **Text scales with the room, floored at `MIN_FONT_SIZE_PX`.** Zooming in is
  how a diner reads a label the fitted layout had to drop, so a label hidden at
  1x appears as soon as the drawn size clears the floor. Before this the font
  size was pinned _at_ the floor, which magnified rectangles around permanently
  11px labels.
- **Hit rects recompute from the zoomed layout**, so at 2x the dense cluster's
  overlaps disappear on their own: the tables now clear the tap floor without
  any expansion.

Pan is clamped to the room's overflow rather than to "not entirely off screen".
A zoomed-in room can be moved to any part of itself; a fitted one cannot be
moved at all. There is never dead space at an edge, which is the state people
read as "the plan has broken".

The responder is claimed as late as possible. One finger is ignored until the
room is actually zoomed in and has travelled past a slop threshold, so this does
not swallow scrolling on the diner's branch screen, where the plan sits inside a
scroll view. Two fingers claim immediately: nothing else on these screens wants
a pinch.

## Why the editor and the viewer share one layout function

The floor plan editor in `apps/web` renders through **this same
`computeFloorLayout`**. It is not tidiness.

A second geometry implementation is how the editor and the viewer end up
disagreeing about where table 7 is. The failure would not surface in either
codebase: it surfaces as a diner standing next to the wrong table, or a waiter
sent to seat a party at a table the plan drew somewhere else. There is no test
that catches that, because each implementation is self-consistent.

So the editor adds interaction on top and converts pixels back into floor units
through `layout.scale`. It never does its own fitting. Two consequences worth
knowing:

- The editor passes `minTapTargetPx: 0`, because a mouse has no fingertip and
  hit expansion there would make small tables impossible to place next to each
  other.
- The editor draws every table in the `free` treatment. A stored plan is a
  drawing of furniture, not a live floor: colouring a table red in the editor
  would claim somebody is sitting at it, which is neither true nor something the
  editor can change. A deactivated table is the one exception, drawn struck
  through — see below.

### Deactivated tables

A table the server has kept because it has bookings against it stays on the
canvas, visibly marked, with a reactivate action. Hiding it would be worse than
useless: a person who deletes table 7, sees it vanish, saves, and finds it back
will simply delete it again.

## Fixtures

| Fixture                 | What it is for                                                             |
| ----------------------- | -------------------------------------------------------------------------- |
| `cafeFloorPlan`         | 11 tables, 2 areas, every derived state. The normal case.                  |
| `terraceFloorPlan`      | 1600x220. Extreme aspect ratio, to keep anyone from "fixing" letterboxing. |
| `denseClusterFloorPlan` | 16 two-tops in one area. Nearest-centre hit resolution, and zoom.          |
| `restaurantFloorPlan`   | **30 tables, 3 areas.** The case that breaks at phone width.               |
| `twoFloorPlan`          | Two areas far apart in space, with an empty band between them.             |

`/dev/floorplan` in the web app renders all five at three viewport sizes, with
zoom and area-mode controls and each area's free count.
