import type { DinerNotification } from '@yalla/api';
import { dinerResources } from '@yalla/i18n/diner';
import { describe, expect, it } from 'vitest';
import { bookingKeysForRow, notificationCopy, notificationRoute } from './notifications';

function row(overrides: Partial<DinerNotification> = {}): DinerNotification {
  return {
    notificationId: 'n1',
    kind: 'booking-confirmed',
    params: {},
    branchId: 'b1',
    branchName: 'Lumen Coffee · Cascade',
    reservationId: 'r1',
    tabId: null,
    orderId: null,
    createdAtUtc: '2026-09-14T10:00:00Z',
    read: false,
    ...overrides,
  };
}

function lookup(bundle: unknown, dotted: string): unknown {
  return dotted
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle);
}

describe('notificationCopy', () => {
  it('names the place from the row, and falls back to the params', () => {
    expect(notificationCopy(row()).params.place).toBe('Lumen Coffee · Cascade');
    expect(
      notificationCopy(row({ branchName: null, params: { venueName: 'Dolmama' } })).params.place,
    ).toBe('Dolmama');
  });

  it('apologises for a booking declined because nobody answered in time', () => {
    for (const expired of [true, 'true']) {
      expect(
        notificationCopy(row({ kind: 'booking-declined', params: { expired } })).titleKey,
      ).toBe('notifications.kind.bookingExpired.title');
    }
    expect(
      notificationCopy(row({ kind: 'booking-declined', params: { expired: false } })).titleKey,
    ).toBe('notifications.kind.bookingDeclined.title');
    expect(notificationCopy(row({ kind: 'booking-declined' })).bodyKey).toBe(
      'notifications.kind.bookingDeclined.body',
    );
  });

  describe('a declined change of a confirmed booking', () => {
    const change = (params: Record<string, string>) =>
      notificationCopy(
        row({
          kind: 'booking-declined',
          params: {
            date: '2026-10-21',
            time: '19:00',
            requestedDate: '2026-10-20',
            requestedTime: '20:00',
            wasChange: 'true',
            ...params,
          },
        }),
      );

    it('says the booking stands at its old time when the server kept it', () => {
      expect(change({ originalKept: 'true', expired: 'false' })).toEqual({
        titleKey: 'notifications.kind.bookingChangeKept.title',
        bodyKey: 'notifications.kind.bookingChangeKept.body',
        params: { place: 'Lumen Coffee · Cascade', time: '19:00', requestedTime: '20:00' },
      });
    });

    it('apologises when the change ran out of time, kept or not', () => {
      expect(change({ originalKept: 'true', expired: 'true' }).titleKey).toBe(
        'notifications.kind.bookingChangeKeptExpired.title',
      );
      expect(change({ originalKept: 'false', expired: 'true' }).titleKey).toBe(
        'notifications.kind.bookingChangeEndedExpired.title',
      );
    });

    it('says the booking ended when its old slot had gone too', () => {
      expect(change({ originalKept: 'false', expired: 'false' }).titleKey).toBe(
        'notifications.kind.bookingChangeEnded.title',
      );
    });

    it('falls back to the plain decline when the times it needs are missing', () => {
      const bare = notificationCopy(
        row({ kind: 'booking-declined', params: { wasChange: 'true', originalKept: 'true' } }),
      );
      expect(bare.titleKey).toBe('notifications.kind.bookingDeclined.title');
    });

    it('is not taken for a plain decline, which says wasChange "false"', () => {
      const plain = notificationCopy(
        row({ kind: 'booking-declined', params: { wasChange: 'false', expired: 'true' } }),
      );
      expect(plain.titleKey).toBe('notifications.kind.bookingExpired.title');
    });
  });

  it('gives a kind this build does not know the generic copy, rather than dropping it', () => {
    expect(notificationCopy(row({ kind: 'table-ready-soon' })).titleKey).toBe(
      'notifications.kind.unknown.title',
    );
  });

  it.each([
    'booking-reminder',
    'booking-confirmed',
    'booking-declined',
    'booking-declined:expired',
    'booking-declined:changeKept',
    'booking-declined:changeKeptExpired',
    'booking-declined:changeEnded',
    'booking-declined:changeEndedExpired',
    'booking-cancelled-by-venue',
    'order-ready',
    'review-hidden',
    'a-kind-from-a-newer-server',
  ])('has a title and a body in every language for %s', (variant) => {
    const [kind, flag] = variant.split(':') as [string, string | undefined];
    const change = flag?.startsWith('change')
      ? {
          wasChange: 'true',
          originalKept: flag.includes('Kept') ? 'true' : 'false',
          expired: flag.endsWith('Expired') ? 'true' : 'false',
          time: '19:00',
          requestedTime: '20:00',
        }
      : null;
    const copy = notificationCopy(row({ kind, params: change ?? (flag ? { [flag]: true } : {}) }));
    for (const bundle of [
      dinerResources.en.diner,
      dinerResources.hy.diner,
      dinerResources.ru.diner,
    ]) {
      expect(typeof lookup(bundle, copy.titleKey)).toBe('string');
      expect(typeof lookup(bundle, copy.bodyKey)).toBe('string');
    }
  });
});

describe('notificationRoute', () => {
  it('opens the booking a booking row is about, or its place without one', () => {
    expect(notificationRoute(row())).toEqual({
      pathname: '/booking/[bookingId]',
      params: { bookingId: 'r1' },
    });
    expect(notificationRoute(row({ reservationId: null }))).toEqual({
      pathname: '/place/[placeId]',
      params: { placeId: 'b1' },
    });
  });

  it('opens the order, then the tab, for a ready order', () => {
    expect(notificationRoute(row({ kind: 'order-ready', orderId: 'o1', tabId: 't1' }))).toEqual({
      pathname: '/order/[orderId]',
      params: { orderId: 'o1' },
    });
    expect(notificationRoute(row({ kind: 'order-ready', orderId: null, tabId: 't1' }))).toEqual({
      pathname: '/tab/[tabId]',
      params: { tabId: 't1' },
    });
  });

  it('opens the place for a hidden review, and nothing when a row names nothing', () => {
    expect(notificationRoute(row({ kind: 'review-hidden', reservationId: null }))?.pathname).toBe(
      '/place/[placeId]',
    );
    expect(
      notificationRoute(row({ kind: 'review-hidden', reservationId: null, branchId: null })),
    ).toBeNull();
  });
});

describe('bookingKeysForRow', () => {
  it('reads the booking a booking row is about again, and the list with it', () => {
    expect(bookingKeysForRow(row({ kind: 'booking-declined' }))).toEqual([
      ['bookings'],
      ['booking', 'r1'],
      ['reservationState', 'r1'],
    ]);
  });

  it('touches nothing for a row about something else, or about no booking', () => {
    expect(bookingKeysForRow(row({ kind: 'order-ready', reservationId: null }))).toEqual([]);
    expect(bookingKeysForRow(row({ kind: 'booking-confirmed', reservationId: null }))).toEqual([]);
  });
});

describe('booking times in the feed', () => {
  it('asks the earlier guest, with the later start and the time to leave by', () => {
    const copy = notificationCopy(
      row({
        kind: 'table-request',
        params: { requestId: 'q1', requestedTime: '19:45', freeByTime: '19:40' },
      }),
    );
    expect(copy).toEqual({
      titleKey: 'notifications.kind.tableRequest.title',
      bodyKey: 'notifications.kind.tableRequest.body',
      params: { place: 'Lumen Coffee · Cascade', time: '19:45', freeBy: '19:40' },
    });
  });

  it('says which way their answer went', () => {
    const decided = (accepted: string) =>
      notificationCopy(
        row({
          kind: 'table-request-decided',
          params: { accepted, requestedTime: '19:45', freeByTime: '19:40' },
        }),
      );
    expect(decided('true').titleKey).toBe('notifications.kind.tableRequestAccepted.title');
    expect(decided('true').params.freeBy).toBe('19:40');
    expect(decided('false').titleKey).toBe('notifications.kind.tableRequestDeclined.title');
  });

  it('tells the later guest the guest before said no, or did not answer', () => {
    const declined = (declinedBecause: string) =>
      notificationCopy(row({ kind: 'booking-declined', params: { declinedBecause } })).titleKey;
    expect(declined('3')).toBe('notifications.kind.bookingDeclinedEarlierGuest.title');
    expect(declined('4')).toBe('notifications.kind.bookingDeclinedEarlierGuestNoAnswer.title');
    expect(declined('1')).toBe('notifications.kind.bookingDeclined.title');
  });

  it('opens the booking, and reads it again', () => {
    const request = row({ kind: 'table-request' });
    expect(notificationRoute(request)).toEqual({
      pathname: '/booking/[bookingId]',
      params: { bookingId: 'r1' },
    });
    expect(bookingKeysForRow(request)).toContainEqual(['booking', 'r1']);
  });
});
