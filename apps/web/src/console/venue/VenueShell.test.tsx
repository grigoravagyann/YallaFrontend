// @vitest-environment jsdom
import {
  createConsoleMockGateway,
  type ConsoleGateway,
  type ConsoleUser,
  type UserRole,
} from '@yalla/api';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { QueryClient } from '@tanstack/react-query';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createConsoleHarness, initConsoleTestI18n } from './reports/testHarness';
import { VenueLayout } from './VenueLayout';

/**
 * The venue console's shell (docs/design/venue-console, the sidebar of every
 * artboard): the one console sidebar the platform admin's shell is also built
 * from, here with the venue and its branch under the brand, four groups of
 * links with live counts on three of them, and the signed-in person at the
 * foot opening "My account".
 *
 * Against the real console mock: the counts are what its fixture holds, read
 * through the same gateway calls the screens make.
 */

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(cleanup);

async function renderShell(role: UserRole, path = '/venue', gateway?: ConsoleGateway) {
  const mock = gateway ?? createConsoleMockGateway({ latencyMs: 0, role });
  const user: ConsoleUser = await mock.getCurrentUser();
  const harness = createConsoleHarness({ gateway: mock });
  harnessClient = harness.queryClient;
  render(
    harness.wrap(
      <Routes>
        <Route path="/venue" element={<VenueLayout user={user} />}>
          <Route index element={<h1>Overview page</h1>} />
          <Route path="menu" element={<h1>Menu page</h1>} />
          <Route path="account" element={<h1>Account page</h1>} />
        </Route>
      </Routes>,
      path,
    ),
  );
  await screen.findByRole('heading', { level: 1 });
  return { gateway: mock, user };
}

const nav = () => screen.getByRole('navigation', { name: 'Main navigation' });

/** The query cache of the shell rendered last. */
let harnessClient: QueryClient | null = null;

describe('the venue sidebar', () => {
  it('has the four groups of the design, in order, and the links in each', async () => {
    await renderShell('owner');
    const groups = within(nav()).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('aria-label') ?? labelOf(group))).toEqual([
      'Today',
      'The venue',
      'Team',
      'Results',
    ]);
    const hrefs = groups.map((group) =>
      within(group)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    );
    expect(hrefs).toEqual([
      ['/venue'],
      ['/venue/menu', '/venue/floorplan', '/venue/hours', '/venue/policy', '/venue/public'],
      ['/venue/staff'],
      ['/venue/reviews', '/venue/messages', '/venue/reports'],
    ]);
  });

  it('keeps the floor screen one click away for a branch manager, who also works the floor', async () => {
    await renderShell('manager');
    const today = within(nav()).getAllByRole('group')[0]!;
    expect(
      within(today)
        .getAllByRole('link')
        .map((link) => [link.getAttribute('href'), link.textContent]),
    ).toEqual([
      ['/venue', expect.stringMatching(/^Overview/u)],
      ['/staff', 'Floor'],
    ]);
  });

  it('does not offer the floor screen to an owner or a general manager, who have no PIN session there', async () => {
    for (const role of ['owner', 'generalManager'] as const) {
      await renderShell(role);
      expect(within(nav()).queryByRole('link', { name: 'Floor' })).toBeNull();
      cleanup();
    }
  });

  it('marks only the page shown as current', async () => {
    await renderShell('owner', '/venue/menu');
    const current = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
      .map((link) => link.getAttribute('href'));
    expect(current).toEqual(['/venue/menu']);
  });

  it('opens "My account" from the person at its foot, who is named', async () => {
    const { user } = await renderShell('generalManager');
    const me = screen.getByRole('link', { name: /my account/i });
    expect(me.getAttribute('href')).toBe('/venue/account');
    expect(me.textContent).toContain(user.displayName);
    expect(within(nav()).queryByRole('link', { name: /my account/i })).toBeNull();
  });

  it('marks the person as current on the account page', async () => {
    await renderShell('owner', '/venue/account');
    expect(screen.getByRole('link', { name: /my account/i }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('names the venue and the role above the links', async () => {
    const { gateway, user } = await renderShell('owner');
    const venue = await gateway.getManagedVenue(user.scope.venueId!);
    expect(await screen.findByText(venue.name)).toBeTruthy();
    expect(screen.getByText('Owner')).toBeTruthy();
  });

  it('has no language picker: it lives on the account page', async () => {
    await renderShell('owner');
    expect(screen.queryByRole('combobox', { name: /language/i })).toBeNull();
  });

  it('puts the page in a main a skip link reaches', async () => {
    await renderShell('owner');
    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { name: 'Overview page' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe(
      `#${main.id}`,
    );
  });
});

describe('the branch switcher', () => {
  it('is offered to an owner whose venue has more than one branch', async () => {
    await renderShell('owner');
    const switcher = await screen.findByRole('combobox', { name: 'Branch' });
    expect(within(switcher).getAllByRole('option').length).toBeGreaterThan(1);
  });

  it('is not offered to a branch manager, who sees their branch named instead', async () => {
    const { gateway, user } = await renderShell('manager');
    const venue = await gateway.getManagedVenue(user.scope.venueId!);
    const home = venue.branches.find((branch) => branch.id === user.scope.branchIds[0]);
    expect(home).toBeDefined();
    expect(await screen.findByText(`${home!.name} branch`)).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Branch' })).toBeNull();
  });
});

describe('the counts on the links', () => {
  /** The branch the layout landed on: the switcher's value, or the manager's home. */
  async function shownBranch(user: ConsoleUser): Promise<string> {
    const switcher = screen.queryByRole<HTMLSelectElement>('combobox', { name: 'Branch' });
    return switcher?.value ?? user.scope.branchIds[0]!;
  }

  /** The three counts at one branch, read the way the screens read them. */
  async function countsAt(gateway: ConsoleGateway, branchId: string) {
    return {
      pending: (await gateway.listPendingReservations(branchId)).length,
      incomplete: (await gateway.getBranchReadiness(branchId)).incompleteMenuItemCount,
      reported: (
        await gateway.listVenueBranchReviews(branchId, { filter: 'reported', pageSize: 1 })
      ).total,
    };
  }

  it('say how many bookings wait, dishes are unfinished and reviews are reported', async () => {
    const { gateway, user } = await renderShell('owner');
    const switcher = await screen.findByRole<HTMLSelectElement>('combobox', { name: 'Branch' });

    // The branch whose fixture has some of each, or these assertions would
    // prove nothing; switching to it also proves the counts follow the switch.
    const venue = await gateway.getManagedVenue(user.scope.venueId!);
    let branchId: string | null = null;
    for (const branch of venue.branches) {
      const counts = await countsAt(gateway, branch.id);
      if (counts.pending > 0 && counts.incomplete > 0 && counts.reported > 0) branchId = branch.id;
    }
    expect(branchId).not.toBeNull();
    fireEvent.change(switcher, { target: { value: branchId } });
    expect(await shownBranch(user)).toBe(branchId);
    const { pending, incomplete, reported } = await countsAt(gateway, branchId!);

    await waitFor(() => {
      expect(linkNamed('/venue')).toBe(
        `Overview ${pending} ${pending === 1 ? 'booking waits' : 'bookings wait'} for a decision`,
      );
      expect(linkNamed('/venue/menu')).toBe(
        `Menu ${incomplete} unfinished ${incomplete === 1 ? 'dish' : 'dishes'}`,
      );
      expect(linkNamed('/venue/reviews')).toBe(
        `Reviews ${reported} reported ${reported === 1 ? 'review' : 'reviews'}`,
      );
    });
    // The number is drawn for the eye and read out once, inside the sentence.
    const badge = within(screen.getByRole('link', { name: /^Overview/u })).getByText(
      String(pending),
    );
    expect(badge.getAttribute('aria-hidden')).toBe('true');
  });

  it('show nothing where there is nothing to count', async () => {
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const quiet: ConsoleGateway = {
      ...base,
      listPendingReservations: async () => [],
      getBranchReadiness: async (branchId) => ({
        ...(await base.getBranchReadiness(branchId)),
        incompleteMenuItemCount: 0,
      }),
      listVenueBranchReviews: async (branchId, query) => ({
        ...(await base.listVenueBranchReviews(branchId, query)),
        items: [],
        total: 0,
      }),
    };
    await renderShell('owner', '/venue', quiet);
    await screen.findByRole('combobox', { name: 'Branch' });
    await waitFor(() => expect(linkNamed('/venue/reviews')).toBe('Reviews'));
    expect(linkNamed('/venue')).toBe('Overview');
    expect(linkNamed('/venue/menu')).toBe('Menu');
  });

  it('show nothing, rather than a wrong zero, when a count cannot be read', async () => {
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const failing: ConsoleGateway = {
      ...base,
      listPendingReservations: async () => {
        throw new Error('down');
      },
    };
    await renderShell('owner', '/venue', failing);
    await screen.findByRole('combobox', { name: 'Branch' });
    await waitFor(() => expect(linkNamed('/venue/menu')).toMatch(/^Menu \d/u));
    expect(linkNamed('/venue')).toBe('Overview');
  });

  it('show nothing while a count is still on its way', async () => {
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const slow: ConsoleGateway = {
      ...base,
      listPendingReservations: () => new Promise(() => {}),
    };
    await renderShell('owner', '/venue', slow);
    await screen.findByRole('combobox', { name: 'Branch' });
    await waitFor(() => expect(linkNamed('/venue/menu')).toMatch(/^Menu \d/u));
    expect(linkNamed('/venue')).toBe('Overview');
  });

  it("never shows the branch before's count while this branch's is on its way", async () => {
    // Reported reviews keep the previous page on screen while the next one
    // loads (`keepPreviousData`, for the reviews screen's pager); on a badge
    // that would be another branch's number under this branch's name.
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const user = await base.getCurrentUser();
    const venue = await base.getManagedVenue(user.scope.venueId!);
    const counted: string[] = [];
    for (const branch of venue.branches) {
      const page = await base.listVenueBranchReviews(branch.id, { filter: 'reported' });
      if (page.total > 0) counted.push(branch.id);
    }
    const reported = counted[0]!;
    const other = venue.branches.find((branch) => branch.id !== reported)!.id;
    let hangOther = false;
    const gateway: ConsoleGateway = {
      ...base,
      listVenueBranchReviews: (branchId, query) =>
        branchId === other && hangOther
          ? new Promise(() => {})
          : base.listVenueBranchReviews(branchId, query),
    };
    await renderShell('owner', '/venue', gateway);
    const switcher = await screen.findByRole<HTMLSelectElement>('combobox', { name: 'Branch' });
    fireEvent.change(switcher, { target: { value: reported } });
    await waitFor(() => expect(linkNamed('/venue/reviews')).toMatch(/^Reviews \d+ reported/u));

    hangOther = true;
    harnessClient!.removeQueries({ queryKey: ['console', 'venueReviews', other] });
    fireEvent.change(switcher, { target: { value: other } });
    expect(switcher.value).toBe(other);
    await waitFor(() => expect(linkNamed('/venue/reviews')).toBe('Reviews'));
  });
});

/** A link's accessible name, as a screen reader would read it. */
function linkNamed(href: string): string {
  const link = within(nav())
    .getAllByRole('link')
    .find((candidate) => candidate.getAttribute('href') === href);
  if (!link) throw new Error(`No link to ${href}`);
  const hidden = new Set(link.querySelectorAll('[aria-hidden="true"]'));
  const text: string[] = [];
  const walk = (node: Node) => {
    if (node instanceof Element && hidden.has(node)) return;
    if (node.nodeType === Node.TEXT_NODE) text.push(node.textContent ?? '');
    node.childNodes.forEach(walk);
  };
  walk(link);
  return text.join(' ').replace(/\s+/gu, ' ').trim();
}

/** A group's name from its `aria-labelledby`. */
function labelOf(group: HTMLElement): string {
  const id = group.getAttribute('aria-labelledby');
  return (id && document.getElementById(id)?.textContent) || '';
}
