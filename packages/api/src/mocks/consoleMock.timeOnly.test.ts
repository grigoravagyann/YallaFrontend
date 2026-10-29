import { describe, expect, it } from 'vitest';
import { PolicyBoundsError } from '../contracts/errors';
import { createConsoleMockGateway } from './consoleMock';

/**
 * Booking by time only in the console mock (2026-10-29): the policy's mode and
 * capacity, refused as the server refuses them, and the readiness table line
 * met without a bookable table.
 */

const BRANCH = 'b-lumen-cascade';

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('booking by time only in the console mock', () => {
  it('ships choosing a table, with no capacity', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    expect(await gateway.getReservationPolicy(BRANCH)).toMatchObject({
      bookingMode: 'chooseTable',
      guestsAtOnce: null,
    });
  });

  it('refuses time only without how many guests it takes at once, naming the field', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const policy = await gateway.getReservationPolicy(BRANCH);

    for (const guestsAtOnce of [null, 0, 2001]) {
      const refusal = await caught(
        gateway.replaceReservationPolicy({
          branchId: BRANCH,
          policy: { ...policy, bookingMode: 'timeOnly', guestsAtOnce },
        }),
      );
      expect(refusal).toBeInstanceOf(PolicyBoundsError);
      expect((refusal as PolicyBoundsError).field).toBe('guestsAtOnce');
    }
  });

  it('keeps no capacity for a branch whose diners choose a table', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const policy = await gateway.getReservationPolicy(BRANCH);

    const saved = await gateway.replaceReservationPolicy({
      branchId: BRANCH,
      policy: { ...policy, guestsAtOnce: 40 },
    });

    expect(saved.policy.guestsAtOnce).toBeNull();
  });

  it('meets the table line without a bookable table once the branch books by time', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const before = await gateway.getBranchReadiness(BRANCH);
    // The mock's rooms have no photos: no table a diner can book.
    expect(before).toMatchObject({ booksByTimeOnly: false, bookableTableCount: 0 });
    expect(before.missingForGuests).toContain('no-bookable-table');

    const policy = await gateway.getReservationPolicy(BRANCH);
    await gateway.replaceReservationPolicy({
      branchId: BRANCH,
      policy: { ...policy, bookingMode: 'timeOnly', guestsAtOnce: 40 },
    });

    const after = await gateway.getBranchReadiness(BRANCH);
    expect(after).toMatchObject({ booksByTimeOnly: true, bookableTableCount: 0 });
    expect(after.missingForGuests).not.toContain('no-bookable-table');
    expect(await gateway.getReservationPolicy(BRANCH)).toMatchObject({
      bookingMode: 'timeOnly',
      guestsAtOnce: 40,
    });
  });
});
