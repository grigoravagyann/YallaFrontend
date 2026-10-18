// @vitest-environment jsdom
import { type PublicBranch, type TableAvailability } from '@yalla/api';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import BookingSheet from './BookingSheet';
import { defaultSelection, slotInstant } from './slots';
import { createHarness, initTestI18n, stubIntersectionObserverAsNeverVisible } from './testHarness';

/**
 * One visitor, two tables at once: refused, and said with the booking they
 * already hold.
 *
 * A number proved by code is the visitor's account on the server, and one
 * diner holds one table at a branch at a time (409 `reservation-overlaps-own`).
 * The sheet says which booking is in the way — "You already have a booking
 * here at 19:30 (table 2)" — rather than a generic failure, keeps the panel
 * open, and does not send the visitor back to the room as if the table had
 * gone: nothing about this table changed.
 */

const VENUE = 'lumen-coffee';
const BRANCH = 'northern-avenue';
const PHONE = '+37477123456';

beforeAll(async () => {
  await initTestI18n();
});

beforeEach(() => {
  stubIntersectionObserverAsNeverVisible();
});

afterEach(cleanup);

describe('a second booking that overlaps the visitor’s own', () => {
  it('names the booking already held, and keeps the visitor on the sheet', async () => {
    const harness = createHarness({ floorApprovesAtOnce: true });
    const branch = (await harness.publicGateway.resolveBranch({
      venueSlug: VENUE,
      branchSlug: BRANCH,
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
    const free = (
      await harness.gateway.getTableAvailability({
        branchId: branch.id,
        slotUtc,
        partySize: 2,
        timeZoneId: branch.timeZoneId,
      })
    ).filter((entry) => entry.isBookable) as TableAvailability[];
    expect(free.length).toBeGreaterThanOrEqual(2);
    const [held, wanted] = free as [TableAvailability, TableAvailability];

    // Earlier, from the same number: the booking already held.
    const challenge = await harness.gateway.requestPhoneCode(PHONE);
    await harness.gateway.verifyPhoneCode({
      challengeId: challenge.challengeId,
      code: challenge.devCode!,
    });
    const first = await harness.gateway.createBooking({
      commandId: crypto.randomUUID(),
      branchId: branch.id,
      tableId: held.tableId,
      slotUtc,
      timeZoneId: branch.timeZoneId,
      partySize: 2,
      guestName: 'Bella',
      guestPhone: PHONE,
      channel: 'web',
    });

    const onTableTaken = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      harness.wrap(
        <BookingSheet
          branch={branch}
          availability={wanted}
          slotUtc={slotUtc}
          partySize={2}
          onClose={onClose}
          onTableTaken={onTableTaken}
        />,
      ),
    );

    await user.click(await screen.findByRole('button', { name: /^Reserve table/u }));
    await user.type(await screen.findByLabelText('Phone number'), '77123456');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await user.type(await screen.findByLabelText('Enter the code'), '123456');
    await user.type(await screen.findByLabelText('Name for the booking'), 'Bella');
    await user.click(await screen.findByRole('button', { name: 'Confirm booking' }));

    const time = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: branch.timeZoneId,
    }).format(new Date(first.slotUtc));
    expect(
      await screen.findByText(
        `You already have a booking here at ${time} (table ${first.tableLabel}). Change or cancel that one first.`,
      ),
    ).toBeDefined();
    // Nothing about this table changed: no trip back to the room.
    expect(onTableTaken).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect((await harness.gateway.listBookings()).upcoming).toHaveLength(1);
  });
});
