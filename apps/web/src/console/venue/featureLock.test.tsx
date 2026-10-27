// @vitest-environment jsdom
import {
  FULL_FEATURES,
  FeatureNotEnabledError,
  createConsoleMockGateway,
  type BranchFeature,
} from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { QueryFailureNotice } from '../../components/QueryFailureNotice';
import { ToastProvider } from '../ui/toast';
import { FeatureGate } from './featureLock';
import { ReservationPolicyScreen } from './policy/ReservationPolicyScreen';
import { createConsoleHarness, initConsoleTestI18n } from './reports/testHarness';
import { venueNavGroups } from './VenueLayout';

/**
 * A feature the platform has not enabled at the branch (2026-10-27) is drawn
 * locked in the venue console, not hidden: the nav item carries a lock, a
 * page is the lock and its two lines, a settings card keeps its controls on
 * screen, disabled, under the same lines.
 */

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(cleanup);

const LOCK = 'Not enabled for this branch';
const without = (...off: BranchFeature[]) => FULL_FEATURES.filter((f) => !off.includes(f));

function renderUnder(element: ReactNode, features: readonly BranchFeature[] | null) {
  const harness = createConsoleHarness({
    gateway: createConsoleMockGateway({ latencyMs: 0, role: 'owner', seedTakeaway: true }),
  });
  const context = {
    branchId: 'b-lumen-north',
    branchName: 'Northern Avenue',
    timeZoneId: 'Asia/Yerevan',
    branchCount: 3,
    canRollUpVenue: true,
    canRelocate: true,
    features,
  };
  render(
    harness.wrap(
      <ToastProvider>
        <Routes>
          <Route path="/venue" element={<Outlet context={context} />}>
            <Route path="page" element={element} />
          </Route>
        </Routes>
      </ToastProvider>,
      '/venue/page',
    ),
  );
}

describe('the venue nav', () => {
  const counts = { pendingApprovals: null, incompleteDishes: null, reportedReviews: null };
  const link = (features: readonly BranchFeature[] | null, to: string) =>
    venueNavGroups(counts, { floor: false, features })
      .flatMap((group) => group.links)
      .find((entry) => entry.to === to);

  it('keeps every link, and locks the ones the platform has not enabled', () => {
    const off = without('reviews', 'guestMessages', 'reports');
    expect(link(off, '/venue/reviews')?.locked).toBe(true);
    expect(link(off, '/venue/messages')?.locked).toBe(true);
    expect(link(off, '/venue/reports')?.locked).toBe(true);
    expect(link(off, '/venue/policy')?.locked).toBeFalsy();
    expect(link(FULL_FEATURES, '/venue/reports')?.locked).toBe(false);
  });

  it('locks nothing while the set is not known', () => {
    expect(link(null, '/venue/reviews')?.locked).toBe(false);
  });
});

describe('a page that is one feature', () => {
  it('is its title and the lock when the feature is blocked', () => {
    renderUnder(
      <FeatureGate feature="reports" titleKey="nav.reports">
        <p>the reports</p>
      </FeatureGate>,
      without('reports'),
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Reports' })).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain(LOCK);
    expect(screen.getByRole('note').textContent).toContain('Contact SHURJ to turn it on.');
    expect(screen.queryByText('the reports')).toBeNull();
  });

  it('is the page itself when the feature is on', () => {
    renderUnder(
      <FeatureGate feature="reports" titleKey="nav.reports">
        <p>the reports</p>
      </FeatureGate>,
      FULL_FEATURES,
    );
    expect(screen.getByText('the reports')).toBeTruthy();
    expect(screen.queryByRole('note')).toBeNull();
  });
});

describe('the Policy cards', () => {
  it('shows takeaway, pre-orders, messages and scanning locked, their switches disabled', async () => {
    renderUnder(
      <ReservationPolicyScreen />,
      without('takeaway', 'preOrders', 'guestMessages', 'tableService'),
    );
    const takeaway = await screen.findByRole('switch', { name: 'We take takeaway orders' });
    const preOrders = await screen.findByRole('switch', { name: 'We accept pre-orders' });
    const messages = await screen.findByRole('switch', { name: 'Guests can write to us' });
    const scans = await screen.findByRole('switch', { name: 'Unverified scans wait for a waiter' });
    for (const control of [takeaway, preOrders, messages, scans]) {
      expect(control.closest('fieldset')?.disabled).toBe(true);
    }
    const notes = screen.getAllByRole('note').filter((note) => note.textContent?.includes(LOCK));
    expect(notes.map((note) => note.getAttribute('data-locked-feature')).sort()).toEqual([
      'guestMessages',
      'preOrders',
      'tableService',
      'takeaway',
    ]);
  });

  it('leaves them usable where the platform allows them', async () => {
    renderUnder(<ReservationPolicyScreen />, FULL_FEATURES);
    const takeaway = await screen.findByRole('switch', { name: 'We take takeaway orders' });
    await waitFor(() => expect(takeaway.closest('fieldset')).toBeNull());
    expect(screen.queryAllByRole('note').some((note) => note.textContent?.includes(LOCK))).toBe(
      false,
    );
  });
});

describe('a refusal from the server', () => {
  it('says feature-not-enabled with the same locked copy, and offers no retry', () => {
    render(
      <QueryFailureNotice
        error={new FeatureNotEnabledError({ url: '/x', feature: 'reports', branchId: 'b' })}
        onRetry={() => undefined}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(LOCK);
    expect(within(alert).queryByRole('button')).toBeNull();
  });
});
