import {
  ADMITTED,
  ScanTurnedAwayError,
  TabAwaitingAdmissionError,
  type Booking,
  type DinerTabView,
  type TabAdmission,
  type TabEvent,
} from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { canChangeBooking } from '../components/bookings/changeBooking';
import { atTableOffer, canKeepTable } from '../lib/bookingActions';
import { scanFailureFor } from '../lib/scanOutcome';
import { admissionState, justAdmitted } from './admission';
import { applyTabEvents } from './events';
import { orderingBlock, orderingBlockKey } from './ordering';
import { billRequestFailure } from './payBill';

/**
 * Unverified guests on the phone (2026-10-20): a tab a scan with no proved
 * number opened waits for a waiter — the menu readable, ordering and the bill
 * not, a waiter callable — until the stream says it was let in (21) or turned
 * away (22); a scan right after a turn-away is refused in words. The few
 * bookings made without a proved number while that was possible (legacy rows)
 * are never moved or used for "I'm at my table"; booking without proof is
 * gone (guest record, 2026-10-20).
 */

const url = 'https://api.test/api/tabs/t-1/orders';

const me: DinerTabView['me'] = {
  participantId: 'p1',
  displayName: 'Guest 1',
  role: 'host',
  status: 'approved',
  canOrder: true,
  canOrderNow: false,
  canPay: true,
  canSeeTableTotal: true,
  joinedAtUtc: '2026-10-20T09:00:00Z',
  photo: null,
};

const AWAITING: TabAdmission = {
  status: 'awaiting',
  admittedBecause: null,
  decidedAtUtc: null,
  decidedByStaffId: null,
  tableFreed: null,
};
const REJECTED: TabAdmission = {
  ...AWAITING,
  status: 'rejected',
  decidedAtUtc: '2026-10-20T09:05:00Z',
  tableFreed: true,
};

function event(sequence: number, type: TabEvent['type']): TabEvent {
  return {
    sequence,
    tabId: 't-1',
    type,
    actor: 'staff',
    actorId: null,
    actorName: null,
    atUtc: '2026-10-20T09:05:00Z',
    data: null,
  } as TabEvent;
}

describe('a tab waiting for a waiter', () => {
  it('is its own reason not to order, said as a waiter coming', () => {
    const block = orderingBlock({ status: 'open', me, admission: AWAITING });
    expect(block).toBe('awaitingAdmission');
    expect(orderingBlockKey(block!)).toBe('order.blocked.awaitingAdmission');
  });

  it('leaves the other reasons alone once admitted', () => {
    expect(
      orderingBlock({ status: 'open', me: { ...me, canOrderNow: true }, admission: ADMITTED }),
    ).toBeNull();
    expect(orderingBlock({ status: 'open', me, admission: ADMITTED })).toBe('notAllowed');
  });

  it('is read as waiting, turned away, or open', () => {
    expect(admissionState({ status: 'open', admission: AWAITING })).toBe('awaiting');
    expect(admissionState({ status: 'closed', admission: REJECTED })).toBe('rejected');
    expect(admissionState({ status: 'open', admission: ADMITTED })).toBe('open');
    // Closed and paid is not a turn-away.
    expect(admissionState({ status: 'closed', admission: ADMITTED })).toBe('open');
  });

  it('celebrates only the moment it is let in, never a tab that was always open', () => {
    expect(justAdmitted('awaiting', 'open')).toBe(true);
    expect(justAdmitted(null, 'open')).toBe(false);
    expect(justAdmitted('open', 'open')).toBe(false);
    expect(justAdmitted('awaiting', 'rejected')).toBe(false);
  });

  it('refetches on being let in or turned away', () => {
    for (const type of ['tabAdmitted', 'tabAdmissionRejected'] as const) {
      expect(applyTabEvents(4, [event(5, type)])).toMatchObject({
        kind: 'refetch',
        reason: 'changed',
        lastSequence: 5,
        markers: [],
      });
    }
  });

  it('says why the bill cannot be asked for yet', () => {
    expect(billRequestFailure(new TabAwaitingAdmissionError({ url, tabId: 't-1' }))).toEqual({
      key: 'tab.pay.awaitingAdmission',
    });
  });
});

describe('a scan right after a waiter turned it away', () => {
  it('asks the diner to find a waiter, not to scan again', () => {
    expect(
      scanFailureFor(new ScanTurnedAwayError({ url, retryAfterUtc: '2026-10-20T09:35:00Z' })).key,
    ).toBe('scan.error.turnedAway');
  });
});

describe('a legacy booking made without a proved number', () => {
  const booking = {
    id: 'r-1',
    status: 'pendingApproval',
    slotUtc: '2026-10-22T15:30:00Z',
  } as Booking;
  const before = new Date('2026-10-20T12:00:00Z');

  it('is never offered Change — the server refuses it until the number is proved', () => {
    expect(canChangeBooking(booking, before)).toBe(true);
    expect(canChangeBooking({ ...booking, phoneUnverified: true }, before)).toBe(false);
  });
});

describe('the review round (UG-FE-REVIEW)', () => {
  const now = new Date('2026-10-20T15:40:00Z');
  const sitting = {
    id: 'r-1',
    status: 'confirmed',
    slotUtc: '2026-10-20T15:30:00Z',
    endUtc: '2026-10-20T17:30:00Z',
  } as Booking;

  it('offers neither "keep my table" nor “I’m at my table” on an unproved booking (S7)', () => {
    expect(canKeepTable(sitting, now)).toBe(true);
    expect(canKeepTable({ ...sitting, phoneUnverified: true }, now)).toBe(false);
    expect(atTableOffer(sitting, now)).toBe('open');
    // The server refuses until the number is proved: scan the code on the table.
    expect(atTableOffer({ ...sitting, phoneUnverified: true }, now)).toBe('scanInstead');
    expect(atTableOffer({ ...sitting, status: 'cancelledByDiner' }, now)).toBeNull();
  });
});
