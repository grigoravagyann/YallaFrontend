/**
 * The time wheel's arithmetic: two columns, hour and minute, over the day's
 * times — pure, so the picker's feel can change without its rules moving.
 *
 * The wheel never invents a time. Its rows are exactly the times the booking
 * screen offers for the day (the branch's hours, the lead time, the server's
 * day of slots), in the order they happen — so a bar open until two lists
 * 23:00, 00:00, 01:00 after the evening, never before it — and every one is
 * matched by its **instant**, never by its clock reading: the 00:30 after
 * tonight is not the 00:30 before it.
 */

/** Whether a time can be had: free, only as a request, or not at all. */
export type SlotState = 'free' | 'requestable' | 'busy';

export interface WheelSlot {
  /** The instant, in milliseconds. */
  readonly at: number;
  /** `HH:mm` on the branch's clock. */
  readonly label: string;
  readonly state: SlotState;
}

export interface WheelHour {
  /** Stable across renders: the instant of its first time. */
  readonly key: string;
  /** `HH`. */
  readonly label: string;
  readonly slots: readonly WheelSlot[];
  /** Every time in the hour is busy: drawn struck. */
  readonly busy: boolean;
}

const MINUTE_MS = 60_000;

/** A busy time is drawn and named, never chosen. */
export function isOffered(slot: WheelSlot): boolean {
  return slot.state !== 'busy';
}

/**
 * The left column: the day's times grouped into hours, in the order they
 * happen. A run of one clock hour is one row — and the 01:00 of a clocks-back
 * night, which happens twice, is two.
 */
export function wheelHours(slots: readonly WheelSlot[]): readonly WheelHour[] {
  const sorted = [...slots].sort((a, b) => a.at - b.at);
  const hours: { key: string; label: string; slots: WheelSlot[] }[] = [];
  for (const slot of sorted) {
    const label = slot.label.slice(0, 2);
    const last = hours[hours.length - 1];
    if (
      last &&
      last.label === label &&
      slot.at - last.slots[last.slots.length - 1]!.at < 60 * MINUTE_MS
    ) {
      last.slots.push(slot);
    } else {
      hours.push({ key: String(slot.at), label, slots: [slot] });
    }
  }
  return hours.map((hour) => ({ ...hour, busy: hour.slots.every((slot) => !isOffered(slot)) }));
}

/** Where a time sits on the two columns, or `null` when it is not on them. */
export function wheelPosition(
  hours: readonly WheelHour[],
  at: number | null,
): { readonly hour: number; readonly minute: number } | null {
  if (at === null) return null;
  for (const [hour, entry] of hours.entries()) {
    const minute = entry.slots.findIndex((slot) => slot.at === at);
    if (minute >= 0) return { hour, minute };
  }
  return null;
}

/**
 * The time a new hour lands on: the same minutes when the hour has them, else
 * the nearest minutes it does have — 17:20 for "00" in an hour that starts at
 * 17:20, because the lead time put it there.
 */
export function minuteIn(hour: WheelHour, minutes: string): WheelSlot | null {
  const wanted = Number(minutes);
  let best: WheelSlot | null = null;
  for (const slot of hour.slots) {
    const distance = Math.abs(Number(slot.label.slice(3)) - wanted);
    if (best === null || distance < Math.abs(Number(best.label.slice(3)) - wanted)) best = slot;
  }
  return best;
}

/** The time nearest `at` that can be had — the later of two equally near. */
export function nearestOffered(slots: readonly WheelSlot[], at: number): WheelSlot | null {
  let best: WheelSlot | null = null;
  for (const slot of slots) {
    if (!isOffered(slot)) continue;
    const distance = Math.abs(slot.at - at);
    const bestDistance = best === null ? Infinity : Math.abs(best.at - at);
    if (
      distance < bestDistance ||
      (distance === bestDistance && best !== null && slot.at > best.at)
    ) {
      best = slot;
    }
  }
  return best;
}

/**
 * Where the wheel comes to rest when it stops on `at`: there, when the time
 * can be had; otherwise on the nearest one that can, with the busy one it left
 * — so the screen can say "No free table at 20:15 — 20:30 suggested".
 */
export function settleOn(
  slots: readonly WheelSlot[],
  at: number,
): { readonly slot: WheelSlot | null; readonly snappedFrom: WheelSlot | null } {
  const here = slots.find((slot) => slot.at === at) ?? null;
  if (here && isOffered(here)) return { slot: here, snappedFrom: null };
  return { slot: nearestOffered(slots, at), snappedFrom: here };
}

/**
 * One step, as a screen reader's swipe up or down takes it: the next time that
 * can be had after `at` (or before it), past any busy ones. `null` at the end.
 */
export function stepOffered(
  slots: readonly WheelSlot[],
  at: number,
  direction: 1 | -1,
): WheelSlot | null {
  const sorted = [...slots].sort((a, b) => a.at - b.at);
  const ordered = direction === 1 ? sorted : sorted.reverse();
  return (
    ordered.find((slot) => isOffered(slot) && (direction === 1 ? slot.at > at : slot.at < at)) ??
    null
  );
}

/**
 * "In 10 min · 19:15": the lead time from now, rounded **up** to five
 * minutes, so the chip names a time a person would say.
 */
export function soonInstant(now: Date, leadMinutes: number): number {
  const earliest = now.getTime() + Math.max(0, leadMinutes) * MINUTE_MS;
  const step = 5 * MINUTE_MS;
  return Math.ceil(earliest / step) * step;
}

/**
 * The quick chips: the `count` times that can be had nearest `anchor`, in the
 * order they happen — `exclude` is the one another chip already offers.
 */
export function quickTimes(
  slots: readonly WheelSlot[],
  anchor: number,
  count: number,
  exclude: number | null = null,
): readonly WheelSlot[] {
  return slots
    .filter((slot) => isOffered(slot) && slot.at !== exclude)
    .sort((a, b) => {
      const distance = Math.abs(a.at - anchor) - Math.abs(b.at - anchor);
      return distance !== 0 ? distance : b.at - a.at;
    })
    .slice(0, Math.max(0, count))
    .sort((a, b) => a.at - b.at);
}
