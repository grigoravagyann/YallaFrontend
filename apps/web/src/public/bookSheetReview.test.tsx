// @vitest-environment jsdom
import {
  MAX_BOOKING_NOTE,
  SmsUnavailableError,
  type PublicBranch,
  type TableAvailability,
} from '@yalla/api';
import { queryKeys } from '@yalla/api/react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingDone } from './BookingDone';
import BookingSheet from './BookingSheet';
import { STICKY_QUERY } from './layout';
import { PublicApp } from './PublicApp';
import { addDays, branchToday, defaultSelection, slotInstant } from './slots';
import { createHarness, initTestI18n, stubIntersectionObserverAsNeverVisible } from './testHarness';

/**
 * The Book sheet after its review (PP4-REVIEW): the calendar file's dates,
 * where the focus goes, a Telegram wait left behind, doors that stay closed,
 * errors said once, and the taken step holding still under a finger.
 */

beforeAll(async () => {
  await initTestI18n();
});

beforeEach(() => {
  stubIntersectionObserverAsNeverVisible();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function world(options: Parameters<typeof createHarness>[0] = {}) {
  const harness = createHarness({ floorApprovesAtOnce: true, ...options });
  const branch = (await harness.publicGateway.resolveBranch({
    venueSlug: 'lumen-coffee',
    branchSlug: 'northern-avenue',
  })) as PublicBranch;
  const selection = {
    ...defaultSelection(branch.timeZoneId, new Date(Date.now() + 2 * 60 * 60_000), {
      minLeadMinutes: branch.policy.minLeadMinutes,
      turnTimeMinutes: branch.policy.turnTimeMinutes,
      weeklyHours: branch.weeklyHours,
    }),
    partySize: 2,
  };
  const slotUtc = slotInstant(selection, branch.timeZoneId)!.toISOString();
  const tables = (
    await harness.gateway.getTableAvailability({
      branchId: branch.id,
      slotUtc,
      partySize: 2,
      timeZoneId: branch.timeZoneId,
    })
  ).filter((entry) => entry.isBookable && !entry.mustFreeByUtc);
  return { harness, branch, slotUtc, table: tables[0] as TableAvailability, tables };
}

type World = Awaited<ReturnType<typeof world>>;

function sheet(w: World, extra: Record<string, unknown> = {}) {
  return (
    <BookingSheet
      branch={w.branch}
      availability={w.table}
      slotUtc={w.slotUtc}
      partySize={2}
      onClose={() => {}}
      onTableTaken={() => {}}
      {...extra}
    />
  );
}

type User = ReturnType<typeof userEvent.setup>;

async function toPhone(user: User) {
  await user.click(await screen.findByRole('button', { name: 'Continue' }));
}

async function verifyBySms(user: User) {
  await user.type(await screen.findByLabelText('Phone number'), '77123456');
  await user.click(screen.getByRole('button', { name: 'Get a code by SMS' }));
  await user.type(await screen.findByLabelText('Code'), '123456');
}

/** The gateway's refusal when the backend has no SMS provider. */
const smsUnavailable = () => new SmsUnavailableError({ url: '/api/auth/diner/request-code' });

describe('the calendar file (review S1)', () => {
  it('dates the free-cancellation line, never "tomorrow" or "today"', async () => {
    const w = await world();
    const booking = await w.harness.gateway.createBooking({
      commandId: crypto.randomUUID(),
      branchId: w.branch.id,
      tableId: w.table.tableId,
      slotUtc: w.slotUtc,
      timeZoneId: w.branch.timeZoneId,
      partySize: 2,
      guestName: 'Ani',
      guestPhone: '+37477123456',
      channel: 'web',
    });
    const tomorrow = addDays(branchToday(w.branch.timeZoneId), 1);
    const until = slotInstant(
      { date: tomorrow, time: '15:00', partySize: 2 },
      w.branch.timeZoneId,
    )!;
    const blobs: Blob[] = [];
    Object.defineProperty(URL, 'createObjectURL', {
      value: (blob: Blob) => {
        blobs.push(blob);
        return 'blob:test';
      },
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(
      w.harness.wrap(
        <BookingDone
          booking={{ ...booking, freeCancellationUntilUtc: until.toISOString() }}
          branch={w.branch}
          onClose={() => {}}
        />,
      ),
    );
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Add to my calendar' }));
    expect(click).toHaveBeenCalled();

    const ics = (await blobs[0]!.text()).replace(/\r?\n[ \t]/gu, '');
    const description = /^DESCRIPTION:(.*)$/mu.exec(ics)![1]!;
    expect(description).not.toMatch(/tomorrow|today/iu);
    const date = new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      timeZone: w.branch.timeZoneId,
    }).format(until);
    expect(description).toContain(`Free cancellation until 15:00 on ${date}`);
  });
});

describe('where the focus goes', () => {
  it('lands on Telegram when the SMS door closes under the visitor (S2)', async () => {
    const w = await world();
    vi.spyOn(w.harness.gateway, 'requestPhoneCode').mockRejectedValue(smsUnavailable());
    const user = userEvent.setup();
    render(w.harness.wrap(sheet(w)));
    await toPhone(user);
    await user.type(screen.getByLabelText('Phone number'), '77123456');
    await user.click(screen.getByRole('button', { name: 'Get a code by SMS' }));
    await screen.findByText(/^Codes by SMS are not available/u);
    // Moved by an effect after the render that shows the line.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Confirm with Telegram' }),
      ),
    );
  });

  it('says a missing name once: the field takes the focus, no alert besides (N1)', async () => {
    const w = await world();
    const user = userEvent.setup();
    render(w.harness.wrap(sheet(w)));
    await toPhone(user);
    await verifyBySms(user);
    await user.click(await screen.findByRole('button', { name: 'Confirm booking' }));
    const field = screen.getByLabelText('Name for the booking');
    expect(document.activeElement).toBe(field);
    expect(screen.getByText('Write the name').getAttribute('role')).toBeNull();
    expect(field.getAttribute('aria-describedby')).toContain(screen.getByText('Write the name').id);
  });

  it('says a short number once, the same way (N1)', async () => {
    const w = await world();
    const user = userEvent.setup();
    render(w.harness.wrap(sheet(w)));
    await toPhone(user);
    await user.type(screen.getByLabelText('Phone number'), '77');
    await user.click(screen.getByRole('button', { name: 'Get a code by SMS' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Phone number'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('still announces a wrong code typed in the field that already has the focus (N1)', async () => {
    const w = await world();
    const user = userEvent.setup();
    render(w.harness.wrap(sheet(w)));
    await toPhone(user);
    await user.type(screen.getByLabelText('Phone number'), '77123456');
    await user.click(screen.getByRole('button', { name: 'Get a code by SMS' }));
    await user.type(await screen.findByLabelText('Code'), '000000');
    expect((await screen.findByRole('alert')).textContent).toMatch(/^That code is not right/u);
  });
});

describe('a failed "Send a new code"', () => {
  it('says why under the number, on the phone step it goes back to', async () => {
    const w = await world();
    const request = vi.spyOn(w.harness.gateway, 'requestPhoneCode');
    request.mockResolvedValueOnce({
      challengeId: 'c1',
      phoneE164: '+37477123456',
      expiresAtUtc: new Date(Date.now() + 600_000).toISOString(),
      resendAvailableAtUtc: new Date().toISOString(),
      maxAttempts: 5,
    });
    request.mockRejectedValueOnce(new Error('down'));
    const user = userEvent.setup();
    render(w.harness.wrap(sheet(w)));
    await toPhone(user);
    await user.type(screen.getByLabelText('Phone number'), '77123456');
    await user.click(screen.getByRole('button', { name: 'Get a code by SMS' }));
    await screen.findByLabelText('Code');
    await user.click(await screen.findByRole('button', { name: 'Send a new code' }));

    const field = await screen.findByLabelText('Phone number');
    await waitFor(() => expect(field.getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getByText('Something went wrong. Try again.')).toBeDefined();
  });
});

describe('the doors (S5, N2, N6)', () => {
  it('forgets the Telegram wait on Back: a later confirmation does not book under it', async () => {
    // The poll on the test's clock, so the reads that would find the
    // confirmation are certain to have come due, busy machine or not.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const w = await world();
    vi.stubGlobal('open', () => null);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(w.harness.wrap(sheet(w)));
    await toPhone(user);
    await user.click(screen.getByRole('button', { name: 'Confirm with Telegram' }));
    const link = (await screen.findByRole('link', {
      name: 'Open Telegram again',
    })) as HTMLAnchorElement;
    const challengeId = new URL(link.href).searchParams.get('start')!;

    await user.click(screen.getByRole('button', { name: 'Back' }));
    w.harness.gateway.confirmTelegramVerification(challengeId, '+37477000000');
    // Two of the mock server's 1.5 s polls (`pollAfterMs`), had it kept polling.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(screen.getByRole('heading', { level: 2, name: 'Your phone' })).toBeDefined();
    expect(screen.queryByLabelText('Name for the booking')).toBeNull();
  });

  it('keeps a refused door closed through Back and Continue', async () => {
    const w = await world();
    vi.spyOn(w.harness.gateway, 'requestPhoneCode').mockRejectedValue(smsUnavailable());
    const user = userEvent.setup();
    render(w.harness.wrap(sheet(w)));
    await toPhone(user);
    await user.type(screen.getByLabelText('Phone number'), '77123456');
    await user.click(screen.getByRole('button', { name: 'Get a code by SMS' }));
    await screen.findByText(/^Codes by SMS are not available/u);

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await toPhone(user);
    expect(screen.getByRole('button', { name: 'Confirm with Telegram' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Get a code by SMS' })).toBeNull();
  });

  it('offers "Check now" only once there is a link to check', async () => {
    const w = await world();
    vi.stubGlobal('open', () => null);
    vi.spyOn(w.harness.gateway, 'startTelegramVerification').mockImplementation(
      () => new Promise(() => {}),
    );
    const user = userEvent.setup();
    render(w.harness.wrap(sheet(w)));
    await toPhone(user);
    await user.click(screen.getByRole('button', { name: 'Confirm with Telegram' }));
    await screen.findByText('Waiting for Telegram…');
    expect(screen.queryByRole('button', { name: 'Check now' })).toBeNull();
  });
});

describe('the note (N12)', () => {
  it('takes as much as the server keeps, as the app does', async () => {
    const w = await world();
    const user = userEvent.setup();
    render(w.harness.wrap(sheet(w)));
    await toPhone(user);
    await verifyBySms(user);
    const note = await screen.findByLabelText(/^Note to the venue/u);
    expect(note.getAttribute('maxlength')).toBe(String(MAX_BOOKING_NOTE));
    expect(screen.getByText(`0 / ${MAX_BOOKING_NOTE} · only the venue sees it`)).toBeDefined();
  });
});

describe('the taken step holds still (N4)', () => {
  it('keeps its order when the room answers again', async () => {
    const w = await world({ simulateTableTaken: true });
    const user = userEvent.setup();
    const alternatives = w.tables
      .filter((entry) => entry.tableId !== w.table.tableId)
      .map((availability) => ({ availability, roomName: null }));
    expect(alternatives.length).toBeGreaterThan(2);
    const view = render(w.harness.wrap(sheet(w, { alternatives, onPickTable: () => {} })));
    await toPhone(user);
    await verifyBySms(user);
    await user.type(await screen.findByLabelText('Name for the booking'), 'Ani');
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }));
    const list = await screen.findByRole('list', { name: 'Free at the same time' });
    const before = within(list)
      .getAllByRole('button')
      .map((button) => button.querySelector('b')!.textContent);

    view.rerender(
      w.harness.wrap(
        sheet(w, { alternatives: [...alternatives].reverse(), onPickTable: () => {} }),
      ),
    );
    const after = within(screen.getByRole('list', { name: 'Free at the same time' }))
      .getAllByRole('button')
      .map((button) => button.querySelector('b')!.textContent);
    expect(after).toEqual(before);
  });
});

function stubViewport(wide: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === STICKY_QUERY ? wide : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  );
}

/** On the page: choose the first free table, open the sheet, and book it to the 409. */
async function loseOnThePage(harness: ReturnType<typeof createHarness>) {
  Reflect.deleteProperty(globalThis, 'IntersectionObserver');
  stubViewport(true);
  render(harness.wrap(<PublicApp />, '/lumen-coffee/northern-avenue'));
  const user = userEvent.setup();
  const pins = (await screen.findAllByRole('button', { name: /^Table .+, free$/u })).filter(
    (pin) => pin.getAttribute('aria-disabled') !== 'true',
  );
  const pin = pins[0]!;
  const label = pin.textContent!;
  await user.click(pin);
  const card = screen.getByRole('region', { name: 'Book a table' });
  const book = await within(card).findByRole('button', { name: `Book table ${label}` });
  await waitFor(() => expect((book as HTMLButtonElement).disabled).toBe(false));
  await user.click(book);
  await toPhone(user);
  await verifyBySms(user);
  await user.type(await screen.findByLabelText('Name for the booking'), 'Ani');
  await user.click(
    await screen.findByRole('button', { name: /^(Confirm booking|Request table)$/u }),
  );
  await screen.findByRole('heading', { level: 2, name: 'This table is no longer free' });
  return { user, pin, label, card };
}

describe('on the page, around the taken step', () => {
  it('ignores a tap on the lost table while the room still draws it free (N5)', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true, simulateTableTaken: true });
    let lost = false;
    const realFloor = harness.gateway.getSlotFloor.bind(harness.gateway);
    vi.spyOn(harness.gateway, 'getSlotFloor').mockImplementation((input) =>
      // After the 409 the room's next answer never comes: the stale one stays.
      lost ? new Promise(() => {}) : realFloor(input),
    );
    const realCreate = harness.gateway.createBooking.bind(harness.gateway);
    vi.spyOn(harness.gateway, 'createBooking').mockImplementation(async (input) => {
      try {
        return await realCreate(input);
      } finally {
        lost = true;
      }
    });
    const { user, pin } = await loseOnThePage(harness);

    await user.click(pin);
    expect(
      screen.getByRole('heading', { level: 2, name: 'This table is no longer free' }),
    ).toBeDefined();
    expect(pin.getAttribute('aria-pressed')).not.toBe('true');
  });

  it('gives the focus to the booking card after booking a table offered there (N3)', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true, simulateTableTaken: true });
    const { user, card } = await loseOnThePage(harness);
    const list = await screen.findByRole('list', { name: 'Free at the same time' });
    await user.click(within(list).getAllByRole('button')[0]!);
    const checkbox = screen.queryByRole('checkbox');
    if (checkbox) await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(
      await screen.findByRole('button', { name: /^(Confirm booking|Request table)$/u }),
    );
    await user.click(await screen.findByRole('button', { name: 'Back to the venue page' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(card).getByRole('heading', { level: 2, name: 'Book a table' }),
      ),
    );
  });
});

describe('after "Choose another time" (S3)', () => {
  // A guard rather than a red test: in jsdom the later sheet's opener is
  // disabled while the new slot's room loads, so the stale flag's `focus()`
  // was a no-op here even before the fix. The flag is cleared all the same.
  it('leaves the focus where the visitor put it when a later sheet closes', async () => {
    // A pinned afternoon in Yerevan: today's times are short notice, so the
    // booking waits, and a one-millisecond answer window declines it.
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-10-20T10:00:00Z'));
    Reflect.deleteProperty(globalThis, 'IntersectionObserver');
    // A phone: the booking bar under the room opens the sheet, and stays
    // mounted (hidden) while it is open — a Book button to focus again.
    stubViewport(false);
    const harness = createHarness({ approvalWindowMs: 1 });
    const made = vi.spyOn(harness.gateway, 'createBooking');
    render(harness.wrap(<PublicApp />, '/lumen-coffee/northern-avenue'));
    const user = userEvent.setup();
    const card = () => screen.getByRole('region', { name: 'Book a table' });
    const room = () => screen.getByRole('region', { name: 'Choose your table' });
    const firstFree = async () =>
      (await screen.findAllByRole('button', { name: /^Table .+, free$/u })).find(
        (pin) => pin.getAttribute('aria-disabled') !== 'true',
      )!;
    const openSheet = async () => {
      const pin = await firstFree();
      await user.click(pin);
      const book = await within(room()).findByRole('button', {
        name: `Book table ${pin.textContent}`,
      });
      await waitFor(() => expect((book as HTMLButtonElement).disabled).toBe(false));
      await user.click(book);
      const checkbox = screen.queryByRole('checkbox');
      if (checkbox) await user.click(checkbox);
      await toPhone(user);
    };

    await openSheet();
    await verifyBySms(user);
    await user.type(await screen.findByLabelText('Name for the booking'), 'Ani');
    await user.click(
      await screen.findByRole('button', { name: /^(Confirm booking|Request table)$/u }),
    );
    // The window closes, and the confirmation reads the booking again now
    // rather than at its 15 s poll — which the 15 s wait for it here used to
    // race, losing whenever the machine was busy.
    await waitFor(() => expect(made).toHaveResolved());
    const { manageToken } = await made.mock.results[0]!.value;
    vi.setSystemTime(Date.now() + 1_000);
    await act(() =>
      harness.queryClient.invalidateQueries({ queryKey: queryKeys.managedBooking(manageToken!) }),
    );
    await user.click(await screen.findByRole('button', { name: 'Choose another time' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await openSheet();
    await screen.findByRole('dialog');
    // Another time the chosen table is still free at: the table stays
    // chosen, so its Book button is still there to be refocused.
    const times = within(within(card()).getByRole('group', { name: 'Time' })).getAllByRole(
      'button',
    );
    const pressed = times.findIndex((chip) => chip.getAttribute('aria-pressed') === 'true');
    const day = times
      .slice(pressed + 1)
      .find((chip) => chip.getAttribute('aria-disabled') !== 'true')!;
    await user.click(day);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // The room's answer for the new time is in — the Book button waits for it
    // — rather than whatever 600 ms of a busy machine had let through.
    await waitFor(() =>
      expect(
        (within(room()).getByRole('button', { name: /^Book table/u }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    expect(document.activeElement).toBe(day);
  });
});
