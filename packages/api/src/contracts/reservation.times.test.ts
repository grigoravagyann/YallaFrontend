import { describe, expect, it } from 'vitest';
import type { TableAvailability } from './booking';
import { FreeByRequiredError } from './errors';
import {
  bookingFailure,
  declinedCopy,
  freeByQuestion,
  promisedFreeByCopy,
  tableCopy,
  tableRequestCopy,
  venueAnswerCopy,
} from './reservation';

/**
 * Booking times: what the two booking surfaces say about a table whose sitting
 * is cut short by the next booking, a table that is only requestable, the
 * earlier guest's question, and the answers to it.
 */

const YEREVAN = 'Asia/Yerevan';
const URL = 'https://api.test.yalla.am/api/reservations';

/** 19:00 Yerevan tomorrow-ish; fixed so the times read the same everywhere. */
const SLOT = '2026-10-20T15:00:00.000Z';
const NEXT = '2026-10-20T17:30:00.000Z'; // 21:30
const FREE_BY = '2026-10-20T17:25:00.000Z'; // 21:25

function table(extra: Partial<TableAvailability> = {}): TableAvailability {
  return {
    tableId: 't1',
    tableLabel: '4',
    floorAreaName: null,
    seats: 4,
    isBookable: true,
    unavailableReason: null,
    window: {
      fromUtc: SLOT,
      untilUtc: NEXT,
      nextBookingStartUtc: NEXT,
      minutes: 150,
      isShorterThanTurnTime: false,
    },
    freeCancellationUntilUtc: null,
    requiresApproval: false,
    ...extra,
  };
}

const input = { partySize: 2, timeZoneId: YEREVAN, locale: 'en' as const };

describe('a table whose sitting the next booking cuts short', () => {
  it('says by when the table has to be free, before any button', () => {
    const copy = tableCopy(table({ mustFreeByUtc: FREE_BY }), input);
    expect(copy.freeBy).toEqual({ key: 'table.mustFreeBy', params: { time: '21:25' } });
  });

  it('says nothing of it when the sitting is not cut short — or the server predates it', () => {
    expect(tableCopy(table({ mustFreeByUtc: null }), input).freeBy).toBeNull();
    expect(tableCopy(table(), input).freeBy).toBeNull();
  });

  it('asks the question with the next booking and the time to be gone by', () => {
    expect(freeByQuestion({ nextStartUtc: NEXT, freeByUtc: FREE_BY }, YEREVAN, 'en')).toEqual({
      key: 'book.freeBy.question',
      params: { next: '21:30', time: '21:25' },
    });
  });

  it('asks without the next booking when only the time is known', () => {
    expect(freeByQuestion({ nextStartUtc: null, freeByUtc: FREE_BY }, YEREVAN, 'en')).toEqual({
      key: 'book.freeBy.questionNoNext',
      params: { time: '21:25' },
    });
  });

  it('reads the promise back on the booking', () => {
    expect(promisedFreeByCopy(FREE_BY, YEREVAN, 'en')).toEqual({
      key: 'booking.freeBy.promised',
      params: { time: '21:25' },
    });
    expect(promisedFreeByCopy(null, YEREVAN, 'en')).toBeNull();
    expect(promisedFreeByCopy(undefined, YEREVAN, 'en')).toBeNull();
  });
});

describe('a requestable table', () => {
  it('says the guest before will be asked, in place of the plain approval line', () => {
    const copy = tableCopy(
      table({ requiresApproval: true, requiresEarlierGuestConsent: true }),
      input,
    );
    expect(copy.approval).toEqual({ key: 'table.requestable.earlierGuest', params: {} });
  });

  it('keeps the plain approval line when the floor decides (today)', () => {
    const copy = tableCopy(
      table({ requiresApproval: true, requiresEarlierGuestConsent: false }),
      input,
    );
    expect(copy.approval).toEqual({ key: 'table.needsApproval', params: {} });
  });
});

describe('the earlier guest', () => {
  it('is asked whether they will have left, with the later start and the time', () => {
    expect(
      tableRequestCopy(
        {
          requestedStartUtc: '2026-10-20T15:45:00.000Z',
          freeByUtc: '2026-10-20T15:40:00.000Z',
        },
        YEREVAN,
        'en',
      ),
    ).toEqual({ key: 'booking.tableRequest.question', params: { time: '19:45', freeBy: '19:40' } });
  });
});

describe('a booking waiting for the guest before', () => {
  const now = new Date('2026-10-19T10:00:00.000Z');

  it('counts down with the earlier-guest sentence, not the venue one', () => {
    expect(
      venueAnswerCopy(
        {
          status: 'pendingApproval',
          awaitingApprovalBecause: 'earlierGuestConsent',
          approvalExpiresAtUtc: '2026-10-19T11:30:00.000Z',
          declinedBecause: null,
        },
        now,
      ),
    ).toEqual({ key: 'booking.approval.waitingEarlierGuest', params: { time: '90:00' } });
  });

  it('keeps the venue sentence for every other wait', () => {
    expect(
      venueAnswerCopy(
        {
          status: 'pendingApproval',
          awaitingApprovalBecause: 'shortNotice',
          approvalExpiresAtUtc: '2026-10-19T10:12:00.000Z',
          declinedBecause: null,
        },
        now,
      ),
    ).toEqual({ key: 'booking.approval.waiting', params: { time: '12:00' } });
  });

  it('says which way the guest before answered, and offers another time or table', () => {
    expect(declinedCopy('earlierGuestDeclined', 'title')?.key).toBe(
      'booking.declined.earlierGuestTitle',
    );
    expect(declinedCopy('earlierGuestDeclined', 'body')?.key).toBe('booking.declined.earlierGuest');
    expect(declinedCopy('earlierGuestNoAnswer', 'title')?.key).toBe(
      'booking.declined.earlierGuestNoAnswerTitle',
    );
    expect(declinedCopy('earlierGuestNoAnswer', 'body')?.key).toBe(
      'booking.declined.earlierGuestNoAnswer',
    );
  });
});

describe('a send refused for want of the promise', () => {
  it('carries the time the server needs, so the screen can ask again', () => {
    const failure = bookingFailure(
      new FreeByRequiredError({ url: URL, requiredFreeByUtc: FREE_BY, nextBookingStartUtc: NEXT }),
      YEREVAN,
      'en',
    );
    expect(failure).toEqual({
      kind: 'freeByRequired',
      requiredFreeByUtc: FREE_BY,
      nextBookingStartUtc: NEXT,
      line: { key: 'confirm.error.freeByRequired', params: { time: '21:25' } },
    });
  });

  it('still says so when the server named no time', () => {
    const failure = bookingFailure(
      new FreeByRequiredError({ url: URL, requiredFreeByUtc: null }),
      YEREVAN,
      'en',
    );
    expect(failure).toEqual({
      kind: 'freeByRequired',
      requiredFreeByUtc: null,
      nextBookingStartUtc: null,
      line: { key: 'confirm.error.freeByRequiredNoTime', params: {} },
    });
  });
});
