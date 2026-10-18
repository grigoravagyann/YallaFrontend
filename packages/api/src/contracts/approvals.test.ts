import { describe, expect, it } from 'vitest';
import { ConcurrencyConflictError, NotFoundError } from '../errors';
import { waitsOnEarlierGuestInApp, approvalCountdown, isApprovalExpired } from './approvals';

/**
 * The answer window, as every surface counts it down.
 *
 * The tablet, the console, the diner's phone and the public page all show the
 * same `mm:ss` from the same server instant, so the arithmetic is here once.
 */

const EXPIRES = '2026-10-18T18:15:00Z';
const at = (iso: string) => new Date(iso);

describe('approvalCountdown', () => {
  it('counts whole seconds to the server instant, as mm:ss', () => {
    expect(approvalCountdown(EXPIRES, at('2026-10-18T18:00:55Z'))).toEqual({
      secondsLeft: 14 * 60 + 5,
      label: '14:05',
      expired: false,
      urgent: false,
    });
  });

  it('rounds a part-second up, so the last second is not shown as closed', () => {
    const last = approvalCountdown(EXPIRES, at('2026-10-18T18:14:59.400Z'));
    expect(last).toMatchObject({ secondsLeft: 1, label: '00:01', expired: false });
  });

  it('is urgent in the last two minutes, and not before', () => {
    expect(approvalCountdown(EXPIRES, at('2026-10-18T18:13:00Z'))?.urgent).toBe(true);
    expect(approvalCountdown(EXPIRES, at('2026-10-18T18:12:59Z'))?.urgent).toBe(false);
  });

  it('stops at zero once the window has closed, and says so', () => {
    expect(approvalCountdown(EXPIRES, at('2026-10-18T18:20:00Z'))).toEqual({
      secondsLeft: 0,
      label: '00:00',
      expired: true,
      urgent: false,
    });
  });

  it('is nothing for a booking that waits without a window', () => {
    expect(approvalCountdown(null, at('2026-10-18T18:00:00Z'))).toBeNull();
    expect(approvalCountdown(undefined, at('2026-10-18T18:00:00Z'))).toBeNull();
    expect(approvalCountdown('not a date', at('2026-10-18T18:00:00Z'))).toBeNull();
  });
});

describe('isApprovalExpired', () => {
  const problem = (code: string) => ({
    type: 'about:blank',
    title: 'Conflict',
    status: 409,
    detail: 'The answer window for LM7Q closed at 18:15.',
    code,
    traceId: 't',
  });

  it('recognises the too-late 409 by its code', () => {
    const late = new ConcurrencyConflictError({
      url: 'x',
      problem: problem('reservation-approval-expired'),
    });
    expect(isApprovalExpired(late)).toBe(true);
  });

  it('does not mistake somebody else deciding first for it', () => {
    const decided = new ConcurrencyConflictError({ url: 'x', problem: problem('conflict') });
    expect(isApprovalExpired(decided)).toBe(false);
    expect(isApprovalExpired(new NotFoundError({ url: 'x' }))).toBe(false);
    expect(isApprovalExpired(new Error('reservation-approval-expired'))).toBe(false);
  });
});

describe('waitsOnEarlierGuestInApp', () => {
  it("is the guest before's to answer only when the server says so — a clock alone no longer does", () => {
    expect(waitsOnEarlierGuestInApp('earlierGuestConsent', true)).toBe(true);
    // The floor's two hours to ring them and decide: the venue's answer.
    expect(waitsOnEarlierGuestInApp('earlierGuestConsent', false)).toBe(false);
    // A server that does not say: the floor's, until a 409 says otherwise.
    expect(waitsOnEarlierGuestInApp('earlierGuestConsent', undefined)).toBe(false);
    expect(waitsOnEarlierGuestInApp('shortNotice', true)).toBe(false);
    expect(waitsOnEarlierGuestInApp(null, null)).toBe(false);
  });
});
