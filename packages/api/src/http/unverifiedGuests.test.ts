import { describe, expect, it } from 'vitest';
import { TabAdmissionDecidedError } from '../contracts/errors';
import { ConcurrencyConflictError } from '../errors';
import type { components } from '../generated/schema';
import { approvalTrigger } from './approvalMapping';
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';
import { createHttpGateway } from './httpGateway';
import { createStaffHttpGateway } from './staffHttpGateway';
import { floorChangePage, staffFloorDetails, staffTabFromView } from './staffMapping';
import { managedBookingFromWire, type WirePublicBooking } from './publicMapping';
import { policyCommand, reservationPolicy } from './venueSettingsMapping';

/**
 * Unverified guests over HTTP (2026-10-20, UG wire): the tab a waiter lets
 * order, and what is left of the bookings made without a proved number while
 * those were taken (the guest record retired them the same day). Every route
 * and body is the wire's; every refusal arrives typed.
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
  awaitingApprovalBecause: 6,
  phoneUnverified: true,
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
  tipsAmd: 0,
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

describe('legacy bookings made without a proved number, and the scans setting', () => {
  it('reads the link of one: never changed, and says why', () => {
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

  it('reads the flag and the reason on a legacy booking the app reads', async () => {
    const { gateway } = dinerOver({
      'GET /api/reservations/mine': { body: { upcoming: [VIEW], past: [] } },
    });

    const [booking] = (await gateway.listBookings()).upcoming;

    expect(booking).toMatchObject({
      phoneUnverified: true,
      awaitingApprovalBecause: 'unverifiedPhone',
    });
    expect(approvalTrigger(6)).toBe('unverifiedPhone');
  });

  it('reads the scans setting, and the shipped one from a server without it', () => {
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
      autoConfirmGuestsWithGoodRecord: false,
    };
    type WirePolicy = Parameters<typeof reservationPolicy>[0];
    expect(
      reservationPolicy({ ...base, unverifiedScansNeedAdmission: false } as WirePolicy),
    ).toMatchObject({ unverifiedScansNeedAdmission: false });
    const shipped = reservationPolicy(base as unknown as WirePolicy);
    expect(shipped).toMatchObject({ unverifiedScansNeedAdmission: true });
    // Sent back whole, so a save never resets a setting it did not show.
    expect(policyCommand({ ...shipped, unverifiedScansNeedAdmission: false })).toMatchObject({
      autoConfirmGuestsWithGoodRecord: false,
      unverifiedScansNeedAdmission: false,
    });
  });
});
