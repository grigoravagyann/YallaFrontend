import { createMockGateway, isHoldAlreadyExtended, actionIsLive, canExtendHold } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import {
  actionFor,
  onYourWayAnswer,
  onYourWayRoute,
  parsePushTarget,
  PUSH_ACTIONS,
  routeFor,
  tableRequestAnswer,
  tableRequestRoute,
} from './payload';

/**
 * What a notification means, and what the app is allowed to do about it.
 *
 * The payloads here are copied from `NotificationHandlers.cs` — the same five
 * dictionaries the scheduler builds, with the same string-typed values. Expo's
 * data payload is `Dictionary<string, string>` on the sending side, so every
 * number and boolean arrives as text and this is where that stops being true.
 */

const RESERVATION = '7b1f0a2c-0000-4000-8000-000000000001';
const TAB = '7b1f0a2c-0000-4000-8000-000000000002';

// --- Test 7, first half: routing ---------------------------------------------

describe('routing a tapped notification', () => {
  it('sends a reservation reminder to the booking it is about', () => {
    // ReservationReminderHandler.
    const target = parsePushTarget({
      kind: 'reservation-reminder',
      reservationId: RESERVATION,
      code: 'YAL-4821',
      action: 'cancel',
      branch: 'Lumen North',
    });

    expect(target).toEqual({
      kind: 'booking',
      reservationId: RESERVATION,
      action: 'cancel',
      extensionMinutes: null,
    });
    expect(routeFor(target)).toEqual({
      pathname: '/booking/[bookingId]',
      params: { bookingId: RESERVATION },
    });
  });

  it('sends a late nudge to the booking, carrying the offered minutes', () => {
    // ReservationLateNudgeHandler. `extensionMinutes` is `ToString`ed there.
    const target = parsePushTarget({
      kind: 'reservation-late-nudge',
      reservationId: RESERVATION,
      action: 'extend-hold',
      extensionMinutes: '15',
    });

    expect(target).toEqual({
      kind: 'booking',
      reservationId: RESERVATION,
      action: 'extendHold',
      extensionMinutes: 15,
    });
  });

  it('sends an approval decision to the booking, with no action', () => {
    // ReservationDecidedHandler carries `approved` and offers no button.
    const target = parsePushTarget({
      kind: 'reservation-decided',
      reservationId: RESERVATION,
      approved: 'false',
    });

    expect(target).toEqual({
      kind: 'booking',
      reservationId: RESERVATION,
      action: null,
      extensionMinutes: null,
    });
  });

  it('sends a decision nobody made — the window ran out — to the booking, with no action', () => {
    // ReservationDecidedHandler for the expiry sweep: `approved` false and
    // `expired` true, both as text. The booking itself says why; the push
    // only has to land on it.
    const target = parsePushTarget({
      kind: 'reservation-decided',
      reservationId: RESERVATION,
      approved: 'false',
      expired: 'true',
    });

    expect(target).toEqual({
      kind: 'booking',
      reservationId: RESERVATION,
      action: null,
      extensionMinutes: null,
    });
    expect(routeFor(target)).toEqual({
      pathname: '/booking/[bookingId]',
      params: { bookingId: RESERVATION },
    });
  });

  it('sends a declined change to the booking it is about, which stands at its old slot', () => {
    // ReservationDecidedHandler for a change the floor did not confirm: the
    // booking went back to the slot it had. Every flag is text.
    const target = parsePushTarget({
      kind: 'reservation-decided',
      reservationId: RESERVATION,
      approved: 'false',
      expired: 'true',
      wasChange: 'true',
      originalKept: 'true',
    });

    expect(target).toEqual({
      kind: 'booking',
      reservationId: RESERVATION,
      action: null,
      extensionMinutes: null,
    });
    expect(routeFor(target)).toEqual({
      pathname: '/booking/[bookingId]',
      params: { bookingId: RESERVATION },
    });
  });

  it('sends a participant approval and an order-ready to the tab', () => {
    for (const kind of ['participant-approved', 'order-ready']) {
      const target = parsePushTarget({ kind, tabId: TAB });
      expect(target).toEqual({ kind: 'tab', tabId: TAB });
      expect(routeFor(target)).toEqual({
        pathname: '/tab/[tabId]',
        params: { tabId: TAB },
      });
    }
  });

  it("sends the host's join request to the tab, where the banner lets them in", () => {
    // TabJoinRequestedHandler. The tab screen shows whoever is waiting at the
    // top of the bill, with Approve beside them; the push only routes there.
    const target = parsePushTarget({ kind: 'tabJoinRequested', tabId: TAB });
    expect(target).toEqual({ kind: 'tab', tabId: TAB });
    expect(routeFor(target)).toEqual({ pathname: '/tab/[tabId]', params: { tabId: TAB } });

    expect(parsePushTarget({ kind: 'tabJoinRequested' })).toEqual({ kind: 'unknown' });
  });

  it('routes nowhere for a type this build does not know', () => {
    // The same rule as the tab event stream. A server one version ahead must
    // not be able to crash a phone, and it must not send it to the home tab
    // either — an unroutable notification leaves the app where it was.
    const target = parsePushTarget({ kind: 'table-ready-for-dessert', tabId: TAB });
    expect(target).toEqual({ kind: 'unknown' });
    expect(routeFor(target)).toBeNull();
  });

  it('routes nowhere when the id the screen needs is missing', () => {
    // Landing on the bookings list would be a guess, and a wrong guess is
    // somebody hunting for the booking the notification was about.
    expect(parsePushTarget({ kind: 'reservation-reminder', code: 'YAL-1' })).toEqual({
      kind: 'unknown',
    });
    expect(parsePushTarget({ kind: 'order-ready' })).toEqual({ kind: 'unknown' });
    expect(parsePushTarget(null)).toEqual({ kind: 'unknown' });
    expect(parsePushTarget({})).toEqual({ kind: 'unknown' });
  });

  it('does not read a non-numeric extensionMinutes as a number', () => {
    const target = parsePushTarget({
      kind: 'reservation-late-nudge',
      reservationId: RESERVATION,
      action: 'extend-hold',
      extensionMinutes: '',
    });
    if (target.kind !== 'booking') throw new Error('expected a booking target');
    expect(target.extensionMinutes).toBeNull();
  });
});

describe('which button was tapped', () => {
  it('recognises the two registered actions and nothing else', () => {
    expect(actionFor(PUSH_ACTIONS.cancel)).toBe(PUSH_ACTIONS.cancel);
    expect(actionFor(PUSH_ACTIONS.extendHold)).toBe(PUSH_ACTIONS.extendHold);
    // Expo's own identifier for "the body was tapped".
    expect(actionFor('expo.modules.notifications.actions.DEFAULT')).toBeNull();
    expect(actionFor(undefined)).toBeNull();
  });
});

/**
 * A booking the mock has actually confirmed, since the mock world seeds none.
 * It is for later today, which waits for the floor now; the floor here says
 * yes at once, because these tests are about what comes after.
 */
const NOW = new Date('2026-09-04T14:30:00Z');
const BRANCH = 'b-lumen-north';
const SLOT = new Date('2026-09-04T18:00:00Z').toISOString();

async function aConfirmedBooking() {
  let clock = NOW;
  const gateway = createMockGateway({
    now: () => clock,
    latencyMs: 0,
    simulateJoiners: false,
    floorApprovesAtOnce: true,
  });

  const challenge = await gateway.requestPhoneCode('+37411223344');
  const verified = await gateway.verifyPhoneCode({
    challengeId: challenge.challengeId,
    code: challenge.devCode ?? '123456',
  });

  const availability = await gateway.getTableAvailability({
    branchId: BRANCH,
    slotUtc: SLOT,
    partySize: 2,
  });
  const table = availability.find((candidate) => candidate.isBookable);
  expect(table, 'the mock branch needs a bookable table').toBeDefined();

  const booking = await gateway.createBooking({
    commandId: 'b9f10039-79af-459f-86a2-7080424ff7c6',
    branchId: BRANCH,
    tableId: table!.tableId,
    slotUtc: SLOT,
    partySize: 2,
    guestPhone: verified.phoneE164,
    timeZoneId: 'Asia/Yerevan',
    guestName: 'Ani',
    channel: 'app',
  });
  expect(booking.status).toBe('confirmed');

  /** Five minutes after the start: late, which is when a table is held longer. */
  const arrive = () => {
    clock = new Date(Date.parse(SLOT) + 5 * 60_000);
  };

  return { gateway, booking, arrive };
}

// --- Test 7, second half: a stale action --------------------------------------

describe('an action offered against a booking that has moved on', () => {
  it('is not offered for a cancelled, seated or finished reservation', () => {
    // The notification fired an hour ago and is being read now. What it asked
    // for is decided by the state, not by the payload that is still on screen.
    expect(actionIsLive('confirmed')).toBe(true);
    expect(actionIsLive('pendingApproval')).toBe(true);

    expect(actionIsLive('cancelledByDiner')).toBe(false);
    expect(actionIsLive('cancelledByVenue')).toBe(false);
    expect(actionIsLive('seated')).toBe(false);
    expect(actionIsLive('completed')).toBe(false);
    expect(actionIsLive('noShow')).toBe(false);
    // A status added after this build shipped offers nothing, which is the safe
    // reading of "the server knows something I do not".
    expect(actionIsLive('unknown')).toBe(false);
  });

  it('offers the hold extension only where a table is actually being held', () => {
    // A pending booking holds nothing; there is no hold to extend.
    expect(canExtendHold('confirmed')).toBe(true);
    expect(canExtendHold('pendingApproval')).toBe(false);
    expect(canExtendHold('seated')).toBe(false);
  });

  it('reads the current state on landing rather than trusting the payload', async () => {
    const { gateway, booking } = await aConfirmedBooking();

    // A reminder was sent while this was live; the diner cancelled from another
    // device; the notification is tapped afterwards.
    await gateway.cancelReservation({ reservationId: booking.id });

    const landed = await gateway.getReservationState(booking.id);
    expect(landed?.status).toBe('cancelledByDiner');
    expect(landed && actionIsLive(landed.status)).toBe(false);
  });
});

// --- Test 6: extend-hold, refused the second time -----------------------------

describe('extending a hold', () => {
  it('is refused before the booking starts, and spends nothing', async () => {
    const { gateway, booking, arrive } = await aConfirmedBooking();

    // Three and a half hours early: there is no held table to keep yet.
    const early = await gateway
      .extendReservationHold({
        reservationId: booking.id,
        clientCommandId: '92a0b0e6-19ca-4ffe-8c9b-15061b1a0647',
      })
      .then(
        () => null,
        (error: unknown) => error as Error,
      );
    expect(early?.name).toBe('HoldNotActiveError');

    // And the one extension is still there once they are actually late.
    arrive();
    await expect(
      gateway.extendReservationHold({
        reservationId: booking.id,
        clientCommandId: '6e8a11c8-8e1e-43e9-85f6-313ed93a0202',
      }),
    ).resolves.toMatchObject({ wasReplay: false });
  });

  it('works once', async () => {
    const { gateway, booking, arrive } = await aConfirmedBooking();
    arrive();

    const outcome = await gateway.extendReservationHold({
      reservationId: booking.id,
      clientCommandId: '11111111-1111-4111-8111-111111111111',
    });

    expect(outcome.extensionMinutes).toBeGreaterThan(0);
    // Stated by the server so a button can be greyed out rather than tapped
    // and refused.
    expect(outcome.extensionsRemaining).toBe(0);
    expect(outcome.wasReplay).toBe(false);
  });

  it('replays the same command rather than refusing it', async () => {
    // A notification is tappable twice, and the second tap on a bad connection
    // is a retry, not a second request. Reusing the command id is what keeps
    // those apart — the server answers with the original result.
    const { gateway, booking, arrive } = await aConfirmedBooking();
    arrive();
    const clientCommandId = '22222222-2222-4222-8222-222222222222';

    const first = await gateway.extendReservationHold({
      reservationId: booking.id,
      clientCommandId,
    });
    const second = await gateway.extendReservationHold({
      reservationId: booking.id,
      clientCommandId,
    });

    expect(first.wasReplay).toBe(false);
    expect(second.wasReplay).toBe(true);
    expect(second.holdExpiresAtUtc).toBe(first.holdExpiresAtUtc);
  });

  it('refuses a genuine second attempt with the specific error, not a generic one', async () => {
    const { gateway, booking, arrive } = await aConfirmedBooking();
    arrive();

    await gateway.extendReservationHold({
      reservationId: booking.id,
      clientCommandId: '33333333-3333-4333-8333-333333333333',
    });

    // A different command id: this is somebody asking for a second extension,
    // not retrying the first.
    const second = gateway.extendReservationHold({
      reservationId: booking.id,
      clientCommandId: '44444444-4444-4444-8444-444444444444',
    });

    await expect(second).rejects.toSatisfy(isHoldAlreadyExtended);

    // And the screen can therefore say "you have already let them know" rather
    // than "something went wrong". The distinction is the whole test: the
    // server sends `conflicting-state` with prose and no field name, so without
    // this typed error the only honest copy left is a generic failure.
    await second.catch((error: unknown) => {
      expect(isHoldAlreadyExtended(error)).toBe(true);
      if (!isHoldAlreadyExtended(error)) return;
      expect(error.reservationId).toBe(booking.id);
      expect(error.status).toBe(409);
    });
  });
});

// --- Booking times: a later guest asks for the diner's table -----------------

describe('a request for the diner’s table', () => {
  const REQUEST = '7b1f0a2c-0000-4000-8000-0000000000aa';

  it('routes to the booking it is about, carrying the request', () => {
    const target = parsePushTarget({
      kind: 'table-request',
      reservationId: RESERVATION,
      requestId: REQUEST,
    });
    expect(target).toEqual({
      kind: 'tableRequest',
      reservationId: RESERVATION,
      requestId: REQUEST,
    });
    expect(routeFor(target)).toEqual({
      pathname: '/booking/[bookingId]',
      params: { bookingId: RESERVATION },
    });
  });

  it('routes what came of the answer to the booking that promised it', () => {
    const target = parsePushTarget({
      kind: 'table-request-decided',
      reservationId: RESERVATION,
      requestId: REQUEST,
      accepted: 'true',
      freeByTime: '19:40',
    });
    expect(routeFor(target)).toEqual({
      pathname: '/booking/[bookingId]',
      params: { bookingId: RESERVATION },
    });
  });

  it('is not routable without the booking or the request', () => {
    expect(parsePushTarget({ kind: 'table-request', reservationId: RESERVATION })).toEqual({
      kind: 'unknown',
    });
    expect(parsePushTarget({ kind: 'table-request', requestId: REQUEST })).toEqual({
      kind: 'unknown',
    });
  });

  it('opens the booking with the answer the button gave, for its card to send and confirm', () => {
    const target = {
      kind: 'tableRequest',
      reservationId: RESERVATION,
      requestId: REQUEST,
    } as const;
    expect(tableRequestRoute(target, true)).toEqual({
      pathname: '/booking/[bookingId]',
      params: { bookingId: RESERVATION, answer: 'yes', requestId: REQUEST },
    });
    expect(tableRequestRoute(target, false).params.answer).toBe('no');
  });

  it('knows its Yes and No buttons, and they answer it', () => {
    expect(actionFor(PUSH_ACTIONS.tableRequestYes)).toBe(PUSH_ACTIONS.tableRequestYes);
    expect(actionFor(PUSH_ACTIONS.tableRequestNo)).toBe(PUSH_ACTIONS.tableRequestNo);
    expect(tableRequestAnswer(PUSH_ACTIONS.tableRequestYes)).toBe(true);
    expect(tableRequestAnswer(PUSH_ACTIONS.tableRequestNo)).toBe(false);
    expect(tableRequestAnswer(PUSH_ACTIONS.cancel)).toBeNull();
  });
});

describe('a change or a cancel made with the web manage link', () => {
  it('sends both to the booking they are about, with no action', () => {
    for (const kind of ['reservation-changed-by-link', 'reservation-cancelled-by-link']) {
      expect(parsePushTarget({ kind, reservationId: 'r-link' })).toEqual({
        kind: 'booking',
        reservationId: 'r-link',
        action: null,
        extensionMinutes: null,
      });
    }
  });
});

/*
 * Guest record (2026-10-20): a booking marked a no-show opens that booking;
 * the week's pause after three in three days, and its early end, open the
 * bookings tab — they name no booking.
 */
describe('a no-show, and the pause on booking', () => {
  it('sends a no-show to the booking it was marked on', () => {
    expect(parsePushTarget({ kind: 'booking-no-show', reservationId: 'r-missed' })).toEqual({
      kind: 'booking',
      reservationId: 'r-missed',
      action: null,
      extensionMinutes: null,
    });
  });

  it('opens the bookings tab for the pause and for its end, with no booking id', () => {
    for (const kind of ['bookings-blocked-no-shows', 'bookings-unblocked']) {
      const target = parsePushTarget({ kind, blockedUntilUtc: '2026-10-27T09:30:00Z' });
      expect(target).toEqual({ kind: 'bookings' });
      expect(routeFor(target)).toEqual({ pathname: '/(tabs)/bookings' });
    }
  });
});

/**
 * "Are you on your way?" (pre-orders, 2026-10-21): 45 minutes before a booking
 * with a pre-order. It lands on the booking, which asks again from the booking
 * as it stands; its two buttons open the app there — "Yes" is sent by the
 * booking's card, "Can't come" opens the ordinary cancel, which asks first.
 */
describe('are you on your way?', () => {
  const data = {
    kind: 'reservation-on-your-way',
    reservationId: RESERVATION,
    code: 'K7Q2LM',
    actions: 'on-my-way,cancel',
  };

  it('lands on the booking it is about', () => {
    const target = parsePushTarget(data);
    expect(target).toEqual({
      kind: 'booking',
      reservationId: RESERVATION,
      action: null,
      extensionMinutes: null,
    });
    expect(routeFor(target)).toEqual({
      pathname: '/booking/[bookingId]',
      params: { bookingId: RESERVATION },
    });
  });

  it('is not routable without its booking', () => {
    expect(parsePushTarget({ kind: 'reservation-on-your-way' })).toEqual({ kind: 'unknown' });
  });

  it('its buttons open the booking carrying the answer, never answering unseen', () => {
    expect(actionFor(PUSH_ACTIONS.onMyWay)).toBe(PUSH_ACTIONS.onMyWay);
    expect(onYourWayAnswer(actionFor(PUSH_ACTIONS.onMyWay))).toBe('yes');
    expect(onYourWayAnswer(actionFor(PUSH_ACTIONS.cantCome))).toBe('cantCome');
    expect(onYourWayAnswer(actionFor(PUSH_ACTIONS.cancel))).toBeNull();
    expect(onYourWayAnswer(null)).toBeNull();
    expect(onYourWayRoute(RESERVATION, 'yes')).toEqual({
      pathname: '/booking/[bookingId]',
      params: { bookingId: RESERVATION, onMyWay: 'yes' },
    });
    expect(onYourWayRoute(RESERVATION, 'cantCome').params.onMyWay).toBe('cantCome');
  });
});

/**
 * Takeaway (2026-10-22): an order accepted, ready or declined lands on its
 * status screen, which reads the order as it stands.
 */
describe('a takeaway order', () => {
  it.each(['takeaway-accepted', 'takeaway-ready', 'takeaway-declined'])(
    '%s opens its status screen',
    (kind) => {
      const target = parsePushTarget({ kind, orderId: 'tw-1', code: 'T-482' });
      expect(target).toEqual({ kind: 'takeaway', orderId: 'tw-1' });
      expect(routeFor(target)).toEqual({
        pathname: '/takeaway/[orderId]',
        params: { orderId: 'tw-1' },
      });
    },
  );

  it('is not routable without its order', () => {
    expect(parsePushTarget({ kind: 'takeaway-ready' })).toEqual({ kind: 'unknown' });
  });
});
