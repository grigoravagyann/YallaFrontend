// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  ConcurrencyConflictError,
  createQueryClient,
  createStaffMockGateway,
  type AwaitingApproval,
  type EnrolledDevice,
  type ReservationStatusCode,
  type StaffGateway,
  type StaffSessionSnapshot,
} from '@yalla/api';
import { GatewayProvider, queryKeys } from '@yalla/api/react';
import { formatDayAndTime } from '@yalla/format';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import type * as CurrentUserModule from '../auth/useCurrentUser';
import {
  arrivalAnnouncement,
  contextLines,
  decidedNotice,
  newArrivals,
  requestLine,
  requestTable,
} from './approvalRequests';

/**
 * Short-notice bookings on the floor tablet.
 *
 * An app booking for tonight waits for somebody who can see the room. The
 * tablet has to show it where a glance lands — a count in the header, a card
 * with the time left to answer and what the table is doing around it — take
 * the yes or the no in one tap (the no with a reason it may ask for), say so
 * when the answer came too late, and announce a request that has just arrived.
 *
 * The staff mock seeds one request at table 7, where the party that booked
 * before it is still sitting, a large party at table 11 that waits with no
 * clock, and a third request at table 4 forty-five seconds in.
 */

const snapshot = vi.hoisted(() => ({ current: null as unknown }));
const chime = vi.hoisted(() => ({ played: 0, primed: 0 }));

vi.mock('./auth/staffSession', () => ({
  staffAuthAvailable: true,
  staffSession: {
    restore: async () => undefined,
    refreshDevice: async () => undefined,
    signOut: async () => undefined,
  },
}));
vi.mock('./auth/useStaffSession', () => ({
  useStaffSessionSnapshot: () => snapshot.current,
  useTouchOnInteraction: () => undefined,
}));
vi.mock('../auth/useCurrentUser', async () => {
  const actual = await vi.importActual<typeof CurrentUserModule>('../auth/useCurrentUser');
  return { ...actual, useCurrentUser: () => ({ user: null }) };
});
vi.mock('./chime', () => ({
  primeChime: () => {
    chime.primed += 1;
  },
  playChime: async () => {
    chime.played += 1;
    return true;
  },
}));

const { StaffRoute } = await import('./StaffRoute');

const BRANCH = 'b1';

const device: EnrolledDevice = {
  deviceId: 'd1',
  deviceName: 'Counter',
  branchId: BRANCH,
  branchName: 'Lumen North',
  venueName: 'Lumen',
  enrolledAtUtc: '2026-09-01T00:00:00Z',
  lastSeenAtUtc: null,
};

function signIn(): void {
  const next: StaffSessionSnapshot = {
    state: 'signedIn',
    device,
    identity: { staffMemberId: 's1', fullName: 'Sona Vardanyan', role: 'waiter', branchId: BRANCH },
    lastSignOut: null,
  };
  snapshot.current = next;
}

/** The mock's clock runs with the device's, plus whatever a test skips ahead. */
function mockClock() {
  let skipped = 0;
  return {
    now: () => new Date(Date.now() + skipped),
    skip: (ms: number) => {
      skipped += ms;
    },
  };
}

function renderFloor(gateway: StaffGateway): QueryClient {
  const queryClient = createQueryClient({ retry: false, mutationNetworkMode: 'always' });
  render(
    <I18nextProvider i18n={i18next}>
      <QueryClientProvider client={queryClient}>
        <GatewayProvider staffGateway={gateway}>
          <MemoryRouter>
            <StaffRoute />
          </MemoryRouter>
        </GatewayProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return queryClient;
}

async function panel(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: /bookings to approve/i });
}

/** The count beside the section's title — the badge itself, not any "2" on a card. */
function badge(section: HTMLElement, count: string): Promise<HTMLElement> {
  return within(section).findByText(count, { selector: '.ft-badge' }, { timeout: 5000 });
}

/** The floor's live region for new requests. */
function announcer(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-testid="approval-announcer"]')!;
}

async function card(table: string): Promise<HTMLElement> {
  const section = await panel();
  const label = await within(section).findByText(new RegExp(`^Table ${table}\\b`, 'u'));
  return label.closest('li')!;
}

beforeAll(async () => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  await initConsoleTestI18n();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  chime.played = 0;
  chime.primed = 0;
});

describe('the words on a request', () => {
  const t = i18next.getFixedT('en', 'staff');
  const time = (iso: string) => iso.slice(11, 16);
  const request: AwaitingApproval = {
    id: 'r1',
    code: 'Y3107',
    branchId: BRANCH,
    guestName: 'Lilit',
    guestPhone: '+37493217788',
    partySize: 2,
    tableId: 't7',
    tableLabel: '7',
    roomName: 'Windows',
    startUtc: '2026-10-18T19:45:00Z',
    localDate: '2026-10-18',
    localStartTime: '23:45:00',
    timeZoneId: 'Asia/Yerevan',
    note: null,
    approvalExpiresAtUtc: '2026-10-18T18:13:00Z',
    because: 'shortNotice',
    previousBooking: {
      startUtc: '2026-10-18T18:00:00Z',
      partySize: 4,
      guestName: 'Anna',
      guestPhone: '+37477889900',
      status: 'seated',
    },
    nextBooking: { startUtc: '2026-10-18T21:30:00Z', partySize: 3 },
    currentSitting: { sinceUtc: '2026-10-18T18:10:00Z', partySize: null },
  };

  it('names the table with its room, and the booking in one line', () => {
    expect(requestTable(request, t)).toBe('Table 7 · Windows');
    expect(requestTable({ ...request, roomName: null }, t)).toBe('Table 7');
    expect(requestLine(request, t, time)).toBe('19:45 · 2 guests · Lilit');
  });

  it("dates a booking that is not for the branch's today, everywhere it is said", () => {
    const days = (today: string) => ({
      today,
      dayKey: (iso: string) => iso.slice(0, 10),
      date: () => 'Sun 18 Oct',
    });
    // Today: the time alone, as ever.
    expect(requestLine(request, t, time, days('2026-10-18'))).toBe('19:45 · 2 guests · Lilit');
    expect(decidedNotice(request, true, t, time, days('2026-10-18'))).toBe(
      'Approved: table 7 at 19:45. The guest has been told.',
    );
    // Another day: its date first, so 19:45 is not read as tonight.
    expect(requestLine(request, t, time, days('2026-10-16'))).toBe(
      'Sun 18 Oct · 19:45 · 2 guests · Lilit',
    );
    expect(decidedNotice(request, true, t, time, days('2026-10-16'))).toBe(
      'Approved: table 7 on Sun 18 Oct at 19:45. The guest has been told.',
    );
    expect(decidedNotice(request, false, t, time, days('2026-10-16'))).toBe(
      'Declined: table 7 on Sun 18 Oct at 19:45. The guest has been told.',
    );
    expect(arrivalAnnouncement([request], t, time, days('2026-10-16'))).toBe(
      'New booking request: table 7 on Sun 18 Oct at 19:45, 2 guests.',
    );
    expect(arrivalAnnouncement([request], t, time, days('2026-10-18'))).toBe(
      'New booking request: table 7 at 19:45, 2 guests.',
    );
  });

  it('reads the table around it in the order a waiter reasons about it', () => {
    expect(contextLines(request, t, time)).toEqual([
      {
        kind: 'before',
        text: 'Before: 18:00 · 4 guests · Anna · seated now',
        call: { phoneE164: '+37477889900', name: 'Anna' },
      },
      { kind: 'sitting', text: 'Sitting now: since 18:10', call: null },
      { kind: 'next', text: 'Next: 21:30 · 3 guests', call: null },
    ]);
  });

  it('says where the booking before stands, in words', () => {
    const before = (status: ReservationStatusCode) =>
      contextLines(
        { ...request, previousBooking: { ...request.previousBooking!, status } },
        t,
        time,
      )[0]!;

    expect(before('seated').text).toMatch(/ · seated now$/u);
    expect(before('completed').text).toMatch(/ · finished$/u);
    expect(before('noShow').text).toMatch(/ · didn't come$/u);
    expect(before('confirmed').text).toMatch(/ · confirmed$/u);
    expect(before('pendingApproval').text).toMatch(/ · waiting$/u);
    // A status the tablet has no word for says nothing rather than guess.
    expect(before('unknown').text).toBe('Before: 18:00 · 4 guests · Anna');
  });

  it('offers a call only while the booking before is still about the table', () => {
    const callFor = (status: 'seated' | 'confirmed' | 'pendingApproval' | 'completed' | 'noShow') =>
      contextLines(
        { ...request, previousBooking: { ...request.previousBooking!, status } },
        t,
        time,
      )[0]!.call;

    expect(callFor('seated')).not.toBeNull();
    expect(callFor('confirmed')).not.toBeNull();
    expect(callFor('pendingApproval')).not.toBeNull();
    // Gone home, or never came: nothing to ask them about tonight.
    expect(callFor('completed')).toBeNull();
    expect(callFor('noShow')).toBeNull();
  });

  it('offers no call for an earlier guest who left no number', () => {
    const quiet = {
      ...request,
      previousBooking: { ...request.previousBooking!, guestPhone: null },
    };
    expect(contextLines(quiet, t, time)[0]?.call).toBeNull();
  });

  it('finds nothing new on the first read, and only the new ones after', () => {
    expect(newArrivals(null, [{ id: 'a' }])).toEqual([]);
    expect(newArrivals(new Set(['a']), [{ id: 'a' }, { id: 'b' }])).toEqual(['b']);
    expect(newArrivals(new Set(['a', 'b']), [{ id: 'b' }])).toEqual([]);
  });
});

describe('the floor tablet', () => {
  it('counts the waiting bookings on their rail section and shows each with its clock and its table', async () => {
    signIn();
    renderFloor(createStaffMockGateway({ latencyMs: 0, branchId: BRANCH, now: mockClock().now }));

    // The count sits beside the section's title, which the top bar no longer
    // repeats: the rail is always beside the floor.
    expect(await badge(await panel(), '2')).toBeTruthy();
    const request = await card('7');

    // Made two minutes before the mock started: about thirteen left.
    const timer = within(request).getByRole('timer', { hidden: true });
    expect(timer.textContent).toMatch(/^1[23]:\d\d$/u);
    // The ticking clock is for the eye; a screen reader hears the deadline, which holds still.
    expect(timer.getAttribute('aria-hidden')).toBe('true');
    expect(within(request).getByText(/^answer by .*\d:\d\d/u)).toBeTruthy();
    expect(within(request).queryByText(/left to answer/u)).toBeNull();
    expect(within(request).getByText('Short notice')).toBeTruthy();
    expect(
      within(request).getByText(/^Before: .* · 4 guests · Anna Petrosyan · seated now/u),
    ).toBeTruthy();
    expect(within(request).getByText(/^Sitting now: since .* · 4 guests$/u)).toBeTruthy();
    expect(within(request).getByText(/^Next: .* · 3 guests$/u)).toBeTruthy();

    const call = within(request).getByRole('link', { name: 'Call Anna Petrosyan' });
    expect(call.getAttribute('href')).toBe('tel:+37477889900');

    // The large party waits with no clock, after every request that has one.
    const party = await card('11');
    expect(within(party).queryByRole('timer', { hidden: true })).toBeNull();
    expect(within(party).getByText('Large party')).toBeTruthy();
    expect(request.compareDocumentPosition(party) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('dates the card and the notice of a request for another day', async () => {
    const user = userEvent.setup();
    signIn();
    const base = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH, now: mockClock().now });
    const twoDaysOn = (iso: string) => new Date(Date.parse(iso) + 2 * 86_400_000).toISOString();
    const later: StaffGateway = {
      ...base,
      listAwaitingApproval: async (branchId) =>
        (await base.listAwaitingApproval(branchId)).map((request) =>
          request.tableLabel === '7'
            ? { ...request, startUtc: twoDaysOn(request.startUtc) }
            : request,
        ),
    };
    renderFloor(later);

    const request = await card('7');
    const start = (await later.listAwaitingApproval(BRANCH)).find(
      (entry) => entry.tableLabel === '7',
    )!.startUtc;
    const day = formatDayAndTime(start, 'Asia/Yerevan', 'en').date;
    expect(within(request).getByText(new RegExp(`^${day} · \\d\\d:\\d\\d · `, 'u'))).toBeTruthy();

    await user.click(within(request).getByRole('button', { name: 'Approve' }));
    expect(
      await screen.findByText(new RegExp(`^Approved: table 7 on ${day} at \\d\\d:\\d\\d\\.`, 'u')),
    ).toBeTruthy();
  });

  it('comes first in the rail, open, so the clocks are the first thing in view', async () => {
    signIn();
    renderFloor(createStaffMockGateway({ latencyMs: 0, branchId: BRANCH, now: mockClock().now }));

    const section = await panel();
    const rail = screen.getByRole('complementary', { name: 'Needs attention' });
    expect(within(rail).getAllByRole('region')[0]).toBe(section);
    expect(
      within(section)
        .getByRole('button', { name: /^Bookings to approve/u })
        .getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('approves in one tap: the card goes, the count goes, the floor says so', async () => {
    const user = userEvent.setup();
    signIn();
    const gateway = createStaffMockGateway({
      latencyMs: 0,
      branchId: BRANCH,
      now: mockClock().now,
    });
    const approve = vi.spyOn(gateway, 'approveReservation');
    renderFloor(gateway);

    const request = await card('7');
    await user.click(within(request).getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(approve).toHaveBeenCalledWith({ reservationId: 'res-await-1' }));
    expect(
      // Dated when the mock's request, 105 minutes out, falls after midnight.
      await screen.findByText(/^Approved: table 7 (?:on .+ )?at .*The guest has been told\.$/u),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: /bookings to approve/i })).queryByText(
          /^Table 7\b/u,
        ),
      ).toBeNull(),
    );
    expect(await badge(await panel(), '1')).toBeTruthy();
  });

  it('takes one answer only: a second tap sends nothing, and the card says it is done', async () => {
    const user = userEvent.setup();
    signIn();
    const base = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH, now: mockClock().now });
    const first = await base.listAwaitingApproval(BRANCH);
    // The list the server answered before the decision, read again: the card
    // stays on screen after its answer until a later read drops it.
    const stale: StaffGateway = { ...base, listAwaitingApproval: async () => first };
    const approve = vi.spyOn(stale, 'approveReservation');
    renderFloor(stale);

    const request = await card('7');
    expect(within(request).getByRole('timer', { hidden: true })).toBeTruthy();
    await user.dblClick(within(request).getByRole('button', { name: 'Approve' }));

    expect(await within(request).findByText('Approved. The guest has been told.')).toBeTruthy();
    expect(approve).toHaveBeenCalledTimes(1);
    expect(within(request).queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(within(request).queryByRole('button', { name: 'Decline' })).toBeNull();
    // Answered: no clock still running on it while the list catches up.
    expect(within(request).queryByRole('timer', { hidden: true })).toBeNull();
    expect(within(request).queryByText(/^Answer within/u)).toBeNull();
    expect(within(request).queryByText(/^answer by/u)).toBeNull();
  });

  it("says somebody else answered first, in its own words, not the server's", async () => {
    const user = userEvent.setup();
    signIn();
    const base = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH, now: mockClock().now });
    const answered: StaffGateway = {
      ...base,
      rejectReservation: () =>
        Promise.reject(
          new ConcurrencyConflictError({
            url: 'mock://reject',
            problem: {
              type: 'about:blank',
              title: 'Conflict',
              status: 409,
              detail: 'Only a pending reservation can be rejected; Y3107 is Confirmed.',
              code: 'conflicting-state',
              traceId: 'mock',
            },
          }),
        ),
    };
    renderFloor(answered);

    const request = await card('7');
    await user.click(within(request).getByRole('button', { name: 'Decline' }));
    await user.click(within(request).getByRole('button', { name: 'Decline the booking' }));

    const alert = await within(request).findByRole('alert');
    expect(alert.textContent).toBe('Already answered by someone else.');
    expect(screen.queryByText(/Only a pending reservation/u)).toBeNull();
  });

  it('stops offering a decision once the server says the guest before answers it in the app', async () => {
    const user = userEvent.setup();
    signIn();
    const base = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH, now: mockClock().now });
    const theirs: StaffGateway = {
      ...base,
      approveReservation: () =>
        Promise.reject(
          new ConcurrencyConflictError({
            url: 'mock://approve',
            problem: {
              type: 'about:blank',
              title: 'Conflict',
              status: 409,
              detail: 'Y3107 waits on the earlier guest.',
              code: 'reservation-awaiting-earlier-guest',
              traceId: 'mock',
            },
          }),
        ),
    };
    renderFloor(theirs);

    const request = await card('7');
    await user.click(within(request).getByRole('button', { name: 'Approve' }));

    const alert = await within(request).findByRole('alert');
    expect(alert.textContent).toBe(
      'The guest before is answering this in the app. It is decided when they do, or declined if they do not.',
    );
    expect(within(request).queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(within(request).queryByRole('button', { name: 'Decline' })).toBeNull();
  });

  it('offers no decision on a booking the guest before answers in the app', async () => {
    signIn();
    const base = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH, now: mockClock().now });
    const theirs: StaffGateway = {
      ...base,
      listAwaitingApproval: async (branchId) =>
        (await base.listAwaitingApproval(branchId)).map((request) =>
          request.tableLabel === '7'
            ? {
                ...request,
                because: 'earlierGuestConsent' as const,
                approvalExpiresAtUtc: new Date(Date.now() + 90 * 60_000).toISOString(),
                awaitsEarlierGuestAnswer: true,
              }
            : request,
        ),
    };
    renderFloor(theirs);

    const request = await card('7');
    expect(
      within(request).getByText(
        'The guest before is answering this in the app. It is decided when they do, or declined if they do not.',
      ),
    ).toBeTruthy();
    expect(within(request).queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(within(request).queryByRole('button', { name: 'Decline' })).toBeNull();
  });

  it("counts down the floor's own two hours to ring the guest before, and offers the decision", async () => {
    signIn();
    const base = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH, now: mockClock().now });
    const floors: StaffGateway = {
      ...base,
      listAwaitingApproval: async (branchId) =>
        (await base.listAwaitingApproval(branchId)).map((request) =>
          request.tableLabel === '7'
            ? {
                ...request,
                because: 'earlierGuestConsent' as const,
                // The guest before booked on the web: the floor rings them, within two hours.
                approvalExpiresAtUtc: new Date(Date.now() + 100 * 60_000).toISOString(),
                awaitsEarlierGuestAnswer: false,
              }
            : request,
        ),
    };
    renderFloor(floors);

    const request = await card('7');
    const timer = within(request).getByRole('timer', { hidden: true });
    expect(timer.textContent).toMatch(/^1 hr [34]\d mins?$/u);
    expect(within(request).getByRole('button', { name: 'Approve' })).toBeTruthy();
    expect(within(request).getByRole('button', { name: 'Decline' })).toBeTruthy();
    expect(within(request).queryByText(/answering this in the app/u)).toBeNull();
  });

  it('wakes the chime on every tap, not only the first', async () => {
    const user = userEvent.setup();
    signIn();
    renderFloor(createStaffMockGateway({ latencyMs: 0, branchId: BRANCH, now: mockClock().now }));
    const section = await panel();

    await user.pointer({ keys: '[MouseLeft]', target: section });
    await user.pointer({ keys: '[MouseLeft]', target: section });
    await user.pointer({ keys: '[MouseLeft]', target: section });

    expect(chime.primed).toBeGreaterThanOrEqual(3);
  });

  it('declines with the reason typed, after asking, and sends nothing until then', async () => {
    const user = userEvent.setup();
    signIn();
    const gateway = createStaffMockGateway({
      latencyMs: 0,
      branchId: BRANCH,
      now: mockClock().now,
    });
    const reject = vi.spyOn(gateway, 'rejectReservation');
    renderFloor(gateway);

    const request = await card('7');
    await user.click(within(request).getByRole('button', { name: 'Decline' }));
    expect(reject).not.toHaveBeenCalled();

    await user.type(within(request).getByLabelText('Reason (optional)'), 'Table 7 is staying late');
    await user.click(within(request).getByRole('button', { name: 'Decline the booking' }));

    await waitFor(() =>
      expect(reject).toHaveBeenCalledWith({
        reservationId: 'res-await-1',
        reason: 'Table 7 is staying late',
      }),
    );
    expect(await screen.findByText(/^Declined: table 7 (?:on .+ )?at /u)).toBeTruthy();
  });

  it('declines without a reason when none is typed', async () => {
    const user = userEvent.setup();
    signIn();
    const gateway = createStaffMockGateway({
      latencyMs: 0,
      branchId: BRANCH,
      now: mockClock().now,
    });
    const reject = vi.spyOn(gateway, 'rejectReservation');
    renderFloor(gateway);

    const request = await card('7');
    await user.click(within(request).getByRole('button', { name: 'Decline' }));
    await user.click(within(request).getByRole('button', { name: 'Decline the booking' }));
    await waitFor(() => expect(reject).toHaveBeenCalledWith({ reservationId: 'res-await-1' }));
  });

  it('says it was too late, in its own words, when the window closed before the tap landed', async () => {
    const user = userEvent.setup();
    signIn();
    const base = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH, now: mockClock().now });
    const late: StaffGateway = {
      ...base,
      approveReservation: () =>
        Promise.reject(
          new ConcurrencyConflictError({
            url: 'mock://approve',
            problem: {
              type: 'about:blank',
              title: 'Conflict',
              status: 409,
              detail: 'The answer window for Y3107 closed at 18:13.',
              code: 'reservation-approval-expired',
              traceId: 'mock',
            },
          }),
        ),
    };
    renderFloor(late);

    const request = await card('7');
    await user.click(within(request).getByRole('button', { name: 'Approve' }));

    const alert = await within(request).findByRole('alert');
    expect(alert.textContent).toMatch(/^Too late: the time to answer ran out/u);
    // And in the floor's own notice, which outlives the card the next read removes.
    expect(
      await screen.findByText(/^Table 7 · Too late: the time to answer ran out/u),
    ).toBeTruthy();
  });

  it('stops offering a decision once the clock reaches zero', async () => {
    signIn();
    const clock = mockClock();
    const base = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH, now: clock.now });
    // The server has not swept it yet: the list still has it, closed.
    const closed: StaffGateway = {
      ...base,
      listAwaitingApproval: async (branchId) =>
        (await base.listAwaitingApproval(branchId)).map((request) => ({
          ...request,
          approvalExpiresAtUtc: new Date(Date.now() - 1000).toISOString(),
        })),
    };
    renderFloor(closed);

    const request = await card('7');
    expect(within(request).getByRole('timer', { hidden: true }).textContent).toBe('00:00');
    expect(within(request).getByText(/^Time is up\./u)).toBeTruthy();
    expect(within(request).queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('announces a request that arrives while the floor is open, and chimes once', async () => {
    signIn();
    const clock = mockClock();
    const queryClient = renderFloor(
      createStaffMockGateway({ latencyMs: 0, branchId: BRANCH, now: clock.now }),
    );

    await card('7');
    // Outside the folding panel and the floor body, so it is heard whatever
    // the panel or the screen is showing.
    const status = announcer();
    expect((await panel()).contains(status)).toBe(false);
    // Nothing new on the first read: those were on screen at once.
    expect(status.textContent).toBe('');
    expect(chime.played).toBe(0);

    clock.skip(50_000);
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.awaitingApproval(BRANCH) });
    });

    const arrived = await card('4');
    await waitFor(() =>
      expect(status.textContent).toMatch(
        /^New booking request: table 4 (?:on .+ )?at .*, 3 guests\.$/u,
      ),
    );
    expect(arrived.className).toContain('is-fresh');
    expect((await card('7')).className).not.toContain('is-fresh');
    expect(await badge(await panel(), '3')).toBeTruthy();
    await waitFor(() => expect(chime.played).toBe(1));
  });

  it('announces and counts a request that arrives while the kitchen tab shows', async () => {
    signIn();
    const clock = mockClock();
    const user = userEvent.setup({ delay: null });
    const queryClient = renderFloor(
      createStaffMockGateway({ latencyMs: 0, branchId: BRANCH, now: clock.now }),
    );
    await card('7');

    await user.click(screen.getByRole('button', { name: /^Kitchen/u }));
    clock.skip(50_000);
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.awaitingApproval(BRANCH) });
    });

    await waitFor(() =>
      expect(announcer().textContent).toMatch(/^New booking request: table 4 (?:on .+ )?at /u),
    );
    // The floor's tab says something is waiting there; the chime rang once.
    expect(screen.getByRole('button', { name: /^Floor, \d+ waiting on the floor$/u })).toBeTruthy();
    await waitFor(() => expect(chime.played).toBe(1));
  });

  it('says the list could not be read rather than that nobody is waiting', async () => {
    signIn();
    const base = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH, now: mockClock().now });
    renderFloor({
      ...base,
      listAwaitingApproval: () => Promise.reject(new Error('socket hang up')),
    });

    const section = await panel();
    expect(
      await within(section).findByText(/could not be read/u, undefined, { timeout: 5000 }),
    ).toBeTruthy();
    expect(within(section).queryByText('No bookings are waiting for an answer.')).toBeNull();
  });
});

/** The guest's record on a card: its one line, sentence for a screen reader and all. */
function recordLine(request: HTMLElement): HTMLElement | null {
  return request.querySelector<HTMLElement>('.guest-record');
}

/** The mock's requests with their records replaced, by table. */
function withRecords(
  records: Readonly<Record<string, AwaitingApproval['guestRecord']>>,
): StaffGateway {
  const base = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH, now: mockClock().now });
  return {
    ...base,
    listAwaitingApproval: async (branchId) =>
      (await base.listAwaitingApproval(branchId)).map((request) =>
        request.tableLabel in records
          ? { ...request, guestRecord: records[request.tableLabel] }
          : request,
      ),
  };
}

describe("the guest's record on a request", () => {
  it('says how the guest kept their bookings, in words, on each card', async () => {
    signIn();
    renderFloor(createStaffMockGateway({ latencyMs: 0, branchId: BRANCH, now: mockClock().now }));

    const missed = recordLine(await card('7'))!;
    expect(missed.textContent).toBe(
      "Guest's record, last 12 months, all venues: 12 bookings · 11 came · 1 no-show",
    );
    // The no-show is said in words; its tone is never the only sign.
    expect(within(missed).getByText('1 no-show').className).toContain('is-missed');

    // No no-show is said too: it is the number a host looks for. A late
    // cancellation is said only when there is one.
    // A takeaway order left at a counter comes last, apart from the bookings,
    // said as a miss (2026-10-23).
    const late = recordLine(await card('11'))!;
    expect(late.textContent).toMatch(
      /: 6 bookings · 5 came · 0 no-shows · 1 late cancellation · 1 takeaway order not collected$/u,
    );
    expect(within(late).getByText('1 takeaway order not collected').className).toContain(
      'is-missed',
    );
    expect(missed.textContent).not.toMatch(/late cancellation/u);
  });

  it('says "New guest" plainly, and nothing at all when no account is behind the booking', async () => {
    signIn();
    renderFloor(
      withRecords({
        '7': {
          booked: 0,
          came: 0,
          noShows: 0,
          lateCancellations: 0,
          unmarked: 0,
          isNewGuest: true,
          takeawayNoShows: 0,
          blockedUntilUtc: null,
        },
        '11': null,
      }),
    );

    const fresh = recordLine(await card('7'))!;
    expect(fresh.textContent).toMatch(/: New guest$/u);
    // Neutral: not a warning.
    expect(fresh.className).toContain('is-new');
    expect(fresh.querySelector('.is-missed')).toBeNull();
    expect(recordLine(await card('11'))).toBeNull();
  });

  it("says a blocked guest is blocked until when, on the branch's clock, with bookings nobody marked", async () => {
    signIn();
    const until = new Date(Date.now() + 6 * 24 * 3_600_000);
    renderFloor(
      withRecords({
        '7': {
          booked: 5,
          came: 2,
          noShows: 3,
          lateCancellations: 0,
          unmarked: 0,
          isNewGuest: false,
          takeawayNoShows: 0,
          blockedUntilUtc: until.toISOString(),
        },
        '11': {
          booked: 8,
          came: 5,
          noShows: 0,
          lateCancellations: 1,
          unmarked: 2,
          isNewGuest: false,
          takeawayNoShows: 0,
          blockedUntilUtc: null,
        },
      }),
    );

    const blocked = recordLine(await card('7'))!;
    const when = formatDayAndTime(until, 'Asia/Yerevan', 'en');
    expect(within(blocked).getByText(`Blocked until ${when.date}, ${when.time}`)).toBeTruthy();
    expect(blocked.className).toContain('is-blocked');
    expect(blocked.textContent).toMatch(/· 5 bookings · 2 came · 3 no-shows$/u);

    expect(recordLine(await card('11'))!.textContent).toMatch(
      /: 8 bookings · 5 came · 0 no-shows · 1 late cancellation · 2 not marked$/u,
    );
  });
});
