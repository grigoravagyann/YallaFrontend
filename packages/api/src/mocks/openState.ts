import { branchDayKey, instantFromZonedClock, type TimeZone } from '@yalla/format';
import {
  closesNextDay,
  toMinutes,
  type WeekdayIndex,
  type WeeklyHours,
} from '../contracts/branchSettings';
import type { OpenState } from '../contracts/publicBranch';

/**
 * "Open until 23:00", derived from a week of opening hours.
 *
 * This lives in the mock, not in the page, and that is deliberate. The real
 * `OpenState` is computed by the backend, because the honest version of this
 * question needs the venue's holiday closures and its actual clock — neither of
 * which a browser has — and because a client that derived it would let a phone
 * with a wrong date tell a visitor a shut venue is open. What the mock needs is
 * something *consistent with the fixture*, so that a page reading "open until
 * 01:00" is reading the same week the hours list below it shows.
 *
 * The awkward part, and the reason this is not four lines: a venue that shuts
 * at 01:00 is open at half past midnight **under yesterday's row**. Every rule
 * here follows from that.
 */

const DAY_MS = 86_400_000;

function dateKeyOffsetBy(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS);
  return shifted.toISOString().slice(0, 10);
}

function weekdayOf(dateKey: string): WeekdayIndex {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() as WeekdayIndex;
}

function instantOn(dateKey: string, clock: string, timeZone: TimeZone): Date {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  const minutes = toMinutes(clock);
  return instantFromZonedClock(
    { year, month, day, hour: Math.floor(minutes / 60), minute: minutes % 60 },
    timeZone,
  );
}

/**
 * Is the branch serving right now, and until (or from) when?
 *
 * Walks yesterday, today and tomorrow. Yesterday because of the 01:00 closer;
 * tomorrow because "opens 09:00" on a Sunday night has to be able to name
 * Monday morning.
 */
export function openStateFrom(weeklyHours: WeeklyHours, now: Date, timeZone: TimeZone): OpenState {
  const dateKey = branchDayKey(now, timeZone);
  const byDay = new Map<WeekdayIndex, WeeklyHours[number]>();
  for (const entry of weeklyHours) byDay.set(entry.day, entry);

  const candidates: { start: Date; end: Date }[] = [];
  for (const offset of [-1, 0, 1, 2]) {
    const key = dateKeyOffsetBy(dateKey, offset);
    const entry = byDay.get(weekdayOf(key));
    if (!entry) continue;

    for (const block of entry.blocks) {
      const start = instantOn(key, block.opensAt, timeZone);
      const endKey = closesNextDay(block) ? dateKeyOffsetBy(key, 1) : key;
      const end = instantOn(endKey, block.closesAt, timeZone);
      if (end.getTime() > start.getTime()) candidates.push({ start, end });
    }
  }

  candidates.sort((a, b) => a.start.getTime() - b.start.getTime());

  const current = candidates.find(
    (span) => now.getTime() >= span.start.getTime() && now.getTime() < span.end.getTime(),
  );
  if (current) {
    return { isOpen: true, closesAtUtc: current.end.toISOString(), opensAtUtc: null };
  }

  const next = candidates.find((span) => span.start.getTime() > now.getTime());
  return {
    isOpen: false,
    closesAtUtc: null,
    opensAtUtc: next ? next.start.toISOString() : null,
  };
}
