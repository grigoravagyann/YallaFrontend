import type { FloorPlanData } from '@yalla/floorplan/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMockGateway } from './mockGateway';
import type { YallaGateway } from '../gateway';

/**
 * The room is drawn for the slot that was asked about, not for this moment.
 *
 * The defect these pin shipped invisibly through five prompts, and it shipped
 * invisibly because the *fixtures* had it too: `availabilityFor` derived every
 * table's answer from `table.state`, which is the state now, however far ahead
 * the question was. So the doubles agreed with the screens, the suite was
 * green, and a diner picking Saturday at 20:00 saw the room as it stood on
 * Wednesday afternoon — tonight's walk-ins greyed out, Saturday's bookings
 * drawn free.
 *
 * Both assertions below are about a slot far enough out that "somebody is
 * sitting there" says nothing about it. That is the whole point: by 20:00 on
 * Saturday tonight's walk-ins have finished, paid and gone.
 */

const BRANCH = 'b-lumen-north';
const NOW = new Date('2026-09-04T14:30:00Z'); // 18:30 in Yerevan, mid-service

/** Tomorrow evening, well past any sitting that is in progress now. */
const TOMORROW_EVENING = new Date('2026-09-05T16:00:00Z').toISOString(); // 20:00 local

let gateway: YallaGateway;

beforeEach(() => {
  gateway = createMockGateway({ latencyMs: 0, simulateJoiners: false, now: () => NOW });
});

/** The room as the mock world currently stands, for seeding assertions. */
async function roomNow(): Promise<FloorPlanData> {
  const plan = await gateway.getFloorPlan(BRANCH);
  if (!plan) throw new Error(`${BRANCH} is missing from the mock world.`);
  return plan;
}

describe('a table occupied now, with nothing booked later', () => {
  it('is selectable for tomorrow evening', async () => {
    const occupied = (await roomNow()).tables.find(
      (table) => table.state === 'occupied' && table.nextReservationStartUtc === null,
    );
    // Guards the premise: without such a table the assertion below passes for
    // the wrong reason.
    expect(occupied, 'no table is occupied now with nothing booked after it').toBeDefined();

    const slot = await gateway.getSlotFloor({
      branchId: BRANCH,
      slotUtc: TOMORROW_EVENING,
      partySize: 2,
    });

    const answer = slot?.tables.find((t) => t.tableId === occupied!.id);
    expect(answer?.isBookable, 'tonight’s walk-in is blocking tomorrow’s booking').toBe(true);
    expect(answer?.unavailableReason).toBeNull();

    // And the *drawn* room agrees with the answer, which is the half that was
    // actually broken: the verdict was already slot-aware, the geometry it was
    // laid over was not.
    const drawn = slot?.plan.tables.find((t) => t.id === occupied!.id);
    expect(drawn?.state).toBe('free');
    expect(drawn?.isBookable).toBe(true);
  });
});

describe('a table free now, booked at 20:00', () => {
  it('is not selectable for a 20:00 booking, and says why', async () => {
    // Seeded through the front door rather than by reaching into the fixture:
    // a booking is how a table becomes spoken for, and going around it would
    // test a state the product cannot actually reach.
    const free = (await roomNow()).tables.find(
      (table) => table.state === 'free' && table.isBookable && table.seats >= 2,
    );
    expect(free).toBeDefined();

    const challenge = await gateway.requestPhoneCode('+37411223344');
    const verified = await gateway.verifyPhoneCode({
      challengeId: challenge.challengeId,
      code: '123456',
    });
    await gateway.createBooking({
      commandId: 'cmd-seed',
      branchId: BRANCH,
      tableId: free!.id,
      slotUtc: TOMORROW_EVENING,
      partySize: 2,
      guestPhone: verified.phoneE164,
      timeZoneId: 'Asia/Yerevan',
      guestName: 'Ani',
      channel: 'app' as const,
    });

    const slot = await gateway.getSlotFloor({
      branchId: BRANCH,
      slotUtc: TOMORROW_EVENING,
      partySize: 2,
    });

    const answer = slot?.tables.find((t) => t.tableId === free!.id);
    expect(answer?.isBookable).toBe(false);

    /*
     * `alreadyBooked`, and emphatically not `occupied`.
     *
     * They are different sentences with different next steps — "pick another
     * time" against "pick another table" — and the client could not tell them
     * apart, because the mapper collapsed the backend's one
     * `TableAlreadyBooked` code onto `occupied` whenever the table was not
     * held. A diner told somebody was sitting at table 7 walks over and finds
     * an empty table.
     */
    expect(answer?.unavailableReason).toBe('alreadyBooked');

    const drawn = slot?.plan.tables.find((t) => t.id === free!.id);
    expect(drawn?.state).toBe('reservedSoon');
    expect(drawn?.isBookable).toBe(false);
  });

  it('is still selectable earlier the same evening', async () => {
    // The other half of the same rule. A booking at 20:00 does not make the
    // table unusable all day, and a projection that got this wrong would pass
    // the test above while being just as useless to a diner.
    const free = (await roomNow()).tables.find(
      (table) => table.state === 'free' && table.isBookable && table.seats >= 2,
    );
    const challenge = await gateway.requestPhoneCode('+37411223345');
    const verified = await gateway.verifyPhoneCode({
      challengeId: challenge.challengeId,
      code: '123456',
    });
    await gateway.createBooking({
      commandId: 'cmd-seed-2',
      branchId: BRANCH,
      tableId: free!.id,
      slotUtc: TOMORROW_EVENING,
      partySize: 2,
      guestPhone: verified.phoneE164,
      timeZoneId: 'Asia/Yerevan',
      guestName: 'Ani',
      channel: 'app' as const,
    });

    // Three hours earlier: a 90-minute sitting ends well before 20:00.
    const earlier = new Date(new Date(TOMORROW_EVENING).getTime() - 3 * 60 * 60_000).toISOString();
    const slot = await gateway.getSlotFloor({
      branchId: BRANCH,
      slotUtc: earlier,
      partySize: 2,
    });

    const answer = slot?.tables.find((t) => t.tableId === free!.id);
    expect(answer?.isBookable).toBe(true);

    // And the window it offers is bounded by the 20:00 booking rather than
    // being open-ended — which is the sentence the sheet renders.
    expect(answer?.window?.untilUtc).toBe(TOMORROW_EVENING);
    expect(answer?.window?.nextBookingStartUtc).toBe(TOMORROW_EVENING);
  });
});

describe('a slot the branch refuses outright', () => {
  it('names the rule and still returns the room', async () => {
    const yesterday = new Date(NOW.getTime() - 24 * 60 * 60_000).toISOString();
    const slot = await gateway.getSlotFloor({
      branchId: BRANCH,
      slotUtc: yesterday,
      partySize: 2,
    });

    // Reported once at the top, not forty times over. A surface that showed
    // this as forty individually-unavailable tables would read as "fully
    // booked", which is a different fact and sends the diner away.
    expect(slot?.rejection).toBe('pastLeadTime');
    expect(slot?.plan.tables.length, 'the room vanished instead of explaining').toBeGreaterThan(0);
    expect(slot?.tables.every((t) => !t.isBookable)).toBe(true);
  });

  it('refuses a date past the branch booking window', async () => {
    const tooFar = new Date(NOW.getTime() + 40 * 24 * 60 * 60_000).toISOString();
    const slot = await gateway.getSlotFloor({
      branchId: BRANCH,
      slotUtc: tooFar,
      partySize: 2,
    });

    expect(slot?.rejection).toBe('tooFarAhead');
    expect(slot?.plan.tables.length).toBeGreaterThan(0);
  });

  it('is null only for a branch that does not exist', async () => {
    expect(
      await gateway.getSlotFloor({ branchId: 'b-nope', slotUtc: TOMORROW_EVENING, partySize: 2 }),
    ).toBeNull();
  });
});

describe('party size', () => {
  it('is a server input, not a local dimming rule', async () => {
    const forTwo = await gateway.getSlotFloor({
      branchId: BRANCH,
      slotUtc: TOMORROW_EVENING,
      partySize: 2,
    });
    const forEight = await gateway.getSlotFloor({
      branchId: BRANCH,
      slotUtc: TOMORROW_EVENING,
      partySize: 8,
    });

    const bookableFor = (floor: typeof forTwo) => floor!.tables.filter((t) => t.isBookable).length;
    expect(bookableFor(forEight)).toBeLessThan(bookableFor(forTwo));

    // The refusal is named rather than left as a grey table.
    expect(forEight!.tables.some((t) => t.unavailableReason === 'tooSmall')).toBe(true);

    // And the drawn room carries it, so the plan and the sheet cannot disagree.
    const small = forEight!.tables.find((t) => t.unavailableReason === 'tooSmall')!;
    expect(forEight!.plan.tables.find((t) => t.id === small.tableId)?.isBookable).toBe(false);
  });
});
