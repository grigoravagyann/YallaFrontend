import { branchDayKey, instantFromZonedClock, intlTag, type Locale } from '@yalla/format';

/**
 * A place the diner can browse: one branch of a venue, photographed.
 *
 * `id` is the API **branch** id. The booking confirmation, the floor plan and
 * the scan flow all key on the branch, so a place opened from Explore has to
 * hand the same id on — a second id scheme here would break every one of them.
 */

export type PlaceType = 'restaurant' | 'cafe';

/** Content badges. Never "open" or "closed" — availability is `openState`. */
export type PlaceBadge = 'popular' | 'new';

/** Live state of one table, as the photo markers show it. */
export type TableStatus = 'free' | 'reserved' | 'occupied';

/** A weekday as `Date#getDay` counts them: 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** A wall-clock time in the place's own zone, `HH:mm`, 24-hour. */
export type ClockTime = string;

export interface OpeningHours {
  readonly day: Weekday;
  readonly open: ClockTime;
  /** May be earlier than `open` — that means the place shuts after midnight. */
  readonly close: ClockTime;
}

export interface OpenState {
  readonly isOpen: boolean;
  /** Today's opening time, `HH:mm` in the place's zone. Absent when shut all day. */
  readonly opensAt?: ClockTime;
  readonly closesAt?: ClockTime;
  /** Today's hours ready to read out — "08:00 – 23:00" — or '' when shut all day. */
  readonly todayLabel: string;
}

export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export interface MenuItem {
  readonly name: string;
  /** Whole dram. The dram has no sub-unit in practice, so never a fraction. */
  readonly price: number;
  readonly description?: string;
}

export interface MenuSection {
  readonly section: string;
  readonly items: readonly MenuItem[];
}

export interface Review {
  readonly author: string;
  /** 1–5. */
  readonly rating: number;
  readonly text: string;
  /** ISO-8601 date, `YYYY-MM-DD`. */
  readonly date: string;
}

/**
 * A table drawn on the FIRST photo of the place.
 *
 * `x`/`y` are normalised 0..1 across that photo, so the marker lands on the
 * same table however the image is scaled. `tableId` is the floor-plan table id
 * the booking flow takes.
 */
export interface TablePhotoMarker {
  readonly tableId: string;
  readonly label: string;
  readonly status: TableStatus;
  readonly capacityMin: number;
  readonly capacityMax: number;
  readonly x: number;
  readonly y: number;
}

export interface Place {
  readonly id: string;
  readonly venueId: string;
  readonly name: string;
  readonly type: PlaceType;
  /** "Armenian & Mediterranean" — free text from the venue, not a key. */
  readonly cuisine: string;
  readonly distanceKm: number;
  /** 0–5, one decimal. */
  readonly rating: number;
  readonly ratingCount: number;
  readonly badges: readonly PlaceBadge[];
  readonly openState: OpenState;
  /** Remote URLs. The first is the hero and carries the table markers. */
  readonly photos: readonly string[];
  readonly coords: Coordinates;
  readonly address: string;
  readonly phone?: string;
  readonly website?: string;
  /** IANA zone every one of its hours is read in. */
  readonly timeZoneId: string;
  readonly hours: readonly OpeningHours[];
  /** Keys under `place.amenity.*` — `outdoorSeating`, `wifi`, `parking`, `cardPayment`, `vegan`. */
  readonly amenities: readonly string[];
  readonly about: string;
  readonly menu: readonly MenuSection[];
  readonly reviews: readonly Review[];
  readonly tables: readonly TablePhotoMarker[];
}

// ---------------------------------------------------------------------------
// Pure helpers. Kept here so the mock, the slot picker and the UI agree on
// what "open" means.
// ---------------------------------------------------------------------------

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export function parseClock(value: ClockTime): { hour: number; minute: number } {
  const [hour = 0, minute = 0] = value.split(':').map(Number);
  return { hour, minute };
}

/** `2026-09-13` → its three parts. */
export function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const [year = 1970, month = 1, day = 1] = dateKey.split('-').map(Number);
  return { year, month, day };
}

/** The instant a place's clock reads `clock` on `dateKey`. */
export function instantAt(dateKey: string, clock: ClockTime, timeZoneId: string): Date {
  const { hour, minute } = parseClock(clock);
  return instantFromZonedClock({ ...parseDateKey(dateKey), hour, minute }, timeZoneId);
}

/** `dateKey` moved by `days` whole days. */
export function shiftDateKey(dateKey: string, days: number): string {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The weekday of a `YYYY-MM-DD`, in the `Date#getDay` numbering. */
export function weekdayOf(dateKey: string): Weekday {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() as Weekday;
}

export function hoursOn(hours: readonly OpeningHours[], dateKey: string): OpeningHours | null {
  const weekday = weekdayOf(dateKey);
  return hours.find((entry) => entry.day === weekday) ?? null;
}

/**
 * The open and close instants of one service day.
 *
 * A close earlier than the open ("09:00"–"01:00") is the small hours of the
 * next date, which is how every late venue writes its hours down.
 */
export function serviceWindow(
  hours: OpeningHours,
  dateKey: string,
  timeZoneId: string,
): { opens: Date; closes: Date } {
  const opens = instantAt(dateKey, hours.open, timeZoneId);
  let closes = instantAt(dateKey, hours.close, timeZoneId);
  if (closes.getTime() <= opens.getTime()) {
    closes = instantAt(shiftDateKey(dateKey, 1), hours.close, timeZoneId);
  }
  return { opens, closes };
}

const clockFormatterCache = new Map<string, Intl.DateTimeFormat>();

/** `"20:30"` as the locale writes it — a wall-clock reading, formatted without a zone. */
export function formatClock(value: ClockTime, locale: Locale): string {
  const tag = intlTag(locale);
  let formatter = clockFormatterCache.get(tag);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(tag, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    });
    clockFormatterCache.set(tag, formatter);
  }
  const { hour, minute } = parseClock(value);
  return formatter.format(new Date(Date.UTC(2026, 0, 1, hour, minute)));
}

/**
 * Whether the place is serving at `now`, and what today's hours are.
 *
 * Yesterday's service is checked too: at 00:30 a place open "18:00–02:00" is
 * still open on yesterday's hours, and "today" for the label is still the
 * calendar day the clock says.
 */
export function openStateFor(
  hours: readonly OpeningHours[],
  now: Date,
  timeZoneId: string,
  locale: Locale = 'en',
): OpenState {
  const today = branchDayKey(now, timeZoneId);
  const t = now.getTime();

  const isOpenOn = (dateKey: string): boolean => {
    const entry = hoursOn(hours, dateKey);
    if (!entry) return false;
    const { opens, closes } = serviceWindow(entry, dateKey, timeZoneId);
    return t >= opens.getTime() && t < closes.getTime();
  };
  const isOpen = isOpenOn(today) || isOpenOn(shiftDateKey(today, -1));

  const todays = hoursOn(hours, today);
  if (!todays) return { isOpen, todayLabel: '' };
  return {
    isOpen,
    opensAt: todays.open,
    closesAt: todays.close,
    todayLabel: `${formatClock(todays.open, locale)} – ${formatClock(todays.close, locale)}`,
  };
}

/** Minutes until the place opens today, or null when it is open or shut all day. */
export function minutesUntilOpen(place: Place, now: Date): number | null {
  const today = branchDayKey(now, place.timeZoneId);
  const todays = hoursOn(place.hours, today);
  if (!todays) return null;
  const { opens } = serviceWindow(todays, today, place.timeZoneId);
  const diff = opens.getTime() - now.getTime();
  return diff > 0 ? Math.ceil(diff / MINUTE_MS) : null;
}
