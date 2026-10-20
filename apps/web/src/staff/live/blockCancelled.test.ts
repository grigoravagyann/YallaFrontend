import type { AwaitingApproval, FloorChange, StaffFloor, StaffTableDetail } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { blockCancelledNews } from './blockCancelled';

/** What the floor is told when a guest's no-show block cancels bookings at this branch (review S6). */

const NOW = new Date('2026-10-21T15:00:00.000Z');
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

function detail(tableId: string, nextReservationId: string | null, start: string | null) {
  return {
    tableId,
    label: tableId.slice(1),
    nextReservationId,
    nextReservationStartUtc: start,
  } as unknown as StaffTableDetail;
}

const floor = {
  plan: { areas: [], tables: [] },
  details: [detail('t4', 'r-next', at(40)), detail('t9', null, null)],
  lastSequence: 10,
  asOfUtc: NOW.toISOString(),
} as unknown as StaffFloor;

function cancelled(reservationId: string, tableLabel: string): FloorChange {
  return {
    sequence: 11,
    tableId: `t${tableLabel}`,
    tableLabel,
    fromStatus: 'free',
    toStatus: 'free',
    atUtc: NOW.toISOString(),
    tableSessionId: null,
    reservationId,
    actor: 'system',
    actorId: null,
    reason: '',
    tabId: null,
    signal: 'bookingCancelledByBlock',
  };
}

describe('the bookings a block cancelled, as news for the floor', () => {
  it("names a table's next booking, with its time", () => {
    expect(blockCancelledNews([cancelled('r-next', '4')], floor, [], NOW)).toEqual([
      { tableLabel: '4', startUtc: at(40) },
    ]);
  });

  it('names a request waiting here that starts soon', () => {
    const request = { id: 'r-ask', startUtc: at(90) } as AwaitingApproval;
    expect(blockCancelledNews([cancelled('r-ask', '9')], floor, [request], NOW)).toEqual([
      { tableLabel: '9', startUtc: at(90) },
    ]);
  });

  it('says nothing of a booking days ahead, or one this floor never showed', () => {
    const later = { id: 'r-later', startUtc: at(3 * 24 * 60) } as AwaitingApproval;
    expect(
      blockCancelledNews(
        [cancelled('r-later', '9'), cancelled('r-unknown', '2')],
        floor,
        [later],
        NOW,
      ),
    ).toEqual([]);
  });

  it('keeps several together, soonest first', () => {
    const request = { id: 'r-ask', startUtc: at(20) } as AwaitingApproval;
    const news = blockCancelledNews(
      [cancelled('r-next', '4'), cancelled('r-ask', '9')],
      floor,
      [request],
      NOW,
    );
    expect(news.map((entry) => entry.tableLabel)).toEqual(['9', '4']);
  });
});
