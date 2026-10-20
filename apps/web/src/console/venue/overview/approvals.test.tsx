// @vitest-environment jsdom
import {
  ConcurrencyConflictError,
  ForbiddenError,
  createConsoleMockGateway,
  type ConsoleBooking,
  type ConsoleGateway,
} from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { formatDayAndTime } from '@yalla/format';
import { ToastProvider } from '../../ui/toast';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';
import { ApprovalsCard } from './ApprovalsCard';

/**
 * The bookings waiting for a person, at the top of Overview.
 *
 * The panel moved here from the policy screen (venue HANDOFF section 6). What
 * matters is unchanged: a decision leaves the list at once, a rejection
 * carries the reason typed, a refusal from the server is shown in the
 * server's own words, and a short-notice booking shows its clock. New with
 * the Main artboard: the decision is said in a toast, declining moves the
 * focus into the reason and back, and a row whose time ran out is put away
 * with "Got it".
 */

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(cleanup);

function renderCard(options: { readonly gateway?: ConsoleGateway } = {}) {
  const harness = createConsoleHarness({
    gateway: options.gateway ?? createConsoleMockGateway({ latencyMs: 0, role: 'owner' }),
  });
  render(
    harness.wrap(
      <ToastProvider>
        <ApprovalsCard branchId="b-lumen-north" timeZoneId="Asia/Yerevan" />
      </ToastProvider>,
      '/venue',
    ),
  );
  return harness;
}

async function waitForPanel() {
  const panel = await screen.findByRole(
    'region',
    { name: /waiting for your decision/i },
    { timeout: 5000 },
  );
  await waitFor(() => expect(within(panel).getAllByRole('listitem').length).toBeGreaterThan(0), {
    timeout: 5000,
  });
  return panel;
}

describe('the awaiting-approval panel', () => {
  it("shows the diner's note on the booking that has one, and nothing on the one that does not", async () => {
    const harness = renderCard();
    const panel = await waitForPanel();

    const pending = await harness.gateway.listPendingReservations('b-lumen-north');
    const withNote = pending.find((booking) => booking.note !== null)!;
    const without = pending.find((booking) => booking.note === null)!;

    const noted = within(panel).getByText(withNote.code).closest('li')!;
    expect(within(noted).getByText(/note from the diner/i)).toBeTruthy();
    expect(within(noted).getByText(withNote.note!)).toBeTruthy();

    const plain = within(panel).getByText(without.code).closest('li')!;
    expect(within(plain).queryByText(/note from the diner/i)).toBeNull();
  });

  it('approves a booking and it leaves the list', async () => {
    const user = userEvent.setup();
    const harness = renderCard();
    const panel = await waitForPanel();

    const before = await harness.gateway.listPendingReservations('b-lumen-north');
    const first = before[0]!;
    const row = within(panel).getByText(first.code).closest('li')!;

    await user.click(within(row).getByRole('button', { name: /^approve$/i }));

    await waitFor(() => expect(within(panel).queryByText(first.code)).toBeNull());
    const after = await harness.gateway.listPendingReservations('b-lumen-north');
    expect(after.map((booking) => booking.id)).not.toContain(first.id);
    expect(within(panel).getAllByRole('listitem').length).toBe(before.length - 1);
    // The focus goes on to the row now in its place, not to the page.
    const next = within(panel).getByText(before[1]!.code).closest('li')!;
    await waitFor(() => expect(next.contains(document.activeElement)).toBe(true));
  });

  it('takes a decided row off at once, so a second click cannot decide it again', async () => {
    const user = userEvent.setup();
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const approve = vi.spyOn(base, 'approveReservation');
    // The next read is slow: the row must not wait for it to go.
    let reads = 0;
    const slow: ConsoleGateway = {
      ...base,
      listPendingReservations: async (branchId) => {
        reads += 1;
        if (reads > 1) await new Promise((resolve) => setTimeout(resolve, 5000));
        return base.listPendingReservations(branchId);
      },
    };
    renderCard({ gateway: slow });
    const panel = await waitForPanel();
    const [first] = await base.listPendingReservations('b-lumen-north');
    const row = within(panel).getByText(first!.code).closest('li')!;

    await user.click(within(row).getByRole('button', { name: /^approve$/i }));
    await waitFor(() => expect(within(panel).queryByText(first!.code)).toBeNull(), {
      timeout: 1000,
    });
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it('counts in its pill the same list the sidebar badge counts', async () => {
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const closed: ConsoleGateway = {
      ...base,
      listPendingReservations: async (branchId) =>
        (await base.listPendingReservations(branchId)).map((booking) =>
          booking.approvalExpiresAtUtc
            ? { ...booking, approvalExpiresAtUtc: new Date(Date.now() - 1000).toISOString() }
            : booking,
        ),
    };
    renderCard({ gateway: closed });
    const panel = await waitForPanel();
    const listed = await closed.listPendingReservations('b-lumen-north');
    // The badge is the server's list, as read; so is the pill — a row whose
    // time ran out on this clock is still in both until the next read.
    expect(within(panel).getByText(`${listed.length} waiting`)).toBeTruthy();
  });

  it('rejects with the reason typed, after asking', async () => {
    const user = userEvent.setup();
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const reject = vi.spyOn(base, 'rejectReservation');
    renderCard({ gateway: base });
    const panel = await waitForPanel();

    const [first] = await base.listPendingReservations('b-lumen-north');
    const row = within(panel).getByText(first!.code).closest('li')!;

    await user.click(within(row).getByRole('button', { name: /^decline$/i }));
    // Nothing is sent until the confirmation.
    expect(reject).not.toHaveBeenCalled();

    await user.type(within(row).getByLabelText(/reason/i), 'Private event that evening');
    await user.click(within(row).getByRole('button', { name: /decline the booking/i }));

    await waitFor(() =>
      expect(reject).toHaveBeenCalledWith({
        reservationId: first!.id,
        reason: 'Private event that evening',
      }),
    );
    await waitFor(() => expect(within(panel).queryByText(first!.code)).toBeNull());
  });

  it('shows the server sentence when the branch refuses the decision', async () => {
    const user = userEvent.setup();
    const detail = 'Approve a booking requires the Manager role; the caller is a Manager.';
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const refusing: ConsoleGateway = {
      ...base,
      approveReservation: () =>
        Promise.reject(
          new ForbiddenError({
            url: 'mock://approve',
            problem: {
              type: 'about:blank',
              title: 'Forbidden',
              status: 403,
              detail,
              code: 'forbidden',
              traceId: 'mock',
            },
          }),
        ),
    };
    renderCard({ gateway: refusing });
    const panel = await waitForPanel();

    const [first] = await base.listPendingReservations('b-lumen-north');
    const row = within(panel).getByText(first!.code).closest('li')!;
    await user.click(within(row).getByRole('button', { name: /^approve$/i }));

    const alert = await within(row).findByRole('alert');
    expect(alert.textContent).toContain(detail);
    // Still listed: nothing was decided.
    expect(within(panel).getByText(first!.code)).toBeTruthy();
  });
});

describe('deciding', () => {
  it('says the decision in a toast', async () => {
    const user = userEvent.setup();
    const harness = renderCard();
    const panel = await waitForPanel();
    const [first] = await harness.gateway.listPendingReservations('b-lumen-north');
    const row = within(panel).getByText(first!.code).closest('li')!;

    await user.click(within(row).getByRole('button', { name: /^approve$/i }));

    expect(
      await screen.findByText(
        `${first!.guestName}'s booking is confirmed · the guest will be notified`,
      ),
    ).toBeTruthy();
  });

  it('moves the focus into the reason on decline, and back to Decline on Keep it', async () => {
    const user = userEvent.setup();
    const harness = renderCard();
    const panel = await waitForPanel();
    const [first] = await harness.gateway.listPendingReservations('b-lumen-north');
    const row = within(panel).getByText(first!.code).closest('li')!;

    await user.click(within(row).getByRole('button', { name: /^decline$/i }));
    const reason = within(row).getByLabelText(/reason/i);
    await waitFor(() => expect(document.activeElement).toBe(reason));
    expect(reason.getAttribute('aria-describedby')).toBeTruthy();
    expect(reason.getAttribute('maxlength')).toBe('200');

    await user.click(within(row).getByRole('button', { name: /^keep it$/i }));
    await waitFor(() =>
      expect(document.activeElement).toBe(within(row).getByRole('button', { name: /^decline$/i })),
    );
  });
});

describe('a booking at short notice', () => {
  it('says why it waits and how long is left to answer, and the others have no clock', async () => {
    renderCard();
    const panel = await waitForPanel();
    const pending = await createConsoleMockGateway({
      latencyMs: 0,
      role: 'owner',
    }).listPendingReservations('b-lumen-north');
    const tonight = pending.find((booking) => booking.awaitingApprovalBecause === 'shortNotice')!;
    const later = pending.find((booking) => booking.approvalExpiresAtUtc === null)!;

    const row = within(panel).getByText(tonight.code).closest('li')!;
    expect(within(row).getByText('Short notice')).toBeTruthy();
    const timer = within(row).getByRole('timer');
    // Asked for a minute ago: about fourteen left.
    expect(timer.textContent).toMatch(/^1[34]:\d\d left to answer$/u);

    const plain = within(panel).getByText(later.code).closest('li')!;
    expect(within(plain).queryByRole('timer')).toBeNull();
  });

  it('says a booking was made without a verified number, beside why it waits', async () => {
    // None is made any more (2026-10-20); the few from the hours they were are still answered.
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const gateway = {
      ...base,
      listPendingReservations: async (branchId: string) =>
        (await base.listPendingReservations(branchId)).map((booking) =>
          booking.awaitingApprovalBecause === 'branchApprovesEveryBooking'
            ? {
                ...booking,
                awaitingApprovalBecause: 'unverifiedPhone' as const,
                phoneUnverified: true,
              }
            : booking,
        ),
    };
    renderCard({ gateway });
    const panel = await waitForPanel();
    const pending = await gateway.listPendingReservations('b-lumen-north');
    const unverified = pending.find((booking) => booking.phoneUnverified)!;
    const verified = pending.find((booking) => !booking.phoneUnverified)!;

    const row = within(panel).getByText(unverified.code).closest('li')!;
    expect(within(row).getByText('Number not verified')).toBeTruthy();
    // A large party made without one would say both; this one waits for that reason alone.
    expect(within(row).queryByText('number not verified')).toBeNull();

    const plain = within(panel).getByText(verified.code).closest('li')!;
    expect(within(plain).queryByText(/number not verified/iu)).toBeNull();
  });

  it('flags an unverified booking that waits for another reason', async () => {
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const gateway = {
      ...base,
      listPendingReservations: async (branchId: string) =>
        (await base.listPendingReservations(branchId)).map((booking) =>
          booking.awaitingApprovalBecause === 'largeParty'
            ? { ...booking, phoneUnverified: true }
            : booking,
        ),
    };
    renderCard({ gateway });
    const panel = await waitForPanel();
    const large = (await gateway.listPendingReservations('b-lumen-north')).find(
      (booking) => booking.awaitingApprovalBecause === 'largeParty',
    )!;

    const row = within(panel).getByText(large.code).closest('li')!;
    expect(within(row).getByText('Large party')).toBeTruthy();
    expect(within(row).getByText('number not verified')).toBeTruthy();
  });

  it('stops offering a decision once the time is up', async () => {
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const closed: ConsoleGateway = {
      ...base,
      listPendingReservations: async (branchId) =>
        (await base.listPendingReservations(branchId)).map((booking) =>
          booking.approvalExpiresAtUtc
            ? { ...booking, approvalExpiresAtUtc: new Date(Date.now() - 1000).toISOString() }
            : booking,
        ),
    };
    renderCard({ gateway: closed });
    const panel = await waitForPanel();
    const tonight = (await closed.listPendingReservations('b-lumen-north')).find(
      (booking) => booking.awaitingApprovalBecause === 'shortNotice',
    )!;

    const row = within(panel).getByText(tonight.code).closest('li')!;
    expect(within(row).getByText(/^Time is up\./u)).toBeTruthy();
    // No decision the server would refuse; "Got it" puts the row away.
    expect(within(row).queryByRole('button', { name: /^approve$/i })).toBeNull();
    expect(within(row).queryByRole('button', { name: /^decline$/i })).toBeNull();
    await userEvent.setup().click(within(row).getByRole('button', { name: /^got it$/i }));
    await waitFor(() => expect(within(panel).queryByText(tonight.code)).toBeNull());
    // On to the next row, not lost on the page.
    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));
  });

  it('turns the clock amber under five minutes and red under one', async () => {
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const left = (seconds: number): ConsoleGateway => ({
      ...base,
      listPendingReservations: async (branchId) =>
        (await base.listPendingReservations(branchId)).map((booking) =>
          // The short-notice one: a booking without a verified number has a
          // clock too, in hours, and keeps it.
          booking.awaitingApprovalBecause === 'shortNotice'
            ? {
                ...booking,
                approvalExpiresAtUtc: new Date(Date.now() + seconds * 1000).toISOString(),
              }
            : { ...booking, approvalExpiresAtUtc: null },
        ),
    });

    renderCard({ gateway: left(210) });
    let timer = within(await waitForPanel()).getByRole('timer');
    expect(timer.className).toContain('is-soon');
    expect(timer.getAttribute('aria-label')).toBe('4 minutes left');
    cleanup();

    renderCard({ gateway: left(40) });
    timer = within(await waitForPanel()).getByRole('timer');
    expect(timer.className).toContain('is-now');
    expect(timer.getAttribute('aria-label')).toBe('1 minute left');
  });

  it('says it was too late when the window closed before the decision landed', async () => {
    const user = userEvent.setup();
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const late: ConsoleGateway = {
      ...base,
      approveReservation: () =>
        Promise.reject(
          new ConcurrencyConflictError({
            url: 'mock://approve',
            problem: {
              type: 'about:blank',
              title: 'Conflict',
              status: 409,
              detail: 'The answer window for LUSN2 closed.',
              code: 'reservation-approval-expired',
              traceId: 'mock',
            },
          }),
        ),
    };
    renderCard({ gateway: late });
    const panel = await waitForPanel();
    const [first] = await base.listPendingReservations('b-lumen-north');
    const row = within(panel).getByText(first!.code).closest('li')!;

    await user.click(within(row).getByRole('button', { name: /^approve$/i }));

    // Said in a toast, which outlives the row: the row is gone at once.
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/^Too late: the time to answer ran out/u);
    await waitFor(() => expect(within(panel).queryByText(first!.code)).toBeNull());
  });

  it('says somebody else answered first in a toast, and takes the row off', async () => {
    const user = userEvent.setup();
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const answered: ConsoleGateway = {
      ...base,
      approveReservation: () =>
        Promise.reject(
          new ConcurrencyConflictError({
            url: 'mock://approve',
            problem: {
              type: 'about:blank',
              title: 'Conflict',
              status: 409,
              detail: 'Only a pending reservation can be confirmed; LUSN2 is Confirmed.',
              code: 'conflicting-state',
              traceId: 'mock',
            },
          }),
        ),
    };
    renderCard({ gateway: answered });
    const panel = await waitForPanel();
    const [first] = await base.listPendingReservations('b-lumen-north');
    const row = within(panel).getByText(first!.code).closest('li')!;

    await user.click(within(row).getByRole('button', { name: /^approve$/i }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Already answered by someone else.',
    );
    await waitFor(() => expect(within(panel).queryByText(first!.code)).toBeNull());
  });
});

describe('a booking the guest before answers in the app', () => {
  const THEIRS =
    'The guest before is answering this in the app. It is decided when they do, or declined if they do not.';

  it('offers no decision, and says whose answer it waits for', async () => {
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const [first] = await base.listPendingReservations('b-lumen-north');
    const theirs: ConsoleGateway = {
      ...base,
      listPendingReservations: async (branchId) =>
        (await base.listPendingReservations(branchId)).map((booking) =>
          booking.id === first!.id
            ? {
                ...booking,
                awaitingApprovalBecause: 'earlierGuestConsent' as const,
                approvalExpiresAtUtc: new Date(Date.now() + 90 * 60_000).toISOString(),
                awaitsEarlierGuestAnswer: true,
              }
            : booking,
        ),
    };
    renderCard({ gateway: theirs });
    const panel = await waitForPanel();
    const row = within(panel).getByText(first!.code).closest('li')!;

    expect(within(row).getByText(THEIRS)).toBeTruthy();
    expect(within(row).queryByRole('button', { name: /^approve$/i })).toBeNull();
    expect(within(row).queryByRole('button', { name: /^decline$/i })).toBeNull();
    // No clock: the time is the guest's to answer in, not the venue's.
    expect(within(row).queryByRole('timer')).toBeNull();
  });

  it('offers the decision, with its clock, when the venue rings the guest before itself', async () => {
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const [first] = await base.listPendingReservations('b-lumen-north');
    const venues: ConsoleGateway = {
      ...base,
      listPendingReservations: async (branchId) =>
        (await base.listPendingReservations(branchId)).map((booking) =>
          booking.id === first!.id
            ? {
                ...booking,
                awaitingApprovalBecause: 'earlierGuestConsent' as const,
                approvalExpiresAtUtc: new Date(Date.now() + 90 * 60_000).toISOString(),
                awaitsEarlierGuestAnswer: false,
              }
            : booking,
        ),
    };
    renderCard({ gateway: venues });
    const panel = await waitForPanel();
    const row = within(panel).getByText(first!.code).closest('li')!;

    expect(within(row).getByRole('timer').textContent).toMatch(/left to answer$/u);
    expect(within(row).getByRole('button', { name: /^approve$/i })).toBeTruthy();
    expect(within(row).queryByText(THEIRS)).toBeNull();
  });

  it('stops offering one once the server says so', async () => {
    const user = userEvent.setup();
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const refused: ConsoleGateway = {
      ...base,
      approveReservation: () =>
        Promise.reject(
          new ConcurrencyConflictError({
            url: 'mock://approve',
            problem: {
              type: 'about:blank',
              title: 'Conflict',
              status: 409,
              detail: 'It waits on the earlier guest.',
              code: 'reservation-awaiting-earlier-guest',
              traceId: 'mock',
            },
          }),
        ),
    };
    renderCard({ gateway: refused });
    const panel = await waitForPanel();
    const [first] = await base.listPendingReservations('b-lumen-north');
    const row = within(panel).getByText(first!.code).closest('li')!;

    await user.click(within(row).getByRole('button', { name: /^approve$/i }));

    expect((await within(row).findByRole('alert')).textContent).toBe(THEIRS);
    expect(within(row).queryByRole('button', { name: /^approve$/i })).toBeNull();
  });
});

describe("the guest's record on a waiting booking", () => {
  const line = (row: HTMLElement) => row.querySelector<HTMLElement>('.guest-record');

  /** The mock's waiting bookings with their records replaced, by why they wait. */
  function withRecords(
    change: (booking: ConsoleBooking) => ConsoleBooking['guestRecord'] | undefined,
  ): ConsoleGateway {
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    return {
      ...base,
      listPendingReservations: async (branchId) =>
        (await base.listPendingReservations(branchId)).map((booking) => {
          const record = change(booking);
          return record === undefined ? booking : { ...booking, guestRecord: record };
        }),
    };
  }

  it('says how each guest kept their bookings, in words, and a new guest plainly', async () => {
    const harness = renderCard();
    const panel = await waitForPanel();
    const pending = await harness.gateway.listPendingReservations('b-lumen-north');
    const rowFor = (because: string) =>
      within(panel)
        .getByText(pending.find((booking) => booking.awaitingApprovalBecause === because)!.code)
        .closest('li')!;

    const history = line(rowFor('noShowHistory'))!;
    expect(history.textContent).toBe(
      "Guest's record, last 12 months, all venues: 7 bookings · 5 came · 2 no-shows",
    );
    expect(within(history).getByText('2 no-shows').className).toContain('is-missed');

    const fresh = line(rowFor('largeParty'))!;
    expect(fresh.textContent).toMatch(/: New guest$/u);
    expect(fresh.className).toContain('is-new');
  });

  it('says a blocked guest is blocked until when, and nothing when no account is behind it', async () => {
    const until = new Date(Date.now() + 5 * 24 * 3_600_000);
    const gateway = withRecords((booking) =>
      booking.awaitingApprovalBecause === 'noShowHistory'
        ? {
            booked: 6,
            came: 3,
            noShows: 3,
            lateCancellations: 0,
            unmarked: 0,
            isNewGuest: false,
            blockedUntilUtc: until.toISOString(),
          }
        : booking.awaitingApprovalBecause === 'largeParty'
          ? null
          : undefined,
    );
    renderCard({ gateway });
    const panel = await waitForPanel();
    const pending = await gateway.listPendingReservations('b-lumen-north');
    const rowFor = (because: string) =>
      within(panel)
        .getByText(pending.find((booking) => booking.awaitingApprovalBecause === because)!.code)
        .closest('li')!;

    const blocked = line(rowFor('noShowHistory'))!;
    const when = formatDayAndTime(until, 'Asia/Yerevan', 'en');
    expect(within(blocked).getByText(`Blocked until ${when.date}, ${when.time}`)).toBeTruthy();
    expect(blocked.className).toContain('is-blocked');
    expect(line(rowFor('largeParty'))).toBeNull();
  });

  it('says a booking the guest block cancelled was cancelled for that, not confirmed', async () => {
    const user = userEvent.setup();
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const gateway: ConsoleGateway = {
      ...base,
      approveReservation: async (command) => {
        const [booking] = (await base.listPendingReservations('b-lumen-north')).filter(
          (candidate) => candidate.id === command.reservationId,
        );
        return {
          ...booking!,
          status: 'cancelledByVenue',
          awaitingApprovalBecause: null,
          cancelledBecause: 'noShowBlock',
        };
      },
    };
    renderCard({ gateway });
    const panel = await waitForPanel();
    const [first] = await base.listPendingReservations('b-lumen-north');
    const row = within(panel).getByText(first!.code).closest('li')!;

    await user.click(within(row).getByRole('button', { name: /^approve$/i }));
    expect(
      await screen.findByText(
        `Cancelled: guest blocked for no-shows. ${first!.guestName}'s booking was not confirmed.`,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/booking is confirmed/u)).toBeNull();
  });
});
