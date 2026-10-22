import { describe, expect, it } from 'vitest';
import {
  askOnMyWayBlock,
  canAnswerOnMyWay,
  guestAnswered,
  guestAnsweredAtUtc,
  isRunningLateMinutes,
  onMyWayOpensAtUtc,
  venueIsAsking,
} from './onMyWay';

/**
 * The "I'm coming" rules the booking screen and the tablet decide their
 * buttons by (2026-10-22): the window, "the guest answered", and why the
 * venue may not ask — in the server's order.
 */

const START = '2026-10-22T16:00:00.000Z';
const END = '2026-10-22T17:30:00.000Z';
const at = (minutes: number) => new Date(Date.parse(START) + minutes * 60_000);
const iso = (minutes: number) => at(minutes).toISOString();

describe('the window', () => {
  it('opens two hours before the start', () => {
    expect(onMyWayOpensAtUtc(START)).toBe(iso(-120));
  });

  it("shows the guest's buttons on a confirmed booking from then until it ends", () => {
    const booking = { status: 'confirmed' as const, startUtc: START, endUtc: END };
    expect(canAnswerOnMyWay(booking, at(-121))).toBe(false);
    expect(canAnswerOnMyWay(booking, at(-120))).toBe(true);
    expect(canAnswerOnMyWay(booking, at(30))).toBe(true);
    expect(canAnswerOnMyWay(booking, at(90))).toBe(false);
    expect(canAnswerOnMyWay({ ...booking, status: 'pendingApproval' }, at(-10))).toBe(false);
    // The server's own opening wins when it says one.
    expect(canAnswerOnMyWay({ ...booking, onMyWayOpensAtUtc: iso(-30) }, at(-60))).toBe(false);
  });

  it('takes 10, 15 or 30 minutes late, nothing else', () => {
    expect([10, 15, 30, 20, '10'].map(isRunningLateMinutes)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });
});

describe('the guest answered', () => {
  it('is on my way or running late, whichever came last', () => {
    expect(guestAnswered({})).toBe(false);
    expect(guestAnswered({ guestConfirmedOnWayAtUtc: iso(-20) })).toBe(true);
    expect(guestAnswered({ guestRunningLateMinutes: 15 })).toBe(true);
    expect(
      guestAnsweredAtUtc({ guestConfirmedOnWayAtUtc: iso(-20), guestRunningLateAtUtc: iso(-5) }),
    ).toBe(iso(-5));
    expect(guestAnsweredAtUtc({})).toBeNull();
  });

  it("shows the venue's question until then", () => {
    expect(venueIsAsking({ staffAskedOnMyWayAtUtc: iso(-10) })).toBe(true);
    expect(
      venueIsAsking({ staffAskedOnMyWayAtUtc: iso(-10), guestConfirmedOnWayAtUtc: iso(-5) }),
    ).toBe(false);
    expect(venueIsAsking({})).toBe(false);
  });
});

describe("the venue's ask", () => {
  const booking = { status: 'confirmed' as const, startUtc: START };

  it('is open from two hours before the start until the start', () => {
    expect(askOnMyWayBlock(booking, at(-60))).toBeNull();
    expect(askOnMyWayBlock(booking, at(-121))).toEqual({ kind: 'tooEarly', opensAtUtc: iso(-120) });
    expect(askOnMyWayBlock(booking, at(0))).toEqual({ kind: 'started' });
    expect(askOnMyWayBlock({ ...booking, status: 'seated' }, at(-10))).toEqual({
      kind: 'notConfirmed',
    });
  });

  it('is closed once the guest answered, and for fifteen minutes after an ask', () => {
    expect(
      askOnMyWayBlock(
        { ...booking, guestRunningLateMinutes: 10, guestRunningLateAtUtc: iso(-50) },
        at(-40),
      ),
    ).toEqual({ kind: 'answered', answeredAtUtc: iso(-50) });
    expect(askOnMyWayBlock({ ...booking, staffAskedOnMyWayAtUtc: iso(-50) }, at(-40))).toEqual({
      kind: 'askedRecently',
      nextAllowedAtUtc: iso(-35),
    });
    expect(askOnMyWayBlock({ ...booking, staffAskedOnMyWayAtUtc: iso(-50) }, at(-35))).toBeNull();
  });
});
