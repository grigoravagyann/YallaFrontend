import type { PublicTakeawayInfo, TableUnavailableReason } from '@yalla/api';
import { branchDayKey, instantFromZonedClock, intlTag, type Locale } from '@yalla/format';

/**
 * A place the diner can browse: one branch of a venue, photographed.
 *
 * `id` is the API **branch** id. The booking confirmation, the room photos and
 * the scan flow all key on the branch, so a place opened from Explore has to
 * hand the same id on — a second id scheme here would break every one of them.
 */

export type PlaceType = 'restaurant' | 'cafe' | 'bar';

/** Every kind of place, in the order a filter offers them. */
export const PLACE_TYPES: readonly PlaceType[] = ['cafe', 'restaurant', 'bar'];

/** Content badges. Never "open" or "closed" — availability is `openState`. */
export type PlaceBadge = 'popular' | 'new';

/** Live state of one table, as the photo pins show it. Out of service is grey, never offered. */
export type TableStatus = 'free' | 'reserved' | 'occupied' | 'outOfService';

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

/**
 * One date that does not follow the week — a holiday, a closure, different
 * hours. It replaces that date's weekly blocks entirely; no blocks is closed
 * all day. A date's blocks are the ones that open on it, as with the week.
 */
export interface PlaceSpecialDay {
  /** `YYYY-MM-DD` in the place's zone. */
  readonly date: string;
  /** The venue's word for it ("New Year"), or null. */
  readonly note: string | null;
  readonly blocks: readonly { readonly open: ClockTime; readonly close: ClockTime }[];
}

export interface OpenState {
  readonly isOpen: boolean;
  /**
   * The opening time of today's block serving now, else the next one, else the
   * last — `HH:mm` in the place's zone. Absent when shut all day.
   */
  readonly opensAt?: ClockTime;
  readonly closesAt?: ClockTime;
  /**
   * Every block today ready to read out — "08:00 – 23:00", or "12:00 – 15:00,
   * 18:00 – 23:00" for a split service — or '' when shut all day.
   */
  readonly todayLabel: string;
  /** Today is a special day: its note, said beside the hours ("New Year"). */
  readonly todayNote?: string;
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
  /** Stable across refetches; the author's shown name and the day are not unique. */
  readonly id: string;
  readonly author: string;
  /** 1–5. */
  readonly rating: number;
  readonly text: string;
  /** ISO-8601 date, `YYYY-MM-DD`. */
  readonly date: string;
  /** Revised since it was first written. Absent in the mock seeds, which are never edited. */
  readonly edited?: boolean;
  /** The venue's public answer under it. Absent in the mock seeds, which have none. */
  readonly reply?: ReviewReplyView | null;
}

/** The venue's reply as the place page shows it: the words, who signed them, and the day. */
export interface ReviewReplyView {
  readonly text: string;
  /** Signed short by the server ("Aram H."); null when the role signs alone. */
  readonly authorName: string | null;
  readonly authorRole: 'owner' | 'generalManager' | 'manager';
  /** ISO-8601 date, `YYYY-MM-DD`, of the last change, in the branch's zone. */
  readonly date: string;
  readonly edited: boolean;
  /** The diner changed the review after this answer: it may no longer fit. */
  readonly reviewEditedAfter: boolean;
}

/** One page of a place's reviews, newest first. */
export interface ReviewPage {
  readonly reviews: readonly Review[];
  /** Every visible review of the place, across all pages. */
  readonly total: number;
  /** 1-based. */
  readonly page: number;
  readonly pageSize: number;
}

/** The server's page size for `GET /api/public/branches/{id}/reviews`. */
export const REVIEW_PAGE_SIZE = 20;

/** The page after `last`, or `undefined` when `last` was the final one. */
export function nextReviewPage(last: ReviewPage | null | undefined): number | undefined {
  if (!last) return undefined;
  if (last.reviews.length < last.pageSize) return undefined;
  if (last.page * last.pageSize >= last.total) return undefined;
  return last.page + 1;
}

/**
 * A table pinned on one photo of its room.
 *
 * `x`/`y` are fractions (0 left/top to 1) of that photo itself, so the pin
 * lands on the same table however the photo is scaled — the screen draws it on
 * the box the photo is actually rendered in, never on a frame around it.
 * `tableId` is the id the booking flow takes.
 */
export interface TablePhotoMarker {
  readonly tableId: string;
  readonly label: string;
  readonly status: TableStatus;
  /** False for a table the venue never takes bookings for: drawn, never offered. */
  readonly isBookable: boolean;
  /**
   * Why the slot will not give it to this party, as the server said: `closed`,
   * `alreadyBooked`, `tooSmall`. Only known at a slot; absent on the live rooms.
   */
  readonly unavailableReason?: TableUnavailableReason | null;
  /**
   * Booked just before the slot, and this party's only by asking: the guest
   * before answers in the app (`earlierGuest`), or the venue checks with them
   * tonight (`venue`). Only known at a slot; absent or `null` otherwise.
   */
  readonly request?: TableRequestKind | null;
  readonly capacityMin: number;
  readonly capacityMax: number;
  readonly x: number;
  readonly y: number;
}

/** Whom a table booked just before the slot is asked of. */
export type TableRequestKind = 'earlierGuest' | 'venue';

/** One photo of a room, and the tables pinned on it. */
export interface RoomPhoto {
  readonly photoId: string;
  /** The large rendition, drawn under the pins. */
  readonly url: string;
  /** The small one, for a thumb. */
  readonly thumbUrl: string;
  /** Pixels; `null` for a photo stored before sizes were — measured once it loads. */
  readonly width: number | null;
  readonly height: number | null;
  readonly tables: readonly TablePhotoMarker[];
}

/** A room a diner picks: Hall, Terrace. Never without a photo; photos in the venue's order. */
export interface PlaceRoom {
  readonly roomId: string;
  readonly name: string;
  readonly photos: readonly RoomPhoto[];
}

export interface Place {
  readonly id: string;
  readonly venueId: string;
  /** The public page's address, `lumen-coffee` — what booking rules are read with. Never an id. */
  readonly venueSlug: string;
  /** `cascade`, as above. */
  readonly branchSlug: string;
  /** The venue on its own, for a title line. */
  readonly venueName: string;
  /** The branch on its own, for the line under the venue. */
  readonly branchName: string;
  /** "Venue · Branch" when the branch has a name of its own, else the venue — see `placeName`. */
  readonly name: string;
  readonly type: PlaceType;
  /** "Armenian & Mediterranean" — free text from the venue, not a key. */
  readonly cuisine: string;
  /** `null` when unknown: no position from the phone, or no coordinates for the place. */
  readonly distanceKm: number | null;
  /** 0–5, one decimal. `null` until the first review — never a stand-in zero. */
  readonly rating: number | null;
  readonly ratingCount: number;
  readonly badges: readonly PlaceBadge[];
  readonly openState: OpenState;
  /** Remote URLs. The first is the hero. */
  readonly photos: readonly string[];
  /** `null` when the venue has not set a location: no pin, no directions. */
  readonly coords: Coordinates | null;
  readonly address: string;
  /**
   * The area of town the venue names for itself — "Kentron", "Arabkir". Free
   * text, never a key; `null` when the venue has not set one.
   */
  readonly district: string | null;
  readonly phone?: string;
  readonly website?: string;
  /** IANA zone every one of its hours is read in. */
  readonly timeZoneId: string;
  readonly hours: readonly OpeningHours[];
  /**
   * The special days ahead, each replacing its date's weekly hours. Absent on
   * a list card and from a server that does not send them.
   */
  readonly specialDays?: readonly PlaceSpecialDay[];
  /** Keys under `place.amenity.*` — `outdoorSeating`, `wifi`, `parking`, `cardPayment`, `vegan`. */
  readonly amenities: readonly string[];
  readonly about: string;
  /**
   * Whether the app may book a table here (K9): the venue's online bookings are
   * on and its reservation policy has been reviewed. `null` on a list card, which
   * does not carry it; known once the place's own page has been read.
   */
  readonly acceptsAppBookings: boolean | null;
  /**
   * Whether the place takes takeaway orders from the app, and how long they
   * take (2026-10-22): the "Order to take away" button and its info card.
   * Absent on a list card, which does not carry it. Whether it is open for
   * orders now is the availability's (`useTakeawayAvailability`).
   */
  readonly takeaway?: PublicTakeawayInfo;
  /**
   * The newest few, from the place's page. The whole list pages through
   * `PlaceRepository.reviewPage`; the menu is read on its own through
   * `PlaceRepository.menu`, so a menu that fails leaves the place standing.
   */
  readonly reviews: readonly Review[];
  /**
   * The rooms with their photos and pins, in the venue's order, as the
   * place's page last read them. Empty on a list card, and for a place that
   * has not photographed a room yet.
   */
  readonly rooms: readonly PlaceRoom[];
}

/** A place the map can pin: one whose venue has set a location. */
export type LocatedPlace = Place & { readonly coords: Coordinates };

export function isLocated(place: Place): place is LocatedPlace {
  return place.coords !== null;
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

/**
 * Every opening block on that date, earliest first: its special day's when it
 * is one, else its weekday's. A split service — lunch 12:00–15:00, dinner
 * 18:00–23:00 — is two blocks on one day.
 */
export function hoursBlocksOn(
  hours: readonly OpeningHours[],
  dateKey: string,
  specialDays: readonly PlaceSpecialDay[] = [],
): OpeningHours[] {
  const weekday = weekdayOf(dateKey);
  // A special day replaces the week's blocks for its date, closed included.
  const special = specialDays.find((day) => day.date === dateKey);
  if (special) {
    return special.blocks
      .map((block) => ({ day: weekday, open: block.open, close: block.close }))
      .sort((a, b) => a.open.localeCompare(b.open));
  }
  return hours
    .filter((entry) => entry.day === weekday)
    .sort((a, b) => a.open.localeCompare(b.open));
}

/** The earliest block on that weekday. A split day has more: see {@link hoursBlocksOn}. */
export function hoursOn(hours: readonly OpeningHours[], dateKey: string): OpeningHours | null {
  return hoursBlocksOn(hours, dateKey)[0] ?? null;
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
 * calendar day the clock says. Every block of a day counts: a place that
 * closes between lunch and dinner is open again at 19:30.
 */
export function openStateFor(
  hours: readonly OpeningHours[],
  now: Date,
  timeZoneId: string,
  locale: Locale = 'en',
  specialDays: readonly PlaceSpecialDay[] = [],
): OpenState {
  const today = branchDayKey(now, timeZoneId);
  const t = now.getTime();
  const note = specialDays.find((day) => day.date === today)?.note ?? null;
  const noted = note ? { todayNote: note } : {};

  const windowsOn = (dateKey: string) =>
    hoursBlocksOn(hours, dateKey, specialDays).map((block) => ({
      block,
      ...serviceWindow(block, dateKey, timeZoneId),
    }));

  const todays = windowsOn(today);
  const isOpen = [...todays, ...windowsOn(shiftDateKey(today, -1))].some(
    ({ opens, closes }) => t >= opens.getTime() && t < closes.getTime(),
  );
  if (todays.length === 0) return { isOpen, todayLabel: '', ...noted };

  // The block serving now, else the next one today, else the day's last: at
  // 16:00 a place open 12:00–15:00 and 18:00–23:00 says when dinner starts.
  const shown = (todays.find(({ closes }) => t < closes.getTime()) ?? todays[todays.length - 1]!)
    .block;
  return {
    isOpen,
    opensAt: shown.open,
    closesAt: shown.close,
    todayLabel: todays
      .map(
        ({ block }) => `${formatClock(block.open, locale)} – ${formatClock(block.close, locale)}`,
      )
      .join(', '),
    ...noted,
  };
}

/** Minutes until the place next opens today, or null when it is open or opens no more today. */
export function minutesUntilOpen(place: Place, now: Date): number | null {
  const today = branchDayKey(now, place.timeZoneId);
  const t = now.getTime();
  const windows = hoursBlocksOn(place.hours, today, place.specialDays).map((block) =>
    serviceWindow(block, today, place.timeZoneId),
  );
  if (windows.some(({ opens, closes }) => t >= opens.getTime() && t < closes.getTime())) {
    return null;
  }
  const next = windows.find(({ opens }) => opens.getTime() > t);
  return next ? Math.ceil((next.opens.getTime() - t) / MINUTE_MS) : null;
}
