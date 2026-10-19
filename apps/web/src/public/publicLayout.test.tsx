// @vitest-environment jsdom
import { i18next } from '@yalla/i18n';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { STICKY_QUERY } from './layout';
import { PublicApp } from './PublicApp';
import { createHarness, initTestI18n } from './testHarness';

/**
 * The frame every phase of the public page redesign builds on (HANDOFF §6.1):
 * the top bar with its language switch, and the branch page's two slots — the
 * content column and the booking column, which sits sticky on the right from
 * 960px and between the header and the room on a phone.
 */

beforeAll(async () => {
  await initTestI18n();
});

const observer = Reflect.get(globalThis, 'IntersectionObserver') as unknown;

beforeEach(() => {
  // No observer at all, so the room draws its photos and a pin can be tapped:
  // the loader fails open without one.
  Reflect.deleteProperty(globalThis, 'IntersectionObserver');
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (observer !== undefined) Reflect.set(globalThis, 'IntersectionObserver', observer);
  // i18n is one instance per run: a test that failed halfway through a switch
  // must not leave the next one reading Russian.
  if (i18next.language !== 'en') await act(() => i18next.changeLanguage('en'));
});

const OPEN_HOURS = () => new Date('2026-10-16T16:00:00Z');

/** Where the router is, written into the page so a test can read it. */
function Where() {
  const location = useLocation();
  return <output data-testid="where">{`${location.pathname}${location.search}`}</output>;
}

function open(path: string) {
  const harness = createHarness({ now: OPEN_HOURS });
  const view = render(
    harness.wrap(
      <>
        <PublicApp />
        <Where />
      </>,
      path,
    ),
  );
  return { ...harness, ...view };
}

/** Whether the booking column is sticky beside the room — wide and tall enough. */
function stubViewport(wide: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === STICKY_QUERY ? wide : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  );
}

describe('the top bar', () => {
  it('carries the wordmark and the language switch, and nothing to install', async () => {
    open('/lumen-coffee/northern-avenue');
    const bar = await screen.findByRole('banner');

    expect(within(bar).getByRole('link', { name: 'Yalla' }).getAttribute('href')).toBe('#top');
    const group = within(bar).getByRole('group', { name: 'Language' });
    expect(within(group).getAllByRole('button')).toHaveLength(3);
    expect(within(bar).queryByText(/App Store|Google Play|Get the app/u)).toBeNull();
  });

  it('shows each language by its own short name, read out in full', async () => {
    open('/lumen-coffee/northern-avenue');
    const group = await screen.findByRole('group', { name: 'Language' });
    const buttons = within(group).getAllByRole('button');

    expect(buttons.map((button) => button.textContent)).toEqual(['Հայ', 'Рус', 'Eng']);
    // The accessible name contains the visible one (WCAG 2.5.3) and says it in full.
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Հայերեն',
      'Русский',
      'English',
    ]);
    expect(buttons.map((button) => button.getAttribute('lang'))).toEqual(['hy', 'ru', 'en']);
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
    ]);
  });

  it('puts the chosen language in ?lang= on the same page, and nowhere in storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    open('/lumen-coffee/northern-avenue');
    const group = await screen.findByRole('group', { name: 'Language' });

    await userEvent.setup().click(within(group).getByRole('button', { name: 'Русский' }));

    await waitFor(() =>
      expect(screen.getByTestId('where').textContent).toBe('/lumen-coffee/northern-avenue?lang=ru'),
    );
    expect(
      within(group).getByRole('button', { name: 'Русский' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(setItem).not.toHaveBeenCalled();

    // Back to English for the files that follow: i18n is one instance per run.
    await userEvent.setup().click(within(group).getByRole('button', { name: 'English' }));
    await waitFor(() =>
      expect(screen.getByTestId('where').textContent).toBe('/lumen-coffee/northern-avenue?lang=en'),
    );
  });

  it('keeps ?lang= on the links inside the page', async () => {
    open('/dolmama?lang=en');
    const link = await screen.findByRole('link', { name: /Pushkin Street/u });
    expect(link.getAttribute('href')).toBe('/dolmama/pushkin-street?lang=en');
  });

  it('adds nothing to a link when the page was opened without one', async () => {
    open('/dolmama');
    const link = await screen.findByRole('link', { name: /Pushkin Street/u });
    expect(link.getAttribute('href')).toBe('/dolmama/pushkin-street');
  });
});

describe('the branch page layout', () => {
  it('has a booking column holding the booking controls, outside the room', async () => {
    open('/lumen-coffee/northern-avenue');
    const aside = await screen.findByRole('region', { name: 'Book a table' });

    expect(aside.id).toBe('book');
    expect(within(aside).getByLabelText('Date')).toBeDefined();
    expect(within(aside).getByLabelText('Time')).toBeDefined();
    expect(within(aside).getByLabelText('Guests')).toBeDefined();

    const room = screen.getByRole('region', { name: 'The room' });
    expect(within(room).queryByLabelText('Time')).toBeNull();
  });

  it('puts the booking column after the header and before the room', async () => {
    open('/lumen-coffee/northern-avenue');
    const aside = await screen.findByRole('region', { name: 'Book a table' });
    const heading = screen.getByRole('heading', { level: 1, name: 'Lumen Coffee' });
    const room = screen.getByRole('region', { name: 'The room' });

    expect(heading.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(aside.compareDocumentPosition(room) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says booking is off in the same column, with the phone, when the venue takes none', async () => {
    open('/tumanyan-shawarma/tumanyan-street');
    const aside = await screen.findByRole('region', { name: 'Booking' });

    expect(within(aside).getByText(/not switched on for this venue/u)).toBeDefined();
    expect(
      within(aside).getByRole('link', { name: 'Call · +374 77 33 44 55' }).getAttribute('href'),
    ).toBe('tel:+37477334455');
    expect(within(aside).queryByLabelText('Time')).toBeNull();
  });

  it('opens the booking panel in the sticky column on a wide screen', async () => {
    stubViewport(true);
    open('/lumen-coffee/northern-avenue');
    const aside = await screen.findByRole('region', { name: 'Book a table' });

    await userEvent.setup().click(await firstFreePin());

    const panel = await screen.findByRole('dialog');
    expect(aside.contains(panel)).toBe(true);
  });

  it('keeps an open panel where it is, the same panel, when another table is tapped after a resize', async () => {
    // Decided once per panel: a window crossing 960px between two taps must not
    // remount a panel holding a verified phone and the attempt's command id.
    stubViewport(true);
    open('/lumen-coffee/northern-avenue');
    const aside = await screen.findByRole('region', { name: 'Book a table' });
    const user = userEvent.setup();

    const pins = await freePins();
    await user.click(pins[0]!);
    const panel = await screen.findByRole('dialog');
    expect(aside.contains(panel)).toBe(true);

    stubViewport(false);
    await user.click(pins[1]!);

    await waitFor(() =>
      expect(screen.getByRole('dialog').getAttribute('aria-label')).toMatch(
        new RegExp(`^Table ${pins[1]!.textContent} `, 'u'),
      ),
    );
    expect(screen.getByRole('dialog')).toBe(panel);
    expect(aside.contains(panel)).toBe(true);
  });

  it('opens it under the room on a phone', async () => {
    stubViewport(false);
    open('/lumen-coffee/northern-avenue');
    const aside = await screen.findByRole('region', { name: 'Book a table' });
    const room = screen.getByRole('region', { name: 'The room' });

    await userEvent.setup().click(await firstFreePin());

    const panel = await screen.findByRole('dialog');
    expect(aside.contains(panel)).toBe(false);
    expect(room.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

async function freePins(): Promise<HTMLElement[]> {
  const pins = await screen.findAllByRole('button', { name: /^Table .+, free$/u });
  const free = pins.filter((pin) => pin.getAttribute('aria-disabled') !== 'true');
  if (free.length < 2) throw new Error('fewer than two free pins at the default slot');
  return free;
}

async function firstFreePin(): Promise<HTMLElement> {
  return (await freePins())[0]!;
}
