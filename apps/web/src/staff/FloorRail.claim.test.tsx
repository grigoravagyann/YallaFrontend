// @vitest-environment jsdom
import type { ServiceRequest } from '@yalla/api';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import { FloorRail, type FloorRailProps } from './FloorRail';

/**
 * "I'm on it" on the rail's calls (2026-10-24): an open call offers the
 * claim beside "On my way"; a claimed one names who took it, on every tablet,
 * and offers no second claim.
 */

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(cleanup);

const call: ServiceRequest = {
  id: 'sr-1',
  tabId: 'tab-5',
  tableLabel: '5',
  reason: 'water',
  note: null,
  requestedAtUtc: new Date(Date.now() - 60_000).toISOString(),
  waitingMinutes: 1,
  acknowledgedAtUtc: null,
  requestedByParticipantId: null,
  bill: null,
};

function show(requests: readonly ServiceRequest[], props: Partial<FloorRailProps> = {}) {
  const handlers = { onAcknowledge: vi.fn(), onClaim: vi.fn() };
  render(
    <I18nextProvider i18n={i18next}>
      <FloorRail
        summary=""
        approvals={null}
        requests={requests}
        requestsFailed={false}
        requestsLoading={false}
        orders={[]}
        ordersLoading={false}
        ordersFailed={false}
        timeZoneId="Asia/Yerevan"
        onAdvance={vi.fn()}
        unresolved={[]}
        onSettle={vi.fn()}
        selfStaffMemberId="s-ani"
        {...handlers}
        {...props}
      />
    </I18nextProvider>,
  );
  const calls = screen.getByRole('region', { name: 'Waiting for a waiter' });
  return { ...handlers, item: within(calls).getByText('asks for water').closest('li')! };
}

describe('claiming a call', () => {
  it('offers "I’m on it" on an open call, with the table in its name', () => {
    const { item, onClaim, onAcknowledge } = show([call]);
    fireEvent.click(within(item).getByRole('button', { name: 'I’m on it · table 5' }));
    expect(onClaim).toHaveBeenCalledWith(call);
    fireEvent.click(within(item).getByRole('button', { name: 'On my way' }));
    expect(onAcknowledge).toHaveBeenCalledWith(call);
  });

  it('names who took it and offers no second claim', () => {
    const { item } = show([
      {
        ...call,
        claimedByStaffMemberId: 's-aram',
        claimedByName: 'Aram Petrosyan',
        claimedAtUtc: new Date().toISOString(),
      },
    ]);
    expect(within(item).getByText('Aram is on it')).toBeTruthy();
    expect(within(item).queryByRole('button', { name: /I’m on it/u })).toBeNull();
    expect(within(item).getByRole('button', { name: 'On my way' })).toBeTruthy();
  });

  it('says "You’re on it" on the claimer’s own tablet', () => {
    const { item } = show([
      { ...call, claimedByStaffMemberId: 's-ani', claimedByName: 'Ani Hakobyan' },
    ]);
    expect(within(item).getByText('You’re on it')).toBeTruthy();
  });

  it('offers no claim offline: "On my way" waits in the queue as before', () => {
    const { item } = show([call], { onClaim: undefined });
    expect(within(item).queryByRole('button', { name: /I’m on it/u })).toBeNull();
    expect(within(item).getByRole('button', { name: 'On my way' }).className).toContain(
      'ft-btn-primary',
    );
  });
});
