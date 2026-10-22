import {
  PhoneNotVerifiedError,
  TakeawayBusyError,
  TakeawayClosedError,
  TakeawayItemsUnavailableError,
  TakeawayNotAcceptedError,
  TakeawaySlotUnavailableError,
  TakeawayStatusConflictError,
  TimeoutError,
  UnauthorizedError,
} from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { cancelFailureLine, namesFrom, sendFailureLine, takeawayFailure } from './failure';
import { readyLine, showsCode, statusCase, takeawaySteps } from './status';
import { KHASHLAMA, PORK, takeawayOrder } from './testFixtures';

/**
 * The status screen's words and steps, and every refusal a send or a cancel
 * can meet said as a sentence with its way on.
 */

describe('the steps', () => {
  it('a sent order has done nothing but be sent', () => {
    const steps = takeawaySteps(takeawayOrder());
    expect(steps.map((step) => step.state)).toEqual(['current', 'todo', 'todo', 'todo']);
    expect(steps[0]?.atUtc).toBe('2026-10-22T14:45:00Z');
    expect(steps[1]?.atUtc).toBeNull();
  });

  it('an accepted one is being prepared, with the time it was accepted', () => {
    const steps = takeawaySteps(
      takeawayOrder({ status: 'accepted', acceptedAtUtc: '2026-10-22T14:47:00Z' }),
    );
    expect(steps.map((step) => step.state)).toEqual(['done', 'current', 'todo', 'todo']);
    expect(steps[1]?.atUtc).toBe('2026-10-22T14:47:00Z');
  });

  it('a collected one is done all the way', () => {
    const steps = takeawaySteps(takeawayOrder({ status: 'collected' }));
    expect(steps.every((step) => step.state === 'done')).toBe(true);
  });

  it('a declined, cancelled or uncollected one has no steps', () => {
    for (const status of ['declined', 'cancelled', 'noShow'] as const) {
      expect(takeawaySteps(takeawayOrder({ status }))).toEqual([]);
    }
  });
});

describe('the words', () => {
  it("tells a decline for no answer from the venue's own", () => {
    expect(statusCase({ status: 'declined', declinedBecause: 'noAnswer' })).toBe(
      'declinedNoAnswer',
    );
    expect(statusCase({ status: 'declined', declinedBecause: 'venue' })).toBe('declined');
    expect(statusCase({ status: 'unknown', declinedBecause: null })).toBe('sent');
  });

  it('shows the code while it can be collected', () => {
    expect(showsCode('sent')).toBe(true);
    expect(showsCode('ready')).toBe(true);
    expect(showsCode('collected')).toBe(false);
    expect(showsCode('declined')).toBe(false);
  });

  it('says the time asked for, then the time promised', () => {
    expect(readyLine(takeawayOrder())).toEqual({
      key: 'takeaway.status.readyAround',
      time: '19:05',
    });
    expect(readyLine(takeawayOrder({ status: 'accepted', readyAt: '19:10' }))).toEqual({
      key: 'takeaway.status.readyAt',
      time: '19:10',
    });
    expect(readyLine(takeawayOrder({ status: 'ready', readyAt: '19:10' }))?.key).toBe(
      'takeaway.status.waitingSince',
    );
    expect(readyLine(takeawayOrder({ status: 'collected' }))).toBeNull();
  });
});

describe('a refusal, said', () => {
  const url = '/api/diner/takeaway-orders';

  it.each([
    [new UnauthorizedError({ url }), 'takeaway.error.signIn'],
    [new PhoneNotVerifiedError({ url }), 'takeaway.error.verify'],
    [new TakeawayNotAcceptedError({ url }), 'takeaway.error.notAccepted'],
    [new TakeawayClosedError({ url }), 'takeaway.error.closed'],
    [new TakeawayBusyError({ url }), 'takeaway.error.busy'],
    [new TakeawaySlotUnavailableError({ url, slots: ['20:00'] }), 'takeaway.error.slot'],
    [new TakeawaySlotUnavailableError({ url, slots: [] }), 'takeaway.error.slotNone'],
    [new TimeoutError({ url, timeoutMs: 10 }), 'takeaway.error.offline'],
    [new Error('boom'), 'takeaway.error.unknown'],
  ])('%s', (error, key) => {
    expect(sendFailureLine(takeawayFailure(error)).key).toBe(key);
  });

  it('closed until a time says the time', () => {
    const line = sendFailureLine(
      takeawayFailure(new TakeawayClosedError({ url, opensAt: '10:00' })),
    );
    expect(line).toEqual({ key: 'takeaway.error.closedUntil', params: { time: '10:00' } });
  });

  it('names the dishes that cannot be taken away', () => {
    const failure = takeawayFailure(
      new TakeawayItemsUnavailableError({
        url,
        items: [{ menuItemId: 'khashlama', reason: 'notForTakeaway' }],
      }),
    );
    expect(failure).toEqual({ kind: 'items', menuItemIds: ['khashlama'] });
    expect(sendFailureLine(failure, namesFrom([PORK, KHASHLAMA]))).toEqual({
      key: 'takeaway.error.items',
      params: { names: 'Khashlama' },
    });
    expect(sendFailureLine(failure).key).toBe('takeaway.error.itemsPlain');
  });

  it('a cancel after the venue answered is too late, not a failure', () => {
    const conflict = takeawayFailure(
      new TakeawayStatusConflictError({ url, orderStatus: 'accepted' }),
    );
    expect(cancelFailureLine(conflict).key).toBe('takeaway.status.cancelTooLate');
    expect(cancelFailureLine(takeawayFailure(new Error('x'))).key).toBe(
      'takeaway.status.cancelFailed',
    );
  });
});
