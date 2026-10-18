// @vitest-environment jsdom
import { ApiError, type AwaitingApproval } from '@yalla/api';
import { i18next } from '@yalla/i18n';
import { beforeAll, describe, expect, it } from 'vitest';
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import { decisionFailureText } from '../console/venue/policy/decisionFailure';
import { contextLines, nextBookingLine } from './approvalRequests';

/**
 * Booking times on the floor tablet.
 *
 * A booking for another day on a table somebody booked shortly before waits
 * for that earlier guest — and when they booked on the web, no push reaches
 * them, so the floor rings them and decides: the card says so, names them,
 * offers the Call, and says the time they are being asked to be gone by. A
 * promise to free a table before the next booking is said wherever the next
 * booking is: on the card's lines and on the floor's next-booking line.
 */

const BRANCH = 'b1';
const time = (iso: string) => iso.slice(11, 16);

beforeAll(async () => {
  await initConsoleTestI18n();
});

const REQUEST: AwaitingApproval = {
  id: 'r4',
  code: 'Y3133',
  branchId: BRANCH,
  guestName: 'Armen',
  guestPhone: '+37495112233',
  partySize: 2,
  tableId: 't9',
  tableLabel: '9',
  roomName: null,
  startUtc: '2026-10-20T19:45:00Z',
  localDate: '2026-10-20',
  localStartTime: '23:45:00',
  timeZoneId: 'Asia/Yerevan',
  note: null,
  // The floor's question for another day: no clock (reservations.md §3e).
  approvalExpiresAtUtc: null,
  because: 'earlierGuestConsent',
  promisedFreeByUtc: '2026-10-20T21:55:00Z',
  previousBooking: {
    startUtc: '2026-10-20T18:00:00Z',
    partySize: 2,
    guestName: 'Mariam',
    guestPhone: '+37477445566',
    status: 'confirmed',
    promisedFreeByUtc: null,
  },
  nextBooking: { startUtc: '2026-10-20T22:00:00Z', partySize: 4 },
  currentSitting: null,
};

describe('a request waiting on the guest before', () => {
  const t = i18next.getFixedT('en', 'staff');

  it('asks the floor to ring the guest before, by name, about the time they would leave by', () => {
    const lines = contextLines(REQUEST, t, time);
    const ask = lines.find((line) => line.kind === 'ask');
    expect(ask).toEqual({
      kind: 'ask',
      text: 'Ask Mariam whether the table will be free by 19:40',
      call: { phoneE164: '+37477445566', name: 'Mariam' },
    });
    // The before line says who, and no second Call for the same person.
    expect(lines.find((line) => line.kind === 'before')?.call).toBeNull();
  });

  it('says the promise this booking made to free the table before the next one', () => {
    const next = contextLines(REQUEST, t, time).find((line) => line.kind === 'next');
    expect(next?.text).toBe('Next: 22:00 · 4 guests · must free by 21:55');
  });

  it('asks for the time the server names — a short-notice request within three hours', () => {
    const lines = contextLines(
      { ...REQUEST, because: 'shortNotice', earlierGuestFreeByUtc: '2026-10-20T19:35:00Z' },
      t,
      time,
    );
    expect(lines.find((line) => line.kind === 'ask')?.text).toBe(
      'Ask Mariam whether the table will be free by 19:35',
    );
  });

  it('says by when the guest before promised to leave, when they did', () => {
    const promised = contextLines(
      {
        ...REQUEST,
        because: 'shortNotice',
        earlierGuestFreeByUtc: null,
        previousBooking: { ...REQUEST.previousBooking!, promisedFreeByUtc: '2026-10-20T19:40:00Z' },
      },
      t,
      time,
    );
    expect(promised[0]).toMatchObject({
      kind: 'before',
      text: 'Before: 18:00 · 2 guests · Mariam · confirmed · leaves by 19:40',
    });
    expect(promised.some((line) => line.kind === 'ask')).toBe(false);
  });

  it('names the reason on the badge', () => {
    expect(t('approvals.because.earlierGuestConsent')).toBe(
      "The guest before can't be asked in the app — call them",
    );
  });
});

describe("the floor's next-booking line", () => {
  const t = i18next.getFixedT('en', 'staff');

  it('adds the promise to free the table when one was made', () => {
    expect(nextBookingLine(t, '21:30', '2026-10-20T17:25:00Z', time)).toBe(
      '21:30 · must free by 17:25',
    );
    expect(nextBookingLine(t, '21:30', null, time)).toBe('21:30');
  });
});

describe('a decision on a booking the guest before is answering in the app', () => {
  it('says it is theirs to answer, in the screen’s words', () => {
    const t = i18next.getFixedT('en', 'staff');
    const refused = new ApiError('busy', {
      status: 409,
      url: '/api/reservations/r4/approve',
      problem: {
        type: '',
        title: 'Waiting for the guest before to answer',
        status: 409,
        detail:
          'This booking is waiting for the guest before it on the table to answer in the app.',
        code: 'reservation-awaiting-earlier-guest',
        traceId: 't',
        instance: null,
        context: { reservationId: 'r4', requestId: 'q1', expiresAtUtc: '2026-10-19T16:00:00Z' },
        errors: null,
      },
    });
    expect(
      decisionFailureText(refused, {
        offline: 'offline',
        generic: 'generic',
        awaitingEarlierGuest: t('approvals.awaitingEarlierGuest'),
      }),
    ).toBe(t('approvals.awaitingEarlierGuest'));
    expect(t('approvals.awaitingEarlierGuest')).not.toBe('approvals.awaitingEarlierGuest');
  });
});

describe('the booking before, from another day', () => {
  const t = i18next.getFixedT('en', 'staff');
  const days = {
    dayKey: (iso: string) => iso.slice(0, 10),
    date: (iso: string) => iso.slice(5, 10),
  };

  it('names its day when it is not the day of the request — a 23:00 before a 00:30', () => {
    const lines = contextLines(
      {
        ...REQUEST,
        startUtc: '2026-10-21T00:30:00Z',
        previousBooking: { ...REQUEST.previousBooking!, startUtc: '2026-10-20T23:00:00Z' },
      },
      t,
      time,
      days,
    );
    expect(lines[0]?.text).toMatch(/^Before: 10-20 23:00 · /u);
  });

  it('says only the time on the same day', () => {
    expect(contextLines(REQUEST, t, time, days)[0]?.text).toMatch(/^Before: 18:00 · /u);
  });
});
