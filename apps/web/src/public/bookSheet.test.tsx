// @vitest-environment jsdom
import {
  SmsUnavailableError,
  type Booking,
  type PublicBranch,
  type TableAvailability,
} from '@yalla/api';
import { i18next } from '@yalla/i18n';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingDone } from './BookingDone';
import BookingSheet from './BookingSheet';
import { STICKY_QUERY } from './layout';
import { PublicApp } from './PublicApp';
import { defaultSelection, slotInstant } from './slots';
import { createHarness, initTestI18n, stubIntersectionObserverAsNeverVisible } from './testHarness';

/**
 * The Book sheet (public-page HANDOFF §6.4, Book artboard): a progress line
 * (Table · Phone · Name), the table step with its window and the free-by
 * promise, the taken step listing what is free at the same time, the phone
 * step with Telegram first and the SMS code second, the name with an optional
 * note, and the three endings — booked, waiting for the venue, declined.
 */

beforeAll(async () => {
  await initTestI18n();
});

beforeEach(() => {
  stubIntersectionObserverAsNeverVisible();
  // Midday in Yerevan. These walk a booking made two hours out, which is short
  // notice — waiting for the venue — only while today still has times; at
  // 22:30 it rolled to tomorrow morning and confirmed at once, and the
  // pending and declined endings were never reached. The clock is pinned.
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-21T08:00:00Z'));
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (i18next.language !== 'en') await act(() => i18next.changeLanguage('en'));
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
  ).filter((entry) => entry.isBookable);
  const table = tables[0] as TableAvailability;
  expect(table).toBeDefined();
  return { harness, branch, slotUtc, table, tables };
}

type World = Awaited<ReturnType<typeof world>>;

function sheet(w: World, availability: TableAvailability = w.table, extra = {}) {
  return w.harness.wrap(
    <BookingSheet
      branch={w.branch}
      availability={availability}
      slotUtc={w.slotUtc}
      partySize={2}
      onClose={() => {}}
      onTableTaken={() => {}}
      {...extra}
    />,
  );
}

/** The backend's answer to "which ways of proving a phone are on" (#62). */
function channels(w: World, sms: boolean, telegram: boolean) {
  Object.assign(w.harness.gateway, {
    getPhoneProofChannels: () => Promise.resolve({ sms, telegram }),
  });
}

const progress = () => screen.queryByRole('list', { name: /^Step \d of 3$/u });
const currentStep = () => progress()?.querySelector('[aria-current="step"]')?.textContent ?? null;

async function toPhone(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Continue' }));
}

async function verifyBySms(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Phone number'), '77123456');
  await user.click(screen.getByRole('button', { name: 'Get a code by SMS' }));
  await user.type(await screen.findByLabelText('Code'), '123456');
}

describe('the progress line', () => {
  it('says Table, then Phone, then Name, and goes once the booking is made', async () => {
    const w = await world();
    const user = userEvent.setup();
    render(sheet(w));

    await screen.findByRole('button', { name: 'Continue' });
    expect(progress()!.getAttribute('aria-label')).toBe('Step 1 of 3');
    expect(currentStep()).toBe('Table');

    await toPhone(user);
    expect(progress()!.getAttribute('aria-label')).toBe('Step 2 of 3');
    expect(currentStep()).toBe('Phone');
    expect(screen.getByRole('heading', { level: 2, name: 'Your phone' })).toBeDefined();

    await verifyBySms(user);
    await screen.findByLabelText('Name for the booking');
    expect(progress()!.getAttribute('aria-label')).toBe('Step 3 of 3');
    expect(currentStep()).toBe('Name');

    await user.type(screen.getByLabelText('Name for the booking'), 'Ani');
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }));
    await screen.findByRole('heading', { name: 'Table booked' });
    expect(progress()).toBeNull();
  });

  it('goes back a step from the header, and straight to the name once the phone is proved', async () => {
    const w = await world();
    const user = userEvent.setup();
    render(sheet(w));
    await toPhone(user);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(currentStep()).toBe('Table');

    await toPhone(user);
    await verifyBySms(user);
    await screen.findByLabelText('Name for the booking');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(currentStep()).toBe('Phone');
  });
});

describe('the table step', () => {
  it('holds Continue until the free-by promise is ticked, and says why', async () => {
    const w = await world();
    const until =
      w.table.window?.untilUtc ?? new Date(Date.parse(w.slotUtc) + 90 * 60_000).toISOString();
    const user = userEvent.setup();
    render(sheet(w, { ...w.table, mustFreeByUtc: until }));

    const go = await screen.findByRole('button', { name: 'Continue' });
    expect(go.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Tick the promise above to continue')).toBeDefined();
    await user.click(go);
    expect(currentStep()).toBe('Table');

    await user.click(screen.getByRole('checkbox', { name: /^I will free the table by / }));
    expect(go.getAttribute('aria-disabled')).toBeNull();
    expect(screen.queryByText('Tick the promise above to continue')).toBeNull();
    await user.click(go);
    expect(currentStep()).toBe('Phone');
  });

  it('sums up when, how many and which table, with the window before the button', async () => {
    const w = await world();
    render(sheet(w, w.table, { roomName: 'Windows' }));
    await screen.findByRole('button', { name: 'Continue' });
    const summary = screen.getByText('When').closest('dl')!;
    expect(within(summary).getByText('2')).toBeDefined();
    const go = screen.getByRole('button', { name: 'Continue' });
    expect(summary.compareDocumentPosition(go) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      within(summary).getByText(`${w.table.tableLabel} · ${w.table.seats} seats · Windows`),
    ).toBeDefined();
  });
});

describe('the phone step', () => {
  it('offers Telegram first and the SMS code second', async () => {
    const w = await world();
    const user = userEvent.setup();
    render(sheet(w));
    await toPhone(user);

    const telegram = screen.getByRole('button', { name: 'Confirm with Telegram' });
    const sms = screen.getByRole('button', { name: 'Get a code by SMS' });
    expect(telegram.compareDocumentPosition(sms) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says a short number under the field, and sends nothing', async () => {
    const w = await world();
    const request = vi.spyOn(w.harness.gateway, 'requestPhoneCode');
    const user = userEvent.setup();
    render(sheet(w));
    await toPhone(user);

    const field = screen.getByLabelText('Phone number');
    await user.type(field, '77');
    await user.click(screen.getByRole('button', { name: 'Get a code by SMS' }));

    const error = screen.getByText('Write the whole number, for example 77 123456');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toContain(error.id);
    expect(request).not.toHaveBeenCalled();
  });

  it('offers only Telegram, and no number to type, when the backend sends no SMS', async () => {
    const w = await world();
    channels(w, false, true);
    const user = userEvent.setup();
    render(sheet(w));
    await toPhone(user);

    expect(await screen.findByRole('button', { name: 'Confirm with Telegram' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Get a code by SMS' })).toBeNull();
    expect(screen.queryByLabelText('Phone number')).toBeNull();
    // Not "fastest" when it is the only way.
    expect(screen.getByText('Confirm with Telegram: one tap, no code to type.')).toBeDefined();
    expect(screen.queryByText(/^Fastest with Telegram/u)).toBeNull();
  });

  it('closes the SMS door when the backend refuses to send a code, as it does Telegram', async () => {
    const w = await world();
    vi.spyOn(w.harness.gateway, 'requestPhoneCode').mockRejectedValue(
      new SmsUnavailableError({ url: '/api/auth/diner/request-code' }),
    );
    const user = userEvent.setup();
    render(sheet(w));
    await toPhone(user);
    await user.type(screen.getByLabelText('Phone number'), '77123456');
    await user.click(screen.getByRole('button', { name: 'Get a code by SMS' }));

    expect(
      await screen.findByText(
        'Codes by SMS are not available right now. Confirm with Telegram instead.',
      ),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Get a code by SMS' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirm with Telegram' })).toBeDefined();
  });

  it('says so when neither door is open', async () => {
    const w = await world();
    channels(w, false, false);
    const user = userEvent.setup();
    render(sheet(w));
    await toPhone(user);

    expect(
      await screen.findByText(
        'Confirming a phone number is not available right now. Try again later.',
      ),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Confirm with Telegram' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Get a code by SMS' })).toBeNull();
  });

  it('waits for Telegram with the link’s time left, and no code to fall back to without SMS', async () => {
    const w = await world();
    channels(w, false, true);
    vi.stubGlobal('open', () => null);
    const user = userEvent.setup();
    render(sheet(w));
    await toPhone(user);
    await user.click(await screen.findByRole('button', { name: 'Confirm with Telegram' }));

    expect(await screen.findByText('Waiting for Telegram…')).toBeDefined();
    expect(screen.getByRole('heading', { level: 2, name: 'Confirm with Telegram' })).toBeDefined();
    expect(screen.getByText(/^The link works for another \d+:\d\d$/u)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Check now' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Get a code instead' })).toBeNull();
  });
});

describe('the name step', () => {
  it('asks for the name rather than booking without one', async () => {
    const w = await world();
    const create = vi.spyOn(w.harness.gateway, 'createBooking');
    const user = userEvent.setup();
    render(sheet(w));
    await toPhone(user);
    await verifyBySms(user);

    await user.click(await screen.findByRole('button', { name: 'Confirm booking' }));
    expect(screen.getByText('Write the name')).toBeDefined();
    expect(screen.getByLabelText('Name for the booking').getAttribute('aria-invalid')).toBe('true');
    expect(create).not.toHaveBeenCalled();
  });

  it('sends the optional note to the venue with the booking', async () => {
    const w = await world();
    const create = vi.spyOn(w.harness.gateway, 'createBooking');
    const user = userEvent.setup();
    render(sheet(w));
    await toPhone(user);
    await verifyBySms(user);

    await user.type(await screen.findByLabelText('Name for the booking'), 'Ani');
    const note = screen.getByLabelText(/^Note to the venue/u);
    expect(note.getAttribute('maxlength')).toBe('500');
    await user.type(note, 'Birthday');
    expect(screen.getByText('8 / 500 · only the venue sees it')).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }));

    await screen.findByRole('heading', { name: 'Table booked' });
    expect(create.mock.calls[0]![0].note).toBe('Birthday');
    const { upcoming } = await w.harness.gateway.listBookings();
    expect(upcoming[0]?.note).toBe('Birthday');
  });

  it('sends no note when none was written', async () => {
    const w = await world();
    const create = vi.spyOn(w.harness.gateway, 'createBooking');
    const user = userEvent.setup();
    render(sheet(w));
    await toPhone(user);
    await verifyBySms(user);
    await user.type(await screen.findByLabelText('Name for the booking'), 'Ani');
    await user.type(screen.getByLabelText(/^Note to the venue/u), '   ');
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }));

    await screen.findByRole('heading', { name: 'Table booked' });
    expect(create.mock.calls[0]![0].note ?? null).toBeNull();
  });
});

describe('the endings', () => {
  it('gives the code, the calendar, and the manage link with a copy button', async () => {
    const w = await world();
    const onClose = vi.fn();
    const user = userEvent.setup();
    // After `setup`, which puts a clipboard of its own on the navigator.
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(sheet(w, w.table, { onClose }));
    await toPhone(user);
    await verifyBySms(user);
    await user.type(await screen.findByLabelText('Name for the booking'), 'Ani');
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }));

    await screen.findByRole('heading', { name: 'Table booked' });
    expect(screen.getByRole('heading', { level: 2, name: 'All set' })).toBeDefined();
    const { upcoming } = await w.harness.gateway.listBookings();
    expect(screen.getByText(upcoming[0]!.code)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Add to my calendar' })).toBeDefined();

    const link = screen.getByRole('link', { name: /\/booking\// });
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(link.getAttribute('href'));
    expect(screen.getByRole('button', { name: 'Copied' })).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Back to the venue page' }));
    expect(onClose).toHaveBeenCalled();
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('waits for the venue with the countdown and the booking page, no calendar yet', async () => {
    const w = await world({ floorApprovesAtOnce: false });
    const booking = await bookDirect(w);
    expect(booking.status).toBe('pendingApproval');
    render(w.harness.wrap(<BookingDone booking={booking} branch={w.branch} onClose={() => {}} />));

    // The head and the title say different things: not "Request sent" twice.
    expect(await screen.findByRole('heading', { level: 2, name: 'Your request' })).toBeDefined();
    expect(screen.getByRole('heading', { level: 3, name: 'Request sent' })).toBeDefined();
    expect(screen.getByRole('timer').textContent).toMatch(/answer within/u);
    expect(screen.getByText('This page updates by itself.')).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Open the booking page' }).getAttribute('href'),
    ).toContain(`/booking/${booking.manageToken}`);
    expect(screen.queryByRole('button', { name: 'Add to my calendar' })).toBeNull();
  });

  it('offers another time once the venue declined', async () => {
    const w = await world({ floorApprovesAtOnce: false, approvalWindowMs: 1 });
    const booking = await bookDirect(w);
    // Past the 1 ms answer window on the pinned clock, so the confirmation's
    // first read finds it declined. Waiting 20 ms for the clock's own 20 ms
    // step left that to a race, lost to the next read at the 15 s poll.
    vi.setSystemTime(Date.now() + 1_000);
    const onChooseAnotherTime = vi.fn();
    render(
      w.harness.wrap(
        <BookingDone
          booking={booking}
          branch={w.branch}
          onClose={() => {}}
          onChooseAnotherTime={onChooseAnotherTime}
        />,
      ),
    );

    expect(
      await screen.findByRole('heading', { level: 2, name: 'It did not work out' }),
    ).toBeDefined();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Choose another time' }));
    expect(onChooseAnotherTime).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Add to my calendar' })).toBeNull();
  });
});

async function bookDirect(w: World): Promise<Booking> {
  return w.harness.gateway.createBooking({
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
}

describe('dates in the sheet', () => {
  it('writes the free-cancellation day in Armenian from our own words', async () => {
    const w = await world();
    await act(() => i18next.changeLanguage('hy'));
    // Three days out: a date, not "today" or "tomorrow".
    const later = new Date(Date.now() + 3 * 86_400_000).toISOString();
    render(sheet(w, { ...w.table, freeCancellationUntilUtc: later }));

    const line = await screen.findByText(/^Անվճար չեղարկում մինչև /u);
    expect(line.textContent).toMatch(/\d{1,2} [ա-ֆ]+ի, \d{2}:\d{2}/u);
    expect(line.textContent).not.toMatch(/[A-Za-z]/u);
  });
});

describe('a table taken while it was being confirmed', () => {
  function stubWide() {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === STICKY_QUERY,
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

  async function loseTheTable() {
    Reflect.deleteProperty(globalThis, 'IntersectionObserver');
    stubWide();
    const harness = createHarness({ floorApprovesAtOnce: true, simulateTableTaken: true });
    const create = vi.spyOn(harness.gateway, 'createBooking');
    render(harness.wrap(<PublicApp />, '/lumen-coffee/northern-avenue'));
    const user = userEvent.setup();
    const pins = (await screen.findAllByRole('button', { name: /^Table .+, free$/u })).filter(
      (pin) => pin.getAttribute('aria-disabled') !== 'true',
    );
    const label = pins[0]!.textContent!;
    await user.click(pins[0]!);
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
    return { harness, create, user, label };
  }

  it('stays open on the taken step, in red with the focus, listing what is free then', async () => {
    const { label } = await loseTheTable();
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByRole('heading', {
        level: 2,
        name: 'This table is no longer free',
      }),
    ).toBeDefined();
    const notice = within(dialog).getByText(
      `Table ${label} was just booked by someone else. Your day, time and guests are kept: choose another table.`,
    );
    expect(notice.closest('.pub-note')!.classList.contains('is-red')).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(notice.closest('.pub-note')));
    expect(progress()).toBeNull();

    const list = within(dialog).getByRole('list', { name: 'Free at the same time' });
    const options = within(list).getAllByRole('button');
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      expect(option.querySelector('b')!.textContent).toMatch(/^Table \S+ · \d+ seats?$/u);
      expect(option.querySelector('b')!.textContent).not.toMatch(
        new RegExp(`^Table ${label} ·`, 'u'),
      );
    }
  });

  it('makes a new attempt on a table picked there: a new command id, the phone kept', async () => {
    const { create, user } = await loseTheTable();
    const dialog = await screen.findByRole('dialog');
    const list = await within(dialog).findByRole('list', { name: 'Free at the same time' });
    const option = within(list).getAllByRole('button')[0]!;
    const picked = /^Table (\S+) ·/u.exec(option.querySelector('b')!.textContent!)![1]!;
    await user.click(option);

    expect(currentStep()).toBe('Table');
    expect(
      within(screen.getByRole('dialog')).getByRole('heading', {
        level: 2,
        name: new RegExp(`^Table ${picked}( ·|$)`, 'u'),
      }),
    ).toBeDefined();
    const checkbox = screen.queryByRole('checkbox');
    if (checkbox) await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    // Still proved: straight to the name.
    expect(currentStep()).toBe('Name');
    await user.click(screen.getByRole('button', { name: /^(Confirm booking|Request table)$/u }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    const [first, second] = [create.mock.calls[0]![0], create.mock.calls[1]![0]];
    expect(second.commandId).not.toBe(first.commandId);
    expect(second.tableId).not.toBe(first.tableId);
    expect(
      await screen.findByRole('heading', { name: /^(Table booked|Request sent)$/u }),
    ).toBeDefined();
  });

  it('goes back to the room on "See the room", where the page says which table went', async () => {
    const { label, user } = await loseTheTable();
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByRole('button', { name: 'See the room' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const card = screen.getByRole('region', { name: 'Book a table' });
    const notice = await waitFor(() => {
      const found = card.querySelector<HTMLElement>('.pub-notice-error');
      if (!found) throw new Error('no notice yet');
      return found;
    });
    expect(notice.textContent).toBe(`Table ${label} was just taken. Here is what is free now.`);
    await waitFor(() => expect(document.activeElement).toBe(notice));
  });
});
