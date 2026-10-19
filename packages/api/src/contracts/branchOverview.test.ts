import { describe, expect, it } from 'vitest';
import { overviewRowState, type OverviewBooking } from './branchOverview';

/**
 * What a row of today's bookings is. A declined request is a cancelled row
 * with a reason; a confirmed booking whose change was declined keeps the
 * reason and is still a live booking — hiding it would lose a party that is
 * coming.
 */

const NOW = new Date('2026-10-18T14:42:00Z');
const ROW: OverviewBooking = {
  id: 'r-1',
  code: 'K7Q2',
  status: 'confirmed',
  startUtc: '2026-10-18T15:30:00Z',
  endUtc: '2026-10-18T17:30:00Z',
  localStartTime: '19:30:00',
  partySize: 2,
  guestName: 'Narine T.',
  tableId: 't-1',
  tableLabel: '1',
  tableStatus: 'free',
  roomName: null,
  channel: 'app',
  declinedBecause: null,
  holdExpiresAtUtc: null,
  lateNudgeAtUtc: null,
};

describe('a row of today', () => {
  it('keeps a confirmed booking whose change was declined on the list', () => {
    expect(overviewRowState({ ...ROW, declinedBecause: 'staffDeclined' }, NOW)).toBe('confirmed');
  });

  it('leaves out a declined request, and keeps a booking the venue called off', () => {
    const cancelled = { ...ROW, status: 'cancelledByVenue' as const };
    expect(overviewRowState({ ...cancelled, declinedBecause: 'noAnswer' }, NOW)).toBe('declined');
    expect(overviewRowState(cancelled, NOW)).toBe('cancelled');
  });

  it('is late once a confirmed start has passed, grace or not', () => {
    expect(overviewRowState({ ...ROW, startUtc: '2026-10-18T14:41:00Z' }, NOW)).toBe('late');
  });
});
