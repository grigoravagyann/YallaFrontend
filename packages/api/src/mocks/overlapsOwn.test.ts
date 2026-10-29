import { describe, expect, it } from 'vitest';
import type { CreateBookingCommand, SlotFloor } from '../contracts/booking';
import { BookingOverlapsOwnError } from '../contracts/errors';
import type { YallaGateway } from '../gateway';
import { SEEDED_ACCOUNT } from './accounts';
import { createMockGateway } from './mockGateway';

/**
 * One diner, two bookings at once at the same branch — the server's
 * `reservation-overlaps-own`, in the diner's mock: a signed-in diner whose new
 * sitting, or a change, overlaps one of their own live bookings at the branch
 * is refused with the booking they already hold. The booking being moved is
 * not counted against itself, and a replay of the same command still replays.
 */

const NORTH = 'b-lumen-north';
/** Monday 19 October 2026, 12:00 in Yerevan. */
const NOW = '2026-10-19T08:00:00.000Z';
const TOMORROW = '2026-10-20';

function at(time: string): string {
  return new Date(`${TOMORROW}T${time}:00+04:00`).toISOString();
}

function world(): YallaGateway {
  return createMockGateway({
    latencyMs: 0,
    simulateJoiners: false,
    now: () => new Date(NOW),
    codeSeed: 11,
  });
}

async function signedIn(gateway: YallaGateway): Promise<void> {
  await gateway.loginDiner({
    identifier: SEEDED_ACCOUNT.username,
    password: SEEDED_ACCOUNT.password,
  });
  const challenge = await gateway.requestPhoneCode(SEEDED_ACCOUNT.phoneE164);
  await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: challenge.devCode! });
}

function command(tableId: string, slotUtc: string): CreateBookingCommand {
  return {
    commandId: crypto.randomUUID(),
    branchId: NORTH,
    tableId,
    slotUtc,
    timeZoneId: 'Asia/Yerevan',
    partySize: 2,
    guestName: 'Bella',
    guestPhone: '+37477123456',
    channel: 'app',
  };
}

async function bookable(gateway: YallaGateway, time: string): Promise<SlotFloor['tables']> {
  const floor = await gateway.getSlotFloor({ branchId: NORTH, slotUtc: at(time), partySize: 2 });
  return floor!.tables.filter((table) => table.isBookable && !table.mustFreeByUtc);
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('one diner, two bookings at once', () => {
  it('refuses a second sitting that overlaps the first, naming it', async () => {
    const gateway = world();
    await signedIn(gateway);
    const [first, second] = await bookable(gateway, '19:45');
    const held = await gateway.createBooking(command(first!.tableId, at('19:45')));

    const error = await caught(gateway.createBooking(command(second!.tableId, at('19:30'))));
    expect(error).toBeInstanceOf(BookingOverlapsOwnError);
    expect(error).toMatchObject({
      existingReservationId: held.id,
      existingCode: held.code,
      localDate: TOMORROW,
      localStartTime: '19:45',
      tableLabel: held.tableLabel,
    });
  });

  it('takes one that starts as the first one ends', async () => {
    const gateway = world();
    await signedIn(gateway);
    const [first] = await bookable(gateway, '18:00');
    const held = await gateway.createBooking(command(first!.tableId, at('18:00')));
    const [other] = (await bookable(gateway, '19:30')).filter(
      (table) => table.tableId !== held.tableId,
    );
    await expect(
      gateway.createBooking(command(other!.tableId, at('19:30'))),
    ).resolves.toMatchObject({ branchId: NORTH });
  });

  it('replays the same command rather than refusing it as its own overlap', async () => {
    const gateway = world();
    await signedIn(gateway);
    const [first] = await bookable(gateway, '19:45');
    const sent = command(first!.tableId, at('19:45'));
    const held = await gateway.createBooking(sent);
    expect((await gateway.createBooking(sent)).id).toBe(held.id);
  });

  it('refuses a change onto an overlapping time, but never counts the moved booking against itself', async () => {
    const gateway = world();
    await signedIn(gateway);
    const [first, second] = await bookable(gateway, '19:45');
    const held = await gateway.createBooking(command(first!.tableId, at('19:45')));
    const late = await gateway.createBooking(command(second!.tableId, at('22:00')));

    const error = await caught(
      gateway.rescheduleBooking({
        bookingId: late.id,
        commandId: crypto.randomUUID(),
        tableId: late.tableId!,
        slotUtc: at('20:00'),
        timeZoneId: 'Asia/Yerevan',
        partySize: 2,
      }),
    );
    expect(error).toBeInstanceOf(BookingOverlapsOwnError);

    // Moving the 19:45 itself by a quarter hour overlaps only itself.
    await expect(
      gateway.rescheduleBooking({
        bookingId: held.id,
        commandId: crypto.randomUUID(),
        tableId: second!.tableId,
        slotUtc: at('19:30'),
        timeZoneId: 'Asia/Yerevan',
        partySize: 2,
      }),
    ).resolves.toMatchObject({ id: held.id, slotUtc: at('19:30') });
  });
});
