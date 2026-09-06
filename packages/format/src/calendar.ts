import type { Locale, TimeZone } from './locale';

/**
 * A booking as an `.ics` file.
 *
 * This exists because a table booked from the web has **no push channel**. The
 * phone app can send a reminder an hour before; a stranger who opened a link in
 * WhatsApp cannot be sent anything at all. An `.ics` is the one reminder
 * mechanism that needs no account, no app and no permission prompt — every
 * phone and desktop on earth already has something that opens it.
 *
 * ## Why the time is written in the branch's zone
 *
 * The whole hazard this file guards against is a tourist. Their phone is on
 * Europe/Moscow, their table is in Yerevan, and an event written as a bare UTC
 * instant would be displayed by their calendar in *their* zone — 21:00 for a
 * 20:00 table. Correct to the second and an hour late to the door.
 *
 * So the event is written as a floating local time tagged with the branch's
 * `TZID`, accompanied by a `VTIMEZONE` that tells the calendar what that zone's
 * offset actually is. The offset is read from `Intl` at the event's own instant
 * rather than assumed.
 *
 * The one case a single-offset `VTIMEZONE` cannot describe is a booking that
 * straddles a daylight-saving change. {@link icsEvent} detects that — the
 * offset at the start and at the end disagree — and falls back to UTC instants,
 * which are unambiguous even though they render in the reader's own zone.
 * Armenia has not observed DST since 2012, so for the launch market this is a
 * branch that never runs; it is here so that the first venue in a zone that
 * does observe it produces a correct file rather than an hour-wrong one.
 */

/** Parts of an instant as read in a given zone. */
interface ZonedParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: TimeZone): Intl.DateTimeFormat {
  const cached = partsCache.get(timeZone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone,
  });
  partsCache.set(timeZone, created);
  return created;
}

/** Wall-clock parts of `instant` as read in `timeZone`. */
export function zonedParts(instant: Date, timeZone: TimeZone): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value ?? '0';
    // `hour12: false` still renders midnight as 24 in some ICU versions.
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };
  const hour = read('hour');
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: hour === 24 ? 0 : hour,
    minute: read('minute'),
    second: read('second'),
  };
}

const offsetCache = new Map<string, Intl.DateTimeFormat>();

/**
 * The zone's UTC offset at one instant, as `+0400`.
 *
 * `longOffset` gives `GMT+04:00`; iCalendar wants `+0400`. A zone exactly on
 * UTC formats as bare `GMT`, which is `+0000`.
 */
export function zoneOffsetAt(instant: Date, timeZone: TimeZone): string {
  let formatter = offsetCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'longOffset' });
    offsetCache.set(timeZone, formatter);
  }
  const name =
    formatter.formatToParts(instant).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = /GMT([+-])(\d{2}):(\d{2})/u.exec(name);
  if (!match) return '+0000';
  return `${match[1]}${match[2]}${match[3]}`;
}

/** `20260906T200000` — a floating local timestamp. */
function localStamp(parts: ZonedParts): string {
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
  return (
    `${pad(parts.year, 4)}${pad(parts.month)}${pad(parts.day)}` +
    `T${pad(parts.hour)}${pad(parts.minute)}${pad(parts.second)}`
  );
}

/** `20260906T160000Z` — an instant. */
function utcStamp(instant: Date): string {
  return `${instant
    .toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}/u, '')}`;
}

/**
 * Escape a property value per RFC 5545 §3.3.11.
 *
 * Backslash first, or the escapes added below would be escaped again. A raw
 * comma in a `LOCATION` — which every Yerevan address has — silently splits the
 * value into a list in a conforming parser.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/gu, '\\\\')
    .replace(/;/gu, '\\;')
    .replace(/,/gu, '\\,')
    .replace(/\r?\n/gu, '\\n');
}

/**
 * Fold a content line to 75 octets, per RFC 5545 §3.1.
 *
 * Counted in UTF-8 bytes, not characters: an Armenian venue name is two bytes a
 * letter, and folding by character length produces lines that are legal to
 * nobody. Continuations begin with a single space. Unfolded long lines are
 * accepted by most clients and rejected by some — and the one that rejects them
 * is the one on the desk of the person who booked the table.
 */
function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let start = 0;
  // 75 for the first line, 74 thereafter — the leading space costs an octet.
  let limit = 75;

  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Never split a UTF-8 sequence: back up off any continuation byte.
    while (end > start && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end -= 1;
    chunks.push(decoder.decode(bytes.subarray(start, end)));
    start = end;
    limit = 74;
  }

  return chunks.join('\r\n ');
}

/**
 * A display name for a fixed offset, e.g. `+0400` -> `+04`, `+0530` -> `+0530`.
 *
 * `TZNAME` is what a calendar shows beside the time. The abbreviation a zone
 * actually uses is not derivable from an offset — and `Intl`'s `short` name for
 * Yerevan is "GMT+4", which is not a name either — so the numeric form is used,
 * which is what CLDR itself falls back to for zones with no abbreviation.
 */
function zoneName(offset: string): string {
  return offset.endsWith('00') ? offset.slice(0, 3) : offset;
}

export interface IcsEventInput {
  /**
   * Stable per booking. A calendar keyed on this replaces rather than
   * duplicates, so a person who downloads the file twice has one event.
   */
  readonly uid: string;
  readonly startUtc: Date;
  readonly endUtc: Date;
  /** The branch's IANA zone. The whole point of this module — see the header. */
  readonly timeZoneId: TimeZone;
  readonly summary: string;
  readonly location: string;
  readonly description: string;
  /** The manage-booking link, so the event itself carries the way to cancel. */
  readonly url?: string | undefined;
  /** Injectable so the output is byte-stable in a test. */
  readonly now?: Date | undefined;
}

/** The `.ics` body, CRLF-delimited as the format requires. */
export function icsEvent(input: IcsEventInput): string {
  const { uid, startUtc, endUtc, timeZoneId, summary, location, description, url } = input;
  const now = input.now ?? new Date();

  const startOffset = zoneOffsetAt(startUtc, timeZoneId);
  const endOffset = zoneOffsetAt(endUtc, timeZoneId);
  // A single STANDARD component can only describe a constant offset. When the
  // clocks change mid-booking, say the instant instead of saying it wrongly.
  const zoneIsStable = startOffset === endOffset;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Yalla//Table booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  if (zoneIsStable) {
    lines.push(
      'BEGIN:VTIMEZONE',
      `TZID:${timeZoneId}`,
      'BEGIN:STANDARD',
      'DTSTART:19700101T000000',
      `TZOFFSETFROM:${startOffset}`,
      `TZOFFSETTO:${startOffset}`,
      `TZNAME:${zoneName(startOffset)}`,
      'END:STANDARD',
      'END:VTIMEZONE',
    );
  }

  lines.push(
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    zoneIsStable
      ? `DTSTART;TZID=${timeZoneId}:${localStamp(zonedParts(startUtc, timeZoneId))}`
      : `DTSTART:${utcStamp(startUtc)}`,
    zoneIsStable
      ? `DTEND;TZID=${timeZoneId}:${localStamp(zonedParts(endUtc, timeZoneId))}`
      : `DTEND:${utcStamp(endUtc)}`,
    `SUMMARY:${escapeText(summary)}`,
    `LOCATION:${escapeText(location)}`,
    `DESCRIPTION:${escapeText(description)}`,
  );

  if (url) lines.push(`URL:${escapeText(url)}`);

  lines.push('STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR');

  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/**
 * A filename a person can recognise in their downloads folder.
 *
 * ASCII only, and not because of the filesystem: `Content-Disposition` and the
 * `download` attribute both mangle non-Latin names on at least one major
 * browser, and "________.ics" is worse than a transliterated one. The locale is
 * taken so a future per-language prefix has somewhere to go.
 */
export function icsFileName(venueName: string, _locale: Locale = 'en'): string {
  const slug = venueName
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .replace(/[^A-Za-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .toLowerCase();
  return `${slug || 'yalla'}-booking.ics`;
}
