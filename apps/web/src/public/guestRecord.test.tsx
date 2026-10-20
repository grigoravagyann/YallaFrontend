// @vitest-environment jsdom
import {
  BookingBlockedNoShowsError,
  BookingOverlapsOwnError,
  PhoneHasActiveBookingError,
  type PublicBranch,
  type TableAvailability,
} from '@yalla/api';
import { i18next } from '@yalla/i18n';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import BookingSheet from './BookingSheet';
import { PublicApp } from './PublicApp';
import { addDays, branchToday, defaultSelection, slotInstant } from './slots';
import {
  bookAtLumen,
  createHarness,
  initTestI18n,
  stubIntersectionObserverAsNeverVisible,
} from './testHarness';

/**
 * The guest record (2026-10-20): no booking without a proved number, at most
 * three active bookings per number, no two of one guest's sittings close
 * together anywhere, and a week's block after three no-shows in three days.
 *
 * On the page that means: the phone step offers only the ways to prove the
 * number; each new refusal is said in the page's own words — the next booking
 * named, the block's end, the other venue — with our own day words, never
 * `Intl`'s (which writes hy dates in English); and before the booking is sent
 * the visitor is told what venues will see of their record.
 */

const URL_TAG = 'mock://test';
const RECORD_LINE =
  'Venues you book with see how many of your bookings in the last 12 months you kept, missed or cancelled late — just the numbers, never where.';

beforeAll(async () => {
  await initTestI18n();
});

beforeEach(() => {
  stubIntersectionObserverAsNeverVisible();
  // Midday in Yerevan, Wednesday 21 October 2026: a booking two hours out is today.
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-21T08:00:00Z'));
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (i18next.language !== 'en') await act(() => i18next.changeLanguage('en'));
});

async function world() {
  const harness = createHarness({ floorApprovesAtOnce: true });
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
  const table = (
    await harness.gateway.getTableAvailability({
      branchId: branch.id,
      slotUtc,
      partySize: 2,
      timeZoneId: branch.timeZoneId,
    })
  ).find((entry) => entry.isBookable) as TableAvailability;
  expect(table).toBeDefined();
  return { harness, branch, slotUtc, table };
}

type World = Awaited<ReturnType<typeof world>>;

function sheet(w: World) {
  return w.harness.wrap(
    <BookingSheet
      branch={w.branch}
      availability={w.table}
      slotUtc={w.slotUtc}
      partySize={2}
      onClose={() => {}}
      onTableTaken={() => {}}
    />,
  );
}

async function toPhone(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Continue' }));
  await screen.findByRole('heading', { level: 2, name: 'Your phone' });
}

/** Through the phone step by SMS to the name step, named; returns the send button. */
async function toName(user: ReturnType<typeof userEvent.setup>) {
  await toPhone(user);
  await user.type(await screen.findByLabelText('Phone number'), '77123456');
  await user.click(screen.getByRole('button', { name: 'Get a code by SMS' }));
  await user.type(await screen.findByLabelText('Code'), '123456');
  await user.type(await screen.findByLabelText('Name for the booking'), 'Ani');
  return screen.getByRole('button', { name: /^(Confirm booking|Request table)$/u });
}

/** The booking refused with `error`, from the name step; the alert's text. */
async function refusedWith(error: Error, language: 'en' | 'hy' = 'en') {
  const w = await world();
  vi.spyOn(w.harness.gateway, 'createBooking').mockRejectedValue(error);
  const user = userEvent.setup();
  render(sheet(w));
  const send = await toName(user);
  if (language !== 'en') await act(() => i18next.changeLanguage(language));
  await user.click(send);
  return { w, text: (await screen.findByRole('alert')).textContent ?? '' };
}

/** Thursday 22 October 2026, 19:30 in Yerevan: the caller's next booking. */
const HELD = {
  reservationId: 'r-next',
  code: 'K7Q2LM',
  startUtc: '2026-10-22T15:30:00Z',
  localDate: '2026-10-22',
  localStartTime: '19:30',
  venueName: 'Café Aram',
  branchName: 'Main',
};

describe('no booking without a proved number', () => {
  it('offers only Telegram and the SMS code on the phone step', async () => {
    const w = await world();
    const user = userEvent.setup();
    render(sheet(w));
    await toPhone(user);

    const step = screen.getByRole('button', { name: 'Confirm with Telegram' }).closest('form')!;
    expect(
      within(step)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Confirm with Telegram', 'Get a code by SMS']);
    expect(screen.queryByRole('button', { name: 'Continue without verifying' })).toBeNull();
    expect(screen.queryByText(/without verifying|without a verified number/iu)).toBeNull();
  });
});

describe('the number rules, said on the Book sheet', () => {
  it('names the next booking when the number holds three already', async () => {
    const { text } = await refusedWith(
      new PhoneHasActiveBookingError({ url: URL_TAG, maxActiveBookings: 3, held: HELD }),
    );
    expect(text).toBe(
      'You already have 3 active bookings — the most one phone number can hold. Cancel one (the next is Café Aram, Thu 22 October at 19:30) and try again.',
    );
  });

  it('says how many without naming one when the server names none', async () => {
    const { text } = await refusedWith(
      new PhoneHasActiveBookingError({ url: URL_TAG, maxActiveBookings: 3 }),
    );
    expect(text).toBe(
      'You already have 3 active bookings — the most one phone number can hold. Cancel one, or wait until one is over.',
    );
  });

  it('names the next booking’s day in our own Armenian words', async () => {
    const { text } = await refusedWith(
      new PhoneHasActiveBookingError({ url: URL_TAG, maxActiveBookings: 3, held: HELD }),
      'hy',
    );
    expect(text).toContain('Café Aram, հնգ, 22 հոկտեմբերի, ժամը 19:30');
    expect(text).not.toMatch(/Oct/u);
  });

  it('says until when booking is blocked after three no-shows', async () => {
    // Wednesday 28 October, 11:30 in Yerevan.
    const { text } = await refusedWith(
      new BookingBlockedNoShowsError({ url: URL_TAG, blockedUntilUtc: '2026-10-28T07:30:00Z' }),
    );
    expect(text).toBe(
      "You can't book until Wed 28 October, 11:30, because of three missed bookings in three days.",
    );
  });

  it('says the block’s end in our own Armenian words', async () => {
    const { text } = await refusedWith(
      new BookingBlockedNoShowsError({ url: URL_TAG, blockedUntilUtc: '2026-10-28T07:30:00Z' }),
      'hy',
    );
    expect(text).toContain('մինչև չրք, 28 հոկտեմբերի, ժամը 11:30');
    expect(text).not.toMatch(/Oct/u);
  });

  it('says a week when the server gives no end', async () => {
    const { text } = await refusedWith(new BookingBlockedNoShowsError({ url: URL_TAG }));
    expect(text).toBe("You can't book for a week because of three missed bookings in three days.");
  });
});

describe('an overlap with the visitor’s own booking elsewhere', () => {
  function overlap(place: { venueName: string; branchName: string }, localDate: string) {
    return new BookingOverlapsOwnError({
      url: URL_TAG,
      existingReservationId: 'r-held',
      existingCode: 'Y3200',
      localDate,
      localStartTime: '19:30',
      tableLabel: '4',
      ...place,
    });
  }

  async function refusedOverlap(place: { venueName: string; branchName: string }, nextDay = false) {
    const w = await world();
    const day = branchToday(w.branch.timeZoneId, new Date(w.slotUtc));
    vi.spyOn(w.harness.gateway, 'createBooking').mockRejectedValue(
      overlap(place, nextDay ? addDays(day, 1) : day),
    );
    const user = userEvent.setup();
    render(sheet(w));
    await user.click(await toName(user));
    return { w, text: (await screen.findByRole('alert')).textContent ?? '' };
  }

  it('names the other venue', async () => {
    const { text } = await refusedOverlap({ venueName: 'Café Aram', branchName: 'Main' });
    expect(text).toBe(
      'You already have a booking at Café Aram at 19:30, too close to this time. Change that booking, or cancel it first.',
    );
  });

  it('names the other venue and the day when it is another day', async () => {
    const { w, text } = await refusedOverlap({ venueName: 'Café Aram', branchName: 'Main' }, true);
    const next = new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      timeZone: w.branch.timeZoneId,
    }).format(new Date(Date.parse(w.slotUtc) + 86_400_000));
    expect(text).toBe(
      `You already have a booking at Café Aram on ${next} at 19:30, too close to this time. Change that booking, or cancel it first.`,
    );
  });

  it('names the other branch of the same venue', async () => {
    const { w, text } = await refusedOverlap({ venueName: 'Lumen Coffee', branchName: 'Opera' });
    expect(w.branch.venue.name).toBe('Lumen Coffee');
    expect(text).toBe(
      'You already have a booking at Lumen Coffee, Opera at 19:30, too close to this time. Change that booking, or cancel it first.',
    );
  });

  it('keeps the words for one here', async () => {
    const w = await world();
    const { text } = await refusedOverlap({
      venueName: w.branch.venue.name,
      branchName: w.branch.name,
    });
    expect(text).toBe(
      'You already have a booking here at 19:30 (table 4). Change or cancel that one first.',
    );
  });
});

describe('what venues see of the visitor’s record', () => {
  it('is said on the last step, before the booking is sent', async () => {
    const w = await world();
    const user = userEvent.setup();
    render(sheet(w));
    const send = await toName(user);

    const line = screen.getByText(RECORD_LINE);
    expect(line.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is said in Armenian and Russian too', async () => {
    for (const language of ['hy', 'ru'] as const) {
      const said = i18next.t('sheet.name.record', { ns: 'public', lng: language });
      expect(said).not.toBe('sheet.name.record');
      expect(said).toContain('12');
    }
  });
});

describe('a change from the manage link while blocked', () => {
  it('says until when, in the page’s words, and keeps the booking as it is', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    vi.spyOn(harness.publicGateway, 'rescheduleManagedBooking').mockRejectedValue(
      new BookingBlockedNoShowsError({ url: URL_TAG, blockedUntilUtc: '2026-10-28T07:30:00Z' }),
    );
    const { booking } = await bookAtLumen(harness);
    const user = userEvent.setup();
    render(harness.wrap(<PublicApp />, `/booking/${booking.manageToken}?lang=en`));
    await user.click(await screen.findByRole('button', { name: 'Change time or guests' }));
    const card = await screen.findByRole('region', { name: 'Change time or guests' });
    await user.click(within(card).getByRole('button', { name: 'Fewer guests' }));
    const save = within(card).getByRole('button', { name: 'Save the change' });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    await user.click(save);

    expect(
      await within(card).findByText(
        "You can't change bookings until Wed 28 October, 11:30, because of three missed bookings in three days.",
      ),
    ).toBeDefined();
    // Cancelling is still there once the card is closed.
    await user.click(within(card).getByRole('button', { name: 'Keep it as it is' }));
    expect(await screen.findByRole('button', { name: 'Cancel this booking' })).toBeDefined();
  });

  it('names the other venue when the new time is too close to a booking there', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    vi.spyOn(harness.publicGateway, 'rescheduleManagedBooking').mockRejectedValue(
      new BookingOverlapsOwnError({
        url: URL_TAG,
        existingReservationId: 'r-held',
        localDate: null,
        localStartTime: '19:30',
        tableLabel: '4',
        venueName: 'Café Aram',
        branchName: 'Main',
      }),
    );
    const { booking } = await bookAtLumen(harness);
    const user = userEvent.setup();
    render(harness.wrap(<PublicApp />, `/booking/${booking.manageToken}?lang=en`));
    await user.click(await screen.findByRole('button', { name: 'Change time or guests' }));
    const card = await screen.findByRole('region', { name: 'Change time or guests' });
    await user.click(within(card).getByRole('button', { name: 'Fewer guests' }));
    const save = within(card).getByRole('button', { name: 'Save the change' });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    await user.click(save);

    expect(
      await within(card).findByText(
        'You already have a booking at Café Aram at 19:30, too close to this time. Change that booking, or cancel it first.',
      ),
    ).toBeDefined();
  });
});
