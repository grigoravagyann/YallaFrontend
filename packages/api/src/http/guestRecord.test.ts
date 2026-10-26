import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import {
  BookingBlockedNoShowsError,
  BookingOverlapsOwnError,
  NoShowUndoWindowClosedError,
  PhoneHasActiveBookingError,
  ReservationCancelledByBlockError,
} from '../contracts/errors';
import type { components } from '../generated/schema';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';
import { cancellationCause, guestRecordFromWire } from './guestRecordMapping';
import { createHttpGateway } from './httpGateway';
import { createPublicHttpGateway } from './publicHttpGateway';
import { createStaffHttpGateway } from './staffHttpGateway';
import { compared, reservationReport } from './reportMapping';
import { floorChangePage, staffFloorDetails } from './staffMapping';
import { policyCommand, reservationPolicy } from './venueSettingsMapping';

/**
 * The guest record over HTTP (GR wire, 2026-10-20): the record on staff reads
 * and on the diner's own list, why a booking was cancelled, the number rules'
 * refusals, the no-show block, and the venue's good-record setting.
 */

type Schemas = components['schemas'];
type ReservationViewWire = Schemas['Yalla.Application.Reservations.ReservationView'];

const BRANCH = '0b5f3c1e-0000-4000-8000-000000000001';
const COMMAND = '3f2b9c10-6d1e-4c1a-9d43-2f6c7f0b1234';
/** As a server before `unmarked` wrote one: read with it as 0. */
const RECORD = {
  booked: 12,
  came: 11,
  noShows: 1,
  lateCancellations: 0,
  isNewGuest: false,
} as unknown as Schemas['Yalla.Application.Reservations.GuestRecord'];
/** The record as today's server writes it, for the stubbed routes. */
const WIRE_RECORD: Schemas['Yalla.Application.Reservations.GuestRecord'] = {
  ...RECORD,
  unmarked: 0,
  takeawayNoShows: 0,
};
// A server before takeaway in the record (2026-10-23) says none: 0.
const RECORD_READ = { ...RECORD, unmarked: 0, takeawayNoShows: 0, blockedUntilUtc: null };

const VIEW: ReservationViewWire = {
  id: '6f1d0a2e-0000-4000-8000-00000000000a',
  code: 'K7Q2LM',
  status: 1,
  branchId: BRANCH,
  branchName: 'Northern Avenue',
  tableId: 'tbl-7',
  tableLabel: '7',
  partySize: 2,
  startUtc: '2026-10-22T15:30:00Z',
  onMyWayOpensAtUtc: '2026-10-22T13:30:00Z',
  endUtc: '2026-10-22T17:00:00Z',
  localDate: '2026-10-22',
  localStartTime: '19:30:00',
  localEndTime: '21:00:00',
  timeZoneId: 'Asia/Yerevan',
  cancellationDeadlineUtc: '2026-10-22T13:30:00Z',
  cancelledAfterDeadline: false,
  clientCommandId: COMMAND,
  guestName: 'Ani',
  guestPhone: '+37499112233',
  wasReplay: false,
  awaitsEarlierGuestAnswer: false,
  awaitingApprovalBecause: 1,
  phoneUnverified: false,
};

const BOOK = {
  branchId: BRANCH,
  commandId: COMMAND,
  tableId: 'tbl-7',
  slotUtc: '2026-10-22T15:30:00.000Z',
  timeZoneId: 'Asia/Yerevan',
  partySize: 2,
  guestName: 'Ani',
  guestPhone: '+37499112233',
  channel: 'app',
} as const;

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

function dinerOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  return createHttpGateway(backend.client({ getToken: () => 'diner-token' }), {
    audience: 'diner',
  });
}

function staffOver(routes: Readonly<Record<string, FakeRoute>>) {
  return createStaffHttpGateway(fakeBackend(routes).client());
}

function consoleOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  return createConsoleHttpGateway(backend.client({ getToken: () => 'held-token' }), {
    auth: createAuthSession({
      storage: createMemoryTokenStorage('refresh-0'),
      refreshTokens: vi.fn(),
    }),
    identity: createMemoryIdentityStore(),
  });
}

describe('the guest record on the wire', () => {
  it('reads the counts, the new guest and the block', () => {
    expect(guestRecordFromWire(RECORD)).toEqual(RECORD_READ);
    expect(
      guestRecordFromWire({
        booked: 0,
        came: 0,
        noShows: 0,
        lateCancellations: 0,
        unmarked: 0,
        isNewGuest: true,
        takeawayNoShows: 1,
        blockedUntilUtc: '2026-10-27T18:00:00Z',
      }),
    ).toMatchObject({
      isNewGuest: true,
      takeawayNoShows: 1,
      blockedUntilUtc: '2026-10-27T18:00:00Z',
    });
    // Absent: no proved account behind the booking.
    expect(guestRecordFromWire(undefined)).toBeNull();
    expect(guestRecordFromWire(null)).toBeNull();
  });

  it('reads why a booking was cancelled, and a cause it does not know', () => {
    expect(cancellationCause(1)).toBe('noShowBlock');
    expect(cancellationCause(9 as never)).toBe('unknown');
    expect(cancellationCause(undefined)).toBeNull();
  });

  it("carries the record on the console's pending list and its answers", async () => {
    const gateway = consoleOver({
      [`GET /api/branches/${BRANCH}/reservations`]: {
        body: [
          { ...VIEW, guestRecord: WIRE_RECORD },
          { ...VIEW, id: 'r-2' },
        ],
      },
      [`POST /api/reservations/${VIEW.id}/reject`]: {
        body: { ...VIEW, status: 7, cancelledBecause: 1, guestRecord: WIRE_RECORD },
      },
    });

    const [withRecord, without] = await gateway.listPendingReservations(BRANCH);
    expect(withRecord?.guestRecord).toMatchObject({ came: 11, noShows: 1 });
    expect(without?.guestRecord).toBeNull();

    const rejected = await gateway.rejectReservation({ reservationId: VIEW.id });
    expect(rejected).toMatchObject({
      cancelledBecause: 'noShowBlock',
      guestRecord: { booked: 12 },
    });
  });

  it("carries the record on the floor's awaiting cards", async () => {
    const gateway = staffOver({
      [`GET /api/branches/${BRANCH}/reservations/awaiting`]: {
        body: [
          {
            reservation: { ...VIEW, guestRecord: WIRE_RECORD },
            trigger: 1,
            approvalExpiresAtUtc: null,
          },
        ],
      },
    });

    const [card] = await gateway.listAwaitingApproval(BRANCH);
    expect(card?.guestRecord).toMatchObject({ came: 11, noShows: 1, isNewGuest: false });
  });

  it("reads a block's cancellation on the floor's change stream", () => {
    const page = floorChangePage({
      branchId: BRANCH,
      maxSequence: 9,
      hasMore: false,
      changes: [
        {
          sequence: 9,
          diningTableId: 't-7',
          tableLabel: '7',
          fromStatus: 1,
          toStatus: 1,
          atUtc: '2026-10-20T17:00:00Z',
          actorType: 3,
          reason: '',
          reservationId: VIEW.id,
          signal: 4,
        },
      ],
    } as unknown as Schemas['Yalla.Application.Floor.BranchChangePage']);
    expect(page.changes[0]).toMatchObject({
      reservationId: VIEW.id,
      signal: 'bookingCancelledByBlock',
    });
  });

  it('reads the bookings nobody settled, and 0 from a server before them', () => {
    expect(guestRecordFromWire({ ...RECORD, booked: 14, unmarked: 2 } as never)).toMatchObject({
      booked: 14,
      unmarked: 2,
    });
    expect(guestRecordFromWire(RECORD)?.unmarked).toBe(0);
  });

  it("gives the diner their own record beside their bookings, and a booking's cause", async () => {
    const gateway = dinerOver({
      'GET /api/reservations/mine': {
        body: {
          upcoming: [],
          past: [{ ...VIEW, status: 7, cancelledBecause: 1 }],
          guestRecord: { ...WIRE_RECORD, blockedUntilUtc: '2026-10-27T18:00:00Z' },
        },
      },
    });

    const mine = await gateway.listBookings();

    expect(mine.guestRecord).toMatchObject({
      came: 11,
      noShows: 1,
      blockedUntilUtc: '2026-10-27T18:00:00Z',
    });
    expect(mine.past[0]).toMatchObject({
      status: 'cancelledByVenue',
      cancelledBecause: 'noShowBlock',
    });
  });
});

describe('the number rules and the block, as refusals', () => {
  it('reads the fourth active booking, with the caller’s next one', async () => {
    const gateway = dinerOver({
      'POST /api/reservations': problemReply(409, 'phone-has-active-booking', {
        maxActiveBookings: 3,
        reservationId: 'r-1',
        code: 'K7Q2LM',
        startUtc: '2026-10-22T15:30:00Z',
        localDate: '2026-10-22',
        localStartTime: '19:30:00',
        venueName: 'Café Aram',
        branchName: 'Main',
      }),
    });

    const error = await caught(gateway.createBooking(BOOK));

    expect(error).toBeInstanceOf(PhoneHasActiveBookingError);
    expect(error).toMatchObject({
      maxActiveBookings: 3,
      held: {
        reservationId: 'r-1',
        code: 'K7Q2LM',
        localDate: '2026-10-22',
        localStartTime: '19:30',
        venueName: 'Café Aram',
        branchName: 'Main',
      },
    });
  });

  it('reads the same refusal with no context: three, naming nobody', async () => {
    const gateway = dinerOver({
      'POST /api/reservations': problemReply(409, 'phone-has-active-booking'),
    });

    const error = await caught(gateway.createBooking(BOOK));

    expect(error).toMatchObject({ maxActiveBookings: 3, held: null });
  });

  it('reads an overlap with her own booking at another venue, naming it', async () => {
    const gateway = dinerOver({
      'POST /api/reservations': problemReply(409, 'reservation-overlaps-own', {
        reservationId: 'r-9',
        code: 'Z1Z1Z1',
        localDate: '2026-10-22',
        localStartTime: '20:30:00',
        tableLabel: '4',
        venueName: 'Café Aram',
        branchName: 'Main',
      }),
    });

    const error = await caught(gateway.createBooking(BOOK));

    expect(error).toBeInstanceOf(BookingOverlapsOwnError);
    expect(error).toMatchObject({
      localStartTime: '20:30',
      venueName: 'Café Aram',
      branchName: 'Main',
    });
  });

  it('reads the block on a booking, on a change and on the link’s change', async () => {
    const until = '2026-10-27T18:00:00Z';
    const reply = problemReply(403, 'booking-blocked-no-shows', { blockedUntilUtc: until });

    const create = await caught(dinerOver({ 'POST /api/reservations': reply }).createBooking(BOOK));
    expect(create).toBeInstanceOf(BookingBlockedNoShowsError);
    expect(create).toMatchObject({ blockedUntilUtc: until });

    const move = await caught(
      dinerOver({ [`POST /api/reservations/${VIEW.id}/reschedule`]: reply }).rescheduleBooking({
        bookingId: VIEW.id,
        commandId: COMMAND,
        tableId: 'tbl-7',
        slotUtc: BOOK.slotUtc,
        timeZoneId: 'Asia/Yerevan',
        partySize: 2,
      }),
    );
    expect(move).toBeInstanceOf(BookingBlockedNoShowsError);

    const link = await caught(
      createPublicHttpGateway(
        fakeBackend({ 'POST /api/public/bookings/tok/reschedule': reply }).client(),
      ).rescheduleManagedBooking({
        token: 'tok',
        commandId: COMMAND,
        tableId: 'tbl-7',
        slotUtc: BOOK.slotUtc,
        timeZoneId: 'Asia/Yerevan',
        partySize: 2,
      }),
    );
    expect(link).toBeInstanceOf(BookingBlockedNoShowsError);
  });
});

describe("the venues' counts (review round)", () => {
  it("reads the report's system cancellations, and none from a server before them", () => {
    const c = { value: 2, previous: 1 };
    const wire = {
      scope: {
        branchIds: ['b-1'],
        range: { fromLocalDate: '2026-10-12', toLocalDate: '2026-10-18' },
        timeZoneId: 'Asia/Yerevan',
      },
      booked: c,
      seated: c,
      cancelled: c,
      noShow: c,
      noShowRate: c,
      cancellationRate: c,
      lateCancellations: c,
      leadTime: [],
      webBookingsWithoutAnApp: c,
    };
    expect(reservationReport({ ...wire, systemCancelled: c } as never).systemCancelled).toEqual(
      compared(c as never),
    );
    expect(reservationReport(wire as never).systemCancelled).toBeNull();
  });
});

describe('undoing a no-show (review round)', () => {
  const ANSWER = { ...VIEW, status: 2, awaitingApprovalBecause: null };

  it('undoes it from the tablet with the command id, and reads the booking back', async () => {
    const backend = fakeBackend({
      [`POST /api/reservations/${VIEW.id}/undo-no-show`]: { body: ANSWER },
    });
    const gateway = createStaffHttpGateway(backend.client());

    const undone = await gateway.undoNoShow({
      reservationId: VIEW.id,
      clientCommandId: COMMAND,
      reason: '  marked the wrong table ',
    });

    expect(backend.requests[0]?.body).toEqual({
      clientCommandId: COMMAND,
      reason: 'marked the wrong table',
    });
    expect(undone).toEqual({
      reservationId: VIEW.id,
      status: 'confirmed',
      tableId: 'tbl-7',
      tableLabel: '7',
    });
  });

  it('says when the window closed, on the tablet and in the console', async () => {
    const reply = problemReply(409, 'no-show-undo-window-closed', {
      undoableUntilUtc: '2026-10-23T01:00:00Z',
    });
    const tablet = await caught(
      staffOver({ [`POST /api/reservations/${VIEW.id}/undo-no-show`]: reply }).undoNoShow({
        reservationId: VIEW.id,
        clientCommandId: COMMAND,
      }),
    );
    expect(tablet).toBeInstanceOf(NoShowUndoWindowClosedError);
    expect(tablet).toMatchObject({ undoableUntilUtc: '2026-10-23T01:00:00Z' });

    const console = await caught(
      consoleOver({ [`POST /api/reservations/${VIEW.id}/undo-no-show`]: reply }).actOnBooking({
        kind: 'undoNoShow',
        branchId: BRANCH,
        reservationId: VIEW.id,
        tableId: 'tbl-7',
        clientCommandId: COMMAND,
      }),
    );
    expect(console).toBeInstanceOf(NoShowUndoWindowClosedError);
  });

  it("undoes it from the console's row, confirmed again", async () => {
    const result = await consoleOver({
      [`POST /api/reservations/${VIEW.id}/undo-no-show`]: { body: ANSWER },
    }).actOnBooking({
      kind: 'undoNoShow',
      branchId: BRANCH,
      reservationId: VIEW.id,
      tableId: 'tbl-7',
      clientCommandId: COMMAND,
    });

    expect(result).toMatchObject({ kind: 'undoNoShow', status: 'confirmed', tableFreed: false });
  });
});

describe('the platform lifts a block (review round)', () => {
  const BLOCK = {
    blockId: 'blk-1',
    dinerUserId: 'd-1',
    dinerDisplayName: 'Armen',
    phoneE164: '+37491555123',
    blockedAtUtc: '2026-10-20T10:00:00Z',
    blockedUntilUtc: '2026-10-27T10:00:00Z',
  };

  it('lists the blocks in force, and lifts one with its reason', async () => {
    const backend = fakeBackend({
      'GET /api/platform/booking-blocks': {
        body: [BLOCK, { ...BLOCK, blockId: 'blk-2', dinerDisplayName: null }],
      },
      'POST /api/platform/booking-blocks/blk-1/lift': {
        body: { ...BLOCK, liftedAtUtc: '2026-10-21T09:00:00Z', liftedBecause: 1 },
      },
    });
    const gateway = createConsoleHttpGateway(backend.client({ getToken: () => 'held-token' }), {
      auth: createAuthSession({
        storage: createMemoryTokenStorage('refresh-0'),
        refreshTokens: vi.fn(),
      }),
      identity: createMemoryIdentityStore(),
    });

    const blocks = await gateway.listBookingBlocks();
    expect(blocks.map((block) => block.dinerDisplayName)).toEqual(['Armen', null]);
    expect(blocks[0]).toMatchObject({ liftedAtUtc: null, phoneE164: '+37491555123' });

    const lifted = await gateway.liftBookingBlock({ blockId: 'blk-1', reason: ' a mistake ' });
    expect(backend.requests[1]?.body).toEqual({ reason: 'a mistake' });
    expect(lifted.liftedAtUtc).toBe('2026-10-21T09:00:00Z');
  });
});

describe("the venue's good-record setting", () => {
  it('reads it, and sends it back whole', () => {
    const base = {
      turnTimeMinutes: 90,
      bufferMinutes: 5,
      graceMinutes: 15,
      lateNudgeAfterMinutes: 10,
      graceExtensionMinutes: 10,
      minLeadMinutes: 10,
      bookingWindowDays: 14,
      cancellationDeadlineMinutes: 120,
      walkInHoldbackMinutes: 30,
      autoConfirm: false,
      serviceChargePercent: 10,
      pricesIncludeVat: true,
      unverifiedScansNeedAdmission: true,
    };
    type WirePolicy = Parameters<typeof reservationPolicy>[0];
    const read = reservationPolicy({
      ...base,
      autoConfirmGuestsWithGoodRecord: true,
    } as WirePolicy);
    expect(read).toMatchObject({ autoConfirmGuestsWithGoodRecord: true });
    // A server before it: off.
    expect(reservationPolicy(base as unknown as WirePolicy)).toMatchObject({
      autoConfirmGuestsWithGoodRecord: false,
    });
    const command = policyCommand(read);
    expect(command).toMatchObject({ autoConfirmGuestsWithGoodRecord: true });
    // The two retired settings are never sent.
    expect(command).not.toHaveProperty('unverifiedBookingsNeedApproval');
    expect(command).not.toHaveProperty('unverifiedMaxPartySize');
  });
});

describe('the staff wire gaps closed (wire §0a)', () => {
  it("reads the next booking's and the sitting party's record off the floor", () => {
    const [table] = staffFloorDetails({
      tables: [
        {
          tableId: 't4',
          label: '4',
          seats: 4,
          physicalStatus: 1,
          rowVersion: 'AAA=',
          nextReservationGuestRecord: { ...RECORD, unmarked: 0 },
          sittingGuestRecord: null,
        },
      ],
    } as never);
    expect(table?.nextReservationGuestRecord).toMatchObject({ came: 11, noShows: 1 });
    expect(table?.sittingGuestRecord).toBeNull();
  });

  it('says when a no-show blocked its guest, on the tablet and in the console', async () => {
    const answer = {
      reservation: { ...VIEW, status: 8 },
      outcome: 1,
      countsTowardNoShowThreshold: true,
      tableId: 'tbl-7',
      tableLabel: '7',
      tableFreed: true,
      tableStatus: 1,
      wasReplay: false,
      guestBlockedUntilUtc: '2026-10-28T15:00:00Z',
    };
    const tablet = await staffOver({
      [`POST /api/reservations/${VIEW.id}/release`]: { body: answer },
    }).releaseReservation({ reservationId: VIEW.id, outcome: 'noShow', clientCommandId: COMMAND });
    expect(tablet.guestBlockedUntilUtc).toBe('2026-10-28T15:00:00Z');

    const console = await consoleOver({
      [`POST /api/reservations/${VIEW.id}/no-show`]: { body: answer },
    }).actOnBooking({
      kind: 'noShow',
      branchId: BRANCH,
      reservationId: VIEW.id,
      tableId: 'tbl-7',
      clientCommandId: COMMAND,
    });
    expect(console.guestBlockedUntilUtc).toBe('2026-10-28T15:00:00Z');

    const { guestBlockedUntilUtc: _none, ...plain } = answer;
    const ordinary = await staffOver({
      [`POST /api/reservations/${VIEW.id}/release`]: { body: plain },
    }).releaseReservation({ reservationId: VIEW.id, outcome: 'noShow', clientCommandId: COMMAND });
    expect(ordinary.guestBlockedUntilUtc).toBeNull();
  });

  it("says a request was cancelled by its guest's block, on approve and reject alike", async () => {
    const reply = problemReply(409, 'reservation-cancelled-by-block', {
      reservationId: VIEW.id,
      cancelledAtUtc: '2026-10-21T14:00:00Z',
    });
    const tablet = staffOver({
      [`POST /api/reservations/${VIEW.id}/approve`]: reply,
      [`POST /api/reservations/${VIEW.id}/reject`]: reply,
    });
    const approve = await caught(tablet.approveReservation({ reservationId: VIEW.id }));
    expect(approve).toBeInstanceOf(ReservationCancelledByBlockError);
    expect(approve).toMatchObject({ cancelledAtUtc: '2026-10-21T14:00:00Z' });
    expect(await caught(tablet.rejectReservation({ reservationId: VIEW.id }))).toBeInstanceOf(
      ReservationCancelledByBlockError,
    );

    const consoleGateway = consoleOver({
      [`POST /api/reservations/${VIEW.id}/approve`]: reply,
      [`POST /api/reservations/${VIEW.id}/reject`]: reply,
    });
    expect(
      await caught(consoleGateway.approveReservation({ reservationId: VIEW.id })),
    ).toBeInstanceOf(ReservationCancelledByBlockError);
    expect(
      await caught(consoleGateway.rejectReservation({ reservationId: VIEW.id })),
    ).toBeInstanceOf(ReservationCancelledByBlockError);
  });

  it('reads a booking event on the change stream (signal 5)', () => {
    const page = floorChangePage({
      branchId: BRANCH,
      maxSequence: 12,
      hasMore: false,
      changes: [
        {
          sequence: 12,
          diningTableId: 't-4',
          tableLabel: '4',
          fromStatus: 1,
          toStatus: 1,
          atUtc: '2026-10-21T15:00:00Z',
          actorType: 1,
          reason: '',
          reservationId: VIEW.id,
          signal: 5,
        },
      ],
    } as unknown as Schemas['Yalla.Application.Floor.BranchChangePage']);
    expect(page.changes[0]).toMatchObject({ signal: 'bookingChanged', reservationId: VIEW.id });
  });
});
