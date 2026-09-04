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
