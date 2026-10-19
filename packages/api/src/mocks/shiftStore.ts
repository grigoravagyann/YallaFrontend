import {
  SHIFT_HORIZON_DAYS,
  SHIFT_MAX_MINUTES,
  type BranchShifts,
  type ShiftInput,
  type StaffMember,
  type StaffShift,
} from '../contracts/staff';
import { validationFailed, type MockViolation } from './problems';

/**
 * The shift model as the backend's VC5 wire describes it, for the mock.
 *
 * Who may write, and whether the person works at the branch, are the
 * gateway's checks (they need the actor); everything about the shift itself —
 * its date window, its times, its length and its overlaps — is here, with the
 * server's fields and bounds, so the editor's error mapping is tested against
 * the same shapes the real 422 carries.
 */

const DAY = 1440;

function dayNumber(key: string): number {
  return Math.round(Date.parse(`${key}T00:00:00Z`) / 86_400_000);
}

export function addDayKeys(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** The shift as minutes on one long clock, for the overlap check. */
function span(shift: { date: string; startsAt: string; endsAt: string }): [number, number] {
  const start = dayNumber(shift.date) * DAY + minutesOf(shift.startsAt);
  const raw = minutesOf(shift.endsAt) - minutesOf(shift.startsAt);
  return [start, start + (raw <= 0 ? raw + DAY : raw)];
}

const hhmm = (time: string | null) => (time ? time.slice(0, 5) : null);

export interface MockShiftStore {
  list(input: {
    branchId: string;
    serviceDate: string;
    from?: string | undefined;
    to?: string | undefined;
  }): BranchShifts;
  create(input: {
    branchId: string;
    serviceDate: string;
    member: StaffMember;
    shift: ShiftInput;
  }): StaffShift;
  update(input: {
    branchId: string;
    serviceDate: string;
    shiftId: string;
    shift: ShiftInput;
  }): StaffShift;
  remove(input: { branchId: string; serviceDate: string; shiftId: string }): StaffShift | null;
  find(branchId: string, shiftId: string): StaffShift | undefined;
}

export function createMockShiftStore(options: {
  readonly url: string;
  readonly nextId: () => string;
  /** Seeds a branch's first read: today and tomorrow for some of its people. */
  readonly seed?: (
    branchId: string,
    serviceDate: string,
  ) => readonly Omit<StaffShift, 'endsAtUtc'>[];
  /**
   * Whether a shift still counts: its person is active and still works at its
   * branch (theirs, or venue-wide). One left behind is hidden from every read
   * and from the overlap check (VC5 wire, round 1).
   */
  readonly counts?: (shift: StaffShift) => boolean;
  /** The instant a working shift ends, in its branch's zone. */
  readonly endsAtUtc?: (shift: Omit<StaffShift, 'endsAtUtc'>) => string | null;
  readonly now?: () => Date;
  /** The 409 for changing or removing a shift that has ended before today. */
  readonly history?: () => Error;
}): MockShiftStore {
  const counts = options.counts ?? (() => true);
  const now = options.now ?? (() => new Date());
  const withEnd = (shift: Omit<StaffShift, 'endsAtUtc'>): StaffShift => ({
    ...shift,
    endsAtUtc: shift.dayOff ? null : (options.endsAtUtc?.(shift) ?? null),
  });
  /** Dated before the service day and over: history, kept as it was. */
  const ended = (shift: StaffShift, serviceDate: string) =>
    shift.date < serviceDate &&
    (shift.endsAtUtc === null || Date.parse(shift.endsAtUtc) <= now().getTime());
  const refuseHistory = (shift: StaffShift, serviceDate: string) => {
    if (ended(shift, serviceDate)) throw options.history?.() ?? new Error('history');
  };
  const all: StaffShift[] = [];
  const seeded = new Set<string>();

  function ensureSeeded(branchId: string, serviceDate: string) {
    if (seeded.has(branchId)) return;
    seeded.add(branchId);
    all.push(...(options.seed?.(branchId, serviceDate) ?? []).map(withEnd));
  }

  function check(
    serviceDate: string,
    staffMemberId: string,
    shift: ShiftInput,
    ignoreId: string | null,
    earliest: string = serviceDate,
  ): void {
    const problems: MockViolation[] = [];
    const last = addDayKeys(serviceDate, SHIFT_HORIZON_DAYS);
    if (!shift.date) problems.push({ field: 'date', message: 'Choose a date.', bound: 'required' });
    else if (shift.date < earliest)
      problems.push({
        field: 'date',
        message: 'A shift cannot be planned in the past.',
        bound: 'min',
      });
    else if (shift.date > last)
      problems.push({
        field: 'date',
        message: `A shift can be planned up to ${SHIFT_HORIZON_DAYS} days ahead.`,
        bound: 'max',
      });

    if (shift.dayOff) {
      if (shift.startsAt || shift.endsAt)
        problems.push({ field: 'startsAt', message: 'A day off has no times.', bound: 'conflict' });
    } else {
      if (!shift.startsAt)
        problems.push({ field: 'startsAt', message: 'Choose a start time.', bound: 'required' });
      if (!shift.endsAt)
        problems.push({ field: 'endsAt', message: 'Choose an end time.', bound: 'required' });
      if (shift.startsAt && shift.endsAt) {
        const [start, end] = span({
          date: shift.date,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
        });
        if (minutesOf(shift.startsAt) === minutesOf(shift.endsAt))
          problems.push({
            field: 'endsAt',
            message: 'A shift has to end after it starts.',
            bound: 'conflict',
          });
        else if (end - start > SHIFT_MAX_MINUTES)
          problems.push({
            field: 'endsAt',
            message: 'A shift is at most 16 hours.',
            bound: 'max',
            max: SHIFT_MAX_MINUTES,
          });
      }
    }

    const theirs = all.filter(
      (other) => other.staffMemberId === staffMemberId && other.id !== ignoreId && counts(other),
    );
    if (shift.date) {
      const sameDate = theirs.filter((other) => other.date === shift.date);
      if (shift.dayOff ? sameDate.length > 0 : sameDate.some((other) => other.dayOff)) {
        problems.push({
          field: 'date',
          message: 'A day off and a shift cannot share a date.',
          bound: 'conflict',
        });
      }
    }
    if (!shift.dayOff && shift.date && shift.startsAt && shift.endsAt) {
      const [start, end] = span({
        date: shift.date,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
      });
      const clash = theirs.find((other) => {
        if (other.dayOff || !other.startsAt || !other.endsAt) return false;
        const [otherStart, otherEnd] = span({
          date: other.date,
          startsAt: other.startsAt,
          endsAt: other.endsAt,
        });
        return start < otherEnd && otherStart < end;
      });
      if (clash) {
        problems.push({
          field: 'startsAt',
          message: `It overlaps their shift on ${clash.date}, ${clash.startsAt}–${clash.endsAt}.`,
          bound: 'conflict',
        });
      }
    }
    if (problems.length > 0) throw validationFailed(options.url, problems);
  }

  function stored(
    base: { readonly id: string; readonly staffMemberId: string; readonly branchId: string },
    shift: ShiftInput,
  ): StaffShift {
    const startsAt = shift.dayOff ? null : hhmm(shift.startsAt);
    const endsAt = shift.dayOff ? null : hhmm(shift.endsAt);
    return withEnd({
      ...base,
      date: shift.date,
      dayOff: shift.dayOff,
      startsAt,
      endsAt,
      endsNextDay: Boolean(startsAt && endsAt && minutesOf(endsAt) <= minutesOf(startsAt)),
    });
  }

  return {
    list({ branchId, serviceDate, from, to }) {
      ensureSeeded(branchId, serviceDate);
      const start = from ?? serviceDate;
      const end = to ?? addDayKeys(start, 13);
      if (end < start) {
        throw validationFailed(options.url, [
          { field: 'to', message: 'The end comes before the start.', bound: 'min' },
        ]);
      }
      if (dayNumber(end) - dayNumber(start) + 1 > SHIFT_HORIZON_DAYS) {
        throw validationFailed(options.url, [
          {
            field: 'to',
            message: `At most ${SHIFT_HORIZON_DAYS} days at a time.`,
            bound: 'max',
            max: SHIFT_HORIZON_DAYS,
          },
        ]);
      }
      const shifts = all
        .filter(
          (shift) =>
            shift.branchId === branchId &&
            shift.date >= start &&
            shift.date <= end &&
            counts(shift),
        )
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            Number(b.dayOff) - Number(a.dayOff) ||
            (a.startsAt ?? '').localeCompare(b.startsAt ?? '') ||
            a.staffMemberId.localeCompare(b.staffMemberId),
        );
      const onShiftToday = new Set(
        all
          .filter(
            (shift) =>
              shift.branchId === branchId &&
              shift.date === serviceDate &&
              !shift.dayOff &&
              counts(shift),
          )
          .map((shift) => shift.staffMemberId),
      ).size;
      return { branchId, serviceDate, from: start, to: end, onShiftToday, shifts };
    },

    create({ branchId, serviceDate, member, shift }) {
      ensureSeeded(branchId, serviceDate);
      check(serviceDate, member.id, shift, null);
      const made = stored({ id: options.nextId(), staffMemberId: member.id, branchId }, shift);
      all.push(made);
      return made;
    },

    update({ branchId, serviceDate, shiftId, shift }) {
      ensureSeeded(branchId, serviceDate);
      const index = all.findIndex((entry) => entry.id === shiftId && entry.branchId === branchId);
      const current = all[index];
      if (!current) throw new Error('unknown shift');
      refuseHistory(current, serviceDate);
      // A shift still running from before today may be corrected on its own date.
      check(
        serviceDate,
        current.staffMemberId,
        shift,
        current.id,
        current.date < serviceDate ? current.date : serviceDate,
      );
      const next = stored(current, shift);
      all[index] = next;
      return next;
    },

    remove({ branchId, serviceDate, shiftId }) {
      const index = all.findIndex((entry) => entry.id === shiftId && entry.branchId === branchId);
      if (index < 0) return null;
      refuseHistory(all[index]!, serviceDate);
      const [gone] = all.splice(index, 1);
      return gone ?? null;
    },

    find(branchId, shiftId) {
      return all.find((entry) => entry.id === shiftId && entry.branchId === branchId);
    },
  };
}
