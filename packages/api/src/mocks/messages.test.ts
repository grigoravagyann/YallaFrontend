import { describe, expect, it } from 'vitest';
import {
  ConversationClosedError,
  GuestsCannotWriteError,
  MessagesTooFastError,
  WaitersCannotWriteError,
} from '../contracts/errors';
import { VENUE_MESSAGE_FEED_KIND } from '../contracts/messages';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors';
import { SEEDED_ACCOUNT } from './accounts';
import { createConsoleMockGateway } from './consoleMock';
import { createMockGateway } from './mockGateway';
import { MOCK_PRE_ORDER_BRANCHES } from './preOrders';
import { createStaffMockGateway } from './staffMock';
import { MOCK_TAKEAWAY_BRANCHES } from './takeaway';

/**
 * Guest messages in the mocks (`docs/messages.md`, 2026-10-23): the diner's
 * threads on its booking and takeaway orders, the venue's scheduled reply,
 * the answers and the ask written into the thread, the rows on bookings and
 * orders, the feed; the floor's inbox, its badges, who may write and the
 * guest's scheduled reply; and the console's settings.
 */

/** Wednesday 2026-09-16, 14:00 in Yerevan. */
const START = Date.parse('2026-09-16T10:00:00.000Z');
const COMING = { kind: 'reservation', id: 'bk_coming' } as const;

let commandSequence = 0;
const commandId = () =>
  `00000000-0000-4000-8000-${String((commandSequence += 1)).padStart(12, '0')}`;

async function caught(promise: Promise<unknown> | (() => unknown)): Promise<unknown> {
  try {
    await (typeof promise === 'function' ? promise() : promise);
    return null;
  } catch (error) {
    return error;
  }
}

async function dinerWorld(
  options: { seedMessages?: boolean; guestsCanWrite?: boolean; start?: number } = {},
) {
  let clock = options.start ?? START;
  const gateway = createMockGateway({
    now: () => new Date(clock),
    preOrders: { branches: MOCK_PRE_ORDER_BRANCHES },
    takeaway: { branches: MOCK_TAKEAWAY_BRANCHES, seedOrders: true },
    seedComingBooking: true,
    seedMessages: options.seedMessages ?? false,
    ...(options.guestsCanWrite === false
      ? { messageSettings: { 'b-lumen-north': { guestsCanWrite: false } } }
      : {}),
  });
  const challenge = await gateway.requestPhoneCode(SEEDED_ACCOUNT.phoneE164);
  await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: challenge.devCode! });
  return {
    gateway,
    advance: (minutes: number) => {
      clock += minutes * 60_000;
    },
    advanceSeconds: (seconds: number) => {
      clock += seconds * 1000;
    },
  };
}

describe("the diner's thread on a booking", () => {
  it('answers no thread yet as an open, empty one', async () => {
    const { gateway } = await dinerWorld();
    const thread = await gateway.getConversation(COMING);
    expect(thread).toMatchObject({
      conversationId: null,
      open: true,
      guestsCanWrite: true,
      pendingAsk: false,
      unreadCount: 0,
      messages: [],
      subject: { kind: 'reservation', id: 'bk_coming', venueName: 'Lumen Coffee' },
    });
    expect(thread?.subject.localTime).toMatch(/^\d{2}:\d{2}$/u);
    expect(thread?.subject.tableLabel).toBeTruthy();
    expect(thread?.venuePhone).toBeTruthy();
  });

  it('sends a text, trimmed, and a replay of the command is the same message', async () => {
    const { gateway } = await dinerWorld();
    const command = { subject: COMING, text: '  Բարև  ', clientCommandId: commandId() };
    const sent = await gateway.sendGuestMessage(command);
    expect(sent).toMatchObject({ author: 'guest', kind: 'text', text: 'Բարև', wasReplay: false });
    const again = await gateway.sendGuestMessage(command);
    expect(again).toMatchObject({ id: sent.id, wasReplay: true });
    const thread = await gateway.getConversation(COMING);
    expect(thread?.conversationId).toBeTruthy();
    expect(thread?.messages.map((message) => message.id)).toEqual([sent.id]);
    // Never a staff name on the guest's side.
    expect(thread?.messages[0]?.staffName).toBeNull();
  });

  it('refuses a blank or over-long text, naming the field', async () => {
    const { gateway } = await dinerWorld();
    const blank = await caught(
      gateway.sendGuestMessage({ subject: COMING, text: '   ', clientCommandId: commandId() }),
    );
    expect(blank).toBeInstanceOf(ValidationError);
    expect((blank as ValidationError).field).toBe('text');
    const long = await caught(
      gateway.sendGuestMessage({
        subject: COMING,
        text: 'ա'.repeat(501),
        clientCommandId: commandId(),
      }),
    );
    expect((long as ValidationError).field).toBe('text');
  });

  it('refuses a guest text when the venue has guest messages off', async () => {
    const { gateway } = await dinerWorld({ guestsCanWrite: false });
    expect((await gateway.getConversation(COMING))?.guestsCanWrite).toBe(false);
    expect(
      await caught(
        gateway.sendGuestMessage({ subject: COMING, text: 'Hi', clientCommandId: commandId() }),
      ),
    ).toBeInstanceOf(GuestsCannotWriteError);
    // The answer buttons still work, and write into the thread.
    await gateway.confirmOnMyWay(COMING.id);
    const thread = await gateway.getConversation(COMING);
    expect(thread?.messages.map((message) => message.kind)).toEqual(['answer', 'status']);
  });

  it('allows five texts a minute, then says wait', async () => {
    const { gateway, advanceSeconds } = await dinerWorld();
    for (let index = 0; index < 5; index += 1) {
      await gateway.sendGuestMessage({
        subject: COMING,
        text: `Message ${index}`,
        clientCommandId: commandId(),
      });
      advanceSeconds(1);
    }
    const tooFast = await caught(
      gateway.sendGuestMessage({ subject: COMING, text: 'One more', clientCommandId: commandId() }),
    );
    expect(tooFast).toBeInstanceOf(MessagesTooFastError);
    expect((tooFast as MessagesTooFastError).retryAfterSeconds).toBeGreaterThan(0);
    advanceSeconds(60);
    await expect(
      gateway.sendGuestMessage({ subject: COMING, text: 'Later', clientCommandId: commandId() }),
    ).resolves.toMatchObject({ text: 'Later' });
  });

  it('closes two hours after the booking ends, and is read-only then; 404 after thirty days', async () => {
    const { gateway, advance } = await dinerWorld();
    await gateway.sendGuestMessage({ subject: COMING, text: 'Hi', clientCommandId: commandId() });
    const booking = await gateway.getBooking(COMING.id);
    const minutesToClose = (Date.parse(booking!.endUtc) + 2 * 3_600_000 - START) / 60_000;
    advance(minutesToClose - 1);
    expect((await gateway.getConversation(COMING))?.open).toBe(true);
    advance(2);
    const closed = await gateway.getConversation(COMING);
    expect(closed).toMatchObject({ open: false, messages: [{ text: 'Hi' }] });
    expect(
      await caught(
        gateway.sendGuestMessage({ subject: COMING, text: 'Late', clientCommandId: commandId() }),
      ),
    ).toBeInstanceOf(ConversationClosedError);
    advance(30 * 24 * 60);
    expect(await gateway.getConversation(COMING)).toBeNull();
  });

  it('closes two hours after a cancellation', async () => {
    const { gateway, advance } = await dinerWorld();
    await gateway.cancelBooking(COMING.id);
    advance(119);
    expect((await gateway.getConversation(COMING))?.open).toBe(true);
    advance(2);
    expect((await gateway.getConversation(COMING))?.open).toBe(false);
  });

  it("answers somebody else's booking as none", async () => {
    const { gateway } = await dinerWorld();
    expect(await gateway.getConversation({ kind: 'reservation', id: 'bk_nobody' })).toBeNull();
    expect(
      await caught(
        gateway.sendGuestMessage({
          subject: { kind: 'reservation', id: 'bk_nobody' },
          text: 'Hi',
          clientCommandId: commandId(),
        }),
      ),
    ).toBeInstanceOf(NotFoundError);
  });
});

describe('the venue, the answers and the reads', () => {
  it("writes the venue's ask into the thread, and the answer bar shows until answered", async () => {
    const { gateway, advance } = await dinerWorld();
    gateway.askOnMyWayAsVenue(COMING.id);
    const asked = await gateway.getConversation(COMING);
    expect(asked).toMatchObject({ pendingAsk: true, unreadCount: 1 });
    expect(asked?.messages).toMatchObject([{ author: 'venue', kind: 'askComing', text: null }]);
    advance(1);
    await gateway.reportRunningLate({ reservationId: COMING.id, minutes: 15 });
    const answered = await gateway.getConversation(COMING);
    expect(answered?.pendingAsk).toBe(false);
    const booking = await gateway.getBooking(COMING.id);
    const heldUntil = new Intl.DateTimeFormat('en-GB', {
      timeZone: booking!.timeZoneId,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(Date.parse(booking!.slotUtc) + 15 * 60_000));
    expect(answered?.messages.slice(1)).toMatchObject([
      { author: 'guest', kind: 'answer', answer: { kind: 'late', lateMinutes: 15 } },
      { author: 'system', kind: 'status', status: { heldUntilLocal: heldUntil, cancelled: false } },
    ]);
  });

  it('writes "not coming" when the guest cancels a booking with a thread', async () => {
    const { gateway } = await dinerWorld();
    gateway.askOnMyWayAsVenue(COMING.id);
    await gateway.cancelBooking(COMING.id);
    const thread = await gateway.getConversation(COMING);
    expect(thread?.messages.slice(1)).toMatchObject([
      { kind: 'answer', answer: { kind: 'notComing' } },
      { kind: 'status', status: { cancelled: true } },
    ]);
  });

  it('counts the venue messages the guest has not read, and a read clears them', async () => {
    const { gateway, advance } = await dinerWorld();
    gateway.sendMessageAsVenue(COMING, 'Your table is ready', 'Արամ');
    advance(1);
    const thread = await gateway.getConversation(COMING);
    expect(thread).toMatchObject({ unreadCount: 1 });
    expect(thread?.messages[0]?.staffName).toBeNull();
    const unread = await gateway.getUnreadMessages();
    expect(unread).toMatchObject({
      total: 1,
      items: [
        {
          subjectKind: 'reservation',
          subjectId: 'bk_coming',
          venueName: 'Lumen Coffee',
          unread: 1,
          lastText: 'Your table is ready',
          lastKind: 'text',
        },
      ],
    });
    expect((await gateway.getBooking(COMING.id))?.messages).toMatchObject({
      unread: 1,
      lastAuthor: 'venue',
      lastText: 'Your table is ready',
      open: true,
    });
    await gateway.markConversationRead(COMING);
    expect((await gateway.getConversation(COMING))?.unreadCount).toBe(0);
    expect((await gateway.getUnreadMessages()).total).toBe(0);
  });

  it('shows "seen" through the venue\'s read', async () => {
    const { gateway, advance } = await dinerWorld();
    await gateway.sendGuestMessage({ subject: COMING, text: 'Hi', clientCommandId: commandId() });
    expect((await gateway.getConversation(COMING))?.venueLastReadUtc).toBeNull();
    advance(1);
    gateway.readConversationAsVenue(COMING);
    expect((await gateway.getConversation(COMING))?.venueLastReadUtc).toBe(
      new Date(START + 60_000).toISOString(),
    );
  });

  it('writes a feed row for every venue text', async () => {
    const { gateway } = await dinerWorld();
    gateway.sendMessageAsVenue(COMING, 'We saved you the window seat');
    const page = await gateway.listNotifications();
    const row = page.items.find((item) => item.kind === VENUE_MESSAGE_FEED_KIND);
    expect(row).toMatchObject({
      reservationId: 'bk_coming',
      orderId: null,
      params: { venueName: 'Lumen Coffee', text: 'We saved you the window seat', ask: 'false' },
    });
  });

  it('gives a booking with no thread a row only while one can be opened', async () => {
    const { gateway } = await dinerWorld();
    expect((await gateway.getBooking(COMING.id))?.messages).toEqual({
      unread: 0,
      lastAuthor: null,
      lastKind: null,
      lastText: null,
      lastAtUtc: null,
      open: true,
    });
  });
});

describe("mock mode's threads and the venue's reply", () => {
  it('seeds the coming booking asking, one new, and both takeaway orders', async () => {
    const { gateway } = await dinerWorld({ seedMessages: true });
    const coming = await gateway.getConversation(COMING);
    expect(coming).toMatchObject({ pendingAsk: true, unreadCount: 1 });
    expect(coming?.messages.map((message) => message.kind)).toEqual(['text', 'text', 'askComing']);
    expect((await gateway.getBooking(COMING.id))?.staffAskedOnMyWayAtUtc).toBeTruthy();

    const orders = await gateway.listDinerOrders();
    const active = orders.find((order) => order.takeaway?.status === 'accepted');
    const collected = orders.find((order) => order.takeaway?.status === 'collected');
    expect(active?.messages).toMatchObject({ unread: 1, lastAuthor: 'venue', open: true });
    expect(collected?.messages).toMatchObject({ unread: 0, open: false });
    const closed = await gateway.getConversation({ kind: 'takeaway', id: collected!.orderId });
    expect(closed).toMatchObject({
      open: false,
      subject: { takeawayCode: collected!.takeaway!.code },
    });

    const unread = await gateway.getUnreadMessages();
    expect(unread.total).toBe(2);
    expect(unread.items.map((item) => item.subjectKind).sort()).toEqual([
      'reservation',
      'takeaway',
    ]);
  });

  it('has the venue reply six seconds after a text, once per burst', async () => {
    const { gateway, advanceSeconds } = await dinerWorld({ seedMessages: true });
    await gateway.markConversationRead(COMING);
    await gateway.sendGuestMessage({ subject: COMING, text: 'Hi', clientCommandId: commandId() });
    await gateway.sendGuestMessage({
      subject: COMING,
      text: 'Again',
      clientCommandId: commandId(),
    });
    const before = (await gateway.getConversation(COMING))!.messages.length;
    advanceSeconds(6);
    const after = await gateway.getConversation(COMING);
    expect(after!.messages.length).toBe(before + 1);
    expect(after!.messages.at(-1)).toMatchObject({ author: 'venue', kind: 'text' });
    expect(after!.unreadCount).toBe(1);
  });

  it('has the venue answer "coming" with its own sentence', async () => {
    const { gateway, advanceSeconds } = await dinerWorld({ seedMessages: true });
    await gateway.confirmOnMyWay(COMING.id);
    advanceSeconds(6);
    const thread = await gateway.getConversation(COMING);
    expect(thread?.messages.slice(-3).map((message) => message.kind)).toEqual([
      'answer',
      'status',
      'text',
    ]);
    expect(thread?.pendingAsk).toBe(false);
  });
});

describe("the floor's inbox", () => {
  function floor(options: Parameters<typeof createStaffMockGateway>[0] = {}) {
    let clock = START;
    const gateway = createStaffMockGateway({
      now: () => new Date(clock),
      branchId: 'branch-cafe-01',
      seedMessages: true,
      ...options,
    });
    return {
      gateway,
      advanceSeconds: (seconds: number) => {
        clock += seconds * 1000;
      },
    };
  }

  it('lists the design threads, unanswered first, with the badge and the settings', async () => {
    const { gateway } = floor();
    const inbox = await gateway.listConversations('branch-cafe-01');
    expect(inbox).toMatchObject({ unreadTotal: 2, remindAfterMinutes: 3, templates: null });
    expect(inbox.items.map((item) => item.subject.guestName)).toEqual([
      'Կարեն Սահակյան',
      'Անի Մելքոնյան',
      'Դավիթ Հովսեփյան',
      'Մարիամ Կարապետյան',
    ]);
    const [karen, ani, davit, mariam] = inbox.items;
    expect(karen).toMatchObject({
      subject: { kind: 'takeaway', label: 'T-485' },
      unreadFromGuest: 1,
      oldestUnansweredGuestMessageUtc: new Date(START - 4 * 60_000).toISOString(),
    });
    expect(ani).toMatchObject({
      subject: { kind: 'reservation', label: '5' },
      unreadFromGuest: 1,
      lastMessage: { author: 'system', kind: 'status' },
    });
    expect(davit).toMatchObject({ awaitingGuestAnswer: true, unreadFromGuest: 0 });
    expect(mariam).toMatchObject({ oldestUnansweredGuestMessageUtc: null, unreadFromGuest: 0 });
  });

  it('carries the unread count on the floor and on the table tile', async () => {
    const { gateway } = floor();
    const state = await gateway.getFloor('branch-cafe-01');
    expect(state?.messages).toEqual({
      unreadTotal: 2,
      oldestUnansweredUtc: new Date(START - 4 * 60_000).toISOString(),
    });
    const tile = state?.details.find((detail) => detail.label === '5');
    expect(tile?.nextReservationUnreadMessages).toBe(1);
  });

  it('shows the staff names, and a read clears the badge', async () => {
    const { gateway } = floor();
    const subject = { kind: 'reservation', id: 'res-msg-ani' } as const;
    const thread = await gateway.getStaffConversation(subject);
    expect(thread).toMatchObject({ guestName: 'Անի Մելքոնյան', canWrite: true, unreadCount: 1 });
    expect(thread?.messages.map((message) => message.staffName)).toEqual([
      null,
      'Լիլիթ',
      'Արամ',
      null,
      null,
    ]);
    await gateway.markStaffConversationRead(subject);
    expect((await gateway.listConversations('branch-cafe-01')).unreadTotal).toBe(1);
    expect((await gateway.getFloor('branch-cafe-01'))?.messages?.unreadTotal).toBe(1);
  });

  it('answers a guest, signed by the tablet, and the guest replies ten seconds on', async () => {
    const { gateway, advanceSeconds } = floor({ staffName: 'Արամ' });
    const subject = { kind: 'takeaway', id: 'tk-msg-karen' } as const;
    const sent = await gateway.sendStaffMessage({
      subject,
      text: 'Այո, կարող եք',
      clientCommandId: commandId(),
    });
    expect(sent).toMatchObject({ author: 'venue', staffName: 'Արամ', wasReplay: false });
    let inbox = await gateway.listConversations('branch-cafe-01');
    expect(inbox.items.find((item) => item.subject.id === 'tk-msg-karen')).toMatchObject({
      unreadFromGuest: 0,
      oldestUnansweredGuestMessageUtc: null,
    });
    advanceSeconds(10);
    inbox = await gateway.listConversations('branch-cafe-01');
    expect(inbox.items.find((item) => item.subject.id === 'tk-msg-karen')).toMatchObject({
      unreadFromGuest: 1,
      lastMessage: { author: 'guest', kind: 'text' },
    });
  });

  it('writes the ask into the thread, and the simulated guest answers "coming"', async () => {
    const { gateway, advanceSeconds } = floor();
    const subject = { kind: 'reservation', id: 'res-msg-mariam' } as const;
    // Mariam is two and a half hours out: too early to ask. Davit asked 14 min ago.
    advanceSeconds(60);
    await gateway.askOnMyWay('res-msg-davit');
    const davit = await gateway.getStaffConversation({ kind: 'reservation', id: 'res-msg-davit' });
    expect(davit?.messages.map((message) => message.kind)).toEqual(['askComing', 'askComing']);
    advanceSeconds(10);
    const answered = await gateway.getStaffConversation({
      kind: 'reservation',
      id: 'res-msg-davit',
    });
    expect(answered?.messages.slice(-2)).toMatchObject([
      { kind: 'answer', answer: { kind: 'coming' } },
      { kind: 'status' },
    ]);
    const tile = (await gateway.getFloor('branch-cafe-01'))?.details.find(
      (detail) => detail.label === '8',
    );
    expect(tile?.nextReservationGuestConfirmedOnWayAtUtc).toBeTruthy();
    expect(await gateway.getStaffConversation(subject)).toMatchObject({ open: true });
  });

  it('lets a waiter write only while the branch allows it, and the kitchen never', async () => {
    const subject = { kind: 'reservation', id: 'res-msg-ani' } as const;
    const off = floor({ messageSettings: { waitersCanWrite: false } }).gateway;
    expect((await off.getStaffConversation(subject))?.canWrite).toBe(false);
    expect(
      await caught(off.sendStaffMessage({ subject, text: 'Hi', clientCommandId: commandId() })),
    ).toBeInstanceOf(WaitersCannotWriteError);
    const manager = floor({ messageSettings: { waitersCanWrite: false }, staffRole: 'manager' });
    await expect(
      manager.gateway.sendStaffMessage({ subject, text: 'Hi', clientCommandId: commandId() }),
    ).resolves.toMatchObject({ text: 'Hi' });
    const kitchen = floor({ staffRole: 'kitchen' }).gateway;
    expect(
      await caught(kitchen.sendStaffMessage({ subject, text: 'Hi', clientCommandId: commandId() })),
    ).toBeInstanceOf(ForbiddenError);
  });

  it('has no threads without the seed', async () => {
    const gateway = createStaffMockGateway({ now: () => new Date(START), seedMessages: false });
    expect(await gateway.listConversations('branch-cafe-01')).toMatchObject({
      items: [],
      unreadTotal: 0,
    });
    expect((await gateway.getFloor('branch-cafe-01'))?.messages).toEqual({
      unreadTotal: 0,
      oldestUnansweredUtc: null,
    });
  });
});

describe("the console's message settings", () => {
  it('starts at the default, saves all four trimmed, and names every bad field', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const branchId = 'b-lumen-north';
    expect(await gateway.getMessageSettings(branchId)).toEqual({
      guestsCanWrite: true,
      waitersCanWrite: true,
      templates: null,
      remindAfterMinutes: 3,
    });
    const saved = await gateway.saveMessageSettings({
      branchId,
      settings: {
        guestsCanWrite: false,
        waitersCanWrite: false,
        templates: ['  Լավ, սպասում ենք  ', 'Սեղանը պատրաստ է'],
        remindAfterMinutes: 5,
      },
    });
    expect(saved.templates).toEqual(['Լավ, սպասում ենք', 'Սեղանը պատրաստ է']);
    expect(await gateway.getMessageSettings(branchId)).toEqual(saved);

    const refused = await caught(
      gateway.saveMessageSettings({
        branchId,
        settings: {
          guestsCanWrite: true,
          waitersCanWrite: true,
          templates: Array.from({ length: 9 }, (_, index) => (index === 2 ? ' ' : `T${index}`)),
          remindAfterMinutes: 16,
        },
      }),
    );
    expect(refused).toBeInstanceOf(ValidationError);
    expect((refused as ValidationError).violations.map((violation) => violation.field)).toEqual([
      'remindAfterMinutes',
      'templates',
      'templates[2]',
    ]);
  });
});
