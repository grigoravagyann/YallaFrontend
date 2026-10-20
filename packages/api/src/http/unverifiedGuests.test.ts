import { describe, expect, it } from 'vitest';
import {
  DeviceHasActiveBookingError,
  PhoneHasActiveBookingError,
  TabAdmissionDecidedError,
  UnverifiedPartyTooLargeError,
  UnverifiedQueueFullError,
} from '../contracts/errors';
import { ConcurrencyConflictError } from '../errors';
import type { components } from '../generated/schema';
import { approvalTrigger } from './approvalMapping';
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';
import { createHttpGateway } from './httpGateway';
import { createPublicHttpGateway } from './publicHttpGateway';
import { createStaffHttpGateway } from './staffHttpGateway';
import { floorChangePage, staffFloorDetails, staffTabFromView } from './staffMapping';
import { managedBookingFromWire, type WirePublicBooking } from './publicMapping';
import { policyCommand, reservationPolicy } from './venueSettingsMapping';

/**
 * Unverified guests over HTTP (2026-10-20, UG wire): the booking without a
 * proved number, one active booking per number, and the tab a waiter lets
 * order. Every route and body is the wire's; every refusal arrives typed.
 */

type Schemas = components['schemas'];
type ReservationViewWire = Schemas['Yalla.Application.Reservations.ReservationView'];
type StaffView = Schemas['Yalla.Application.Tabs.TabStaffView'];

const BRANCH = '0b5f3c1e-0000-4000-8000-000000000001';
const TAB = '7d0c0000-0000-4000-8000-000000000001';
const COMMAND = '3f2b9c10-6d1e-4c1a-9d43-2f6c7f0b1234';

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
  awaitingApprovalBecause: 6,
  phoneUnverified: true,
  madeWithYourNumber: false,
  manageToken: 'manage-once',
};

const STAFF_VIEW: StaffView = {
  tabId: TAB,
  branchId: BRANCH,
  diningTableId: 't-7',
  tableLabel: '7',
  timeZoneId: 'Asia/Yerevan',
  status: 1,
  settlementMode: 1,
  settlementModeLocked: false,
  serviceChargePercent: 10,
  openedAtUtc: '2026-10-20T17:00:00Z',
  maxSequence: 3,
  participants: [],
  lines: [],
  adjustments: [],
  totals: { subtotalAmd: 0, serviceChargeAmd: 0, totalAmd: 0, paidAmd: 0, remainingAmd: 0 },
  admission: {
    status: 2,
    admittedBecause: 1,
    decidedAtUtc: '2026-10-20T17:03:00Z',
    decidedByStaffId: 'staff-1',
  },
} as unknown as StaffView;

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

function staffOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  return { backend, gateway: createStaffHttpGateway(backend.client()) };
}

function publicOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  return { backend, gateway: createPublicHttpGateway(backend.client()) };
}

function dinerOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  const gateway = createHttpGateway(backend.client({ getToken: () => 'diner-token' }), {
    audience: 'diner',
  });
  return { backend, gateway };
}

describe('the floor: tables waiting to be let in', () => {
  it('reads the awaiting list, oldest first, as sent', async () => {
    const { gateway, backend } = staffOver({
      [`GET /api/branches/${BRANCH}/tabs/awaiting-admission`]: {
        body: [
          {
            tabId: TAB,
            tableId: 't-7',
            tableLabel: '7',
            roomName: 'Hall',
            openedAtUtc: '2026-10-20T17:00:00Z',
            hostDisplayName: 'Guest 1',
            participantCount: 1,
            sittingSeatedByScan: true,
          },
          {
            tabId: 'tab-2',
            tableId: 't-9',
            tableLabel: '9',
            openedAtUtc: '2026-10-20T17:02:00Z',
            participantCount: 2,
            sittingSeatedByScan: false,
          },
        ],
      },
    });

    const list = await gateway.listTabsAwaitingAdmission(BRANCH);

    expect(backend.requests[0]?.method).toBe('GET');
    expect(list).toEqual([
      {
        tabId: TAB,
        tableId: 't-7',
        tableLabel: '7',
        roomName: 'Hall',
        openedAtUtc: '2026-10-20T17:00:00Z',
        hostDisplayName: 'Guest 1',
        participantCount: 1,
        sittingSeatedByScan: true,
      },
      {
        tabId: 'tab-2',
        tableId: 't-9',
        tableLabel: '9',
        roomName: null,
        openedAtUtc: '2026-10-20T17:02:00Z',
        hostDisplayName: null,
        participantCount: 2,
        sittingSeatedByScan: false,
      },
    ]);
  });

  it('admits with the command id alone, and reads the admission back', async () => {
    const { gateway, backend } = staffOver({
      [`POST /api/tabs/${TAB}/admit`]: { body: STAFF_VIEW },
    });

    const tab = await gateway.admitTab({ tabId: TAB, clientCommandId: COMMAND });

    expect(backend.requests[0]?.body).toEqual({ clientCommandId: COMMAND });
    expect(tab.admission).toEqual({
      status: 'admitted',
      admittedBecause: 'waiter',
      decidedAtUtc: '2026-10-20T17:03:00Z',
      decidedByStaffId: 'staff-1',
      tableFreed: null,
    });
  });

  it('rejects with a trimmed reason, and says whether the table was freed', async () => {
    const { gateway, backend } = staffOver({
      [`POST /api/tabs/${TAB}/reject`]: {
        body: {
          ...STAFF_VIEW,
          status: 3,
          admission: {
            status: 3,
            decidedAtUtc: '2026-10-20T17:04:00Z',
            decidedByStaffId: 'staff-1',
            tableFreed: true,
          },
        },
      },
    });

    const tab = await gateway.rejectTab({
      tabId: TAB,
      clientCommandId: COMMAND,
      reason: '  nobody there  ',
    });

    expect(backend.requests[0]?.body).toEqual({ clientCommandId: COMMAND, reason: 'nobody there' });
    expect(tab.status).toBe('closed');
    expect(tab.admission).toMatchObject({ status: 'rejected', tableFreed: true });
  });

  it('says another waiter decided first, with what they decided', async () => {
    const { gateway } = staffOver({
      [`POST /api/tabs/${TAB}/admit`]: problemReply(409, 'tab-admission-decided', {
        tabId: TAB,
        admission: 3,
      }),
    });

    const error = await caught(gateway.admitTab({ tabId: TAB, clientCommandId: COMMAND }));

    expect(error).toBeInstanceOf(TabAdmissionDecidedError);
    expect(error).toMatchObject({ tabId: TAB, admission: 'rejected' });
  });

  it('reads what was decided from the admission view too', async () => {
    const { gateway } = staffOver({
      [`POST /api/tabs/${TAB}/admit`]: problemReply(409, 'tab-admission-decided', {
        tabId: TAB,
        admission: { status: 3, tableFreed: true },
      }),
    });

    const error = await caught(gateway.admitTab({ tabId: TAB, clientCommandId: COMMAND }));

    expect(error).toMatchObject({ tabId: TAB, admission: 'rejected' });
  });

  it('leaves a table race on a reject as the race it is', async () => {
    const { gateway } = staffOver({
      [`POST /api/tabs/${TAB}/reject`]: problemReply(409, 'table-state-conflict', {}),
    });

    const error = await caught(gateway.rejectTab({ tabId: TAB, clientCommandId: COMMAND }));

    expect(error).toBeInstanceOf(ConcurrencyConflictError);
    expect(error).not.toBeInstanceOf(TabAdmissionDecidedError);
  });

  it('reads the two flags on a floor table, and the signal on a change', () => {
    const row = {
      tableId: 't-7',
      label: '7',
      seats: 4,
      floorAreaDisplayOrder: 0,
      isBookable: true,
      physicalStatus: 4,
      state: 4,
      rowVersion: 'AAAAAAAAB9E=',
      openTabId: TAB,
    } as const;
    const floor = {
      asOfUtc: '2026-10-20T17:00:00Z',
      branchId: BRANCH,
      branchName: 'North',
      maxSequence: 4,
      timeZoneId: 'Asia/Yerevan',
      tables: [
        { ...row, nextReservationPhoneUnverified: true, openTabAwaitingAdmission: true },
        // A server before the feature says neither: a verified booking, an admitted tab.
        { ...row, tableId: 't-8', label: '8' },
      ],
    } as unknown as Schemas['Yalla.Application.Floor.BranchFloorState'];

    const [flagged, quiet] = staffFloorDetails(floor);
    expect(flagged).toMatchObject({
      nextReservationPhoneUnverified: true,
      openTabAwaitingAdmission: true,
    });
    expect(quiet).toMatchObject({
      nextReservationPhoneUnverified: false,
      openTabAwaitingAdmission: false,
    });

    const page = floorChangePage({
      branchId: BRANCH,
      maxSequence: 5,
      hasMore: false,
      changes: [
        {
          sequence: 5,
          diningTableId: 't-7',
          tableLabel: '7',
          fromStatus: 4,
          toStatus: 4,
          atUtc: '2026-10-20T17:00:00Z',
          actorType: 3,
          reason: '',
          tabId: TAB,
          signal: 1,
        },
      ],
    } as unknown as Schemas['Yalla.Application.Floor.BranchChangePage']);
    expect(page.changes[0]).toMatchObject({ tabId: TAB, signal: 'tabAwaitingAdmission' });
  });

  it('reads a tab from before admission as admitted', () => {
    const { admission: _admission, ...legacy } = STAFF_VIEW;
    expect(staffTabFromView(legacy as StaffView, '').admission.status).toBe('admitted');
  });
});

describe('a booking without a proved number', () => {
  const COMMAND_BODY = {
    branchId: BRANCH,
    commandId: COMMAND,
    tableId: 'tbl-7',
    // 15:30 UTC is 19:30 in Yerevan: the route takes the branch's wall clock.
    slotUtc: '2026-10-22T15:30:00.000Z',
    timeZoneId: 'Asia/Yerevan',
    partySize: 2,
    guestName: 'Ani',
    guestPhone: '+374 99 11 22 33',
    deviceId: 'browser-1',
  } as const;
  const ROUTE = `POST /api/public/branches/${BRANCH}/bookings`;

  it('posts anonymously with the browser, and hands the token back once', async () => {
    const { gateway, backend } = publicOver({ [ROUTE]: { status: 201, body: VIEW } });

    const result = await gateway.createUnverifiedBooking(COMMAND_BODY);

    const request = backend.requests[0]!;
    expect(request.headers.get('authorization')).toBeNull();
    expect(request.body).toEqual({
      tableId: 'tbl-7',
      date: '2026-10-22',
      time: '19:30',
      partySize: 2,
      guestName: 'Ani',
      guestPhone: '+374 99 11 22 33',
      deviceId: 'browser-1',
      clientCommandId: COMMAND,
      note: null,
    });
    expect(result.manageToken).toBe('manage-once');
    expect(result.wasReplay).toBe(false);
    expect(result.booking).toMatchObject({
      status: 'pendingApproval',
      awaitingApprovalBecause: 'unverifiedPhone',
      phoneUnverified: true,
    });
  });

  it('carries no token on a replay', async () => {
    const { manageToken: _token, ...replay } = VIEW;
    const { gateway } = publicOver({ [ROUTE]: { body: { ...replay, wasReplay: true } } });

    const result = await gateway.createUnverifiedBooking(COMMAND_BODY);

    expect(result).toMatchObject({ manageToken: null, wasReplay: true });
  });

  it('names the three refusals of its own', async () => {
    const refusal = async (reply: ReturnType<typeof problemReply>) =>
      caught(publicOver({ [ROUTE]: reply }).gateway.createUnverifiedBooking(COMMAND_BODY));

    const phone = await refusal(problemReply(409, 'phone-has-active-booking'));
    expect(phone).toBeInstanceOf(PhoneHasActiveBookingError);
    // Nothing named on this route: somebody else's booking is never described.
    expect((phone as PhoneHasActiveBookingError).held).toBeNull();

    expect(await refusal(problemReply(409, 'device-has-active-booking'))).toBeInstanceOf(
      DeviceHasActiveBookingError,
    );

    const cap = await refusal(
      problemReply(422, 'reservation-unverified-party-too-large', {
        reason: 14,
        partySize: 8,
        maxPartySize: 6,
      }),
    );
    expect(cap).toBeInstanceOf(UnverifiedPartyTooLargeError);
    expect(cap).toMatchObject({ partySize: 8, maxPartySize: 6 });

    // A cap of 0: the branch takes none without a verified number.
    const off = await refusal(
      problemReply(422, 'reservation-unverified-party-too-large', {
        reason: 14,
        partySize: 2,
        maxPartySize: 0,
      }),
    );
    expect(off).toMatchObject({ partySize: 2, maxPartySize: 0 });

    expect(await refusal(problemReply(409, 'branch-unverified-queue-full'))).toBeInstanceOf(
      UnverifiedQueueFullError,
    );
  });

  it("reads a booking somebody else made with the account's number", async () => {
    const { gateway } = dinerOver({
      'GET /api/reservations/mine': {
        body: { upcoming: [{ ...VIEW, madeWithYourNumber: true }], past: [] },
      },
    });

    const mine = await gateway.listBookings();

    expect(mine.upcoming[0]).toMatchObject({ madeWithYourNumber: true, phoneUnverified: true });
  });

  it("names the account's own held booking when the app is refused for the number", async () => {
    const { gateway } = dinerOver({
      'POST /api/reservations': problemReply(409, 'phone-has-active-booking', {
        reservationId: 'r-1',
        code: 'K7Q2LM',
        startUtc: '2026-10-22T15:30:00Z',
        localDate: '2026-10-22',
        localStartTime: '19:30:00',
        venueName: 'Café Aram',
        branchName: 'Main',
      }),
    });

    const error = await caught(
      gateway.createBooking({ ...COMMAND_BODY, guestPhone: '+37499112233', channel: 'app' }),
    );

    expect(error).toBeInstanceOf(PhoneHasActiveBookingError);
    expect((error as PhoneHasActiveBookingError).held).toEqual({
      reservationId: 'r-1',
      code: 'K7Q2LM',
      startUtc: '2026-10-22T15:30:00Z',
      localDate: '2026-10-22',
      localStartTime: '19:30',
      venueName: 'Café Aram',
      branchName: 'Main',
    });
  });

  it('reads the flag and the reason on every booking the app reads', async () => {
    const { gateway } = dinerOver({ 'POST /api/reservations': { status: 201, body: VIEW } });

    const booking = await gateway.createBooking({
      ...COMMAND_BODY,
      guestPhone: '+37499112233',
      channel: 'app',
    });

    expect(booking.phoneUnverified).toBe(true);
    expect(booking.awaitingApprovalBecause).toBe('unverifiedPhone');
    expect(approvalTrigger(6)).toBe('unverifiedPhone');
  });

  it('reads the link: never changed, and says why', () => {
    const managed = managedBookingFromWire({
      reservationId: VIEW.id,
      code: VIEW.code,
      status: 1,
      venueName: 'Lumen',
      branchName: 'North',
      tableId: 'tbl-7',
      tableLabel: '7',
      partySize: 2,
      localDate: '2026-10-22',
      localStartTime: '19:30:00',
      timeZoneId: 'Asia/Yerevan',
      cancellationDeadlineUtc: '2026-10-22T13:30:00Z',
      cancelledAfterDeadline: false,
      canCancel: true,
      canChange: false,
      phoneUnverified: true,
    } as unknown as WirePublicBooking);

    expect(managed).toMatchObject({ phoneUnverified: true, canChange: false, canCancel: true });
  });

  it('reads the two policy settings, and the shipped ones from a server without them', () => {
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
      autoConfirm: true,
      serviceChargePercent: 10,
      pricesIncludeVat: true,
    };
    type WirePolicy = Parameters<typeof reservationPolicy>[0];
    expect(
      reservationPolicy({
        ...base,
        unverifiedBookingsNeedApproval: false,
        unverifiedMaxPartySize: 4,
      } as WirePolicy),
    ).toMatchObject({ unverifiedBookingsNeedApproval: false, unverifiedMaxPartySize: 4 });
    expect(
      reservationPolicy({ ...base, unverifiedScansNeedAdmission: false } as unknown as WirePolicy),
    ).toMatchObject({ unverifiedScansNeedAdmission: false });
    const shipped = reservationPolicy(base as unknown as WirePolicy);
    expect(shipped).toMatchObject({
      unverifiedBookingsNeedApproval: true,
      unverifiedMaxPartySize: 6,
      unverifiedScansNeedAdmission: true,
    });
    // Sent back whole, so a save never resets a setting it did not show.
    expect(policyCommand({ ...shipped, unverifiedScansNeedAdmission: false })).toMatchObject({
      unverifiedBookingsNeedApproval: true,
      unverifiedMaxPartySize: 6,
      unverifiedScansNeedAdmission: false,
    });
  });
});
