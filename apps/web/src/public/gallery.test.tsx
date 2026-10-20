// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { i18next } from '@yalla/i18n';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicApp } from './PublicApp';
import { createHarness, initTestI18n, stubIntersectionObserverAsNeverVisible } from './testHarness';

/**
 * The photos at the top of the branch page (Main artboard): the cover, four
 * thumbnails under it — the first three put their photo on the cover, the last
 * opens every photo in a dialog — and nothing at all for a venue with none.
 */

beforeAll(async () => {
  await initTestI18n();
});

beforeEach(() => {
  stubIntersectionObserverAsNeverVisible();
});

afterEach(async () => {
  cleanup();
  if (i18next.language !== 'en') await act(() => i18next.changeLanguage('en'));
});

const FRIDAY_EVENING = () => new Date('2026-10-16T16:00:00Z');

function open(path: string) {
  // The showcase gives Northern Avenue its listing: the gallery among it.
  const harness = createHarness({ now: FRIDAY_EVENING, showcase: true });
  return render(harness.wrap(<PublicApp />, path));
}

/** Northern Avenue: the cover and six gallery photos. */
const LUMEN = '/lumen-coffee/northern-avenue';

describe('the photos', () => {
  it('shows the cover with four thumbnails, the last one opening all seven', async () => {
    const { container } = open(LUMEN);
    const photos = await screen.findByRole('group', { name: 'Photos' });
    const thumbs = within(photos).getAllByRole('button');
    expect(thumbs.map((thumb) => thumb.getAttribute('aria-label'))).toEqual([
      'Photo 1 of 7',
      'Photo 2 of 7',
      'Photo 3 of 7',
      'All 7 photos',
    ]);
    expect(thumbs[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(thumbs[3]!.hasAttribute('aria-pressed')).toBe(false);
    expect(container.querySelector('.pub-cover img')?.getAttribute('src')).toBe(
      '/api/photos/photo-cover-lumen/card',
    );
  });

  it('puts a thumbnail’s photo on the cover', async () => {
    const { container } = open(LUMEN);
    await userEvent.click(await screen.findByRole('button', { name: 'Photo 2 of 7' }));
    expect(screen.getByRole('button', { name: 'Photo 2 of 7' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Photo 1 of 7' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(container.querySelector('.pub-cover img')?.getAttribute('src')).toBe(
      '/api/photos/photo-gallery-lumen-north-1/card',
    );
    expect(container.querySelector('.pub-cover-count')?.textContent).toBe('2 / 7');
  });

  it('holds the thumbnails’ row while the listing loads, so the name does not jump', async () => {
    const harness = createHarness({ now: FRIDAY_EVENING, showcase: true });
    let release: () => void = () => {};
    const real = harness.gateway.getBranchDetail.bind(harness.gateway);
    vi.spyOn(harness.gateway, 'getBranchDetail').mockImplementation(
      (...args) =>
        new Promise((resolve) => {
          release = () => resolve(real(...args));
        }),
    );
    const { container } = render(harness.wrap(<PublicApp />, LUMEN));
    await screen.findByRole('heading', { level: 1 });
    const placeholder = container.querySelector('.pub-gallery.is-loading');
    expect(placeholder).not.toBeNull();
    expect(placeholder?.getAttribute('aria-hidden')).toBe('true');
    expect(placeholder?.querySelectorAll('.pub-skeleton')).toHaveLength(4);
    await act(async () => release());
    expect(await screen.findByRole('group', { name: 'Photos' })).toBeDefined();
    expect(container.querySelector('.pub-gallery.is-loading')).toBeNull();
  });

  it('names a thumbnail in Armenian as the artboard does', async () => {
    await act(() => i18next.changeLanguage('hy'));
    open(LUMEN);
    expect(await screen.findByRole('button', { name: '7 լուսանկարից 2-րդը' })).toBeDefined();
  });

  it('shows nothing for a venue with no photos', async () => {
    const { container } = open('/tumanyan-shawarma/tumanyan-street');
    await screen.findByRole('heading', { level: 1 });
    await screen.findByText('No reviews yet');
    expect(screen.queryByRole('group', { name: 'Photos' })).toBeNull();
    expect(container.querySelector('.pub-cover')).toBeNull();
  });

  it('leaves out a photo that does not load', async () => {
    const { container } = open(LUMEN);
    await screen.findByRole('button', { name: 'All 7 photos' });
    const broken = container.querySelector<HTMLImageElement>(
      '.pub-gallery button:nth-child(2) img',
    )!;
    broken.dispatchEvent(new Event('error'));
    expect(await screen.findByRole('button', { name: 'All 6 photos' })).toBeDefined();
  });
});

describe('the gallery dialog', () => {
  it('opens on the last thumbnail with every photo, focus on Close', async () => {
    open(LUMEN);
    await userEvent.click(await screen.findByRole('button', { name: 'All 7 photos' }));

    const dialog = screen.getByRole('dialog', { name: 'Photos · 7' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(within(dialog).getAllByRole('img')).toHaveLength(7);
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Close' }));
  });

  it('keeps Tab inside, closes on Escape and gives focus back to the thumbnail', async () => {
    open(LUMEN);
    const opener = await screen.findByRole('button', { name: 'All 7 photos' });
    await userEvent.click(opener);
    const close = within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' });

    await userEvent.tab();
    expect(document.activeElement).toBe(close);
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(close);

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes on a tap outside the photos, and focus goes back', async () => {
    open(LUMEN);
    const opener = await screen.findByRole('button', { name: 'All 7 photos' });
    await userEvent.click(opener);
    const scrim = screen.getByRole('dialog').parentElement!;
    // A tap on a photo is not a tap outside.
    await userEvent.click(within(screen.getByRole('dialog')).getAllByRole('img')[0]!);
    expect(screen.getByRole('dialog')).toBeDefined();
    await userEvent.click(scrim);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it('drops a photo from the dialog when it does not load', async () => {
    open(LUMEN);
    await userEvent.click(await screen.findByRole('button', { name: 'All 7 photos' }));
    const dialog = screen.getByRole('dialog');
    within(dialog).getAllByRole('img')[6]!.dispatchEvent(new Event('error'));
    await waitFor(() =>
      expect(within(screen.getByRole('dialog')).getAllByRole('img')).toHaveLength(6),
    );
    expect(screen.getByRole('dialog', { name: 'Photos · 6' })).toBeDefined();
  });

  it('closes on Close', async () => {
    open(LUMEN);
    const opener = await screen.findByRole('button', { name: 'All 7 photos' });
    await userEvent.click(opener);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
  });
});
