import { describe, expect, it } from 'vitest';
import {
  answerWindowClosed,
  approvalExpiryFor,
  isShortNotice,
  localDateAndTime,
} from './approvalWindow';

/**
 * The server's short-notice rule and answer window, as the mocks apply them.
 * Yerevan is UTC+4 all year, so the instants below read easily.
 */

const YEREVAN = 'Asia/Yerevan';
/** 14:00 in Yerevan. */
const NOW = new Date('2026-10-18T10:00:00Z');

describe('isShortNotice', () => {
  it('is a booking for later today at the branch, however many hours away', () => {
    // 23:30 Yerevan, nine and a half hours out.
    expect(isShortNotice({ startUtc: '2026-10-18T19:30:00Z', timeZoneId: YEREVAN, now: NOW })).toBe(
      true,
    );
  });

  it('is a booking under six hours away even when it is tomorrow at the branch', () => {
    const lateEvening = new Date('2026-10-18T18:00:00Z'); // 22:00
    // 01:00 tomorrow, three hours out.
    expect(
      isShortNotice({ startUtc: '2026-10-18T21:00:00Z', timeZoneId: YEREVAN, now: lateEvening }),
    ).toBe(true);
  });

  it('is not a booking for another day six hours or more away', () => {
    // 19:00 tomorrow.
    expect(isShortNotice({ startUtc: '2026-10-19T15:00:00Z', timeZoneId: YEREVAN, now: NOW })).toBe(
      false,
    );
  });

  it("reads today in the branch's zone, not in UTC", () => {
    // 02:00 Yerevan on the 19th is still the 18th in UTC; the branch's today
    // is the 19th, so a 21:00 booking that day is short notice.
    const earlyMorning = new Date('2026-10-18T22:00:00Z');
    expect(
      isShortNotice({ startUtc: '2026-10-19T17:00:00Z', timeZoneId: YEREVAN, now: earlyMorning }),
    ).toBe(true);
  });
});

describe('approvalExpiryFor', () => {
  it('gives the floor fifteen minutes from the request', () => {
    expect(approvalExpiryFor(NOW, '2026-10-18T12:00:00Z')).toBe('2026-10-18T10:15:00.000Z');
  });

  it('closes at the start when the booking begins sooner than that', () => {
    expect(approvalExpiryFor(NOW, '2026-10-18T10:10:00Z')).toBe('2026-10-18T10:10:00.000Z');
  });

  it('takes a shorter window, for walking the expiry in the mock', () => {
    expect(approvalExpiryFor(NOW, '2026-10-18T12:00:00Z', 60_000)).toBe('2026-10-18T10:01:00.000Z');
  });
});

describe('answerWindowClosed', () => {
  it('is open until the window closes, and closed from that instant', () => {
    const expires = '2026-10-18T10:15:00Z';
    const start = '2026-10-18T12:00:00Z';
    expect(answerWindowClosed(expires, start, new Date('2026-10-18T10:14:59Z'))).toBe(false);
    expect(answerWindowClosed(expires, start, new Date('2026-10-18T10:15:00Z'))).toBe(true);
  });

  it('is closed once the booking has started, window or none', () => {
    expect(answerWindowClosed(null, '2026-10-18T09:00:00Z', NOW)).toBe(true);
    expect(answerWindowClosed(null, '2026-10-18T12:00:00Z', NOW)).toBe(false);
  });
});

describe('localDateAndTime', () => {
  it("writes the branch's own day and wall clock", () => {
    expect(localDateAndTime('2026-10-18T21:30:00Z', YEREVAN)).toEqual({
      localDate: '2026-10-19',
      localStartTime: '01:30:00',
    });
  });
});
