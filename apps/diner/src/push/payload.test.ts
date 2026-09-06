import { createMockGateway, isHoldAlreadyExtended, actionIsLive, canExtendHold } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { actionFor, parsePushTarget, PUSH_ACTIONS, routeFor } from './payload';

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

/** A booking the mock has actually confirmed, since the mock world seeds none. */
const NOW = new Date('2026-09-04T14:30:00Z');
const BRANCH = 'b-lumen-north';
const SLOT = new Date('2026-09-04T18:00:00Z').toISOString();

async function aConfirmedBooking() {
  const gateway = createMockGateway({ now: () => NOW, latencyMs: 0, simulateJoiners: false });

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
    commandId: 'cmd-push-test',
    branchId: BRANCH,
    tableId: table!.tableId,
    slotUtc: SLOT,
    partySize: 2,
    verificationToken: verified.verificationToken,
  });
  expect(booking.status).toBe('confirmed');

  return { gateway, booking };
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
  it('works once', async () => {
    const { gateway, booking } = await aConfirmedBooking();

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
    const { gateway, booking } = await aConfirmedBooking();
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
    const { gateway, booking } = await aConfirmedBooking();

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
