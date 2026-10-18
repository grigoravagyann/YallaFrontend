import { describe, expect, it } from 'vitest';
import { isApprovalExpired } from '../contracts/approvals';
import { ConcurrencyConflictError } from '../errors';
import { createStaffMockGateway } from './staffMock';

/**
 * Bookings waiting for the floor, in the tablet's mock.
 *
 * Seeded the way the floor actually meets one: a short-notice request for a
 * table somebody is sitting at now, with the earlier booking whose guest can be
 * rung, and a second request arriving a little later so the chime has
 * something to announce. The rules are the server's: fifteen minutes to
 * answer, declined by nobody once they pass, and a decision after that is a
 * 409 of its own.
 */

const START = new Date('2026-10-18T14:00:00Z');

function clock(at: Date = START) {
  let now = at;
  return {
    now: () => now,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
  };
}

describe('the awaiting list', () => {
  it('seeds one short-notice request with its table around it and a fixed window', async () => {
    const time = clock();
    const staff = createStaffMockGateway({ now: time.now });

    const listed = await staff.listAwaitingApproval('b1');
    const shortNotice = listed.filter((entry) => entry.because === 'shortNotice');
    const [request] = shortNotice;

    expect(shortNotice).toHaveLength(1);
    expect(request).toMatchObject({
      branchId: 'b1',
      because: 'shortNotice',
      partySize: 2,
      // Made two minutes before the mock started, so thirteen are left.
      approvalExpiresAtUtc: '2026-10-18T14:13:00.000Z',
      previousBooking: { partySize: 4, status: 'seated' },
      currentSitting: { partySize: 4 },
    });
    expect(request!.previousBooking!.guestPhone).toMatch(/^\+374\d{8}$/u);
    expect(request!.guestPhone).toMatch(/^\+374\d{8}$/u);
    expect(request!.nextBooking).not.toBeNull();
    expect(request!.roomName).toBe('Windows');
  });

  it('has a second request arrive after the floor has been open a while', async () => {
    const time = clock();
    const staff = createStaffMockGateway({ now: time.now });

    expect(await staff.listAwaitingApproval('b1')).toHaveLength(2);
    time.advance(50_000);
    expect(await staff.listAwaitingApproval('b1')).toHaveLength(3);
  });

  it('lists as the server does: deadlines first, soonest first, then the rest by start', async () => {
    const time = clock();
    const staff = createStaffMockGateway({ now: time.now });
    time.advance(50_000);

    const listed = await staff.listAwaitingApproval('b1');

    expect(listed.map((entry) => entry.code)).toEqual(['Y3107', 'Y3112', 'Y3120']);
    // Table 4 starts before table 7, and still lists after it: the deadline orders.
    expect(listed[1]!.startUtc < listed[0]!.startUtc).toBe(true);
    expect(listed[2]).toMatchObject({ because: 'largeParty', approvalExpiresAtUtc: null });
  });

  it('drops a request once its window closes, declined for want of an answer', async () => {
    const time = clock();
    const staff = createStaffMockGateway({ now: time.now });
    const [request] = await staff.listAwaitingApproval('b1');

    time.advance(13 * 60_000);
    const left = await staff.listAwaitingApproval('b1');
    expect(left.map((entry) => entry.id)).not.toContain(request!.id);
    // The one with no clock does not run out.
    expect(left.map((entry) => entry.code)).toContain('Y3120');
  });
});

describe('deciding', () => {
  it('approves a request, which leaves the list and puts the booking on its table', async () => {
    const time = clock();
    const staff = createStaffMockGateway({ now: time.now });
    const [request] = await staff.listAwaitingApproval('b1');

    const decided = await staff.approveReservation({ reservationId: request!.id });

    expect(decided).toMatchObject({
      id: request!.id,
      status: 'confirmed',
      awaitingApprovalBecause: null,
      approvalExpiresAtUtc: null,
    });
    expect((await staff.listAwaitingApproval('b1')).map((entry) => entry.id)).not.toContain(
      request!.id,
    );
  });

  it('declines a request with the reason given, and it leaves the list', async () => {
    const staff = createStaffMockGateway({ now: clock().now });
    const [request] = await staff.listAwaitingApproval('b1');

    const decided = await staff.rejectReservation({
      reservationId: request!.id,
      reason: 'Table 7 is staying late',
    });

    expect(decided.status).toBe('cancelledByVenue');
    expect((await staff.listAwaitingApproval('b1')).map((entry) => entry.id)).not.toContain(
      request!.id,
    );
  });

  it('refuses a second decision as somebody else deciding first, not as too late', async () => {
    const staff = createStaffMockGateway({ now: clock().now });
    const [request] = await staff.listAwaitingApproval('b1');
    await staff.approveReservation({ reservationId: request!.id });

    const again = await staff
      .rejectReservation({ reservationId: request!.id })
      .catch((error: unknown) => error);
    expect(again).toBeInstanceOf(ConcurrencyConflictError);
    expect(isApprovalExpired(again)).toBe(false);
    // The server's code for "not pending any more", as `DomainStateException` maps it.
    expect((again as ConcurrencyConflictError).code).toBe('conflicting-state');
    expect((again as Error).message).toMatch(/Confirmed/u);
  });

  it('refuses a decision after the window closed with the too-late 409', async () => {
    const time = clock();
    const staff = createStaffMockGateway({ now: time.now });
    const [request] = await staff.listAwaitingApproval('b1');

    time.advance(13 * 60_000 + 1);
    const late = await staff
      .approveReservation({ reservationId: request!.id })
      .catch((error: unknown) => error);
    expect(late).toBeInstanceOf(ConcurrencyConflictError);
    expect(isApprovalExpired(late)).toBe(true);
  });
});
