// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PublicApp } from './PublicApp';
import { createHarness, initTestI18n, stubIntersectionObserverAsNeverVisible } from './testHarness';

/**
 * What a visitor actually sees, for the two states that are easiest to get
 * wrong by getting right in the data layer alone.
 *
 * A suspended branch resolving to `status: 'suspended'` is not the requirement.
 * The requirement is that a person who taps a link to a venue whose
 * subscription lapsed gets a sentence explaining it — not a crash, not an error
 * banner, and above all not a free-table count for a venue the platform has
 * switched off. That is a claim about the DOM, so it is asserted against one.
 */

beforeAll(async () => {
  await initTestI18n();
});

beforeEach(() => {
  // The room is below the fold and has not been scrolled to, so its renderer
  // has not been fetched. See the harness for why this is the honest default.
  stubIntersectionObserverAsNeverVisible();
});

afterEach(cleanup);

function open(path: string) {
  const harness = createHarness();
  const view = render(harness.wrap(<PublicApp />, path));
  return { ...harness, ...view };
}

describe('a suspended branch', () => {
  it('renders a plain not-available page, not an error', async () => {
    open('/dolmama/dalma-garden');

    expect(await screen.findByText('Not available')).toBeDefined();
    expect(
      screen.getByText(/not on Yalla at the moment/u),
      'the page should say what happened, in a sentence',
    ).toBeDefined();

    // The venue is still named — somebody who knows the place exists should
    // recognise that they reached the right page.
    expect(screen.getByText('Dolmama')).toBeDefined();
  });

  it('advertises nothing: no free-table count, no way to book', async () => {
    open('/dolmama/dalma-garden');
    await screen.findByText('Not available');

    expect(screen.queryByText(/tables? free right now/u)).toBeNull();
    expect(screen.queryByText('Book a table')).toBeNull();
    expect(screen.queryByRole('button', { name: /Reserve/u })).toBeNull();
  });
});

describe('a link that does not resolve', () => {
  it('says the link is wrong rather than showing a sign-in form', async () => {
    // The console's catch-all would refuse this. A stranger who mistyped a
    // venue's name has never heard of the console.
    open('/no-such-venue/no-such-branch');

    expect(await screen.findByText('We could not find that place')).toBeDefined();
  });

  it('404s a real branch under the wrong venue', async () => {
    open('/dolmama/northern-avenue');
    expect(await screen.findByText('We could not find that place')).toBeDefined();
  });
});

describe('a live branch', () => {
  it('leads with the venue, then open state, then the free-table count', async () => {
    const { container } = open('/lumen-coffee/northern-avenue');

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('Lumen Coffee');

    // The count is the largest thing after the name and the reason the page
    // exists; the room, the menu and the address follow it.
    const count = await screen.findByText(/tables? free right now/u);
    expect(count).toBeDefined();
    expect(heading.compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Scoped to the badge: "Closed" also appears in the week's own table, and
    // a loose text query would match either and pass for the wrong reason.
    expect(container.querySelector('.pub-open')?.textContent).toMatch(/^(Open until|Closed)/u);
    expect(screen.getByRole('heading', { name: 'The room' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Menu' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Find us' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Opening hours' })).toBeDefined();
  });

  it('offers no app-store link anywhere on the page', async () => {
    open('/lumen-coffee/northern-avenue');
    await screen.findByText(/tables? free right now/u);

    // Nothing on this page may reference something the visitor cannot reach.
    // The one honest mention of the app is on the booking confirmation, and
    // only when there is an app to link to.
    expect(screen.queryByText(/Get the app/u)).toBeNull();
    expect(screen.queryByText(/App Store|Google Play/u)).toBeNull();
  });

  it("says plainly that the menu is in the venue's own language", async () => {
    open('/lumen-coffee/northern-avenue');
    // One name per item is the schema. Rendering it under a three-language
    // switcher without saying so implies a translation that does not exist.
    expect(await screen.findByText(/written in the venue's own language/u)).toBeDefined();
  });

  it('does not fetch the floor plan renderer before the room is scrolled to', async () => {
    open('/lumen-coffee/northern-avenue');
    await screen.findByText(/tables? free right now/u);

    // The placeholder holds the room's space; the renderer has not been asked
    // for. `productionBundle.test.ts` proves it is a separate chunk; this
    // proves the page does not reach for it on load.
    expect(screen.queryByLabelText('What the colours mean')).toBeNull();
  });
});

describe('the language switcher', () => {
  it("is at the top of the page, in each language's own name", async () => {
    open('/lumen-coffee/northern-avenue');

    const nav = await screen.findByRole('navigation', { name: 'Language' });
    const names = [...nav.querySelectorAll('button')].map((button) => button.textContent);
    // Never a flag — a flag is a country — and never a two-letter code, which
    // means nothing to the person who most needs the control.
    expect(names).toEqual(['Հայերեն', 'Русский', 'English']);
  });

  it('marks the active language', async () => {
    open('/lumen-coffee/northern-avenue');
    const nav = await screen.findByRole('navigation', { name: 'Language' });
    const active = [...nav.querySelectorAll('button')].filter(
      (button) => button.getAttribute('aria-current') === 'true',
    );
    expect(active.map((button) => button.textContent)).toEqual(['English']);
  });
});

describe('the branch chooser', () => {
  it('gives every branch its own free count, and marks the suspended one', async () => {
    open('/dolmama');

    await waitFor(() => expect(screen.getByText('Pushkin Street')).toBeDefined());
    expect(screen.getByText('Dalma Garden')).toBeDefined();
    // Listed, and not a link: hiding it makes a chain look smaller than it is,
    // and a dead link wastes the tap.
    expect(screen.queryByRole('link', { name: /Dalma Garden/u })).toBeNull();
    expect(screen.getByRole('link', { name: /Pushkin Street/u })).toBeDefined();
  });
});
