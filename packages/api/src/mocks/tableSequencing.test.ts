import { describe, expect, it } from 'vitest';
import { tableTiming, type SequencedBooking } from './tableSequencing';

/**
 * The table-sequencing rules, pure — one table, the bookings already on it,
 * and a start somebody asks about. The mock books and answers availability
 * through these, as the server does through `ReservationRules`, so they are
 * pinned here once, against the written rules:
 *
 * 1. within 90 minutes after an earlier booking starts: refused;
 * 2. later than 45 minutes before the next one: refused; a sitting that would
 *    run into the next one is cut to its start less 5 minutes, and the diner
 *    must agree to that;
 * 3. 90–180 minutes after an earlier booking (or while it would still be
 *    sitting): requestable — the earlier guest, or the floor, decides;
 * 4. otherwise free.
 */

const TURN = 90;
const at = (hhmm: string) => `2026-10-20T${hhmm}:00.000Z`;

/** A booking on the table with the usual sitting. */
function booked(id: string, start: string, endMinutes = TURN): SequencedBooking {
  const startUtc = at(start);
  return {
    id,
    startUtc,
    endUtc: new Date(Date.parse(startUtc) + endMinutes * 60_000).toISOString(),
    promisedFreeByUtc: null,
  };
}

const timing = (start: string, bookings: readonly SequencedBooking[]) =>
  tableTiming({ startUtc: at(start), turnMinutes: TURN, bookings });

describe('an empty table', () => {
  it('is free, and nothing is cut short', () => {
    expect(timing('16:00', [])).toEqual({
      kind: 'free',
      mustFreeByUtc: null,
      nextStartUtc: null,
    });
  });
});

describe('after an earlier booking (16:00)', () => {
  const earlier = [booked('p', '16:00')];

  it('refuses the 90 minutes after it starts, its own start included', () => {
    expect(timing('16:00', earlier)).toEqual({ kind: 'refused', because: 'justBooked' });
    expect(timing('17:15', earlier)).toEqual({ kind: 'refused', because: 'justBooked' });
  });

  it('is requestable from 90 minutes after it starts, asking to be gone 5 minutes before', () => {
    expect(timing('17:30', earlier)).toEqual({
      kind: 'requestable',
      previousId: 'p',
      freeByUtc: at('17:25'),
      mustFreeByUtc: null,
      nextStartUtc: null,
    });
    expect(timing('18:45', earlier).kind).toBe('requestable');
  });

  it('is free from three hours after it starts', () => {
    expect(timing('19:00', earlier).kind).toBe('free');
  });

  it('stays requestable while a long sitting would still run, three hours or not', () => {
    const long = [booked('p', '16:00', 200)];
    expect(timing('19:00', long).kind).toBe('requestable');
    expect(timing('19:30', long).kind).toBe('free');
  });

  it('is free when the guest before already promised to be gone in time', () => {
    const promised: SequencedBooking[] = [
      { ...booked('p', '16:00'), endUtc: at('17:40'), promisedFreeByUtc: at('17:40') },
    ];
    expect(timing('17:45', promised).kind).toBe('free');
    // A promise that does not leave the clearing time is no help.
    expect(timing('17:30', promised).kind).toBe('requestable');
  });
});

describe('before a later booking (21:30)', () => {
  const later = [booked('n', '21:30')];

  it('is free and uncut when the whole sitting and the clearing time fit', () => {
    expect(timing('19:55', later)).toEqual({
      kind: 'free',
      mustFreeByUtc: null,
      nextStartUtc: at('21:30'),
    });
  });

  it('cuts a sitting that would run into it to its start less 5 minutes', () => {
    expect(timing('20:00', later)).toEqual({
      kind: 'free',
      mustFreeByUtc: at('21:25'),
      nextStartUtc: at('21:30'),
    });
    expect(timing('20:45', later).kind).toBe('free');
  });

  it('refuses a start later than 45 minutes before it', () => {
    expect(timing('20:46', later)).toEqual({ kind: 'refused', because: 'nextTooSoon' });
    expect(timing('21:30', later).kind).toBe('refused');
  });
});

describe('between two bookings', () => {
  it('can be both requestable and cut short', () => {
    const both = [booked('p', '16:00'), booked('n', '19:00')];
    expect(timing('17:30', both)).toEqual({
      kind: 'requestable',
      previousId: 'p',
      freeByUtc: at('17:25'),
      mustFreeByUtc: at('18:55'),
      nextStartUtc: at('19:00'),
    });
  });

  it('judges by the latest booking before and the earliest after, not by every one', () => {
    const many = [
      booked('a', '10:00'),
      booked('p', '13:00'),
      booked('n', '20:00'),
      booked('z', '23:00'),
    ];
    expect(timing('16:30', many)).toEqual({
      kind: 'free',
      mustFreeByUtc: null,
      nextStartUtc: at('20:00'),
    });
  });
});
