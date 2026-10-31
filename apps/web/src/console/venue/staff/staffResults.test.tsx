// @vitest-environment jsdom
import {
  createConsoleMockGateway,
  type PerformanceFigures,
  type StaffPerformance,
} from '@yalla/api';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../ui/toast';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';
import { StaffResults } from './StaffResults';

/**
 * Staff → Results with the bookings taken by hand (2026-10-31): three
 * columns beside the decisions — taken, came, no-show — on every row and on
 * the totals.
 */

const NORTH = 'b-lumen-north';

const figures: PerformanceFigures = {
  tables: 4,
  guests: 11,
  salesAmd: 86_000,
  averageCheckAmd: 21_500,
  tipsAmd: 4_000,
  callMedianSeconds: 48,
  callsClaimed: 3,
  replyMedianSeconds: null,
  messagesAnswered: 0,
  approvals: 1,
  declines: 0,
  bookingsTaken: 3,
  bookingsCame: 2,
  bookingsNoShow: 1,
  cashAmd: 50_000,
  cashPayments: 2,
  discounts: 0,
  comps: 0,
  adjustmentsAmd: 0,
  voids: 0,
};

const performance: StaffPerformance = {
  from: '2026-10-31',
  to: '2026-10-31',
  rows: [
    {
      ...figures,
      staffMemberId: 's-ani',
      name: 'Ani Hakobyan',
      role: 'waiter',
      isActive: true,
    },
  ],
  totals: {
    ...figures,
    bookingsTaken: 5,
    bookingsCame: 3,
    bookingsNoShow: 1,
    unattributedSalesAmd: 0,
    takeawayAmd: 0,
  },
};

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(cleanup);

describe('Staff → Results', () => {
  it('shows the bookings each person took by hand, how many came and how many did not', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    vi.spyOn(gateway, 'getStaffPerformance').mockResolvedValue(performance);
    const harness = createConsoleHarness({ gateway });
    render(
      harness.wrap(
        <ToastProvider>
          <StaffResults branchId={NORTH} timeZoneId="Asia/Yerevan" />
        </ToastProvider>,
        '/venue/staff?tab=results',
      ),
    );

    const table = await screen.findByRole('table');
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent?.trim());
    expect(headers).toEqual(
      expect.arrayContaining(['Approved', 'Declined', 'Bookings taken', 'Came', 'No-show']),
    );
    // Beside the decisions, in that order.
    expect(headers.indexOf('Bookings taken')).toBe(headers.indexOf('Declined') + 1);
    expect(headers.indexOf('Came')).toBe(headers.indexOf('Bookings taken') + 1);
    expect(headers.indexOf('No-show')).toBe(headers.indexOf('Came') + 1);

    const row = within(table).getByRole('row', { name: /Ani Hakobyan/u });
    const cells = within(row)
      .getAllByRole('cell')
      .map((cell) => cell.textContent?.trim());
    const taken = headers.indexOf('Bookings taken') - 1;
    expect(cells.slice(taken, taken + 3)).toEqual(['3', '2', '1']);

    const total = within(table).getByRole('row', { name: /^Total/u });
    const totals = within(total)
      .getAllByRole('cell')
      .map((cell) => cell.textContent?.trim());
    expect(totals.slice(taken, taken + 3)).toEqual(['5', '3', '1']);
  });
});
