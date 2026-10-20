import { describe, expect, it } from 'vitest';
import type { CreateBookingCommand } from '../contracts/booking';
import { BookingRejectedError, UsernameTakenError } from '../contracts/errors';
import { ConcurrencyConflictError } from '../errors';
import type { YallaGateway } from '../gateway';
import { SEEDED_ACCOUNT } from './accounts';
import { createMockGateway } from './mockGateway';
import { mockTableCode } from './tableCodes';

/**
 * QA sweep 2026-10-16 (`.gstack/qa-reports/run-20261016T1/mock-parity.md`):
 * the diner mock must refuse what `ReservationService`, `TabOrderService` and
 * `DinerProfileService` refuse, and publish what `MenuQuery` publishes.
 */

const NORTH = 'b-lumen-north';
const TUMANYAN = 'b-tumanyan-main';
/** Wednesday 2026-09-16, 14:00 in Yerevan (UTC+4): every fixture branch is open. */
const WEDNESDAY_2PM = () => new Date('2026-09-16T10:00:00.000Z');
/** Thursday 2026-09-17, 03:30 in Yerevan: Lumen North shut at 01:00. */
const THURSDAY_330AM = () => new Date('2026-09-16T23:30:00.000Z');

let commandSequence = 0;
const commandId = () =>
  `00000000-0000-4000-8000-${String((commandSequence += 1)).padStart(12, '0')}`;

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

async function verified(gateway: YallaGateway): Promise<void> {
  const challenge = await gateway.requestPhoneCode('+37491000199');
  await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: challenge.devCode! });
}

async function bookAt(
  gateway: YallaGateway,
  branchId: string,
  slotUtc: string,
  extra: Partial<CreateBookingCommand> = {},
) {
  const floor = await gateway.getSlotFloor({ branchId, slotUtc, partySize: 2 });
  const table = floor!.tables.find((t) => t.isBookable) ?? floor!.tables[0]!;
  return gateway.createBooking({
    commandId: commandId(),
    branchId,
    tableId: table.tableId,
    slotUtc,
    timeZoneId: 'Asia/Yerevan',
    partySize: 2,
    guestName: 'Test Diner',
    guestPhone: '+37491000199',
    channel: 'app',
    ...extra,
  });
}

describe('F5 — the public page books only where the switch is on, and only when open', () => {
  it('refuses a web booking at a branch that does not take them, with the server sentence', async () => {
    // `ReservationService.RequireWebBookingsAccepted`: a 409
    // `web-bookings-not-accepted` for the web channel, before any table rule.
    const gateway = createMockGateway({ now: WEDNESDAY_2PM, simulateJoiners: false });
    await verified(gateway);
    const error = await caught(
      bookAt(gateway, TUMANYAN, '2026-09-17T15:00:00.000Z', { channel: 'web' }),
    );
    expect(error).toBeInstanceOf(ConcurrencyConflictError);
    expect((error as ConcurrencyConflictError).message).toBe(
      'Tumanyan Street does not take bookings from its public page. ' +
        'Contact the venue directly to book a table.',
    );
  });

  it('answers a slot outside the opening hours as closed, and refuses to book it', async () => {
    // `ReservationRules.CheckOpeningHours`: the whole sitting must fall inside
    // one block of the day (or the day before, for an after-midnight closer).
    const gateway = createMockGateway({ now: WEDNESDAY_2PM, simulateJoiners: false });
    await verified(gateway);
    // Lumen North opens 09:00 and closes 01:00; 03:00 the next morning is shut.
    const shut = '2026-09-17T23:00:00.000Z';
    const floor = await gateway.getSlotFloor({ branchId: NORTH, slotUtc: shut, partySize: 2 });
    expect(floor?.rejection).toBe('closed');

    const error = await caught(bookAt(gateway, NORTH, shut));
    expect(error).toBeInstanceOf(BookingRejectedError);
    expect((error as BookingRejectedError).reason).toBe('closed');

    // A sitting that starts before closing but runs past it is shut too.
    const late = '2026-09-17T20:30:00.000Z'; // 00:30 local, 105-minute turn ends 02:15
    expect(
      (await gateway.getSlotFloor({ branchId: NORTH, slotUtc: late, partySize: 2 }))?.rejection,
    ).toBe('closed');
    // And one well inside the day is fine.
    const open = '2026-09-17T15:00:00.000Z';
    expect(
      (await gateway.getSlotFloor({ branchId: NORTH, slotUtc: open, partySize: 2 }))?.rejection,
    ).toBeNull();
    await expect(bookAt(gateway, NORTH, open)).resolves.toMatchObject({ branchId: NORTH });
  });
});

describe('F6 — booking codes are minted, not derived from the booking count', () => {
  it('two worlds started fresh do not hand out the same first code', async () => {
    // `ReservationCode.Generate` is random and the unique index catches a
    // collision; the mock derived it from `sequence`, so a reloaded page minted
    // the code the last page had minted (QA F6).
    const codes = await Promise.all(
      [1, 2].map(async () => {
        const gateway = createMockGateway({ now: WEDNESDAY_2PM, simulateJoiners: false });
        await verified(gateway);
        return (await bookAt(gateway, NORTH, '2026-09-17T15:00:00.000Z')).code;
      }),
    );
    expect(codes[0]).not.toBe(codes[1]);
  });

  it('is reproducible from a seed, so a replayed world keeps its codes', async () => {
    const codes = await Promise.all(
      [1, 2].map(async () => {
        const gateway = createMockGateway({
          now: WEDNESDAY_2PM,
          simulateJoiners: false,
          codeSeed: 42,
        });
        await verified(gateway);
        return (await bookAt(gateway, NORTH, '2026-09-17T15:00:00.000Z')).code;
      }),
    );
    expect(codes[0]).toBe(codes[1]);
  });

  it('never repeats a code within one world', async () => {
    const gateway = createMockGateway({
      now: WEDNESDAY_2PM,
      simulateJoiners: false,
    });
    await verified(gateway);
    const seen = new Set<string>();
    // A sitting apart: one diner holds one table at a time — and at most
    // three active bookings, so each is let go once its code is seen.
    for (const time of ['11:00', '12:30', '14:00', '15:30', '17:00', '18:30']) {
      const { id, code } = await bookAt(gateway, NORTH, `2026-09-17T${time}:00.000Z`);
      expect(seen.has(code)).toBe(false);
      seen.add(code);
      await gateway.cancelBooking(id);
    }
  });
});

describe('F9 — ordering after hours, and what the diner menu publishes', () => {
  it("keeps taking a seated party's order after closing time", async () => {
    // The server pins the opposite of what QA F9 asked for: "the tab decides,
    // not the clock" (fix/qa-2026-10-16-backend 0fa9053, OrderingTests.
    // A_seated_party_keeps_ordering_after_closing_time_because_the_tab_decides_not_the_clock;
    // docs/tabs.md "Ordering after closing time"). Last orders is Mark closing.
    const gateway = createMockGateway({ now: THURSDAY_330AM, simulateJoiners: false });
    const scan = await gateway.scanTableCode({
      tableCode: mockTableCode('b-lumen-north-t1'),
      commandId: commandId(),
    });
    // Scanned with no proved number: a waiter lets the table order.
    gateway.admitTabAsWaiter(scan.tab.tabId);
    const placed = await gateway.placeOrder({
      tabId: scan.tab.tabId,
      clientCommandId: commandId(),
      lines: [
        {
          menuItemId: 'espresso',
          quantity: 1,
          participantId: scan.tab.me.participantId,
          isShared: false,
        },
      ],
    });
    expect(placed.status).toBe('new');
  });

  it('publishes only dishes that pass MenuItemCompleteness, and still has a menu', async () => {
    // `MenuQuery` filters on `MenuItemCompleteness.Rule`: photo, description,
    // ingredients, allergens, portion size and a positive prep time.
    const gateway = createMockGateway({ now: WEDNESDAY_2PM, simulateJoiners: false });
    const menu = await gateway.getBranchMenuDetail(NORTH);
    const items = menu!.categories.flatMap((category) => category.items);
    expect(items.length).toBeGreaterThan(10);
    for (const item of items) {
      expect(item.description, item.id).not.toBe('');
      expect(item.ingredients, item.id).not.toBe('');
      expect(item.allergens, item.id).not.toBe('');
      expect(item.portionSize, item.id).not.toBe('');
      expect(item.prepMinutes, item.id).toBeGreaterThan(0);
      expect(item.photo?.thumbnailUrl, item.id).toBeTruthy();
    }
    // The one dish the fixture leaves unfinished on purpose stays hidden.
    expect(items.some((item) => item.id === 'compote')).toBe(false);
  });
});

describe('F10 — the username the login screen advertises is somebody', () => {
  it('refuses ani on sign-up and on a profile edit, as a taken username', async () => {
    // `DinerProfileService`: `DinerIdentifierTakenException.Username()` (409
    // `username-taken`), the same answer registration gives.
    const gateway = createMockGateway({ now: WEDNESDAY_2PM, simulateJoiners: false });
    const signUp = await caught(
      gateway.registerDiner({
        username: 'ani',
        email: 'somebody@example.test',
        password: 'correct horse',
        phoneE164: '+37491000150',
        displayName: 'Somebody',
      }),
    );
    expect(signUp).toBeInstanceOf(UsernameTakenError);

    await gateway.loginDiner({
      identifier: SEEDED_ACCOUNT.username,
      password: SEEDED_ACCOUNT.password,
    });
    expect(await caught(gateway.updateDinerProfile({ username: 'ani' }))).toBeInstanceOf(
      UsernameTakenError,
    );
  });
});

describe('F14 — the confirm screen can say where the table is', () => {
  it('finds a venue by the id the places list carries, not only by its slug', async () => {
    const gateway = createMockGateway({ now: WEDNESDAY_2PM, simulateJoiners: false });
    const byId = await gateway.getVenue('v-lumen');
    const bySlug = await gateway.getVenue('lumen-coffee');
    expect(byId?.name).toBe('Lumen Coffee');
    expect(bySlug?.name).toBe('Lumen Coffee');
  });

  it('draws the room with the branch name on it', async () => {
    const gateway = createMockGateway({ now: WEDNESDAY_2PM, simulateJoiners: false });
    const slot = await gateway.getSlotFloor({
      branchId: NORTH,
      slotUtc: '2026-09-17T15:00:00.000Z',
      partySize: 2,
    });
    expect(slot?.plan.branchName).toBe('Northern Avenue');
    expect((await gateway.getFloorPlan(NORTH))?.branchName).toBe('Northern Avenue');
  });
});
