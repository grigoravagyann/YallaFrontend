import {
  ExtensionsNotOfferedError,
  HoldAlreadyExtendedError,
  HoldNotActiveError,
  type BookingStatus,
} from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { canCancel, canKeepTable, keepTableFailureKey } from './bookingActions';

describe('cancel', () => {
  it('is offered only while the booking still holds a table', () => {
    const offered = (['confirmed', 'pendingApproval'] as const).map(canCancel);
    const refused = (
      ['seated', 'completed', 'noShow', 'cancelledByDiner', 'cancelledByVenue', 'unknown'] as const
    ).map((status: BookingStatus) => canCancel(status));

    expect(offered).toEqual([true, true]);
    expect(refused).toEqual([false, false, false, false, false, false]);
  });
});

describe('keep my table', () => {
  const booking = {
    status: 'confirmed' as const,
    slotUtc: '2026-09-20T15:30:00Z',
    endUtc: '2026-09-20T17:00:00Z',
  };

  it('is not offered days before the booking', () => {
    expect(canKeepTable(booking, new Date('2026-09-17T12:00:00Z'))).toBe(false);
  });

  it('is offered once the booking has started and not ended', () => {
    expect(canKeepTable(booking, new Date('2026-09-20T15:40:00Z'))).toBe(true);
    expect(canKeepTable(booking, new Date('2026-09-20T17:30:00Z'))).toBe(false);
  });

  it('is never offered on a booking that is only a request', () => {
    expect(
      canKeepTable({ ...booking, status: 'pendingApproval' }, new Date('2026-09-20T15:40:00Z')),
    ).toBe(false);
  });

  it('says each refusal as itself', () => {
    const url = 'https://api.test/x';
    expect(keepTableFailureKey(new HoldNotActiveError({ url, reservationId: 'r' }))).toBe(
      'push.actions.holdNotActive',
    );
    expect(keepTableFailureKey(new ExtensionsNotOfferedError({ url, reservationId: 'r' }))).toBe(
      'push.actions.extensionsNotOffered',
    );
    expect(keepTableFailureKey(new HoldAlreadyExtendedError({ url, reservationId: 'r' }))).toBe(
      'push.actions.alreadyExtended',
    );
  });
});
