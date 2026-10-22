import { describe, expect, it } from 'vitest';
import type { components } from '../generated/schema';
import { awaitingApprovalFromWire, type WireAwaitingApproval } from './awaitingApprovalMapping';
import { consoleBookingFromWire } from './consoleMapping';
import { booking } from './dinerMapping';
import { managedBookingFromWire, type WirePublicBooking } from './publicMapping';

/**
 * Whose answer a booking for the guest before's table waits on.
 *
 * Since every earlier-guest wait has a clock — the guest's own two hours in the
 * app, and the floor's two hours to ring them and decide — the clock no longer
 * says whose it is. `awaitsEarlierGuestAnswer` on `ReservationView` does: true
 * while the guest before answers it themselves, and only then is the venue's
 * approve and reject refused. A server that does not send it reads as the
 * floor's, and the 409 `reservation-awaiting-earlier-guest` corrects a screen
 * that offered a decision it should not have.
 */

type ReservationView = components['schemas']['Yalla.Application.Reservations.ReservationView'];

const VIEW: ReservationView = {
  id: 'r-1',
  code: 'Y3107',
  status: 1,
  branchId: 'b-1',
  branchName: 'Northern Avenue',
  tableId: 'tbl-7',
  tableLabel: '7',
  partySize: 2,
  startUtc: '2026-10-20T15:45:00Z',
  onMyWayOpensAtUtc: '2026-10-20T13:45:00Z',
  endUtc: '2026-10-20T17:25:00Z',
  localDate: '2026-10-20',
  localStartTime: '19:45:00',
  localEndTime: '21:25:00',
  timeZoneId: 'Asia/Yerevan',
  cancellationDeadlineUtc: '2026-10-20T13:45:00Z',
  cancelledAfterDeadline: false,
  clientCommandId: 'cmd-1',
  guestName: 'Carmen QA',
  guestPhone: '+37493217788',
  wasReplay: false,
  awaitsEarlierGuestAnswer: false,
  phoneUnverified: false,
};

function waiting(extra: Record<string, unknown>): ReservationView {
  return {
    ...VIEW,
    awaitingApprovalBecause: 5,
    approvalExpiresAtUtc: '2026-10-19T12:00:00Z',
    ...extra,
  } as unknown as ReservationView;
}

describe("whose answer an earlier guest's booking waits on", () => {
  it('reads the flag on the console row, while it waits', () => {
    expect(
      consoleBookingFromWire(waiting({ awaitsEarlierGuestAnswer: true })).awaitsEarlierGuestAnswer,
    ).toBe(true);
    const floors = consoleBookingFromWire(waiting({ awaitsEarlierGuestAnswer: false }));
    expect(floors).toMatchObject({
      awaitingApprovalBecause: 'earlierGuestConsent',
      approvalExpiresAtUtc: '2026-10-19T12:00:00Z',
      awaitsEarlierGuestAnswer: false,
    });
    expect(consoleBookingFromWire(waiting({})).awaitsEarlierGuestAnswer).toBe(false);
    // Decided: nobody's answer is awaited, whatever a stale flag says.
    expect(
      consoleBookingFromWire(waiting({ status: 2, awaitsEarlierGuestAnswer: true }))
        .awaitsEarlierGuestAnswer,
    ).toBe(false);
  });

  it("reads it on the diner's booking too", () => {
    expect(
      booking(waiting({ awaitsEarlierGuestAnswer: true }), null).awaitsEarlierGuestAnswer,
    ).toBe(true);
    expect(booking(waiting({}), null).awaitsEarlierGuestAnswer).toBe(false);
    expect(
      booking(waiting({ status: 7, awaitsEarlierGuestAnswer: true }), null)
        .awaitsEarlierGuestAnswer,
    ).toBe(false);
  });

  it("reads it on the floor tablet's row — the floor's own two hours included", () => {
    const row = (extra: Record<string, unknown>) =>
      ({
        reservation: waiting(extra),
        trigger: 5,
        approvalExpiresAtUtc: '2026-10-19T12:00:00Z',
      }) as unknown as WireAwaitingApproval;

    expect(awaitingApprovalFromWire(row({ awaitsEarlierGuestAnswer: false }))).toMatchObject({
      because: 'earlierGuestConsent',
      approvalExpiresAtUtc: '2026-10-19T12:00:00Z',
      awaitsEarlierGuestAnswer: false,
    });
    expect(
      awaitingApprovalFromWire(row({ awaitsEarlierGuestAnswer: true })).awaitsEarlierGuestAnswer,
    ).toBe(true);
  });

  it('reads it on the manage link when the server sends it, and leaves it unsaid when not', () => {
    const managed = (extra: Record<string, unknown>) =>
      managedBookingFromWire(
        {
          code: 'Y3107',
          status: 1,
          timeZoneId: 'Asia/Yerevan',
          localDate: '2026-10-20',
          localStartTime: '19:45:00',
          approvalExpiresAtUtc: '2026-10-19T12:00:00Z',
          awaitingApprovalBecause: 5,
          ...extra,
        } as unknown as WirePublicBooking,
        { venueSlug: 'v', branchSlug: 'b' },
      ).awaitsEarlierGuestAnswer;

    expect(managed({ awaitsEarlierGuestAnswer: false })).toBe(false);
    expect(managed({ awaitsEarlierGuestAnswer: true })).toBe(true);
    // Not sent: the page says the sentence true either way.
    expect(managed({})).toBeUndefined();
    expect(managed({ status: 2, awaitsEarlierGuestAnswer: true })).toBe(false);
  });
});
