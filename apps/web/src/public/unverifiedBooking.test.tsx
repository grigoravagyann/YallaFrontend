// @vitest-environment jsdom
import {
  DeviceHasActiveBookingError,
  NetworkError,
  PhoneHasActiveBookingError,
  TooManyRequestsError,
  UnverifiedPartyTooLargeError,
  UnverifiedQueueFullError,
  type PublicBranch,
  type TableAvailability,
  type UnverifiedBookingCommand,
} from '@yalla/api';
import { i18next } from '@yalla/i18n';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import BookingSheet from './BookingSheet';
import { PublicApp } from './PublicApp';
import { defaultSelection, slotInstant } from './slots';
import { createHarness, initTestI18n, stubIntersectionObserverAsNeverVisible } from './testHarness';
import { browserDeviceId, keepManageToken, keptManageToken } from './unverifiedBooking';

/**
 * Booking without proving the number (unverified guests, 2026-10-20): the
 * door beside "Confirm with Telegram", said honestly before it is taken — the
 * venue may confirm first, Telegram is instant, the party cap — then the
 * number and the name, the booking waiting for the venue, its link kept
 * because no reminder will come, and every new refusal in its own words.
 * Nothing goes into browser storage; the browser's id lives in memory.
 */

beforeAll(async () => {
  await initTestI18n();
});

beforeEach(() => {
  stubIntersectionObserverAsNeverVisible();
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  // Midday in Yerevan, so a booking two hours out is today.
  vi.setSystemTime(new Date('2026-10-21T08:00:00Z'));
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (i18next.language !== 'en') await act(() => i18next.changeLanguage('en'));
});

async function world(partySize = 2) {
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
    partySize,
  };
  const slotUtc = slotInstant(selection, branch.timeZoneId)!.toISOString();
  const table = (
    await harness.gateway.getTableAvailability({
      branchId: branch.id,
      slotUtc,
      partySize,
      timeZoneId: branch.timeZoneId,
    })
  ).find((entry) => entry.isBookable) as TableAvailability;
  expect(table).toBeDefined();
  return { harness, branch, slotUtc, table, partySize };
}

type World = Awaited<ReturnType<typeof world>>;

function sheet(w: World, branch: PublicBranch = w.branch) {
  return w.harness.wrap(
    <BookingSheet
      branch={branch}
      availability={w.table}
      slotUtc={w.slotUtc}
      partySize={w.partySize}
      onClose={() => {}}
      onTableTaken={() => {}}
    />,
  );
}

const WITHOUT = 'Continue without verifying';

async function toPhone(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Continue' }));
  await screen.findByRole('heading', { level: 2, name: 'Your phone' });
}

async function bookWithoutProof(user: ReturnType<typeof userEvent.setup>, local = '77 123456') {
  await toPhone(user);
  await user.click(await screen.findByRole('button', { name: WITHOUT }));
  await user.type(await screen.findByLabelText('Phone number'), local);
  await user.type(screen.getByLabelText('Name for the booking'), 'Ani');
  await user.click(screen.getByRole('button', { name: 'Request table' }));
}

describe('the door without proof, on the phone step', () => {
  it('is offered beside Telegram, saying the venue confirms first, Telegram is instant, and the cap', async () => {
    const w = await world();
    const user = userEvent.setup();
    render(sheet(w));
    await toPhone(user);

    expect(screen.getByRole('button', { name: 'Confirm with Telegram' })).toBeDefined();
    expect(screen.getByRole('button', { name: WITHOUT })).toBeDefined();
    expect(
      screen.getByText(
        'No Telegram? You can book without verifying your number, for parties of up to 6. The venue then confirms the booking itself first; with Telegram it is confirmed at once.',
      ),
    ).toBeDefined();
  });

  it('says what a booking without proof loses where the venue does not confirm first', async () => {
    const w = await world();
    const user = userEvent.setup();
    render(
      sheet(w, {
        ...w.branch,
        policy: { ...w.branch.policy, unverifiedBookingsNeedApproval: false },
      }),
    );
    await toPhone(user);

    expect(
      screen.getByText(/cannot be changed online later, only cancelled; with Telegram/u),
    ).toBeDefined();
  });

  it('is not offered to a party over the cap, and says why', async () => {
    const w = await world();
    const user = userEvent.setup();
    render(sheet(w, { ...w.branch, policy: { ...w.branch.policy, unverifiedMaxPartySize: 1 } }));
    await toPhone(user);

    expect(screen.queryByRole('button', { name: WITHOUT })).toBeNull();
    expect(
      screen.getByText(
        'Without a verified number this venue takes bookings for parties of up to 1. Confirm your number with Telegram to book for more.',
      ),
    ).toBeDefined();
  });
});

describe('booking without proof', () => {
  it('books under the typed number and this page’s id, and waits for the venue with its link', async () => {
    const w = await world();
    const user = userEvent.setup();
    const create = vi.spyOn(w.harness.publicGateway, 'createUnverifiedBooking');
    const stored = vi.spyOn(Storage.prototype, 'setItem');
    render(sheet(w));

    await bookWithoutProof(user);

    expect(await screen.findByRole('heading', { level: 2, name: 'Your request' })).toBeDefined();
    expect(screen.getByText('Request sent')).toBeDefined();
    expect(
      screen.getByText('The venue confirms bookings made without a verified number itself.'),
    ).toBeDefined();
    // No reminder will come: the link is the way back, and it is said.
    expect(
      screen.getByText(/We send no reminders for a booking made without a verified number/u),
    ).toBeDefined();
    const link = screen.getByRole('link', { name: /\/booking\/mbk_/u });
    expect(link.getAttribute('href')).toMatch(/\/booking\/mbk_/u);

    const command = create.mock.calls[0]![0] as UnverifiedBookingCommand;
    expect(command.guestPhone).toBe('+37477123456');
    expect(command.guestName).toBe('Ani');
    expect(command.deviceId).toBe(browserDeviceId());
    // Nothing in browser storage — not the id, not the token.
    expect(stored).not.toHaveBeenCalled();
  });

  it('sends the same id from every sheet on the page', async () => {
    const w = await world();
    const user = userEvent.setup();
    const create = vi
      .spyOn(w.harness.publicGateway, 'createUnverifiedBooking')
      .mockRejectedValue(new UnverifiedQueueFullError({ url: '/x' }));
    const first = render(sheet(w));
    await bookWithoutProof(user);
    await screen.findByText(/too many unconfirmed bookings/u);
    first.unmount();

    render(sheet(w));
    await bookWithoutProof(user);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1]![0].deviceId).toBe(create.mock.calls[0]![0].deviceId);
    // A new attempt is a new command, under the same browser.
    expect(create.mock.calls[1]![0].commandId).not.toBe(create.mock.calls[0]![0].commandId);
  });

  it('asks for the whole number before sending', async () => {
    const w = await world();
    const user = userEvent.setup();
    const create = vi.spyOn(w.harness.publicGateway, 'createUnverifiedBooking');
    render(sheet(w));

    await bookWithoutProof(user, '771');

    expect(await screen.findByText('Write the whole number, for example 77 123456')).toBeDefined();
    expect(create).not.toHaveBeenCalled();
  });

  it('goes back to Telegram from the name step', async () => {
    const w = await world();
    const user = userEvent.setup();
    render(sheet(w));
    await toPhone(user);
    await user.click(screen.getByRole('button', { name: WITHOUT }));
    await screen.findByLabelText('Name for the booking');

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('button', { name: 'Confirm with Telegram' })).toBeDefined();
  });

  it('checks again under the same command, and says when the link cannot be shown', async () => {
    const w = await world();
    const user = userEvent.setup();
    const real = w.harness.publicGateway.createUnverifiedBooking.bind(w.harness.publicGateway);
    const create = vi
      .spyOn(w.harness.publicGateway, 'createUnverifiedBooking')
      .mockImplementationOnce(async (command) => {
        // Booked on the server; the answer lost on the way back.
        await real(command);
        throw new NetworkError({ url: '/x' });
      });
    render(sheet(w));

    await bookWithoutProof(user);
    await user.click(await screen.findByRole('button', { name: 'Check again' }));

    expect(await screen.findByText('Request sent')).toBeDefined();
    expect(create.mock.calls[1]![0].commandId).toBe(create.mock.calls[0]![0].commandId);
    // The replay carries no token, and none was kept: said, with the venue's number.
    expect(
      screen.getByText(
        "We could not show this booking's link. Note the code; to cancel, call the venue.",
      ),
    ).toBeDefined();
  });
});

describe('the refusals without proof', () => {
  const cases: readonly [string, Error, RegExp, boolean][] = [
    [
      'the number already holds a booking — naming nothing',
      new PhoneHasActiveBookingError({ url: '/x' }),
      /^This phone number already has an active booking\. Cancel it from its link first, or use that booking\.$/u,
      false,
    ],
    [
      'this browser already holds one',
      new DeviceHasActiveBookingError({ url: '/x' }),
      /^You already have a booking made from this browser without a verified number\./u,
      true,
    ],
    [
      'the party is over the cap',
      new UnverifiedPartyTooLargeError({ url: '/x', partySize: 8, maxPartySize: 6 }),
      /^Without a verified number this venue takes bookings for up to 6\./u,
      true,
    ],
    [
      'the venue has too many waiting',
      new UnverifiedQueueFullError({ url: '/x' }),
      /^This venue has too many unconfirmed bookings right now\./u,
      true,
    ],
    [
      'the network booked too many this hour',
      new TooManyRequestsError({ url: '/x', retryAfterSeconds: 900 }),
      /^Too many bookings without a verified number were made from this network/u,
      true,
    ],
  ];

  it.each(cases)('says so when %s', async (_name, error, text, offersTelegram) => {
    const w = await world();
    const user = userEvent.setup();
    vi.spyOn(w.harness.publicGateway, 'createUnverifiedBooking').mockRejectedValue(error);
    render(sheet(w));

    await bookWithoutProof(user);

    expect((await screen.findByRole('alert')).textContent).toMatch(text);
    // Proving the number lifts every limit but the number's own booking.
    expect(Boolean(screen.queryByRole('button', { name: 'Confirm with Telegram instead' }))).toBe(
      offersTelegram,
    );
  });

  it('takes the visitor to Telegram from a refusal proof lifts', async () => {
    const w = await world();
    const user = userEvent.setup();
    vi.spyOn(w.harness.publicGateway, 'createUnverifiedBooking').mockRejectedValue(
      new UnverifiedQueueFullError({ url: '/x' }),
    );
    render(sheet(w));
    await bookWithoutProof(user);

    await user.click(await screen.findByRole('button', { name: 'Confirm with Telegram instead' }));
    expect(await screen.findByRole('button', { name: 'Confirm with Telegram' })).toBeDefined();
  });
});

describe('the manage link of a booking without proof', () => {
  async function unverifiedLink() {
    const w = await world();
    const result = await w.harness.publicGateway.createUnverifiedBooking({
      branchId: w.branch.id,
      commandId: crypto.randomUUID(),
      tableId: w.table.tableId,
      slotUtc: w.slotUtc,
      timeZoneId: w.branch.timeZoneId,
      partySize: 2,
      guestName: 'Ani',
      guestPhone: '+374 77 123456',
      deviceId: 'device-for-the-link',
    });
    expect(result.manageToken).toBeTruthy();
    return { w, url: `/booking/${result.manageToken}` };
  }

  it('says the number is not verified, offers no change and says why, and still cancels', async () => {
    const { w, url } = await unverifiedLink();
    render(w.harness.wrap(<PublicApp />, url));

    expect(await screen.findByText('Number not verified')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Change time or guests' })).toBeNull();
    expect(
      screen.getByText(
        'A booking made without a verified phone number cannot be changed online. Cancel it and book again, or call the venue.',
      ),
    ).toBeDefined();
    expect(
      screen.getByText('The venue confirms bookings made without a verified number itself.'),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Cancel this booking' })).toBeDefined();
  });
});

describe('the token kept in memory', () => {
  it('is found again by the command that made it, and only a real one is kept', () => {
    keepManageToken('cmd-1', 'mbk_one');
    keepManageToken('cmd-2', null);
    expect(keptManageToken('cmd-1')).toBe('mbk_one');
    expect(keptManageToken('cmd-2')).toBeNull();
  });
});
