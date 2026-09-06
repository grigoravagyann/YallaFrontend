import { beforeEach, describe, expect, it } from 'vitest';
import {
  ExpiredCodeError,
  LeadTimeExceededError,
  RateLimitedError,
  TableTakenError,
  TooManyAttemptsError,
  WrongCodeError,
  isTableTaken,
} from '../contracts/errors';
import type { YallaGateway } from '../gateway';
import { createMockGateway } from './mockGateway';

const BRANCH = 'b-lumen-north';
const NOW = new Date('2026-09-04T14:30:00Z');
/** Comfortably past the 15-minute lead time. */
const SLOT = new Date('2026-09-04T18:00:00Z').toISOString();

let gateway: YallaGateway;

beforeEach(() => {
  gateway = createMockGateway({ now: () => NOW });
});

async function verifiedToken(): Promise<string> {
  const challenge = await gateway.requestPhoneCode('+37411223344');
  const verified = await gateway.verifyPhoneCode({
    challengeId: challenge.challengeId,
    code: challenge.devCode ?? '123456',
  });
  return verified.verificationToken;
}

async function firstBookableTableId(partySize = 2): Promise<string> {
  const availability = await gateway.getTableAvailability({
    branchId: BRANCH,
    slotUtc: SLOT,
    partySize,
  });
  const bookable = availability.find((a) => a.isBookable);
  expect(bookable, 'fixture must contain a bookable table').toBeDefined();
  return bookable!.tableId;
}

describe('availability', () => {
  it('marks unbookable tables with a reason instead of hiding them', async () => {
    const availability = await gateway.getTableAvailability({
      branchId: BRANCH,
      slotUtc: SLOT,
      partySize: 2,
    });
    expect(availability.length).toBeGreaterThan(0);

    for (const entry of availability) {
      // Exactly one of the two must hold — never both, never neither.
      expect(entry.isBookable).toBe(entry.unavailableReason === null);
    }
    expect(availability.some((a) => a.unavailableReason !== null)).toBe(true);
  });

  it('reports a window with no end when nothing is booked after', async () => {
    const availability = await gateway.getTableAvailability({
      branchId: BRANCH,
      slotUtc: SLOT,
      partySize: 2,
    });
    const open = availability.find((a) => a.isBookable && a.window?.untilUtc === null);
    expect(open, 'a table with no later booking').toBeDefined();
    // "No booking after yours" is a real advantage, so it must be expressible.
    expect(open!.window!.minutes).toBeNull();
    expect(open!.window!.isShorterThanTurnTime).toBe(false);
  });

  it('flags a party larger than the instant-confirmation limit', async () => {
    const small = await gateway.getTableAvailability({
      branchId: BRANCH,
      slotUtc: SLOT,
      partySize: 2,
    });
    const large = await gateway.getTableAvailability({
      branchId: BRANCH,
      slotUtc: SLOT,
      partySize: 8,
    });
    expect(small.every((a) => !a.requiresApproval)).toBe(true);
    expect(large.every((a) => a.requiresApproval)).toBe(true);
  });

  it('marks tables too small for the party rather than omitting them', async () => {
    const availability = await gateway.getTableAvailability({
      branchId: BRANCH,
      slotUtc: SLOT,
      partySize: 8,
    });
    expect(availability.some((a) => a.unavailableReason === 'tooSmall')).toBe(true);
  });
});

describe('phone verification', () => {
  it('issues a challenge with a dev code so the flow is testable without SMS', async () => {
    const challenge = await gateway.requestPhoneCode('+37411223344');
    expect(challenge.challengeId).toBeTruthy();
    expect(challenge.devCode).toBe('123456');
  });

  it('exchanges the right code for a token', async () => {
    const token = await verifiedToken();
    expect(token).toMatch(/^vt_/u);
  });

  it('reports a wrong code with attempts remaining', async () => {
    const challenge = await gateway.requestPhoneCode('+37411223344');
    try {
      await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: '000000' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(WrongCodeError);
      expect((error as WrongCodeError).attemptsRemaining).toBe(2);
    }
  });

  it('burns the challenge after too many attempts, distinctly from a wrong code', async () => {
    const challenge = await gateway.requestPhoneCode('+37411223344');
    await expect(
      gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: '000000' }),
    ).rejects.toBeInstanceOf(WrongCodeError);
    await expect(
      gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: '000000' }),
    ).rejects.toBeInstanceOf(WrongCodeError);
    // Third strike burns it.
    await expect(
      gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: '000000' }),
    ).rejects.toBeInstanceOf(TooManyAttemptsError);
    // And stays burned even for the correct code.
    await expect(
      gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: '123456' }),
    ).rejects.toBeInstanceOf(TooManyAttemptsError);
  });

  it('reports an expired code distinctly', async () => {
    let clock = new Date(NOW);
    const g = createMockGateway({ now: () => clock });
    const challenge = await g.requestPhoneCode('+37411223344');

    clock = new Date(NOW.getTime() + 11 * 60_000); // TTL is 10 minutes
    await expect(
      g.verifyPhoneCode({ challengeId: challenge.challengeId, code: '123456' }),
    ).rejects.toBeInstanceOf(ExpiredCodeError);
  });

  it('treats an unknown challenge as expired rather than crashing', async () => {
    await expect(
      gateway.verifyPhoneCode({ challengeId: 'nope', code: '123456' }),
    ).rejects.toBeInstanceOf(ExpiredCodeError);
  });

  it('rate-limits repeated code requests, distinctly from too many attempts', async () => {
    for (let i = 0; i < 5; i += 1) await gateway.requestPhoneCode('+37411223344');
    try {
      await gateway.requestPhoneCode('+37411223344');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitedError);
      expect((error as RateLimitedError).retryAtUtc).toBeTruthy();
    }
  });

  it('rate-limits per number, not globally', async () => {
    for (let i = 0; i < 5; i += 1) await gateway.requestPhoneCode('+37411223344');
    // A tourist's foreign number must not be blocked by someone else's retries.
    await expect(gateway.requestPhoneCode('+447700900123')).resolves.toBeDefined();
  });
});

describe('createBooking', () => {
  it('confirms a normal party', async () => {
    const booking = await gateway.createBooking({
      commandId: 'cmd-1',
      branchId: BRANCH,
      tableId: await firstBookableTableId(),
      slotUtc: SLOT,
      partySize: 2,
      verificationToken: await verifiedToken(),
    });

    expect(booking.status).toBe('confirmed');
    expect(booking.code).toMatch(/^\d{6}$/u);
    expect(booking.timeZoneId).toBe('Asia/Yerevan');
    expect(booking.cancelledAtUtc).toBeNull();
  });

  it('is idempotent on commandId — a retry does not book twice', async () => {
    const command = {
      commandId: 'cmd-retry',
      branchId: BRANCH,
      tableId: await firstBookableTableId(),
      slotUtc: SLOT,
      partySize: 2,
      verificationToken: await verifiedToken(),
    };

    const first = await gateway.createBooking(command);
    const second = await gateway.createBooking(command);

    expect(second.id).toBe(first.id);
    expect(second.code).toBe(first.code);
    expect(await gateway.listBookings()).toHaveLength(1);
  });

  it('returns pendingApproval for a party over the limit, not a confirmation', async () => {
    const tableId = await firstBookableTableId(8);
    const booking = await gateway.createBooking({
      commandId: 'cmd-big',
      branchId: BRANCH,
      tableId,
      slotUtc: SLOT,
      partySize: 8,
      verificationToken: await verifiedToken(),
    });
    expect(booking.status).toBe('pendingApproval');
  });

  describe('409 — someone else took the table', () => {
    it('throws TableTakenError carrying the refreshed floor', async () => {
      const g = createMockGateway({ now: () => NOW, simulateTableTaken: true });
      const availability = await g.getTableAvailability({
        branchId: BRANCH,
        slotUtc: SLOT,
        partySize: 2,
      });
      const target = availability.find((a) => a.isBookable)!;
      const challenge = await g.requestPhoneCode('+37411223344');
      const { verificationToken } = await g.verifyPhoneCode({
        challengeId: challenge.challengeId,
        code: '123456',
      });

      try {
        await g.createBooking({
          commandId: 'cmd-race',
          branchId: BRANCH,
          tableId: target.tableId,
          slotUtc: SLOT,
          partySize: 2,
          verificationToken,
        });
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(isTableTaken(error)).toBe(true);
        const taken = error as TableTakenError;
        expect(taken.status).toBe(409);
        expect(taken.tableId).toBe(target.tableId);
        expect(taken.tableLabel).toBe(target.tableLabel);
        // The refreshed floor travels with the error so the UI need not refetch.
        expect(taken.floor.tables.length).toBeGreaterThan(0);
        const nowTaken = taken.floor.tables.find((t) => t.id === target.tableId);
        expect(nowTaken?.state).not.toBe('free');
      }
    });

    it('creates no booking when the race is lost', async () => {
      const g = createMockGateway({ now: () => NOW, simulateTableTaken: true });
      const challenge = await g.requestPhoneCode('+37411223344');
      const { verificationToken } = await g.verifyPhoneCode({
        challengeId: challenge.challengeId,
        code: '123456',
      });
      const availability = await g.getTableAvailability({
        branchId: BRANCH,
        slotUtc: SLOT,
        partySize: 2,
      });

      await expect(
        g.createBooking({
          commandId: 'cmd-race-2',
          branchId: BRANCH,
          tableId: availability.find((a) => a.isBookable)!.tableId,
          slotUtc: SLOT,
          partySize: 2,
          verificationToken,
        }),
      ).rejects.toBeInstanceOf(TableTakenError);

      expect(await g.listBookings()).toHaveLength(0);
    });

    it('rejects booking a table already booked for that slot', async () => {
      /*
       * This used to look for a table refused as `occupied` at a slot three and
       * a half hours out, and it found one — because the mock answered "now"
       * for every slot it was asked about, exactly as the two screens did. The
       * double reproduced the defect it existed to catch, which is how this
       * shipped through five prompts.
       *
       * The refusal that genuinely applies to a future slot is a *booking* on
       * it, so the test makes one and then asks again.
       */
      const target = await firstBookableTableId();
      await gateway.createBooking({
        commandId: 'cmd-first',
        branchId: BRANCH,
        tableId: target,
        slotUtc: SLOT,
        partySize: 2,
        verificationToken: await verifiedToken(),
      });

      const availability = await gateway.getTableAvailability({
        branchId: BRANCH,
        slotUtc: SLOT,
        partySize: 2,
      });
      const busy = availability.find((a) => a.tableId === target);

      // `alreadyBooked`, not `occupied`. Nobody is sitting there — it is 18:00
      // and the room is empty — and telling a diner otherwise sends them to
      // look at a table with nobody at it.
      expect(busy?.unavailableReason).toBe('alreadyBooked');

      await expect(
        gateway.createBooking({
          commandId: 'cmd-busy',
          branchId: BRANCH,
          tableId: target,
          slotUtc: SLOT,
          partySize: 2,
          verificationToken: await verifiedToken(),
        }),
      ).rejects.toBeInstanceOf(TableTakenError);
    });
  });

  it('rejects a slot that became too soon while the diner was deciding', async () => {
    const soon = new Date(NOW.getTime() + 5 * 60_000).toISOString(); // lead time is 15
    try {
      await gateway.createBooking({
        commandId: 'cmd-late',
        branchId: BRANCH,
        tableId: await firstBookableTableId(),
        slotUtc: soon,
        partySize: 2,
        verificationToken: await verifiedToken(),
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(LeadTimeExceededError);
      const lead = error as LeadTimeExceededError;
      expect(lead.leadTimeMinutes).toBe(15);
      // Offers a way forward rather than just refusing.
      expect(new Date(lead.earliestSlotUtc).getTime()).toBeGreaterThan(NOW.getTime());
    }
  });

  it('takes the table off the floor so a second diner cannot book it', async () => {
    const tableId = await firstBookableTableId();
    await gateway.createBooking({
      commandId: 'cmd-first',
      branchId: BRANCH,
      tableId,
      slotUtc: SLOT,
      partySize: 2,
      verificationToken: await verifiedToken(),
    });

    const after = await gateway.getFloorPlan(BRANCH);
    expect(after?.tables.find((t) => t.id === tableId)?.state).not.toBe('free');
  });
});

describe('bookings list and cancellation', () => {
  async function makeBooking(commandId: string) {
    return gateway.createBooking({
      commandId,
      branchId: BRANCH,
      tableId: await firstBookableTableId(),
      slotUtc: SLOT,
      partySize: 2,
      verificationToken: await verifiedToken(),
    });
  }

  it('lists bookings soonest first', async () => {
    await makeBooking('c1');
    const list = await gateway.listBookings();
    expect(list).toHaveLength(1);
    expect(list[0]?.slotUtc).toBe(SLOT);
  });

  it('cancels and frees the table again', async () => {
    const booking = await makeBooking('c2');
    const cancelled = await gateway.cancelBooking(booking.id);

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelledAtUtc).not.toBeNull();

    const floor = await gateway.getFloorPlan(BRANCH);
    expect(floor?.tables.find((t) => t.id === booking.tableId)?.state).toBe('free');
  });

  it('never refuses a late cancellation', async () => {
    // Past the free-cancellation deadline: still allowed, because a late
    // cancellation is far better for the venue than a no-show.
    let clock = new Date(NOW);
    const g = createMockGateway({ now: () => clock });
    const challenge = await g.requestPhoneCode('+37411223344');
    const { verificationToken } = await g.verifyPhoneCode({
      challengeId: challenge.challengeId,
      code: '123456',
    });
    const availability = await g.getTableAvailability({
      branchId: BRANCH,
      slotUtc: SLOT,
      partySize: 2,
    });
    const booking = await g.createBooking({
      commandId: 'c3',
      branchId: BRANCH,
      tableId: availability.find((a) => a.isBookable)!.tableId,
      slotUtc: SLOT,
      partySize: 2,
      verificationToken,
    });

    clock = new Date(new Date(booking.freeCancellationUntilUtc).getTime() + 60_000);
    await expect(g.cancelBooking(booking.id)).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('sets a free-cancellation deadline before the slot', async () => {
    const booking = await makeBooking('c4');
    expect(new Date(booking.freeCancellationUntilUtc).getTime()).toBeLessThan(
      new Date(booking.slotUtc).getTime(),
    );
  });
});
