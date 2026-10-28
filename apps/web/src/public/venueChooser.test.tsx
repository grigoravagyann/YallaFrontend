// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicApp } from './PublicApp';
import { createHarness, initTestI18n, stubIntersectionObserverAsNeverVisible } from './testHarness';

/**
 * `/{venue}` — choosing a branch (Venue artboard): a card per branch with its
 * photo, "address · district", whether it is open and how many tables are
 * free; a branch that is not available listed but not a link; and a plain
 * sentence when the venue has none yet.
 */

beforeAll(async () => {
  await initTestI18n();
});

beforeEach(() => {
  stubIntersectionObserverAsNeverVisible();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Friday 20:00 in Yerevan: inside every fixture's hours.
const OPEN_HOURS = () => new Date('2026-10-16T16:00:00Z');

function open(path: string, harness = createHarness({ now: OPEN_HOURS })) {
  render(harness.wrap(<PublicApp />, path));
  return harness;
}

describe('the branch cards', () => {
  it('name each branch with its address and district, open state and free tables', async () => {
    open('/lumen-coffee?lang=en');

    const card = await screen.findByRole('link', { name: /Northern Avenue/u });
    expect(card.getAttribute('href')).toBe('/lumen-coffee/northern-avenue?lang=en');
    await waitFor(() => expect(within(card).getByText(/· Kentron$/u)).toBeTruthy());
    expect(within(card).getByText(/^Open/u)).toBeTruthy();
    expect(within(card).getByText(/tables? free/u)).toBeTruthy();
  });

  it("carries each branch's photo from the listing, decoratively", async () => {
    open('/lumen-coffee');
    const card = await screen.findByRole('link', { name: /Northern Avenue/u });
    await waitFor(() => expect(card.querySelector('img')).not.toBeNull());
    expect(card.querySelector('img')?.getAttribute('alt')).toBe('');
  });

  it('stands without the listing: no photo, no district, still a card', async () => {
    const harness = createHarness({ now: OPEN_HOURS });
    vi.spyOn(harness.gateway, 'searchBranches').mockRejectedValue(new Error('down'));
    open('/lumen-coffee', harness);
    const card = await screen.findByRole('link', { name: /Northern Avenue/u });
    expect(card.querySelector('img')).toBeNull();
    expect(within(card).queryByText(/· Kentron$/u)).toBeNull();
  });

  it('lists a branch that is not available, as a card that is not a link', async () => {
    open('/dolmama');
    await screen.findByRole('link', { name: /Pushkin Street/u });
    const dalma = screen.getByText('Dalma Garden').closest('.pub-branch-card');
    expect(dalma?.tagName).not.toBe('A');
    expect(within(dalma as HTMLElement).getByText('Not available')).toBeTruthy();
  });

  it('says so plainly when the venue has no branch yet', async () => {
    const harness = createHarness({ now: OPEN_HOURS });
    const resolve = harness.publicGateway.resolveVenue.bind(harness.publicGateway);
    vi.spyOn(harness.publicGateway, 'resolveVenue').mockImplementation(async (slug) => {
      const venue = await resolve(slug);
      return venue ? { ...venue, branches: [] } : venue;
    });
    open('/lumen-coffee', harness);
    expect(
      await screen.findByText(
        'This venue has not added a branch on Time to Eat yet. Try again a little later.',
      ),
    ).toBeTruthy();
  });
});
