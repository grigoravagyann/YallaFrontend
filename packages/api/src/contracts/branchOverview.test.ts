import { describe, expect, it } from 'vitest';
import { overviewRowState, type OverviewBooking } from './branchOverview';

/**
 * What a row of today's bookings is (VC2 wire, revision 2). The server lists
 * no cancelled or declined booking, so nothing is hidden on the client; a
 * confirmed booking whose change waits is listed at the slot it keeps as
 * `pendingApproval` with `changeRequested`, and is not a request to answer
 * from its row.
 */

const NOW = new Date('2026-10-18T14:42:00Z');
const ROW: OverviewBooking = {
  id: 'r-1',
  code: 'K7Q2',
  status: 'confirmed',
  startUtc: '2026-10-18T15:30:00Z',
  endUtc: '2026-10-18T17:30:00Z',
  localDate: '2026-10-18',
  localStartTime: '19:30:00',
  partySize: 2,
  guestName: 'Narine T.',
  tableId: 't-1',
  tableLabel: '1',
  tableStatus: 'free',
  roomName: null,
  channel: 'app',
  changeRequested: false,
  holdExpiresAtUtc: null,
  lateNudgeAtUtc: null,
  lateNudgeSent: null,
};

describe('a row of today', () => {
  it('tells a change waiting for an answer from a request', () => {
    const waiting = { ...ROW, status: 'pendingApproval' as const };
    expect(overviewRowState(waiting, NOW)).toBe('pending');
    expect(overviewRowState({ ...waiting, changeRequested: true }, NOW)).toBe('changeRequested');
  });

  it('is late once a confirmed start has passed, grace or not', () => {
    expect(overviewRowState({ ...ROW, startUtc: '2026-10-18T14:41:00Z' }, NOW)).toBe('late');
    expect(overviewRowState(ROW, NOW)).toBe('confirmed');
  });

  it('shows a booking just called off as cancelled until the next read drops it', () => {
    expect(overviewRowState({ ...ROW, status: 'cancelledByVenue' }, NOW)).toBe('cancelled');
  });

  it('reads a status this build does not know as unknown, never as confirmed', () => {
    expect(overviewRowState({ ...ROW, status: 'unknown' }, NOW)).toBe('unknown');
  });
});
