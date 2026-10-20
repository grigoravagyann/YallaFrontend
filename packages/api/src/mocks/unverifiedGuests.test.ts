import { describe, expect, it, vi } from 'vitest';
import type { CreateBookingCommand, SlotFloor } from '../contracts/booking';
import {
  BookingCommandInUseError,
  BookingOverlapsOwnError,
  ScanTurnedAwayError,
  BookingLinkAccountUnavailableError,
  DeviceHasActiveBookingError,
  PhoneHasActiveBookingError,
  TableTakenError,
  TabAwaitingAdmissionError,
  UnverifiedPartyTooLargeError,
} from '../contracts/errors';
import type { UnverifiedBookingCommand } from '../contracts/publicBranch';
import { ValidationError } from '../errors';
import { SEEDED_ACCOUNT } from './accounts';
import { createMockGateway, type MockGateway, type MockGatewayOptions } from './mockGateway';
import { createPublicMockGateway } from './publicMock';
import { mockTableCode } from './tableCodes';

/**
 * Unverified guests in the diner's mock (2026-10-20): the same rules the
 * server enforces, so the public page and the app are built against them.
 *
 * - An account whose number is not proved books — flagged, capped at the
 *   branch's `unverifiedMaxPartySize`, waiting for the venue (`unverifiedPhone`)
 *   when the branch approves those first.
 * - One phone number holds one active booking, for everybody; the held one
 *   is named only to its own account. One unverified booking per browser.
 * - The public page's anonymous booking hands its manage token back once.
 * - A tab a scan opened without a proved number waits for a waiter: no order
 *   and no bill until admitted, water and napkins meanwhile.
 */

const NORTH = 'b-lumen-north';
/** Monday 19 October 2026, 12:00 in Yerevan. */
const NOW = '2026-10-19T08:00:00.000Z';
const TOMORROW = '2026-10-20';

function at(time: string): string {
  return new Date(`${TOMORROW}T${time}:00+04:00`).toISOString();
}

function world(options: MockGatewayOptions = {}): MockGateway {
  return createMockGateway({
    latencyMs: 0,
    simulateJoiners: false,
    simulateWaiter: false,
    now: () => new Date(NOW),
    codeSeed: 5,
    ...options,
  });
}

/** Registered, number never proved. */
async function unproved(gateway: MockGateway, phoneE164 = '+37499000123'): Promise<void> {
  await gateway.registerDiner({
    username: `u${phoneE164.slice(-6)}`,
    email: `u${phoneE164.slice(-6)}@example.com`,
    password: 'correct horse',
    phoneE164,
    displayName: 'Ani',
  });
}

async function proved(gateway: MockGateway): Promise<void> {
  await gateway.loginDiner({
    identifier: SEEDED_ACCOUNT.username,
    password: SEEDED_ACCOUNT.password,
  });
  const challenge = await gateway.requestPhoneCode(SEEDED_ACCOUNT.phoneE164);
  await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: challenge.devCode! });
}

function command(tableId: string, slotUtc: string, partySize = 2): CreateBookingCommand {
  return {
    commandId: crypto.randomUUID(),
    branchId: NORTH,
    tableId,
    slotUtc,
    timeZoneId: 'Asia/Yerevan',
    partySize,
    guestName: 'Ani',
    guestPhone: '+37499000123',
    channel: 'app',
  };
}

async function bookable(gateway: MockGateway, time: string): Promise<SlotFloor['tables']> {
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

describe('an app account whose number is not proved', () => {
  it('books, flagged, and waits for the venue for hours, not minutes', async () => {
    const gateway = world();
    await unproved(gateway);
    const [table] = await bookable(gateway, '19:00');

    const booking = await gateway.createBooking(command(table!.tableId, at('19:00')));

    expect(booking).toMatchObject({
      status: 'pendingApproval',
      awaitingApprovalBecause: 'unverifiedPhone',
      // The sooner of a day after it was made (tomorrow 12:00) and two hours
      // before it starts (tomorrow 17:00).
      approvalExpiresAtUtc: '2026-10-20T08:00:00.000Z',
      phoneUnverified: true,
    });
  });

  it('is confirmed as usual, still flagged, where the branch does not approve them first', async () => {
    const gateway = world({ unverifiedBookingsNeedApproval: false });
    await unproved(gateway);
    const [table] = await bookable(gateway, '19:00');

    const booking = await gateway.createBooking(command(table!.tableId, at('19:00')));

    expect(booking).toMatchObject({ status: 'confirmed', phoneUnverified: true });
  });

  it('is refused a party over the cap, naming the cap', async () => {
    const gateway = world({ unverifiedMaxPartySize: 4 });
    await unproved(gateway);
    const [table] = (await bookable(gateway, '19:00')).filter((entry) => entry.seats >= 5);

    const error = await caught(gateway.createBooking(command(table!.tableId, at('19:00'), 5)));

    expect(error).toBeInstanceOf(UnverifiedPartyTooLargeError);
    expect(error).toMatchObject({ partySize: 5, maxPartySize: 4 });
  });

  it('keeps a proved account instant and unflagged', async () => {
    const gateway = world();
    await proved(gateway);
    const [table] = await bookable(gateway, '19:00');

    const booking = await gateway.createBooking(command(table!.tableId, at('19:00')));

    expect(booking).toMatchObject({ status: 'confirmed', phoneUnverified: false });
  });
});

describe('one phone number, one active booking', () => {
  it('answers an overlap with her own as before, and any other second booking by the number', async () => {
    const gateway = world();
    await proved(gateway);
    const [first, second] = await bookable(gateway, '19:45');
    const held = await gateway.createBooking(command(first!.tableId, at('19:45')));

    // An overlapping sitting of her own says so, with the booking, first.
    expect(
      await caught(gateway.createBooking(command(second!.tableId, at('19:30')))),
    ).toBeInstanceOf(BookingOverlapsOwnError);

    // Another evening: the number rule, naming the one she holds.
    const error = await caught(gateway.createBooking(command(second!.tableId, at('13:00'))));

    expect(error).toBeInstanceOf(PhoneHasActiveBookingError);
    expect((error as PhoneHasActiveBookingError).held).toEqual({
      reservationId: held.id,
      code: held.code,
      startUtc: held.slotUtc,
      localDate: TOMORROW,
      localStartTime: '19:45',
      venueName: held.venueName ?? '',
      branchName: held.branchName,
    });
  });

  it("lets a proved account book past a stranger's unverified booking with its number, and shows it that one", async () => {
    const gateway = world();
    const publicGateway = createPublicMockGateway({ gateway, now: () => new Date(NOW) });
    const [first, second] = await bookable(gateway, '19:00');
    // Somebody on the web, with the seeded account's number, no proof.
    const stranger = await publicGateway.createUnverifiedBooking({
      branchId: NORTH,
      commandId: crypto.randomUUID(),
      tableId: first!.tableId,
      slotUtc: at('19:00'),
      timeZoneId: 'Asia/Yerevan',
      partySize: 2,
      guestName: 'Not Lurj',
      guestPhone: SEEDED_ACCOUNT.phoneE164,
      deviceId: 'browser-x',
    });

    await proved(gateway);
    const mine = await gateway.listBookings();
    expect(mine.upcoming.find((booking) => booking.id === stranger.booking.id)).toMatchObject({
      madeWithYourNumber: true,
    });
    await expect(
      gateway.createBooking(command(second!.tableId, at('13:00'))),
    ).resolves.toMatchObject({ status: 'confirmed' });
  });

  it('frees the number the moment the booking is cancelled', async () => {
    const gateway = world();
    await proved(gateway);
    const [first, second] = await bookable(gateway, '13:00');
    const held = await gateway.createBooking(command(first!.tableId, at('13:00')));
    await gateway.cancelBooking(held.id);

    await expect(
      gateway.createBooking(command(second!.tableId, at('20:00'))),
    ).resolves.toMatchObject({ status: 'confirmed' });
  });
});

describe("the public page's booking without a proved number", () => {
  async function page(options: MockGatewayOptions = {}) {
    const gateway = world(options);
    const publicGateway = createPublicMockGateway({ gateway, now: () => new Date(NOW) });
    const [table, other] = await bookable(gateway, '19:00');
    const booking = (
      overrides: Partial<UnverifiedBookingCommand> = {},
    ): UnverifiedBookingCommand => ({
      branchId: NORTH,
      commandId: crypto.randomUUID(),
      tableId: table!.tableId,
      slotUtc: at('19:00'),
      timeZoneId: 'Asia/Yerevan',
      partySize: 2,
      guestName: 'Ani',
      guestPhone: '+374 99 11-22-33',
      deviceId: 'browser-1',
      ...overrides,
    });
    return { gateway, publicGateway, booking, other: other! };
  }

  it('books, flagged and waiting, and hands the token back once', async () => {
    const { publicGateway, booking } = await page();
    const sent = booking();

    const first = await publicGateway.createUnverifiedBooking(sent);
    expect(first.wasReplay).toBe(false);
    expect(first.manageToken).toBeTruthy();
    expect(first.booking).toMatchObject({
      status: 'pendingApproval',
      awaitingApprovalBecause: 'unverifiedPhone',
      phoneUnverified: true,
    });

    // The same attempt again from this browser: the booking, never the token.
    const replay = await publicGateway.createUnverifiedBooking(sent);
    expect(replay).toMatchObject({ wasReplay: true, manageToken: null });
    expect(replay.booking.id).toBe(first.booking.id);

    // The same id from another browser is somebody else's.
    expect(
      await caught(publicGateway.createUnverifiedBooking({ ...sent, deviceId: 'browser-2' })),
    ).toBeInstanceOf(BookingCommandInUseError);
  });

  it('answers a booked table as taken before the browser or the number (UG review S5)', async () => {
    const { publicGateway, booking } = await page();
    await publicGateway.createUnverifiedBooking(booking());

    // The same browser, another number, the table it already took.
    expect(
      await caught(
        publicGateway.createUnverifiedBooking(booking({ guestPhone: '+374 99 44-55-66' })),
      ),
    ).toBeInstanceOf(TableTakenError);
  });

  it('takes none without a proved number where the branch set the cap to 0', async () => {
    const { publicGateway, booking } = await page({ unverifiedMaxPartySize: 0 });
    expect(await caught(publicGateway.createUnverifiedBooking(booking()))).toMatchObject({
      name: 'BranchRequiresVerifiedPhoneError',
    });
  });

  it('holds one per browser and one per number, naming nobody', async () => {
    const { publicGateway, booking, other } = await page();
    await publicGateway.createUnverifiedBooking(booking());

    expect(
      await caught(
        publicGateway.createUnverifiedBooking(
          booking({ tableId: other.tableId, guestPhone: '+37455000111' }),
        ),
      ),
    ).toBeInstanceOf(DeviceHasActiveBookingError);

    const number = await caught(
      publicGateway.createUnverifiedBooking(
        booking({ tableId: other.tableId, deviceId: 'browser-2' }),
      ),
    );
    expect(number).toBeInstanceOf(PhoneHasActiveBookingError);
    expect((number as PhoneHasActiveBookingError).held).toBeNull();
  });

  it('refuses a number that is not one, and a party over the cap', async () => {
    const { publicGateway, booking } = await page({ unverifiedMaxPartySize: 2 });

    const phone = await caught(
      publicGateway.createUnverifiedBooking(booking({ guestPhone: '12' })),
    );
    expect(phone).toBeInstanceOf(ValidationError);
    expect((phone as ValidationError).field).toBe('guestPhone');

    expect(
      await caught(publicGateway.createUnverifiedBooking(booking({ partySize: 3 }))),
    ).toBeInstanceOf(UnverifiedPartyTooLargeError);
  });

  it('is cancelled from its link, never changed, and cancelling frees the number', async () => {
    const { publicGateway, booking, other } = await page();
    const { manageToken } = await publicGateway.createUnverifiedBooking(booking());

    const managed = await publicGateway.getManagedBooking({ token: manageToken! });
    expect(managed).toMatchObject({ phoneUnverified: true, canChange: false, canCancel: true });

    expect(
      await caught(
        publicGateway.rescheduleManagedBooking({
          token: manageToken!,
          commandId: crypto.randomUUID(),
          tableId: managed!.tableId,
          slotUtc: at('20:00'),
          timeZoneId: 'Asia/Yerevan',
          partySize: 2,
        }),
      ),
    ).toBeInstanceOf(BookingLinkAccountUnavailableError);

    await publicGateway.cancelManagedBooking({ token: manageToken! });
    await expect(
      publicGateway.createUnverifiedBooking(booking({ tableId: other.tableId })),
    ).resolves.toMatchObject({ wasReplay: false });
  });
});

describe('a tab a scan opened without a proved number', () => {
  async function scanned(gateway: MockGateway) {
    const scan = await gateway.scanTableCode({
      tableCode: mockTableCode(`${NORTH}-t4`),
      commandId: crypto.randomUUID(),
    });
    expect(scan.kind).toBe('tabOpened');
    return scan.tab;
  }

  const order = (gateway: MockGateway, tabId: string, participantId: string) =>
    gateway.placeOrder({
      tabId,
      clientCommandId: crypto.randomUUID(),
      lines: [{ menuItemId: 'cappuccino', quantity: 1, isShared: false, participantId }],
    });

  it('lets mock mode play a waiter who admits, or one who turns the table away', async () => {
    // The mock's waiter comes on a timer: the clock is the test's, not the machine's.
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const admits = world({ simulateAdmissionAfterMs: 5_000 });
    const turnsAway = world({
      simulateAdmissionAfterMs: 5_000,
      simulateAdmissionOutcome: 'reject',
    });
    let admitted: Awaited<ReturnType<typeof scanned>>;
    let rejected: Awaited<ReturnType<typeof scanned>>;
    try {
      admitted = await scanned(admits);
      rejected = await scanned(turnsAway);
      vi.advanceTimersByTime(5_000);
    } finally {
      vi.useRealTimers();
    }

    expect((await admits.getDinerTab(admitted.tabId))?.admission).toMatchObject({
      status: 'admitted',
      admittedBecause: 'waiter',
    });
    expect((await turnsAway.getDinerTab(rejected.tabId))?.admission).toMatchObject({
      status: 'rejected',
      tableFreed: true,
    });
  });

  it('waits for a waiter: no order, no bill, but water', async () => {
    const gateway = world();
    const tab = await scanned(gateway);

    expect(tab.admission.status).toBe('awaiting');
    expect(tab.me.canOrderNow).toBe(false);
    expect(await caught(order(gateway, tab.tabId, tab.me.participantId))).toBeInstanceOf(
      TabAwaitingAdmissionError,
    );
    expect(
      await caught(
        gateway.callWaiter({
          tabId: tab.tabId,
          reason: 'bill',
          commandId: crypto.randomUUID(),
          bill: { scope: 'whole', tipPercent: 0 },
        }),
      ),
    ).toBeInstanceOf(TabAwaitingAdmissionError);
    await expect(
      gateway.callWaiter({ tabId: tab.tabId, reason: 'water', commandId: crypto.randomUUID() }),
    ).resolves.toMatchObject({ reason: 'water' });
  });

  it('orders once a waiter admits it, and the stream says so', async () => {
    const gateway = world();
    const tab = await scanned(gateway);

    gateway.admitTabAsWaiter(tab.tabId);

    const read = (await gateway.getDinerTab(tab.tabId))!;
    expect(read.admission).toMatchObject({ status: 'admitted', admittedBecause: 'waiter' });
    expect(read.me.canOrderNow).toBe(true);
    const events = await gateway.getTabEvents({ tabId: tab.tabId, afterSequence: 0 });
    expect(events.events.map((event) => event.type)).toContain('tabAdmitted');
    await expect(order(gateway, tab.tabId, tab.me.participantId)).resolves.toMatchObject({
      tabId: tab.tabId,
    });
  });

  it('is closed when a waiter turns it away', async () => {
    const gateway = world();
    const tab = await scanned(gateway);

    gateway.rejectTabAsWaiter(tab.tabId);

    const events = await gateway.getTabEvents({ tabId: tab.tabId, afterSequence: 0 });
    expect(events.events.map((event) => event.type)).toContain('tabAdmissionRejected');
    const read = await gateway.getDinerTab(tab.tabId);
    expect(read?.admission.status ?? 'rejected').toBe('rejected');

    // The phone a waiter just turned away is refused a new scan for a while.
    const again = await caught(
      gateway.scanTableCode({
        tableCode: mockTableCode(`${NORTH}-t5`),
        commandId: crypto.randomUUID(),
      }),
    );
    expect(again).toBeInstanceOf(ScanTurnedAwayError);
    expect((again as ScanTurnedAwayError).retryAfterUtc).toBeTruthy();
  });

  it('orders at once where the branch lets unverified scans in', async () => {
    const gateway = world({ unverifiedScansNeedAdmission: false });
    const tab = await scanned(gateway);

    expect(tab.admission).toMatchObject({ status: 'admitted', admittedBecause: 'notRequired' });
    expect(tab.me.canOrderNow).toBe(true);
  });

  it('lets a proved scanner order at once', async () => {
    const gateway = world();
    await proved(gateway);
    const tab = await scanned(gateway);

    expect(tab.admission).toMatchObject({ status: 'admitted', admittedBecause: 'verifiedHost' });
    expect(tab.me.canOrderNow).toBe(true);
  });
});
