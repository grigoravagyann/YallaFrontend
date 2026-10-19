// @vitest-environment jsdom
import {
  createConsoleMockGateway,
  type ConsoleGateway,
  type OccupancyReport,
  type StaffDevice,
} from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';
import { WorthALook } from './WorthALook';

/**
 * "Worth a look" (lead review, H1 and the turn-time rule).
 *
 * A tablet's last-seen moves only on a PIN sign-in or a session renewal —
 * about every fifteen minutes while it is used, and an idle one locks after
 * thirty — so a healthy tablet can look quiet for half an hour. Only a silence
 * past 45 minutes, while the branch is open, is a line here, worded as what is
 * known ("not heard from since"), and the list is read again every minute so
 * the line keeps up with the clock. The turn-time line needs enough sittings
 * and a real overrun.
 */

/** Sunday 18 October 2026, 18:42 in Yerevan. */
const EVENING = new Date('2026-10-18T14:42:00Z');
const BRANCH = 'b-lumen-north';

beforeAll(async () => {
  await initConsoleTestI18n();
});

beforeEach(() => {
  vi.useFakeTimers({ now: EVENING, shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const minutesAgo = (minutes: number) =>
  new Date(EVENING.getTime() - minutes * 60_000).toISOString();

function tablet(name: string, lastSeenMinutesAgo: number): StaffDevice {
  return {
    id: `d-${name}`,
    name,
    branchId: BRANCH,
    enrolledAtUtc: minutesAgo(60 * 24 * 30),
    lastSeenAtUtc: minutesAgo(lastSeenMinutesAgo),
    isRevoked: false,
  };
}

function gatewayWith(
  options: {
    readonly devices?: readonly StaffDevice[];
    readonly turn?: Partial<OccupancyReport['turnTime']>;
  } = {},
): ConsoleGateway & { readonly reported: () => boolean } {
  const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
  let answered = false;
  return {
    ...base,
    listDevices: vi.fn(async () => [...(options.devices ?? [])]),
    getOccupancyReport: async (query) => {
      const report = await base.getOccupancyReport(query);
      answered = true;
      return { ...report, turnTime: { ...report.turnTime, ...options.turn } };
    },
    reported: () => answered,
  };
}

function renderCard(gateway: ConsoleGateway, open = true) {
  const harness = createConsoleHarness({ gateway });
  render(
    harness.wrap(<WorthALook branchId={BRANCH} timeZoneId="Asia/Yerevan" open={open} />, '/venue'),
  );
  return screen.findByRole('region', { name: 'Worth a look' });
}

describe('a tablet gone quiet', () => {
  it('is not a line at 20 or 40 minutes, and is one past 45, said as since when', async () => {
    const gateway = gatewayWith({
      devices: [tablet('Bar', 20), tablet('Terrace', 40), tablet('Kitchen', 50)],
    });
    const card = await renderCard(gateway);

    expect(await within(card).findByText('Not heard from Kitchen since 17:52')).toBeTruthy();
    expect(within(card).queryByText(/Bar/u)).toBeNull();
    expect(within(card).queryByText(/Terrace/u)).toBeNull();
    expect(within(card).queryByText(/lost its connection/u)).toBeNull();
  });

  it('is not a line while the branch is shut', async () => {
    const gateway = gatewayWith({ devices: [tablet('Kitchen', 120)] });
    const card = await renderCard(gateway, false);
    await waitFor(() => expect(gateway.listDevices).toHaveBeenCalled());
    expect(within(card).queryByText(/Kitchen/u)).toBeNull();
  });

  it('reads the tablets again every minute, so a tablet heard from again drops off', async () => {
    const devices = vi
      .fn<ConsoleGateway['listDevices']>()
      .mockResolvedValueOnce([tablet('Kitchen', 50)])
      .mockResolvedValue([tablet('Kitchen', 0)]);
    const card = await renderCard({ ...gatewayWith(), listDevices: devices });
    expect(await within(card).findByText(/^Not heard from Kitchen/u)).toBeTruthy();

    await vi.advanceTimersByTimeAsync(61_000);
    await waitFor(() => expect(devices).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(card).queryByText(/^Not heard from Kitchen/u)).toBeNull());
  });
});

describe('sittings running long', () => {
  const OVER = { policyTurnTimeMinutes: 120, medianMinutes: 140, overPolicyFraction: 0.5 };

  it('is a line on enough sittings with a real overrun', async () => {
    const card = await renderCard(gatewayWith({ turn: { ...OVER, closedSessions: 40 } }));
    expect(await within(card).findByText('Tables are kept 20 minutes longer')).toBeTruthy();
  });

  it('is not a line on a thin week, a small overrun or a few long nights', async () => {
    for (const turn of [
      { ...OVER, closedSessions: 8 },
      { ...OVER, closedSessions: 40, medianMinutes: 125 },
      { ...OVER, closedSessions: 40, overPolicyFraction: 0.1 },
    ]) {
      const gateway = gatewayWith({ turn });
      const card = await renderCard(gateway);
      // The report has answered, and a render after it has happened.
      await waitFor(() => expect(gateway.reported()).toBe(true));
      await within(card).findByText(/still unfinished|Online bookings|Nothing needs/u);
      await vi.advanceTimersByTimeAsync(50);
      expect(within(card).queryByText(/^Tables are kept/u)).toBeNull();
      cleanup();
    }
  });
});
