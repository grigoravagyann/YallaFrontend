// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { i18next } from '@yalla/i18n';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicApp } from './PublicApp';
import {
  createHarness,
  initTestI18n,
  stubIntersectionObserverAsNeverVisible,
  type HarnessOptions,
} from './testHarness';

/**
 * The branch page's header and details from `PublicBranchDetail` (public-page
 * HANDOFF §6.2, the Main artboard): type · cuisine, rating · district · price,
 * the all-branches link, call / address / share, about with amenities, how to
 * find with the number and the website, and the week with today marked.
 */

// Friday 20:00 in Yerevan: inside every fixture's hours.
const FRIDAY_EVENING = () => new Date('2026-10-16T16:00:00Z');

beforeAll(async () => {
  await initTestI18n();
});

beforeEach(() => {
  stubIntersectionObserverAsNeverVisible();
  // The page reads the clock for today's row and the days ahead; the mock
  // world reads `now`. Both on the same Friday evening.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FRIDAY_EVENING());
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  // The navigator's own stand-ins, taken off again.
  for (const key of ['share', 'clipboard'] as const) {
    if (Object.prototype.hasOwnProperty.call(navigator, key))
      Reflect.deleteProperty(navigator, key);
  }
  if (i18next.language !== 'en') await act(() => i18next.changeLanguage('en'));
});

/**
 * Give the real `navigator` a share sheet and a clipboard, or take them away,
 * as own properties: a spread copy of `navigator` keeps none of its prototype.
 */
function stubNavigator(members: { share?: unknown; clipboard?: unknown }) {
  for (const [key, value] of Object.entries(members)) {
    Object.defineProperty(navigator, key, { value, configurable: true, writable: true });
  }
}

/** Let pending promises and the re-renders they cause land. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

const LUMEN = '/lumen-coffee/northern-avenue';

function open(path: string, options: HarnessOptions = {}) {
  const harness = createHarness({ now: FRIDAY_EVENING, ...options });
  const view = render(harness.wrap(<PublicApp />, path));
  return { ...harness, ...view };
}

describe('the header', () => {
  it('reads the listing from the branch detail: type · cuisine, rating · district · price', async () => {
    const { container } = open('/lumen-coffee/northern-avenue', { showcase: true });

    expect(await screen.findByText('Cafe · Coffee, breakfast and brunch')).toBeDefined();
    await waitFor(() =>
      expect(container.querySelector('.pub-facts')?.textContent).toMatch(
        /^★ \d\.\d \(24 reviews\)·Kentron·֏֏ · moderate$/u,
      ),
    );
    const facts = container.querySelector<HTMLElement>('.pub-facts')!;
    // Each "·" travels with the part after it, so a wrapped line never ends on one.
    const items = [...facts.children];
    expect(items).toHaveLength(3);
    expect(items[0]!.querySelector('.pub-facts-dot')).toBeNull();
    expect(items[1]!.firstElementChild?.className).toBe('pub-facts-dot');
    expect(items[2]!.firstElementChild?.className).toBe('pub-facts-dot');
    // The glyphs are read as words: the stars as a rating, the dram signs as a level.
    expect(within(facts).getByRole('img', { name: /^Rated \d\.\d out of 5$/u })).toBeDefined();
    expect(within(facts).getByRole('img', { name: 'Price level: moderate' })).toBeDefined();
  });

  it('asks the detail by the branch id', async () => {
    const harness = createHarness({ now: FRIDAY_EVENING, showcase: true });
    const detail = vi.spyOn(harness.gateway, 'getBranchDetail');
    render(harness.wrap(<PublicApp />, LUMEN));
    await screen.findByText('Cafe · Coffee, breakfast and brunch');
    expect(detail).toHaveBeenCalledWith('b-lumen-north');
  });

  it('says a branch nobody reviewed has no reviews yet, and shows no price it was not given', async () => {
    const { container } = open('/tumanyan-shawarma/tumanyan-street');
    await waitFor(() =>
      expect(container.querySelector('.pub-facts')?.textContent).toBe('No reviews yet·Kentron'),
    );
    expect(screen.queryByRole('img', { name: /^Price level/u })).toBeNull();
  });

  it('links to all the venue’s branches, keeping the chosen language', async () => {
    open('/lumen-coffee/northern-avenue?lang=en');
    const link = await screen.findByRole('link', { name: 'All 3 branches' });
    expect(link.getAttribute('href')).toBe('/lumen-coffee?lang=en');
  });

  it('has no branches link for a venue with one branch', async () => {
    const harness = createHarness({ now: FRIDAY_EVENING });
    const venue = vi.spyOn(harness.publicGateway, 'resolveVenue');
    render(harness.wrap(<PublicApp />, '/tumanyan-shawarma/tumanyan-street'));
    // Wait for the venue's own answer, not for something else on the page.
    await waitFor(() => expect(venue).toHaveBeenCalledWith('tumanyan-shawarma'));
    expect((await venue.mock.results[0]!.value)?.branches).toHaveLength(1);
    await settle();
    expect(screen.queryByRole('link', { name: /branch/u })).toBeNull();
  });

  it('offers call, address and share, in that order', async () => {
    open('/lumen-coffee/northern-avenue');
    const actions = await screen.findByRole('group', { name: 'Contact and share' });
    const names = [...actions.querySelectorAll('a, button')].map((element) => element.textContent);
    expect(names).toEqual(['Call', 'Address', 'Share']);
    expect(within(actions).getByRole('link', { name: 'Call' }).getAttribute('href')).toBe(
      'tel:+37410500501',
    );
    expect(within(actions).getByRole('link', { name: 'Address' }).getAttribute('href')).toBe(
      '#find',
    );
  });
});

describe("the header's Book a table", () => {
  it('takes a phone down to the booking card, outside the contact group', async () => {
    open('/lumen-coffee/northern-avenue');
    const heading = await screen.findByRole('heading', { level: 1 });
    const book = screen.getByRole('link', { name: 'Book a table' });
    expect(book.getAttribute('href')).toBe('#book');
    // Hidden from 960px by the stylesheet, where the card is beside it.
    expect(book.classList.contains('pub-only-phone')).toBe(true);
    expect(heading.compareDocumentPosition(book) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const actions = screen.getByRole('group', { name: 'Contact and share' });
    expect(actions.contains(book)).toBe(false);
  });

  it('is not offered where the venue takes no web bookings', async () => {
    open('/tumanyan-shawarma/tumanyan-street');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('link', { name: 'Book a table' })).toBeNull();
  });
});

describe('share', () => {
  it('uses the Web Share API when there is one', async () => {
    const share = vi.fn(() => Promise.resolve());
    const writeText = vi.fn(() => Promise.resolve());
    stubNavigator({ share, clipboard: { writeText } });
    open(LUMEN);
    await userEvent.click(await screen.findByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledWith({
      title: 'Lumen Coffee — Northern Avenue',
      url: expect.stringMatching(/\/lumen-coffee\/northern-avenue$/u),
    });
    await settle();
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Share' })).toBeDefined();
  });

  it('copies the link instead, and says so, where there is none', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubNavigator({ share: undefined, clipboard: { writeText } });
    open(LUMEN);
    await userEvent.click(await screen.findByRole('button', { name: 'Share' }));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringMatching(/\/lumen-coffee\/northern-avenue$/u),
    );
    expect(await screen.findByRole('button', { name: 'Link copied' })).toBeDefined();
    // Said aloud too: the button's new name is not announced on its own.
    await waitFor(() =>
      expect(
        screen.getAllByRole('status').some((status) => status.textContent === 'Link copied'),
      ).toBe(true),
    );
  });

  it('keeps "Link copied" up for its full time after a second copy', async () => {
    stubNavigator({ share: undefined, clipboard: { writeText: () => Promise.resolve() } });
    open(LUMEN);
    await userEvent.click(await screen.findByRole('button', { name: 'Share' }));
    await screen.findByRole('button', { name: 'Link copied' });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await userEvent.click(screen.getByRole('button', { name: 'Link copied' }));
    // 3 s after the first copy, 1.5 s after the second: the second one counts.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(screen.getByRole('button', { name: 'Link copied' })).toBeDefined();
  });

  it('shows the link to copy by hand when the clipboard refuses', async () => {
    stubNavigator({
      share: undefined,
      clipboard: { writeText: () => Promise.reject(new Error('denied')) },
    });
    open(LUMEN);
    await userEvent.click(await screen.findByRole('button', { name: 'Share' }));
    const shown = await screen.findByText('Copy this link:', {
      selector: '.pub-share-manual span',
    });
    expect(shown.parentElement?.textContent).toMatch(/\/lumen-coffee\/northern-avenue$/u);
    // Said aloud too, not only shown.
    await waitFor(() =>
      expect(
        screen.getAllByRole('status').some((status) => status.textContent === 'Copy this link:'),
      ).toBe(true),
    );
  });

  it('says nothing when the visitor closes the share sheet', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    const writeText = vi.fn(() => Promise.resolve());
    const share = vi.fn(() => Promise.reject(abort));
    stubNavigator({ share, clipboard: { writeText } });
    open(LUMEN);
    await userEvent.click(await screen.findByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalled();
    await settle();
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByText('Copy this link:')).toBeNull();
  });
});

describe('about', () => {
  it('shows the venue’s paragraph and its amenities by name', async () => {
    open(LUMEN, { showcase: true });
    const about = await screen.findByRole('region', { name: 'About' });
    expect(await within(about).findByText(/roastery café on Northern Avenue/u)).toBeDefined();
    const amenities = (await within(about).findAllByRole('listitem')).map(
      (item) => item.textContent,
    );
    expect(amenities).toEqual(['Outdoor seating', 'Wi-Fi', 'Card payment', 'Vegan options']);
  });

  it('falls back to the venue’s one line, with no amenity list, for a bare listing', async () => {
    open('/tumanyan-shawarma/tumanyan-street');
    const about = await screen.findByRole('region', { name: 'About' });
    expect(within(about).getByText('Charcoal shawarma, open late.')).toBeDefined();
    expect(within(about).queryByRole('list')).toBeNull();
  });
});

describe('how to find', () => {
  it('shows the address, the district, the map, the number and the website', async () => {
    open(LUMEN, { showcase: true });
    const find = await screen.findByRole('region', { name: 'Find us' });
    expect(within(find).getByText('Northern Avenue 5, Yerevan 0001')).toBeDefined();
    await within(find).findByText('Kentron');
    expect(
      within(find)
        .getByRole('link', { name: /Open in maps/u })
        .getAttribute('href'),
    ).toBe('https://maps.google.com/?q=40.1817%2C44.5142');
    const call = within(find).getByRole('link', { name: '+374 10 50 05 01' });
    expect(call.getAttribute('href')).toBe('tel:+37410500501');
    const site = within(find).getByRole('link', { name: /lumen\.am/u });
    expect(site.getAttribute('href')).toBe('https://lumen.am');
    expect(site.getAttribute('target')).toBe('_blank');
  });

  it('has no website link when the venue gave none', async () => {
    open('/tumanyan-shawarma/tumanyan-street');
    const find = await screen.findByRole('region', { name: 'Find us' });
    await within(find).findByRole('link', { name: '+374 77 33 44 55' });
    expect(within(find).queryAllByRole('link')).toHaveLength(2);
  });
});

describe('opening hours', () => {
  it('shows the whole week with today marked, in the branch’s zone', async () => {
    open('/lumen-coffee/northern-avenue');
    const hours = await screen.findByRole('region', { name: 'Opening hours' });
    expect(within(hours).getByText('Times are Yerevan time.')).toBeDefined();
    const week = within(hours).getAllByRole('table')[0]!;
    expect(within(week).getAllByRole('row')).toHaveLength(7);
    const today = week.querySelector('tr[aria-current="date"]');
    expect(today?.textContent).toBe('Friday · today09:00–01:00');
  });

  it('moves today’s mark at midnight on a page left open', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    // Friday 23:59:30 in Yerevan.
    vi.setSystemTime(new Date('2026-10-16T19:59:30Z'));
    open(LUMEN);
    const hours = await screen.findByRole('region', { name: 'Opening hours' });
    const todayRow = () => hours.querySelector('tr[aria-current="date"] th')?.textContent;
    expect(todayRow()).toBe('Friday · today');
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(todayRow()).toBe('Saturday · today');
  });

  it('puts today’s special day on today’s row', async () => {
    const harness = createHarness({ now: FRIDAY_EVENING });
    const real = harness.publicGateway.resolveBranch.bind(harness.publicGateway);
    vi.spyOn(harness.publicGateway, 'resolveBranch').mockImplementation(async (input) => {
      const branch = await real(input);
      return (
        branch && {
          ...branch,
          specialDays: [{ date: '2026-10-16', note: 'Staff training', blocks: [] }],
        }
      );
    });
    render(harness.wrap(<PublicApp />, LUMEN));
    const hours = await screen.findByRole('region', { name: 'Opening hours' });
    const week = within(hours).getAllByRole('table')[0]!;
    // The week's Friday hours do not hold today: the special day's do.
    expect(week.querySelector('tr[aria-current="date"]')?.textContent).toBe(
      'Friday · today · Staff trainingClosed',
    );
  });

  it('lists the special days ahead under the week', async () => {
    open('/lumen-coffee/northern-avenue', { showcase: true });
    const special = await screen.findByRole('table', { name: 'Special days' });
    const rows = within(special).getAllByRole('row');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/October 21 · Staff training\s*Closed$/u),
      expect.stringMatching(/October 25 · Wine night\s*09:00–02:00$/u),
    ]);
  });
});

describe('when the detail does not load', () => {
  it('keeps the page and says which parts are missing, with a retry that works', async () => {
    const harness = createHarness({ now: FRIDAY_EVENING, showcase: true });
    const real = harness.gateway.getBranchDetail.bind(harness.gateway);
    const detail = vi
      .spyOn(harness.gateway, 'getBranchDetail')
      .mockRejectedValueOnce(new Error('network'))
      .mockImplementation(real);
    render(harness.wrap(<PublicApp />, '/lumen-coffee/northern-avenue'));

    // The page itself is up: the name, the open state, the room.
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Lumen Coffee');
    const reviews = await screen.findByRole('region', { name: 'Reviews' });
    expect(within(reviews).getByText('We could not load the reviews.')).toBeDefined();

    await userEvent.click(within(reviews).getByRole('button', { name: 'Try again' }));
    await within(reviews).findByText('24 reviews');
    expect(detail).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Cafe · Coffee, breakfast and brunch')).toBeDefined();
  });
});
