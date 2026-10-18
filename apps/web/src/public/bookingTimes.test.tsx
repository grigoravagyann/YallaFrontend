// @vitest-environment jsdom
import type { PublicBranch } from '@yalla/api';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PublicApp } from './PublicApp';
import { addDays, branchToday, slotInstant } from './slots';
import { createHarness, initTestI18n } from './testHarness';

/**
 * Booking times on the manage link: a web booking made with the promise to
 * free the table before the next one says so — the visitor has no app, no
 * push and no other place to read it back.
 */

beforeAll(async () => {
  await initTestI18n();
});

afterEach(cleanup);

describe('the manage link of a booking the next one cuts short', () => {
  it('reads the promise back: "You will free the table by …"', async () => {
    const harness = createHarness();
    const branch = (await harness.publicGateway.resolveBranch({
      venueSlug: 'lumen-coffee',
      branchSlug: 'northern-avenue',
    })) as PublicBranch;
    const date = addDays(branchToday(branch.timeZoneId), 2);
    const at = (time: string) =>
      slotInstant({ date, time, partySize: 2 }, branch.timeZoneId)!.toISOString();

    // The next booking on the table: 14:00 that day.
    const floor = await harness.gateway.getTableAvailability({
      branchId: branch.id,
      slotUtc: at('14:00'),
      partySize: 2,
      timeZoneId: branch.timeZoneId,
    });
    const table = floor.find((entry) => entry.isBookable)!;
    const book = (slotUtc: string, commandId: string, acceptsFreeByUtc?: string) =>
      harness.gateway.createBooking({
        commandId,
        branchId: branch.id,
        tableId: table.tableId,
        slotUtc,
        timeZoneId: branch.timeZoneId,
        partySize: 2,
        guestName: 'Ani',
        guestPhone: '+37477123456',
        channel: 'web',
        ...(acceptsFreeByUtc ? { acceptsFreeByUtc } : {}),
      });
    await book(at('14:00'), '1b4c0bdd-6b65-4073-8db4-4655617e1d01');

    // 13:00 runs into it: taken only with the promise to be gone by 13:55.
    const cut = await book(at('13:00'), '1b4c0bdd-6b65-4073-8db4-4655617e1d02', at('13:55'));
    expect(cut.promisedFreeByUtc).toBe(at('13:55'));

    render(
      harness.wrap(
        <PublicApp />,
        `/${branch.venue.slug}/${branch.slug}/booking/${cut.manageToken}`,
      ),
    );

    expect(await screen.findByText('Your booking')).toBeDefined();
    expect(screen.getByText('You will free the table by 13:55')).toBeDefined();
  });
});

describe('the manage link of a booking waiting on the guest before', () => {
  it('names the venue when the venue rings them, with its two hours', async () => {
    const harness = createHarness();
    const branch = (await harness.publicGateway.resolveBranch({
      venueSlug: 'lumen-coffee',
      branchSlug: 'northern-avenue',
    })) as PublicBranch;
    const date = addDays(branchToday(branch.timeZoneId), 2);
    const slotUtc = slotInstant(
      { date, time: '19:45', partySize: 2 },
      branch.timeZoneId,
    )!.toISOString();
    const table = (
      await harness.gateway.getTableAvailability({
        branchId: branch.id,
        slotUtc,
        partySize: 2,
        timeZoneId: branch.timeZoneId,
      })
    ).find((entry) => entry.isBookable)!;
    const made = await harness.gateway.createBooking({
      commandId: '1b4c0bdd-6b65-4073-8db4-4655617e1d03',
      branchId: branch.id,
      tableId: table.tableId,
      slotUtc,
      timeZoneId: branch.timeZoneId,
      partySize: 2,
      guestName: 'Ani',
      guestPhone: '+37477123456',
      channel: 'web',
    });
    const real = harness.publicGateway.getManagedBooking.bind(harness.publicGateway);
    // The guest before booked on the web: the venue rings them, within two hours.
    vi.spyOn(harness.publicGateway, 'getManagedBooking').mockImplementation(async (input) => {
      const booking = await real(input);
      return (
        booking && {
          ...booking,
          status: 'pendingApproval',
          awaitingApprovalBecause: 'earlierGuestConsent',
          approvalExpiresAtUtc: new Date(Date.now() + 100 * 60_000).toISOString(),
          awaitsEarlierGuestAnswer: false,
        }
      );
    });

    render(
      harness.wrap(
        <PublicApp />,
        `/${branch.venue.slug}/${branch.slug}/booking/${made.manageToken}`,
      ),
    );

    expect(
      await screen.findByText(
        'The venue will ask the guest before you whether they will have left by then.',
      ),
    ).toBeDefined();
    expect(screen.getByRole('timer').textContent).toMatch(
      /^The venue is checking with the guest before you · answer within 1 hr/u,
    );
  });
});
