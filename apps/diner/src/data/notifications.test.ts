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
    'review-replied',
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
    // The venue answered: the reply is under the review on the place's page.
    expect(notificationRoute(row({ kind: 'review-replied', reservationId: null }))?.pathname).toBe(
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

/**
 * Public page phase 5: a change or a cancel made with the booking's web
 * manage link. The link may be in somebody else's hands, so the account holder
 * is told what happened — and where it stands now — in their own language.
 */
describe('a booking changed or cancelled with its link', () => {
  const PARAMS = {
    venueName: 'Lumen Coffee',
    branchName: 'Northern Avenue',
    date: '2026-10-24',
    time: '20:00',
    partySize: '3',
    reservationCode: 'Y3107',
  };

  it('says the new day, time and party, and that it stands confirmed', () => {
    const copy = notificationCopy(
      row({ kind: 'booking-changed-by-link', params: { ...PARAMS, status: '2' } }),
    );
    expect(copy.titleKey).toBe('notifications.kind.bookingChangedByLink.title');
    expect(copy.bodyKey).toBe('notifications.kind.bookingChangedByLink.body');
    expect(copy.params).toMatchObject({ day: '24.10', time: '20:00', count: 3 });
  });

  it('says it waits for the venue when the change went back to it', () => {
    const copy = notificationCopy(
      row({ kind: 'booking-changed-by-link', params: { ...PARAMS, status: '1' } }),
    );
    expect(copy.bodyKey).toBe('notifications.kind.bookingChangedByLinkWaiting.body');
  });

  it('says it was cancelled with the link', () => {
    const copy = notificationCopy(row({ kind: 'booking-cancelled-by-link', params: PARAMS }));
    expect(copy.titleKey).toBe('notifications.kind.bookingCancelledByLink.title');
    expect(copy.params).toMatchObject({ day: '24.10', time: '20:00' });
  });

  it('has the words in every language, the day, time and party in each', () => {
    for (const params of [
      { kind: 'booking-changed-by-link', params: { ...PARAMS, status: '2' } },
      { kind: 'booking-changed-by-link', params: { ...PARAMS, status: '1' } },
      { kind: 'booking-cancelled-by-link', params: PARAMS },
    ]) {
      const copy = notificationCopy(row(params));
      for (const bundle of [
        dinerResources.en.diner,
        dinerResources.hy.diner,
        dinerResources.ru.diner,
      ]) {
        const title = lookup(bundle, copy.titleKey);
        const body =
          lookup(bundle, copy.bodyKey) ??
          lookup(bundle, `${copy.bodyKey}_other`) ??
          lookup(bundle, `${copy.bodyKey}_one`);
        expect(typeof title).toBe('string');
        expect(typeof body).toBe('string');
        expect(body as string).toContain('{{time}}');
        expect(body as string).toContain('{{day}}');
      }
    }
  });

  it('never invents a party: without one the row names the place only', () => {
    for (const partySize of [undefined, '', 'x', '0']) {
      const params: Record<string, string> = { ...PARAMS, status: '2' };
      if (partySize === undefined) delete params['partySize'];
      else params['partySize'] = partySize;
      expect(notificationCopy(row({ kind: 'booking-changed-by-link', params })).bodyKey).toBe(
        'notifications.kind.bookingChangedByLinkPlain.body',
      );
    }
  });

  it('reads a row without the slot as the place only, never "undefined"', () => {
    const copy = notificationCopy(row({ kind: 'booking-changed-by-link', params: {} }));
    expect(copy.titleKey).toBe('notifications.kind.bookingChangedByLink.title');
    expect(copy.bodyKey).toBe('notifications.kind.bookingChangedByLinkPlain.body');
  });

  it('opens the booking it is about, and reads it again', () => {
    for (const kind of ['booking-changed-by-link', 'booking-cancelled-by-link']) {
      expect(notificationRoute(row({ kind }))).toEqual({
        pathname: '/booking/[bookingId]',
        params: { bookingId: 'r1' },
      });
      expect(bookingKeysForRow(row({ kind }))).toContainEqual(['booking', 'r1']);
    }
  });
});

/*
 * Guest record (2026-10-20): a venue marked a booking a no-show; three in
 * three days paused booking for a week and cancelled what had not started;
 * and the pause lifted early. The two about the pause open the bookings tab.
 */
describe('no-shows and the pause on booking, in the feed', () => {
  const ZONE = 'Asia/Yerevan';
  const BLOCK = {
    blockedUntilUtc: '2026-10-27T09:30:00Z',
    blockedUntilLocalDate: '2026-10-27',
    cancelledCount: '2',
  };

  it('says how many bookings went and when booking opens again, plural by the count', () => {
    const copy = notificationCopy(
      row({ kind: 'bookings-blocked-no-shows', reservationId: null, params: BLOCK }),
      ZONE,
    );
    expect(copy.titleKey).toBe('notifications.kind.bookingsBlockedNoShows.title');
    expect(copy.bodyKey).toBe('notifications.kind.bookingsBlockedNoShows.body');
    expect(copy.params).toMatchObject({ count: 2, day: '27.10', time: '13:30' });
    const en = dinerResources.en.diner;
    expect(lookup(en, `${copy.bodyKey}_one`)).toContain('{{count}}');
    expect(lookup(en, `${copy.bodyKey}_other`)).toContain('{{time}}');
  });

  it('leaves the count out when nothing was cancelled, and the time when it has none', () => {
    expect(
      notificationCopy(
        row({ kind: 'bookings-blocked-no-shows', params: { ...BLOCK, cancelledCount: '0' } }),
        ZONE,
      ).bodyKey,
    ).toBe('notifications.kind.bookingsBlockedNoShowsNone.body');
    expect(
      notificationCopy(row({ kind: 'bookings-blocked-no-shows', params: {} }), ZONE).bodyKey,
    ).toBe('notifications.kind.bookingsBlockedNoShowsPlain.body');
  });

  it('reads the end from the instant when the row has no local day', () => {
    const copy = notificationCopy(
      row({
        kind: 'bookings-blocked-no-shows',
        params: { blockedUntilUtc: BLOCK.blockedUntilUtc, cancelledCount: '1' },
      }),
      ZONE,
    );
    expect(copy.params).toMatchObject({ count: 1, day: '27.10', time: '13:30' });
  });

  // Review round 2 (N4): one clock for day and time. 21:30 UTC on the 27th
  // is already the 28th at the venue; a phone on UTC reads the 27th, 21:30 —
  // never the venue's day beside the phone's time.
  it('says day and time on the phone’s clock, even where the venue’s day differs', () => {
    const copy = notificationCopy(
      row({
        kind: 'bookings-blocked-no-shows',
        params: {
          blockedUntilUtc: '2026-10-27T21:30:00Z',
          blockedUntilLocalDate: '2026-10-28',
          cancelledCount: '1',
        },
      }),
      'UTC',
    );
    expect(copy.params).toMatchObject({ day: '27.10', time: '21:30' });
  });

  it('says a no-show was marked, where and when, and to contact the venue', () => {
    const copy = notificationCopy(
      row({
        kind: 'booking-no-show',
        branchName: null,
        params: {
          venueName: 'Café Aram',
          branchName: 'Main',
          date: '2026-10-19',
          time: '19:30',
          partySize: '2',
          reservationCode: 'K7Q2LM',
        },
      }),
    );
    expect(copy).toEqual({
      titleKey: 'notifications.kind.bookingNoShow.title',
      bodyKey: 'notifications.kind.bookingNoShow.body',
      params: { place: 'Main', day: '19.10', time: '19:30' },
    });
    expect(notificationCopy(row({ kind: 'booking-no-show', params: {} })).bodyKey).toBe(
      'notifications.kind.bookingNoShowPlain.body',
    );
  });

  it('says why the pause was lifted early', () => {
    const lifted = (liftedBecause?: string) =>
      notificationCopy(
        row({
          kind: 'bookings-unblocked',
          params: liftedBecause ? { liftedBecause } : {},
        }),
      );
    expect(lifted('1').bodyKey).toBe('notifications.kind.bookingsUnblockedLifted.body');
    expect(lifted('2').bodyKey).toBe('notifications.kind.bookingsUnblockedUndone.body');
    expect(lifted().bodyKey).toBe('notifications.kind.bookingsUnblocked.body');
    expect(lifted('1').titleKey).toBe('notifications.kind.bookingsUnblocked.title');
  });

  it('opens the bookings tab for the pause, and reads the list again', () => {
    for (const kind of ['bookings-blocked-no-shows', 'bookings-unblocked']) {
      const pause = row({ kind, reservationId: null, branchId: null });
      expect(notificationRoute(pause)).toEqual({ pathname: '/(tabs)/bookings' });
      expect(bookingKeysForRow(pause)).toEqual([['bookings']]);
    }
  });

  it('opens the booking a no-show was marked on', () => {
    const noShow = row({ kind: 'booking-no-show' });
    expect(notificationRoute(noShow)).toEqual({
      pathname: '/booking/[bookingId]',
      params: { bookingId: 'r1' },
    });
    expect(bookingKeysForRow(noShow)).toContainEqual(['booking', 'r1']);
  });

  it('has every line in every language', () => {
    for (const bundle of Object.values(dinerResources)) {
      for (const key of [
        'bookingsBlockedNoShows.title',
        'bookingsBlockedNoShowsNone.body',
        'bookingsBlockedNoShowsPlain.body',
        'bookingNoShow.title',
        'bookingNoShow.body',
        'bookingNoShowPlain.body',
        'bookingsUnblocked.title',
        'bookingsUnblocked.body',
        'bookingsUnblockedLifted.body',
        'bookingsUnblockedUndone.body',
      ]) {
        expect(typeof lookup(bundle.diner, `notifications.kind.${key}`)).toBe('string');
      }
    }
  });
});

describe('are you on your way?, in the feed', () => {
  const asked = row({ kind: 'booking-on-your-way', reservationId: 'r-way' });

  it('opens the booking, which asks the question', () => {
    expect(notificationRoute(asked)).toEqual({
      pathname: '/booking/[bookingId]',
      params: { bookingId: 'r-way' },
    });
    expect(notificationRoute({ ...asked, reservationId: null })).toEqual({
      pathname: '/place/[placeId]',
      params: { placeId: 'b1' },
    });
  });

  it('reads the booking again on the way in', () => {
    expect(bookingKeysForRow(asked)).toEqual([
      ['bookings'],
      ['booking', 'r-way'],
      ['reservationState', 'r-way'],
    ]);
  });

  it('has its copy in every language', () => {
    const copy = notificationCopy(asked);
    expect(copy.titleKey).toBe('notifications.kind.bookingOnYourWay.title');
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

describe('takeaway in the feed (2026-10-22)', () => {
  const takeaway = (kind: string, params: DinerNotification['params']) =>
    row({ kind, params: { code: 'T-482', ...params }, reservationId: null, orderId: 'tw-1' });

  it('says the order was accepted, with the time it will be ready', () => {
    expect(notificationCopy(takeaway('takeaway-accepted', { readyTime: '19:10' }))).toEqual({
      titleKey: 'notifications.kind.takeawayAccepted.title',
      bodyKey: 'notifications.kind.takeawayAccepted.body',
      params: { place: 'Lumen Coffee · Cascade', code: 'T-482', readyTime: '19:10' },
    });
    expect(notificationCopy(takeaway('takeaway-accepted', {})).bodyKey).toBe(
      'notifications.kind.takeawayAcceptedPlain.body',
    );
  });

  it('says it is ready to pick up', () => {
    expect(notificationCopy(takeaway('takeaway-ready', {})).titleKey).toBe(
      'notifications.kind.takeawayReady.title',
    );
  });

  it("apologises when nobody answered, and gives the venue's reason when it gave one", () => {
    expect(notificationCopy(takeaway('takeaway-declined', { noAnswer: 'true' })).bodyKey).toBe(
      'notifications.kind.takeawayDeclinedNoAnswer.body',
    );
    const reasoned = notificationCopy(takeaway('takeaway-declined', { reason: 'Out of lamb' }));
    expect(reasoned.bodyKey).toBe('notifications.kind.takeawayDeclinedReason.body');
    expect(reasoned.params.reason).toBe('Out of lamb');
    expect(notificationCopy(takeaway('takeaway-declined', {})).bodyKey).toBe(
      'notifications.kind.takeawayDeclined.body',
    );
  });

  it('has every one of its keys in all three languages', () => {
    const rows = [
      takeaway('takeaway-accepted', { readyTime: '19:10' }),
      takeaway('takeaway-accepted', {}),
      takeaway('takeaway-ready', {}),
      takeaway('takeaway-declined', { noAnswer: true }),
      takeaway('takeaway-declined', { reason: 'x' }),
      takeaway('takeaway-declined', {}),
    ];
    for (const locale of ['hy', 'ru', 'en'] as const) {
      for (const copy of rows.map((entry) => notificationCopy(entry))) {
        for (const key of [copy.titleKey, copy.bodyKey]) {
          expect(typeof lookup(dinerResources[locale].diner, key), `${locale} ${key}`).toBe(
            'string',
          );
        }
      }
    }
  });

  it("opens the order's status screen", () => {
    expect(notificationRoute(takeaway('takeaway-ready', {}))).toEqual({
      pathname: '/takeaway/[orderId]',
      params: { orderId: 'tw-1' },
    });
    expect(notificationRoute({ ...takeaway('takeaway-ready', {}), orderId: null })).toEqual({
      pathname: '/place/[placeId]',
      params: { placeId: 'b1' },
    });
  });
});

/**
 * Guest messages (2026-10-23): a venue's message in the feed — "{venue}
 * wrote" and its words — opens the booking's or the order's thread.
 */
describe('a venue message in the feed', () => {
  const message = (params: DinerNotification['params'], ids: Partial<DinerNotification> = {}) =>
    row({
      kind: 'venue-message',
      branchName: 'Lava',
      params: { conversationId: 'c1', ...params },
      ...ids,
    });

  it('quotes the words under the venue, in every language', () => {
    const copy = notificationCopy(message({ text: 'Your table is ready', ask: 'false' }));
    expect(copy).toEqual({
      titleKey: 'notifications.kind.venueMessage.title',
      bodyKey: 'notifications.kind.venueMessage.body',
      params: { place: 'Lava', text: 'Your table is ready' },
    });
    for (const locale of ['hy', 'ru', 'en'] as const) {
      expect(lookup(dinerResources[locale].diner, copy.titleKey)).toEqual(expect.any(String));
      expect(lookup(dinerResources[locale].diner, copy.bodyKey)).toEqual(
        expect.stringContaining('{{text}}'),
      );
    }
  });

  it('names the venue, as the thread does, not the branch', () => {
    expect(notificationCopy(message({ venueName: 'Lumen Coffee', text: 'Hi' })).params.place).toBe(
      'Lumen Coffee',
    );
  });

  it('says it is the question when an ask has no words of its own', () => {
    expect(notificationCopy(message({ ask: 'true' })).bodyKey).toBe(
      'notifications.kind.venueAsk.body',
    );
    expect(notificationCopy(message({ ask: 'false' })).bodyKey).toBe(
      'notifications.kind.venueMessagePlain.body',
    );
  });

  it("says the booking's time on the venue's ask, as the backend writes its row", () => {
    // The ask's row since 2026-10-23: no words, `ask` "true", the booking's date and time.
    const copy = notificationCopy(
      message({
        venueName: 'Lava',
        branchName: 'Kentron',
        subjectKind: 'reservation',
        ask: 'true',
        date: '2026-10-23',
        time: '19:30',
      }),
    );
    expect(copy).toEqual({
      titleKey: 'notifications.kind.venueMessage.title',
      bodyKey: 'notifications.kind.venueAskAt.body',
      params: { place: 'Lava', time: '19:30' },
    });
    for (const locale of ['hy', 'ru', 'en'] as const) {
      expect(lookup(dinerResources[locale].diner, copy.bodyKey)).toEqual(
        expect.stringContaining('{{time}}'),
      );
    }
    expect(notificationRoute(message({ subjectKind: 'reservation', ask: 'true' }))).toEqual({
      pathname: '/messages/reservation/[id]',
      params: { id: 'r1' },
    });
  });

  it("opens the booking's thread, or the takeaway order's", () => {
    expect(notificationRoute(message({}))).toEqual({
      pathname: '/messages/reservation/[id]',
      params: { id: 'r1' },
    });
    expect(notificationRoute(message({}, { reservationId: null, orderId: 'tw-1' }))).toEqual({
      pathname: '/messages/takeaway/[id]',
      params: { id: 'tw-1' },
    });
    expect(notificationRoute(message({}, { reservationId: null }))).toEqual({
      pathname: '/place/[placeId]',
      params: { placeId: 'b1' },
    });
  });
});
