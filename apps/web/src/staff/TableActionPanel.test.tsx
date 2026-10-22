// @vitest-environment jsdom
import type {
  AffectedReservation,
  FloorTable,
  ServiceRequest,
  StaffTab,
  StaffTableDetail,
} from '@yalla/api';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import { TableActionPanel, type TableActionPanelProps } from './TableActionPanel';

/**
 * The table panel, one artboard state at a time (floor-tablet `Table`): what
 * each state offers, and that every action goes down the path it always went
 * down — the queued table command, or the online-only release with its reason.
 */

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

const baseTable: FloorTable = {
  id: 't6',
  label: '6',
  seats: 2,
  floorAreaId: 'a1',
  floorAreaName: 'Terrace',
  floorAreaDisplayOrder: 0,
  pin: null,
  isBookable: true,
  state: 'free',
  nextReservationStartUtc: null,
};

const baseDetail: StaffTableDetail = {
  tableId: 't6',
  label: '6',
  seats: 2,
  physicalStatus: 'free',
  currentSessionId: null,
  seatedAtUtc: null,
  partySize: null,
  nextReservationId: null,
  nextReservationStartUtc: null,
  nextReservationPartySize: null,
  freeUntilUtc: null,
  openTabId: null,
  rowVersion: 'v1',
};

function tabOwing(remainingDram: number): StaffTab {
  return { id: 'tab-1', status: 'open', totals: { remainingDram } } as unknown as StaffTab;
}

function show(
  overrides: Partial<Omit<TableActionPanelProps, 'table' | 'detail'>> & {
    table?: Partial<FloorTable>;
    detail?: Partial<StaffTableDetail>;
  } = {},
) {
  const handlers = {
    onAct: vi.fn(),
    onRelease: vi.fn(),
    onOpenTab: vi.fn(),
    onStartTab: vi.fn(),
    onOrder: vi.fn(),
    onCash: vi.fn(),
    onClose: vi.fn(),
  };
  const { table, detail, ...rest } = overrides;
  render(
    <I18nextProvider i18n={i18next}>
      <TableActionPanel
        timeZoneId="Asia/Yerevan"
        projectedStatus={null}
        tab={null}
        pending={false}
        online
        affectedReservations={[]}
        releasing={false}
        startingTab={false}
        {...handlers}
        {...rest}
        table={{ ...baseTable, ...table }}
        detail={{ ...baseDetail, ...detail }}
      />
    </I18nextProvider>,
  );
  return { ...handlers, panel: screen.getByRole('dialog', { name: 'Actions for table 6' }) };
}

const button = (name: string | RegExp) => screen.getByRole('button', { name });

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(() => {
  cleanup();
});

describe('a free table', () => {
  it('says its seats and room, and offers seat, hold and out of service', () => {
    const { onAct } = show();
    expect(screen.getByRole('heading', { name: 'Table 6' })).toBeTruthy();
    expect(screen.getByText('Seats').nextElementSibling?.textContent).toBe('2');
    expect(screen.getByText('Room').nextElementSibling?.textContent).toBe('Terrace');

    fireEvent.click(button('Hold for a late party'));
    expect(onAct).toHaveBeenLastCalledWith('hold');
    fireEvent.click(button('Out of service'));
    expect(onAct).toHaveBeenLastCalledWith('outOfService');
  });

  it('seats a walk-in with a stepper: two to start, never under one, past the seats with a note, and no more than the server takes', () => {
    const { onAct } = show();
    fireEvent.click(button('Seat a walk-in'));
    const stepper = screen.getByRole('group', { name: 'How many people' });
    const value = () => within(stepper).getByRole('status').textContent;
    expect(value()).toBe('2');

    for (let i = 0; i < 3; i += 1) fireEvent.click(button('One fewer'));
    expect(value()).toBe('1');
    expect(button('One fewer')).toHaveProperty('disabled', true);

    for (let i = 0; i < 3; i += 1) fireEvent.click(button('One more'));
    expect(value()).toBe('4');
    // Five do sit at a four-top: said, never refused.
    expect(screen.getByText('More than 2 seats')).toBeTruthy();

    for (let i = 0; i < 120; i += 1) fireEvent.click(button('One more'));
    expect(value()).toBe('100');
    expect(button('One more')).toHaveProperty('disabled', true);

    fireEvent.click(button('Seat 100 guests'));
    expect(onAct).toHaveBeenCalledWith('seatWalkIn', { partySize: 100 });
  });

  it('goes back to its actions on cancel, having done nothing', () => {
    const { onAct } = show();
    fireEvent.click(button('Seat a walk-in'));
    fireEvent.click(button('Cancel'));
    expect(onAct).not.toHaveBeenCalled();
    expect(button('Seat a walk-in')).toBeTruthy();
  });

  it('when booked soon, says by when it must be free and seats the booking that is due', () => {
    const start = minutesFromNow(25);
    const { onAct } = show({
      table: { state: 'reservedSoon', nextReservationStartUtc: start },
      detail: {
        nextReservationId: 'r1',
        nextReservationStartUtc: start,
        nextReservationPartySize: 4,
        freeUntilUtc: minutesFromNow(15),
      },
    });
    expect(screen.getByText(/^Booked at \d\d:\d\d\.$/u)).toBeTruthy();
    expect(screen.getByText(/must be free by \d\d:\d\d\.$/u)).toBeTruthy();

    fireEvent.click(button(/^Seat the booking · \d\d:\d\d$/u));
    expect(onAct).toHaveBeenCalledWith('seatReservation', { partySize: 4 });
  });
});

describe('an occupied table', () => {
  const occupied = {
    table: { state: 'occupied' as const, occupiedSinceUtc: minutesFromNow(-48) },
    detail: {
      physicalStatus: 'occupied' as const,
      seatedAtUtc: minutesFromNow(-48),
      partySize: 2,
      openTabId: 'tab-1',
    },
  };

  it('opens the order, the tab and cash on the existing screens', () => {
    const { onOrder, onOpenTab, onCash } = show({ ...occupied, tab: tabOwing(18400) });
    expect(screen.getByText('Seated').nextElementSibling?.textContent).toBe('48 min');
    expect(screen.getByText('Open bill').nextElementSibling?.textContent).toMatch(/18[,\s ]?400/u);

    fireEvent.click(button('Take an order'));
    fireEvent.click(button('View the tab'));
    fireEvent.click(button(/^Take cash · .*18[,\s ]?400/u));
    expect(onOrder).toHaveBeenCalledTimes(1);
    expect(onOpenTab).toHaveBeenCalledTimes(1);
    expect(onCash).toHaveBeenCalledTimes(1);
  });

  it('cannot take cash offline, and says why', () => {
    show({ ...occupied, tab: tabOwing(18400), online: false });
    expect(button(/^Take cash/u)).toHaveProperty('disabled', true);
    expect(screen.getByText('Taking cash needs a connection.')).toBeTruthy();
  });

  it('frees only after a confirm that says what is still owed', () => {
    const { onAct } = show({ ...occupied, tab: tabOwing(18400) });
    fireEvent.click(button('Free the table'));
    expect(onAct).not.toHaveBeenCalled();
    const confirm = screen.getByRole('group', { name: 'Free table 6?' });
    expect(within(confirm).getByText(/^18.?400.{1,3}is still unpaid/u)).toBeTruthy();

    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: 'Free table 6?' })).toBeNull();

    fireEvent.click(button('Free the table'));
    fireEvent.click(button('Free it'));
    expect(onAct).toHaveBeenCalledWith('freeTable');
  });

  it('says in words when it has sat past the next booking’s turnaround', () => {
    show({
      ...occupied,
      table: { ...occupied.table, occupiedSinceUtc: minutesFromNow(-134) },
      detail: {
        ...occupied.detail,
        seatedAtUtc: minutesFromNow(-134),
        freeUntilUtc: minutesFromNow(-10),
        nextReservationStartUtc: minutesFromNow(5),
      },
    });
    expect(screen.getByText('Seated 134 min · long')).toBeTruthy();
    expect(screen.getByText('Seated longer than planned.')).toBeTruthy();
  });

  it('says when the table asked for the bill from the app, and how', () => {
    const request = {
      id: 'sr1',
      tabId: 'tab-1',
      reason: 'bill',
      requestedAtUtc: minutesFromNow(-6),
      bill: { scope: 'whole', amountDram: 42600, tipDram: 4260, tipPercent: 10 },
    } as unknown as ServiceRequest;
    show({ ...occupied, tab: tabOwing(42600), billRequest: request });
    expect(screen.getByText('Asked for the bill in the app 6 min ago.')).toBeTruthy();
  });
});

describe('a held table', () => {
  const held = {
    table: { state: 'held' as const },
    detail: {
      physicalStatus: 'held' as const,
      nextReservationId: 'r1',
      nextReservationStartUtc: minutesFromNow(-12),
      nextReservationPartySize: 3,
    },
  };

  it('seats the party when they come, the stepper starting at the booked size', () => {
    const { onAct } = show(held);
    expect(screen.getByText('Nobody has arrived.')).toBeTruthy();
    fireEvent.click(button('They came · seat them'));
    expect(
      within(screen.getByRole('group', { name: 'How many people' })).getByRole('status')
        .textContent,
    ).toBe('3');
    fireEvent.click(button('Seat 3 guests'));
    expect(onAct).toHaveBeenCalledWith('seatHeldParty', { partySize: 3 });
  });

  it('asks why before releasing the booking, with no answer chosen for the waiter', () => {
    const { onRelease } = show(held);
    fireEvent.click(button('Release the booking'));
    const why = screen.getByRole('group', { name: 'Why is it being released?' });
    const noShow = within(why).getByRole('button', { name: /They didn't come/u });
    const cancelled = within(why).getByRole('button', {
      name: /They let us know they won't come/u,
    });
    expect(noShow.getAttribute('aria-pressed')).toBe('false');
    expect(cancelled.getAttribute('aria-pressed')).toBe('false');
    // The existing sentence on what separates the two stays.
    expect(within(why).getByText(/goes on the diner's record/u)).toBeTruthy();

    const release = within(why).getByRole('button', { name: 'Release' });
    expect(release).toHaveProperty('disabled', true);
    fireEvent.click(cancelled);
    expect(cancelled.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(release);
    expect(onRelease).toHaveBeenCalledWith('r1', 'guestCancelled');
  });

  it('releases as a no-show when that is the answer picked', () => {
    const { onRelease } = show(held);
    fireEvent.click(button('Release the booking'));
    fireEvent.click(button(/They didn't come/u));
    fireEvent.click(button('Release'));
    expect(onRelease).toHaveBeenCalledWith('r1', 'noShow');
  });

  it('needs a connection to release the booking, and can still release the hold alone', () => {
    const { onAct } = show({ ...held, online: false });
    expect(button('Release the booking')).toHaveProperty('disabled', true);
    expect(screen.getByText('Releasing a booking needs a connection.')).toBeTruthy();
    fireEvent.click(button('Release the hold'));
    expect(onAct).toHaveBeenCalledWith('releaseHold');
  });
});

describe('a free table whose booking is late', () => {
  // Midday: twenty minutes back is the same day wherever the run is, so the
  // line says a bare time rather than yesterday's date (a midnight flake).
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-21T08:00:00.000Z'), shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds it, or releases the booking with a reason', () => {
    const start = minutesFromNow(-20.5);
    const { onAct, onRelease } = show({
      table: { state: 'reservedSoon', nextReservationStartUtc: start },
      // The turnaround before the next booking, which is not how long a late
      // party is waited for (live QA: "held until 17:00" for a 17:05 booking).
      detail: { nextReservationId: 'r1', nextReservationStartUtc: start, freeUntilUtc: start },
    });
    expect(
      screen.getByText(/^Reserved \d\d:\d\d · nobody has arrived · 20 min late$/u),
    ).toBeTruthy();
    // Said once: no bold "Nobody has arrived." in front of a line that says it.
    expect(screen.queryByText('Nobody has arrived.')).toBeNull();
    expect(screen.queryByText(/held until/u)).toBeNull();
    fireEvent.click(button('Hold it'));
    expect(onAct).toHaveBeenCalledWith('hold');

    fireEvent.click(button('Release the booking'));
    fireEvent.click(button(/They didn't come/u));
    fireEvent.click(button('Release'));
    expect(onRelease).toHaveBeenCalledWith('r1', 'noShow');
  });
});

describe('a late booking, said in hours', () => {
  it('counts hours and minutes once it is an hour or more', () => {
    const start = minutesFromNow(-99.5);
    show({
      table: { state: 'reservedSoon', nextReservationStartUtc: start },
      detail: { nextReservationId: 'r1', nextReservationStartUtc: start },
    });
    expect(screen.getByText(/· 1 h 39 min late$/u)).toBeTruthy();
  });
});

describe('a table held before its booking is due (review B1)', () => {
  const ahead = {
    table: { state: 'held' as const },
    detail: {
      physicalStatus: 'held' as const,
      nextReservationId: 'r9',
      nextReservationStartUtc: minutesFromNow(180),
      nextReservationPartySize: 4,
    },
  };

  it('offers only "Release the hold": nobody can be a no-show for a booking three hours away', () => {
    const { onAct, onRelease } = show(ahead);
    expect(screen.queryByRole('button', { name: 'Release the booking' })).toBeNull();
    expect(screen.queryByText('Nobody has arrived.')).toBeNull();
    fireEvent.click(button('Release the hold'));
    expect(onAct).toHaveBeenCalledWith('releaseHold');
    expect(onRelease).not.toHaveBeenCalled();
  });

  it('dates a booking that is not tonight', () => {
    show({
      ...ahead,
      detail: { ...ahead.detail, nextReservationStartUtc: minutesFromNow(24 * 60) },
    });
    expect(screen.getByText('Booked for').nextElementSibling?.textContent).toMatch(
      /^Tomorrow \d\d:\d\d$/u,
    );
  });

  it('says nothing about an unknown booking when the hold has none', () => {
    show({ table: { state: 'held' }, detail: { physicalStatus: 'held' } });
    expect(screen.queryByText(/does not know which booking/u)).toBeNull();
    expect(button('Release the hold')).toBeTruthy();
  });
});

describe('a table with a command still queued (review S10)', () => {
  it('does not release its booking until the queued command has been sent', () => {
    const start = minutesFromNow(-15);
    show({
      table: { state: 'held' },
      detail: { physicalStatus: 'held', nextReservationId: 'r1', nextReservationStartUtc: start },
      pending: true,
    });
    expect(button('Release the booking')).toHaveProperty('disabled', true);
  });
});

describe('cash from the panel (review nits)', () => {
  const occupied = {
    table: { state: 'occupied' as const, occupiedSinceUtc: minutesFromNow(-30) },
    detail: { physicalStatus: 'occupied' as const, partySize: 2, openTabId: 'tab-1' },
  };

  it('does not name the balance when the keypad will open on a bill request instead', () => {
    const request = {
      id: 'sr1',
      tabId: 'tab-1',
      reason: 'bill',
      requestedAtUtc: minutesFromNow(-2),
      bill: { scope: 'mine', amountDram: 9000, tipDram: 0, tipPercent: 0 },
    } as unknown as ServiceRequest;
    show({ ...occupied, tab: tabOwing(42600), billRequest: request });
    expect(button('Take cash')).toBeTruthy();
  });

  it('is off on an abandoned tab', () => {
    show({
      ...occupied,
      tab: { ...tabOwing(1000), status: 'abandoned' } as unknown as StaffTab,
    });
    expect(button(/^Take cash/u)).toHaveProperty('disabled', true);
  });
});

describe('a table out of service', () => {
  const booking: AffectedReservation = {
    reservationId: 'r9',
    code: 'YL-4K7Q',
    guestName: 'Anna P.',
    guestPhone: '+37491000012',
    partySize: 6,
    startUtc: minutesFromNow(60),
    localDate: '2026-10-19',
    localStartTime: '19:30',
  };

  it('lists the bookings it stranded with a number to call, releases one as our doing, and returns to service', () => {
    const { onAct, onRelease } = show({
      table: { state: 'outOfService' },
      detail: { physicalStatus: 'outOfService' },
      affectedReservations: [booking],
    });
    expect(screen.getByText('This table has 1 booking.')).toBeTruthy();
    expect(screen.getByRole('link', { name: '+37491000012' }).getAttribute('href')).toBe(
      'tel:+37491000012',
    );
    fireEvent.click(button('Release — our doing'));
    expect(onRelease).toHaveBeenCalledWith('r9', 'guestCancelled');

    fireEvent.click(button('Return to service'));
    expect(onAct).toHaveBeenCalledWith('returnToService');
  });
});

describe('the panel itself', () => {
  it('says a queued action is waiting, and what offline means', () => {
    show({ pending: true, online: false });
    expect(screen.getByText('Waiting to sync. The kitchen cannot see this yet.')).toBeTruthy();
    expect(screen.getByText(/^Offline\. This is saved on the tablet/u)).toBeTruthy();
  });

  it('keeps focus in the panel through a question, so Escape still closes it', () => {
    const { onClose, panel } = show({
      table: { state: 'occupied' },
      detail: { physicalStatus: 'occupied', openTabId: 'tab-1' },
    });
    fireEvent.click(button('Free the table'));
    expect(
      screen.getByRole('group', { name: 'Free table 6?' }).contains(document.activeElement),
    ).toBe(true);
    fireEvent.click(button('Cancel'));
    expect(panel.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on its close button and on Escape', () => {
    const { onClose, panel } = show();
    fireEvent.click(button('Close and go back to the floor'));
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("the next booking's guest record", () => {
  const booked = {
    nextReservationId: 'r-next',
    nextReservationStartUtc: minutesFromNow(90),
    nextReservationPartySize: 3,
  };

  it('is said under the next booking when the floor has it', () => {
    const { panel } = show({
      detail: booked,
      nextBookingRecord: {
        booked: 6,
        came: 4,
        noShows: 2,
        lateCancellations: 0,
        unmarked: 0,
        isNewGuest: false,
        takeawayNoShows: 0,
        blockedUntilUtc: null,
      },
    });
    const next = within(panel).getByText('Next booking').nextElementSibling as HTMLElement;
    expect(next.querySelector('.guest-record')?.textContent).toMatch(
      /: 6 bookings · 4 came · 2 no-shows$/u,
    );
  });

  it('is not said when no record came with it', () => {
    const { panel } = show({ detail: booked });
    expect(panel.querySelector('.guest-record')).toBeNull();
  });
  it("says the sitting party's record beside the party, when the floor has it (wire §0a)", () => {
    const { panel } = show({
      table: { state: 'occupied' },
      detail: {
        physicalStatus: 'occupied',
        seatedAtUtc: minutesFromNow(-30),
        partySize: 2,
        sittingGuestRecord: {
          booked: 3,
          came: 3,
          noShows: 0,
          lateCancellations: 0,
          unmarked: 0,
          isNewGuest: false,
          takeawayNoShows: 0,
          blockedUntilUtc: null,
        },
      },
    });
    const party = within(panel).getByText('Party').nextElementSibling as HTMLElement;
    expect(party.querySelector('.guest-record')?.textContent).toMatch(
      /: 3 bookings · 3 came · 0 no-shows$/u,
    );
  });
});
