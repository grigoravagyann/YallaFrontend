import { branchDayKey, instantFromZonedClock, type TimeZone } from '@yalla/format';
import {
  blocksOnDate,
  closesNextDay,
  toMinutes,
  type SpecialDay,
  type WeeklyHours,
} from './branchSettings';
import type { OpenState } from './publicBranch';

/**
 * "Open until 23:00", derived from a week of opening hours.
 *
 * The open/closed VERDICT belongs to the backend: the honest version of that
 * question needs the venue's actual clock, which a browser does not have, and a client that decided it would let a phone with a
 * wrong date tell a visitor a shut venue is open. Two callers use this anyway,
 * each within that rule:
 *
 * - the mock, which has no backend and needs a state *consistent with its
 *   fixture*, so a page reading "open until 01:00" reads the same week the
 *   hours list below it shows;
 * - the real public mapping (`http/publicMapping.ts`), which keeps the server's
 *   `isOpenNow` and borrows only the times ("opens at 09:00") from the hours,
 *   dropping them whenever this disagrees with the server.
 *
 * It sits in `contracts/` rather than `mocks/` so production code never imports
 * from the mock.
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

function instantOn(dateKey: string, clock: string, timeZone: TimeZone): Date {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  const minutes = toMinutes(clock);
  return instantFromZonedClock(
    { year, month, day, hour: Math.floor(minutes / 60), minute: minutes % 60 },
    timeZone,
  );
}

/**
 * Does one opening block hold the whole sitting?
 *
 * `ReservationRules.CheckOpeningHours`, as the server applies it: the day the
 * sitting starts and the day before (for an after-midnight closer) are walked,
 * and the sitting passes when `start >= opensAt && end <= closesAt` for any
 * block of either day. A sitting that starts inside the hours and runs past
 * closing is outside them.
 */
export function coversSitting(
  weeklyHours: WeeklyHours,
  startUtc: Date,
  endUtc: Date,
  timeZone: TimeZone,
  specialDays: readonly SpecialDay[] = [],
): boolean {
  const dateKey = branchDayKey(startUtc, timeZone);

  for (const offset of [-1, 0]) {
    const key = dateKeyOffsetBy(dateKey, offset);
    for (const block of blocksOnDate(key, weeklyHours, specialDays)) {
      const opens = instantOn(key, block.opensAt, timeZone);
      const closes = instantOn(
        closesNextDay(block) ? dateKeyOffsetBy(key, 1) : key,
        block.closesAt,
        timeZone,
      );
      if (startUtc.getTime() >= opens.getTime() && endUtc.getTime() <= closes.getTime()) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Is the branch serving right now, and until (or from) when?
 *
 * Walks yesterday, today and tomorrow. Yesterday because of the 01:00 closer;
 * tomorrow because "opens 09:00" on a Sunday night has to be able to name
 * Monday morning. Each date's blocks are its special day's when it is one
 * ({@link blocksOnDate}), as the server reads them.
 */
export function openStateFrom(
  weeklyHours: WeeklyHours,
  now: Date,
  timeZone: TimeZone,
  specialDays: readonly SpecialDay[] = [],
): OpenState {
  const dateKey = branchDayKey(now, timeZone);

  const candidates: { start: Date; end: Date }[] = [];
  for (const offset of [-1, 0, 1, 2]) {
    const key = dateKeyOffsetBy(dateKey, offset);
    for (const block of blocksOnDate(key, weeklyHours, specialDays)) {
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
