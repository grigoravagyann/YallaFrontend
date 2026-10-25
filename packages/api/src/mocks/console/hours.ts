import {
  type WeeklyHours,
  type SpecialDaysList,
  type SpecialDaysSaved,
  SPECIAL_DAY_HORIZON_DAYS,
  SPECIAL_DAY_NOTE_MAX,
  toMinutes,
  type SpecialDay,
} from '../../contracts/branchSettings';
import { type MockViolation, validationFailed } from '../problems';
import { OverlappingHoursError } from '../../contracts/errors';
import { ConcurrencyConflictError } from '../../errors';
import { branchDayKey, type TimeZone } from '@yalla/format';
import type { ConsoleGateway } from '../../consoleGateway';
import { type ConsoleMockContext, DAY_NAMES, overlapsWithin, URL_TAG } from './context';

/** Opening hours and special days. */
export function hoursMethods(
  ctx: ConsoleMockContext,
): Pick<
  ConsoleGateway,
  'getOpeningHours' | 'replaceOpeningHours' | 'getSpecialDays' | 'replaceSpecialDays'
> {
  const {
    branchTimeZone,
    hours,
    hoursFor,
    now,
    requireBranchInVenue,
    shiftDate,
    specialDays,
    specialDaysFor,
    specialDaysFromServiceDate,
    specialVersionFor,
    specialVersions,
    wait,
  } = ctx;
  return {
    // --- Opening hours ------------------------------------------------------------

    async getOpeningHours(branchId): Promise<WeeklyHours> {
      await wait();
      requireBranchInVenue(branchId);
      return hoursFor(branchId);
    },

    async replaceOpeningHours({ branchId, week }): Promise<WeeklyHours> {
      await wait();

      // `OpeningHoursRules.Normalise`, first rule: a block that opens and
      // closes at the same minute has no length. A 422 naming `[i].closesAt`
      // — the index of the block in the flat array the wire carries — with
      // the server's sentence, and nothing written. Checked before overlaps,
      // as the server checks it. The mock used to save it as a 24h day (QA F7).
      const equal: MockViolation[] = [];
      let index = 0;
      for (const day of week) {
        for (const block of day.blocks) {
          if (block.opensAt === block.closesAt) {
            equal.push({
              field: `[${index}].closesAt`,
              message:
                `Opening and closing time are both ${block.opensAt} on ${DAY_NAMES[day.day]}. ` +
                'A block must have a length; for a branch that never closes use 00:00 to 23:59.',
              bound: 'conflict',
            });
          }
          index += 1;
        }
      }
      if (equal.length > 0) throw validationFailed(`${URL_TAG}/opening-hours`, equal);

      // The server's own check, so the screen's client-side validation has
      // something to be tested against rather than being the only opinion.
      const clashing = week.filter((day) => overlapsWithin(day.blocks)).map((day) => day.day);
      if (clashing.length > 0) {
        throw new OverlappingHoursError({
          url: `${URL_TAG}/opening-hours`,
          days: clashing,
          detail: 'Two opening times on the same day overlap.',
        });
      }

      const stored: WeeklyHours = week.map((day) => ({
        day: day.day,
        blocks: day.blocks.map((block) => ({ ...block })),
      }));
      hours.set(branchId, stored);
      return stored;
    },

    async getSpecialDays(branchId): Promise<SpecialDaysList> {
      await wait();
      requireBranchInVenue(branchId);
      return {
        version: String(specialVersionFor(branchId)),
        days: specialDaysFromServiceDate(branchId),
      };
    },

    async replaceSpecialDays({ branchId, expectedVersion, days }): Promise<SpecialDaysSaved> {
      await wait();
      requireBranchInVenue(branchId);
      const url = `${URL_TAG}/branches/${branchId}/opening-hours/exceptions`;
      const current = String(specialVersionFor(branchId));
      // Saved by somebody else since this editor read it: nothing written.
      if (expectedVersion !== current) {
        throw new ConcurrencyConflictError({
          url,
          problem: {
            type: 'about:blank',
            title: 'Conflict',
            status: 409,
            detail: 'The special days were changed since they were loaded.',
            code: 'concurrent-update',
            traceId: 'mock',
            context: { currentVersion: current },
          },
        });
      }
      const today = branchDayKey(now(), branchTimeZone(branchId) as TimeZone);
      const horizon = shiftDate(today, SPECIAL_DAY_HORIZON_DAYS);

      // `SpecialOpeningDaysRules`, as the wire lists them: every problem at
      // once, under `days[i]`, nothing saved. An entry before today is history
      // and is skipped, fields and all — a console left open past midnight
      // still saves the rest.
      const problems: MockViolation[] = [];
      const upcoming = days
        .map((day, i) => ({ day, i }))
        .filter(({ day }) => !/^\d{4}-\d{2}-\d{2}$/u.test(day.date) || day.date >= today);
      if (upcoming.length > 100) {
        problems.push({ field: 'days[100]', message: 'At most 100 special days.', bound: 'max' });
      }
      const seen = new Set<string>();
      for (const { day, i } of upcoming) {
        if (!/^\d{4}-\d{2}-\d{2}$/u.test(day.date)) {
          problems.push({
            field: `days[${i}].date`,
            message: 'A date is required.',
            bound: 'required',
          });
        } else if (day.date > horizon) {
          problems.push({
            field: `days[${i}].date`,
            message: `${day.date} is more than a year ahead.`,
            bound: 'max',
          });
        } else if (seen.has(day.date)) {
          problems.push({
            field: `days[${i}].date`,
            message: `${day.date} is in the list twice.`,
            bound: 'conflict',
          });
        }
        seen.add(day.date);
        if ((day.note ?? '').trim().length > SPECIAL_DAY_NOTE_MAX) {
          problems.push({
            field: `days[${i}].note`,
            message: `A note is at most ${SPECIAL_DAY_NOTE_MAX} characters.`,
            bound: 'max',
          });
        }
        if (day.blocks.length > 4) {
          problems.push({ field: `days[${i}].blocks`, message: 'At most 4 blocks.', bound: 'max' });
        }
        const spans: { start: number; end: number }[] = [];
        day.blocks.forEach((block, j) => {
          const opens = toMinutes(block.opensAt);
          const closes = toMinutes(block.closesAt);
          if (opens === closes) {
            problems.push({
              field: `days[${i}].blocks[${j}].closesAt`,
              message: 'A block must have a length.',
              bound: 'conflict',
            });
            return;
          }
          const end = closes < opens ? closes + 1440 : closes;
          if (spans.some((span) => opens < span.end && span.start < end)) {
            problems.push({
              field: `days[${i}].blocks[${j}].opensAt`,
              message: 'Two blocks on the same date overlap.',
              bound: 'conflict',
            });
          }
          spans.push({ start: opens, end });
        });
      }
      if (problems.length > 0) throw validationFailed(url, problems);

      // History stays as it was; the list from today on is replaced whole.
      const kept = specialDaysFor(branchId).filter((day) => day.date < today);
      const saved: SpecialDay[] = upcoming
        .map(({ day }) => ({
          date: day.date,
          note: day.note?.trim() ? day.note.trim() : null,
          blocks: [...day.blocks]
            .map((block) => ({ ...block }))
            .sort((a, b) => a.opensAt.localeCompare(b.opensAt)),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
      specialDays.set(branchId, [...kept, ...saved]);
      specialVersions.set(branchId, specialVersionFor(branchId) + 1);
      return {
        version: String(specialVersionFor(branchId)),
        days: specialDaysFromServiceDate(branchId),
        affectedExistingReservations: 0,
        affectedReservationIds: [],
      };
    },
  };
}
