import { describe, expect, it } from 'vitest';
import { icsEvent, icsFileName, zoneOffsetAt, zonedParts } from './calendar';

/**
 * The device's own zone is set to Moscow for this file.
 *
 * That is the actual hazard, not a contrived one: the visitor this page exists
 * for is a tourist, their phone is an hour ahead of Yerevan, and a calendar
 * file that quietly used the device's clock would put them at the door an hour
 * late with a booking that says they are on time. Every assertion below would
 * still pass against a buggy implementation if the test ran in UTC+4.
 */
process.env['TZ'] = 'Europe/Moscow';

const YEREVAN = 'Asia/Yerevan';
/** 20:00 in Yerevan, which is 21:00 in Moscow and 16:00 UTC. */
const START = new Date('2026-09-06T16:00:00Z');
const END = new Date('2026-09-06T17:45:00Z');

function event(overrides: Partial<Parameters<typeof icsEvent>[0]> = {}): string {
  return icsEvent({
    uid: 'yalla-bk-1@yalla.am',
    startUtc: START,
    endUtc: END,
    timeZoneId: YEREVAN,
    summary: 'Table 7 at Lumen Coffee',
    location: 'Northern Avenue 5, Yerevan',
    description: 'Booking code 481920.',
    url: 'https://yalla.am/lumen-coffee/northern-avenue/booking/tok',
    now: new Date('2026-09-06T12:00:00Z'),
    ...overrides,
  });
}

describe('the device clock never reaches the file', () => {
  it('writes the start in the branch zone, not the device zone', () => {
    // 21:00 would be Moscow; 16:00 would be UTC. Neither is the table.
    expect(event()).toContain('DTSTART;TZID=Asia/Yerevan:20260906T200000');
    expect(event()).not.toContain('T210000');
    expect(event()).not.toContain('DTSTART:20260906T160000Z');
  });

  it('writes the end in the branch zone too', () => {
    expect(event()).toContain('DTEND;TZID=Asia/Yerevan:20260906T214500');
  });

  it('declares the zone it used, with the offset read from the instant', () => {
    const ics = event();
    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics).toContain('TZID:Asia/Yerevan');
    expect(ics).toContain('TZOFFSETTO:+0400');
    expect(ics).toContain('TZNAME:+04');
  });

  it('reads the same wall clock for a zone behind UTC', () => {
    // A sanity check on the parts reader itself: 16:00Z is 12:00 in New York.
    expect(zonedParts(START, 'America/New_York')).toMatchObject({ hour: 12, minute: 0 });
    expect(zoneOffsetAt(START, 'America/New_York')).toBe('-0400');
  });
});

describe('the file itself', () => {
  it('is CRLF-delimited and wrapped in a single VEVENT', () => {
    const ics = event();
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.split('BEGIN:VEVENT').length - 1).toBe(1);
  });

  it('escapes the comma in an address rather than splitting the value', () => {
    expect(event()).toContain('LOCATION:Northern Avenue 5\\, Yerevan');
  });

  it('carries the cancellation link, so the event is the way back out', () => {
    expect(event()).toContain('/booking/tok');
  });

  it('folds every line to 75 octets', () => {
    const ics = icsEvent({
      uid: 'yalla-bk-2@yalla.am',
      startUtc: START,
      endUtc: END,
      timeZoneId: YEREVAN,
      // Armenian is two bytes a letter: folding by character count would leave
      // lines that are legal to nobody.
      summary: 'Սեղան 7՝ Լումեն Սրճարան, Հյուսիսային պողոտա, Երևան, Հայաստան',
      location: 'Հյուսիսային պողոտա 5, Երևան 0001, Հայաստանի Հանրապետություն',
      description: 'Ամրագրման կոդը՝ 481920։ Չեղարկեք հղումով, եթե ծրագրերը փոխվեն։',
      url: 'https://yalla.am/lumen-coffee/northern-avenue/booking/a-fairly-long-signed-token-value',
      now: new Date('2026-09-06T12:00:00Z'),
    });

    const encoder = new TextEncoder();
    for (const line of ics.split('\r\n')) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it('never splits a UTF-8 sequence when folding', () => {
    const ics = icsEvent({
      uid: 'u',
      startUtc: START,
      endUtc: END,
      timeZoneId: YEREVAN,
      summary: 'Ա'.repeat(120),
      location: '',
      description: '',
      now: new Date('2026-09-06T12:00:00Z'),
    });
    // Unfolding must recover the original run of characters intact.
    const unfolded = ics.replace(/\r\n /gu, '');
    expect(unfolded).toContain(`SUMMARY:${'Ա'.repeat(120)}`);
    expect(unfolded).not.toContain('�');
  });
});

describe('a booking that straddles a clock change', () => {
  it('falls back to unambiguous UTC instants rather than one wrong offset', () => {
    // Europe/London, the night the clocks go back: 01:30 to 02:30 local spans
    // BST -> GMT, and no single-offset VTIMEZONE can describe it.
    const ics = icsEvent({
      uid: 'u',
      startUtc: new Date('2026-10-25T00:30:00Z'),
      endUtc: new Date('2026-10-25T02:30:00Z'),
      timeZoneId: 'Europe/London',
      summary: 'Late table',
      location: 'London',
      description: '',
      now: new Date('2026-10-24T12:00:00Z'),
    });

    expect(ics).not.toContain('BEGIN:VTIMEZONE');
    expect(ics).toContain('DTSTART:20261025T003000Z');
    expect(ics).toContain('DTEND:20261025T023000Z');
  });
});

describe('the filename', () => {
  it('is recognisable and ASCII', () => {
    expect(icsFileName('Lumen Coffee')).toBe('lumen-coffee-booking.ics');
  });

  it('degrades to a usable name rather than an empty one', () => {
    expect(icsFileName('Լումեն')).toBe('yalla-booking.ics');
  });
});
