import type { BranchShifts, StaffShift } from '@yalla/api';

/** How a row's shift line reads, and the dot beside it (Staff artboard). */
export type ShiftLineKind = 'today' | 'later' | 'off' | 'none';

export interface ShiftLine {
  readonly kind: ShiftLineKind;
  /** The shift's day, as the words put it: today, tomorrow, or a date. */
  readonly day: 'today' | 'tomorrow' | 'date';
  readonly date: string;
  /** "10:00–19:00", several joined with commas; empty for a day off or none. */
  readonly times: string;
}

/** `YYYY-MM-DD` plus `days`, on keys rather than instants: no zone can move a day. */
export function addDays(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * "16:00–00:00", or "22:00–02:00 (next day)".
 *
 * An end of exactly midnight is drawn without "(next day)", as the opening
 * hours draw a 00:00 close: nobody reads 00:00 as this morning.
 */
export function shiftTimes(shift: StaffShift, nextDay: string): string {
  if (shift.dayOff || !shift.startsAt || !shift.endsAt) return '';
  const span = `${shift.startsAt}–${shift.endsAt}`;
  return shift.endsNextDay && shift.endsAt !== '00:00' ? `${span} ${nextDay}` : span;
}

/**
 * The line under a person's role on the Staff page (VC5 wire §1).
 *
 * Today's shifts first — a day off says so; otherwise the next working one,
 * "tomorrow" when it is; otherwise none. `null` for somebody deactivated:
 * their shifts are kept but not shown, and neither is a line.
 */
export function shiftLineOf(
  staffMemberId: string,
  isActive: boolean,
  data: BranchShifts | undefined,
  nextDay: string,
): ShiftLine | null {
  if (!isActive) return null;
  if (!data) return { kind: 'none', day: 'today', date: '', times: '' };
  const theirs = data.shifts.filter((shift) => shift.staffMemberId === staffMemberId);
  const today = theirs.filter((shift) => shift.date === data.serviceDate);
  if (today.some((shift) => shift.dayOff)) {
    return { kind: 'off', day: 'today', date: data.serviceDate, times: '' };
  }
  if (today.length > 0) {
    return {
      kind: 'today',
      day: 'today',
      date: data.serviceDate,
      times: today.map((shift) => shiftTimes(shift, nextDay)).join(', '),
    };
  }
  const next = theirs.find((shift) => !shift.dayOff && shift.date > data.serviceDate);
  if (!next) return { kind: 'none', day: 'today', date: '', times: '' };
  const sameDay = theirs.filter((shift) => !shift.dayOff && shift.date === next.date);
  return {
    kind: 'later',
    day: next.date === addDays(data.serviceDate, 1) ? 'tomorrow' : 'date',
    date: next.date,
    times: sameDay.map((shift) => shiftTimes(shift, nextDay)).join(', '),
  };
}

/** Minutes past midnight of an `HH:mm`. */
export function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** A shift's length in minutes; an end not after the start runs past midnight. */
export function shiftLength(startsAt: string, endsAt: string): number {
  const raw = minutesOf(endsAt) - minutesOf(startsAt);
  return raw <= 0 ? raw + 1440 : raw;
}
