// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  createConsoleMockGateway,
  type ConsoleGateway,
  type ConsoleUser,
  type PlatformOverview,
} from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppRoutes as AppRoutesComponent } from '../../App';
import { createConsoleHarness, initConsoleTestI18n } from '../venue/reports/testHarness';

/**
 * Home (Main artboard; HANDOFF section 8 step 5): the platform as it stands —
 * the outbox alert with its details and **no retry** (by decision), four
 * cards of which two open a per-venue list, bookings per day for 14 or 30
 * days, the branches not ready yet, the newest venues and the activity feed.
 */

let AppRoutes: typeof AppRoutesComponent;

beforeAll(async () => {
  vi.stubEnv('VITE_DATA_SOURCE', 'mock');
  await initConsoleTestI18n();
  ({ AppRoutes } = await import('../../App'));
});

afterEach(cleanup);

const ADMIN: ConsoleUser = {
  id: 'u-platform',
  displayName: 'Grigor Avagyan',
  role: 'platformAdmin',
  scope: { venueId: null, branchIds: [] },
};

const NOW = new Date('2026-10-18T10:32:00Z');

function gateway(change: (overview: PlatformOverview) => PlatformOverview = (o) => o) {
  const mock = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin', now: () => NOW });
  const wrapped: ConsoleGateway = {
    ...mock,
    getPlatformOverview: async () => change(await mock.getPlatformOverview()),
  };
  return wrapped;
}

function renderHome(source: ConsoleGateway = gateway()) {
  const harness = createConsoleHarness({ gateway: source });
  render(harness.wrap(<AppRoutes user={ADMIN} />, '/platform'));
}

async function overviewOf(source: ConsoleGateway) {
  return source.getPlatformOverview();
}

describe('Home', () => {
  it('is where a platform admin lands, from / and after signing in', async () => {
    const harness = createConsoleHarness({ gateway: gateway() });
    render(harness.wrap(<AppRoutes user={ADMIN} />, '/'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeTruthy();
  });

  it('is what /platform opens, under its own name', async () => {
    renderHome();
    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeTruthy();
    expect(await screen.findByText(/The platform as it stands · updated/u)).toBeTruthy();
  });

  it('says how many messages did not reach guests, with details and no retry', async () => {
    const user = userEvent.setup();
    renderHome();
    const alert = await screen.findByText('2 messages did not reach guests in the last 24 hours');
    // A real failure: announced at once, not when the reader is idle.
    const box = alert.closest('[role="alert"]') as HTMLElement;
    expect(box).toBeTruthy();
    expect(within(box).queryByRole('button', { name: /send again/iu })).toBeNull();

    const details = within(box).getByRole('button', { name: 'Details' });
    expect(details.getAttribute('aria-expanded')).toBe('false');
    await user.click(details);
    expect(details.getAttribute('aria-expanded')).toBe('true');
    expect(await within(box).findByText('Booking reminder')).toBeTruthy();
    expect(within(box).getByText('Telegram did not answer after 3 attempts.')).toBeTruthy();
    await user.click(within(box).getByRole('button', { name: 'Hide' }));
    expect(within(box).queryByText('Booking reminder')).toBeNull();
  });

  it('says nothing about the outbox when every message got through', async () => {
    renderHome(
      gateway((overview) => ({
        ...overview,
        outbox: { ...overview.outbox, deadLetteredLastDay: 0 },
      })),
    );
    await screen.findByRole('heading', { level: 1, name: 'Home' });
    await within(screen.getByRole('main')).findByRole('link', { name: /^Venues/u });
    expect(screen.queryByText(/did not reach guests/u)).toBeNull();
  });

  it('shows the venues by plan and the week against the one before', async () => {
    const source = gateway((overview) => ({
      ...overview,
      venues: { ...overview.venues, total: 8, paid: 5, mixed: 0, free: 3 },
      bookings: { ...overview.bookings, last7Days: 312, previous7Days: 278, changePercent: 12.2 },
    }));
    renderHome(source);
    const venues = await within(screen.getByRole('main')).findByRole('link', {
      name: /^Venues/u,
    });
    expect(venues.getAttribute('href')).toBe('/platform/venues');
    expect(within(venues).getByText('8')).toBeTruthy();
    expect(within(venues).getByText('5 paid · 3 free')).toBeTruthy();

    const week = screen.getByRole('link', { name: /^Bookings this week/u });
    expect(within(week).getByText('312')).toBeTruthy();
    expect(within(week).getByText(/↑ 12\.2 %/u)).toBeTruthy();
  });

  it('opens the venues behind the pending and open-tab numbers', async () => {
    const user = userEvent.setup();
    const source = gateway();
    const overview = await overviewOf(source);
    renderHome(source);
    const pending = await screen.findByRole('button', { name: /^Awaiting approval/u });
    expect(within(pending).getByText(String(overview.pendingApprovals.total))).toBeTruthy();
    expect(pending.getAttribute('aria-expanded')).toBe('false');

    await user.click(pending);
    expect(pending.getAttribute('aria-expanded')).toBe('true');
    const drill = screen.getByRole('region', { name: 'Bookings awaiting approval, by venue' });
    const first = overview.pendingApprovals.venues[0]!;
    const link = within(drill).getByRole('link', { name: new RegExp(`^${first.name}`, 'u') });
    expect(link.getAttribute('href')).toBe(`/platform/venues/${first.venueId}`);

    const tabs = screen.getByRole('button', { name: /^Open tabs now/u });
    await user.click(tabs);
    expect(pending.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('region', { name: 'Open tabs by venue' })).toBeTruthy();
    await user.click(
      within(screen.getByRole('region', { name: 'Open tabs by venue' })).getByRole('button', {
        name: 'Close',
      }),
    );
    expect(screen.queryByRole('region', { name: 'Open tabs by venue' })).toBeNull();
    // The list it closed was opened from the card: the focus goes back there.
    expect(document.activeElement).toBe(tabs);
  });

  it('draws bookings per day for 14 days, or 30, today last', async () => {
    const user = userEvent.setup();
    const source = gateway();
    const overview = await overviewOf(source);
    renderHome(source);
    const chart = await screen.findByRole('region', { name: 'Bookings per day' });
    const bars = () => within(chart).getAllByRole('button');
    expect(bars()).toHaveLength(14);
    const today = overview.bookings.perDay.at(-1)!;
    expect(bars().at(-1)?.getAttribute('aria-label')).toBe(
      `October 18 (today) · ${today.count} bookings`,
    );
    const fortnight = overview.bookings.perDay.slice(-14).reduce((sum, day) => sum + day.count, 0);
    const total = new Intl.NumberFormat('en').format(fortnight);
    expect(within(chart).getByText(new RegExp(`Last 14 days · ${total} in all`, 'u'))).toBeTruthy();

    await user.selectOptions(within(chart).getByLabelText('Period'), '30');
    expect(bars()).toHaveLength(30);
  });

  it('lists the branches not ready yet with what is missing, and the newest venues', async () => {
    const source = gateway();
    const overview = await overviewOf(source);
    renderHome(source);
    const ready = await screen.findByRole('region', { name: 'Not ready yet' });
    const first = overview.notReady.branches[0]!;
    const link = within(ready).getAllByRole('link')[0]!;
    expect(link.getAttribute('href')).toBe(`/platform/venues/${first.venueId}`);
    expect(link.textContent).toContain(first.venueName);

    const recent = screen.getByRole('region', { name: 'Recently added' });
    const rows = within(recent).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(overview.recentVenues.length);
    const newest = overview.recentVenues[0]!;
    expect(within(rows[0]!).getByRole('link', { name: newest.name }).getAttribute('href')).toBe(
      `/platform/venues/${newest.id}`,
    );
  });

  it('tells what happened lately, in sentences, without a guest in them', async () => {
    renderHome();
    const feed = await screen.findByRole('region', { name: 'Recent activity' });
    await waitFor(() => expect(within(feed).getAllByRole('listitem').length).toBeGreaterThan(0));
    expect(within(feed).getByText(/switched .* to Paid/u)).toBeTruthy();
    expect(within(feed).getByText(/added Mariam Avetisyan as branch manager/u)).toBeTruthy();
  });

  it('says who joined without guessing a role the log did not record', async () => {
    const source = gateway();
    const withoutRole: ConsoleGateway = {
      ...source,
      listPlatformActivity: async () => [
        {
          id: 'a-1',
          atUtc: NOW.toISOString(),
          action: 'staff.create',
          actor: { id: 's-1', role: 'owner', name: 'Aram Hakobyan' },
          target: { type: 'StaffMember', id: 's-2', name: 'Mariam Avetisyan' },
          venue: { id: 'v-1', name: 'Cascade Cafe' },
          tierTo: null,
          staffRole: null,
        },
      ],
    };
    renderHome(withoutRole);
    const feed = await screen.findByRole('region', { name: 'Recent activity' });
    expect(await within(feed).findByText(/added Mariam Avetisyan to the team/u)).toBeTruthy();
    expect(within(feed).queryByText(/branch manager/u)).toBeNull();
  });

  it('says a restore of reports in words, and never prints an action code it has no words for', async () => {
    const source = gateway();
    const entry = (id: string, action: string) => ({
      id,
      atUtc: NOW.toISOString(),
      action,
      actor: { id: 'a-1', role: 'platformAdmin' as const, name: 'Grigor Avagyan' },
      target: { type: 'Branch', id: 'b-1', name: 'Կենտրոն' },
      venue: { id: 'v-1', name: 'Cascade Cafe' },
      tierTo: null,
      staffRole: null,
    });
    renderHome({
      ...source,
      listPlatformActivity: async () => [
        entry('a-1', 'review.restore-reports'),
        entry('a-2', 'menu.bulk-import'),
      ],
    });
    const feed = await screen.findByRole('region', { name: 'Recent activity' });
    expect(
      await within(feed).findByText(/put back the reports on a review at Կենտրոն/u),
    ).toBeTruthy();
    expect(within(feed).getByText(/made a change$/u)).toBeTruthy();
    expect(within(feed).queryByText(/menu\.bulk-import/u)).toBeNull();
  });

  it("says what a venue's own people did to their own accounts", async () => {
    const source = gateway();
    const entry = (id: string, action: string) => ({
      id,
      atUtc: NOW.toISOString(),
      action,
      actor: { id: 's-1', role: 'owner' as const, name: 'Aram Hakobyan' },
      target: { type: 'StaffMember', id: 's-1', name: 'Aram Hakobyan' },
      venue: { id: 'v-1', name: 'Cascade Cafe' },
      tierTo: null,
      staffRole: null,
    });
    renderHome({
      ...source,
      listPlatformActivity: async () => [
        entry('a-1', 'account.rename'),
        entry('a-2', 'account.password-change'),
        entry('a-3', 'account.sign-out-others'),
      ],
    });
    const feed = await screen.findByRole('region', { name: 'Recent activity' });
    expect(await within(feed).findByText(/changed their name$/u)).toBeTruthy();
    expect(within(feed).getByText(/changed their password$/u)).toBeTruthy();
    expect(within(feed).getByText(/signed out of their other devices$/u)).toBeTruthy();
    expect(within(feed).queryByText(/made a change$/u)).toBeNull();
  });

  it('says the overview failed rather than showing zeros', async () => {
    const failing: ConsoleGateway = {
      ...gateway(),
      getPlatformOverview: () => Promise.reject(new Error('down')),
    };
    renderHome(failing);
    expect(await screen.findByRole('alert', undefined, { timeout: 5000 })).toBeTruthy();
    expect(within(screen.getByRole('main')).queryByRole('link', { name: /^Venues/u })).toBeNull();
  });
});
