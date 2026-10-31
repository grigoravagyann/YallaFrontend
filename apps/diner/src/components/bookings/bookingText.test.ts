import { describe, expect, it } from 'vitest';
import {
  bookedByTime,
  bookingShareLine,
  sittingEndLines,
  tableLine,
  tableWithRoom,
} from './bookingText';

const BOOKING = {
  tableLabel: '4',
  roomName: 'Hall',
  branchName: 'Northern Avenue',
  code: 'K7M2QX',
};

describe('tableWithRoom', () => {
  it('names the room after the table when the server said which', () => {
    expect(tableWithRoom(BOOKING)).toBe('4 · Hall');
  });

  it('is the table alone when there is no room, or only a blank one', () => {
    expect(tableWithRoom({ ...BOOKING, roomName: null })).toBe('4');
    expect(tableWithRoom({ ...BOOKING, roomName: '  ' })).toBe('4');
  });
});

describe('a booking with no table yet (booked by time only)', () => {
  const NO_TABLE = { ...BOOKING, tableLabel: null, bookedWithoutTable: true };

  it('names no table: the venue chooses it on arrival', () => {
    expect(tableWithRoom(NO_TABLE)).toBeNull();
    expect(tableLine(NO_TABLE)).toEqual({ key: 'booking.byTime.table', params: {} });
    expect(tableLine(BOOKING)).toEqual({ key: 'tables.table', params: { label: '4 · Hall' } });
  });

  it('is by time only until seated and after: the flag, or no table at all', () => {
    expect(bookedByTime(NO_TABLE)).toBe(true);
    // Seated at the table the waiter chose: still made by time only.
    expect(bookedByTime({ ...NO_TABLE, tableLabel: '7' })).toBe(true);
    expect(bookedByTime({ ...BOOKING, bookedWithoutTable: false })).toBe(false);
  });

  it('shares the place, the time and the code, and no table', () => {
    expect(bookingShareLine(NO_TABLE, 'Lumen Coffee', '18 Oct · 19:30')).toEqual({
      key: 'booking.byTime.shareMessage',
      params: {
        venue: 'Lumen Coffee',
        branch: 'Northern Avenue',
        time: '18 Oct · 19:30',
        code: 'K7M2QX',
      },
    });
  });
});

describe('bookingShareLine', () => {
  it('shares the room with the table when there is one', () => {
    expect(bookingShareLine(BOOKING, 'Lumen Coffee', '18 Oct · 19:30')).toEqual({
      key: 'success.shareMessageRoom',
      params: {
        table: '4',
        room: 'Hall',
        venue: 'Lumen Coffee',
        branch: 'Northern Avenue',
        time: '18 Oct · 19:30',
        code: 'K7M2QX',
      },
    });
  });

  it('keeps today’s sentence without one', () => {
    expect(bookingShareLine({ ...BOOKING, roomName: null }, 'Lumen Coffee', 'x').key).toBe(
      'success.shareMessage',
    );
  });
});

describe('sittingEndLines', () => {
  const ENDS = {
    endUtc: '2026-10-20T15:30:00.000Z',
    timeZoneId: 'Asia/Yerevan',
    promisedFreeByUtc: null as string | null,
  };

  it('says until when the sitting ends', () => {
    expect(sittingEndLines(ENDS, 'en')).toEqual([
      { key: 'bookings.detail.until', params: { time: '19:30' } },
    ]);
  });

  it('says only the end when the promise is the end — a sooner promise cuts it to it', () => {
    expect(sittingEndLines({ ...ENDS, promisedFreeByUtc: '2026-10-20T15:30:00Z' }, 'en')).toEqual([
      { key: 'bookings.detail.until', params: { time: '19:30' } },
    ]);
  });

  it('keeps the end, and the promise beside it, when the promise is later — it never lengthens', () => {
    expect(sittingEndLines({ ...ENDS, promisedFreeByUtc: '2026-10-20T15:40:00Z' }, 'en')).toEqual([
      { key: 'bookings.detail.until', params: { time: '19:30' } },
      { key: 'booking.freeBy.promised', params: { time: '19:40' } },
    ]);
  });
});
