import type {
  AwaitingApproval,
  BookingWithoutTable,
  FloorTable,
  StaffConversationListItem,
} from '@yalla/api';
import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { arrivalAnnouncement, decidedNotice, requestTable } from './approvalRequests';
import { railTitle } from './messages/messageText';
import { initialCommandState, type CommandState, type QueuedCommand } from './commands/types';
import { arrivingBookings, dueNowCount, seatingReservationIds, tableChoices } from './withoutTable';

/**
 * Booking by time only at the door (2026-10-29): which bookings the rail
 * lists, which tables a waiter is offered to seat one at and in what order,
 * and the words for a booking that has no table yet.
 */

const NOW = new Date('2026-10-29T15:00:00Z');

function booking(id: string, startsInMinutes: number, partySize = 2): BookingWithoutTable {
  const start = NOW.getTime() + startsInMinutes * 60_000;
  return {
    id,
    code: id.toUpperCase(),
    guestName: id,
    guestPhone: '',
    partySize,
    startUtc: new Date(start).toISOString(),
    endUtc: new Date(start + 120 * 60_000).toISOString(),
    localDate: '2026-10-29',
    localStartTime: '19:00:00',
    note: null,
    phoneUnverified: false,
    guestRecord: null,
    guestConfirmedOnWayAtUtc: null,
    guestRunningLateMinutes: null,
  };
}

function table(
  id: string,
  seats: number,
  state: FloorTable['state'] = 'free',
  nextReservationStartUtc: string | null = null,
): FloorTable {
  return {
    id,
    label: id.slice(1),
    seats,
    floorAreaId: 'hall',
    floorAreaName: 'Hall',
    floorAreaDisplayOrder: 1,
    isBookable: true,
    state,
    nextReservationStartUtc,
    pin: null,
  };
}

describe('the bookings the rail lists', () => {
  it('lists those due within three hours or started and not over, soonest first', () => {
    const listed = arrivingBookings(
      [
        booking('later', 200),
        booking('soon', 30),
        booking('started', -20),
        booking('over', -150),
        booking('due', 5),
      ],
      NOW,
      new Set(),
    );

    expect(listed.map((entry) => entry.id)).toEqual(['started', 'due', 'soon']);
  });

  it('leaves out one being seated from this tablet, and lists nothing before the first read', () => {
    expect(arrivingBookings([booking('a', 5), booking('b', 10)], NOW, new Set(['a']))).toEqual([
      booking('b', 10),
    ]);
    expect(arrivingBookings(undefined, NOW, new Set())).toEqual([]);
  });

  it('counts those due now for the Now tab: started, or within a quarter of an hour', () => {
    expect(dueNowCount([booking('a', -5), booking('b', 15), booking('c', 16)], NOW)).toBe(2);
  });
});

describe('a seat on its way', () => {
  it('names the bookings a queued or refused seat is for, and only those', () => {
    const seat = (id: string, reservationId: string | undefined): QueuedCommand =>
      ({
        id,
        kind: 'seatReservation',
        body: {
          kind: 'seatReservation',
          command: {
            kind: 'seatReservation',
            branchId: 'b1',
            tableId: 't2',
            clientCommandId: id,
            reservationId,
          },
        },
      }) as unknown as QueuedCommand;
    const walkIn = {
      id: 'w',
      kind: 'seatWalkIn',
      body: { kind: 'seatWalkIn', command: { kind: 'seatWalkIn' } },
    } as unknown as QueuedCommand;
    const state: CommandState = {
      ...initialCommandState,
      queue: [seat('c1', 'res-1'), walkIn, seat('c2', undefined)],
      conflicts: [{ command: seat('c3', 'res-3') } as CommandState['conflicts'][number]],
    };

    expect([...seatingReservationIds(state)].sort()).toEqual(['res-1', 'res-3']);
  });
});

describe('the tables offered', () => {
  const tables = [
    table('t8', 8),
    table('t4', 4),
    table('t2', 2),
    table('t6', 4, 'reservedSoon', '2026-10-29T17:00:00Z'),
    table('t3', 4, 'occupied'),
    table('t5', 4, 'held'),
    table('t9', 2, 'outOfService'),
    table('t10', 3),
  ];

  it('offers free tables that fit first, the closest fit first, one booked later after', () => {
    const { fit, smaller } = tableChoices(tables, 4);

    expect(fit.map((choice) => choice.label)).toEqual(['4', '8', '6']);
    expect(fit[2]?.bookedAtUtc).toBe('2026-10-29T17:00:00Z');
    expect(fit[0]).toMatchObject({ seats: 4, roomName: 'Hall', bookedAtUtc: null });
    // Too small, the biggest first: for a waiter who pushes two together.
    expect(smaller.map((choice) => choice.label)).toEqual(['10', '2']);
  });

  it('never offers an occupied, held or out-of-service table', () => {
    const offered = tableChoices(tables, 1);
    const labels = [...offered.fit, ...offered.smaller].map((choice) => choice.label);

    expect(labels).not.toContain('3');
    expect(labels).not.toContain('5');
    expect(labels).not.toContain('9');
  });
});

describe('the words for a booking with no table', () => {
  /** Echoes the key and its label, so the choice of sentence is what is tested. */
  const t = ((key: string, params?: { label?: unknown }) =>
    params?.label === undefined ? key : `${key}:${String(params.label)}`) as unknown as TFunction;

  const request = {
    tableId: null,
    tableLabel: null,
    roomName: null,
    startUtc: '2026-10-29T15:30:00Z',
    partySize: 4,
  } as unknown as AwaitingApproval;

  it('names no table on a request, its notice and its announcement', () => {
    const time = () => '19:30';

    expect(requestTable(request, t)).toBe('approvals.noTable');
    expect(decidedNotice(request, true, t, time)).toBe('approvals.approvedNoticeNoTable:null');
    expect(decidedNotice(request, false, t, time)).toBe('approvals.declinedNoticeNoTable:null');
    expect(arrivalAnnouncement([request], t, time)).toBe('approvals.arrivedNoTable:null');
    // A table booking keeps its own sentence.
    expect(requestTable({ ...request, tableLabel: '7' }, t)).toBe('table.title:7');
  });

  it("titles a message thread's card with no table where the booking has none", () => {
    const item = {
      subject: { kind: 'reservation', label: '', guestName: 'Ani Hakobyan', localTime: '19:30:00' },
    } as unknown as StaffConversationListItem;

    expect(railTitle(t, item)).toBe('messages.rail.titleBookingNoTable');
    expect(railTitle(t, { ...item, subject: { ...item.subject, label: '6' } })).toBe(
      'messages.rail.titleBooking:6',
    );
  });
});
