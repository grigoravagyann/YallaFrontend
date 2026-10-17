import { describe, expect, it } from 'vitest';
import { bookingShareLine, tableWithRoom } from './bookingText';

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
