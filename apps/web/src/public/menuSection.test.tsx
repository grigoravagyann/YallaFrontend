// @vitest-environment jsdom
import type { BranchMenu } from '@yalla/api';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initTestI18n } from './testHarness';

/*
 * This file's runtime has no Armenian number data, as headless Chromium has
 * none: every `Intl.NumberFormat` is built as the root locale would be, whose
 * group separator is a comma. Hoisted, so `@yalla/format` builds its dram
 * formatter in that runtime.
 */
vi.hoisted(() => {
  const Real = Intl.NumberFormat;
  function RootOnly(_locales?: string | string[], options?: Intl.NumberFormatOptions) {
    return new Real('und', options);
  }
  // Everything else `Intl` has, prototype and non-enumerable members included.
  globalThis.Intl = Object.create(Intl, {
    NumberFormat: { value: RootOnly, configurable: true, writable: true },
  }) as typeof Intl;
});

const { MenuSection } = await import('./MenuSection');

/**
 * The menu (Main artboard): one category at a time behind chips with counts,
 * a thumbnail or the dish's initial, sold-out said in words, and the price in
 * dram the way Armenia writes it — "1 400 ֏" — whatever number data the
 * browser has.
 */

beforeAll(async () => {
  await initTestI18n();
});

afterEach(async () => {
  cleanup();
  if (i18next.language !== 'en') await act(() => i18next.changeLanguage('en'));
});

function item(id: string, name: string, priceDram: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    categoryId: 'c',
    name,
    description: '',
    priceDram,
    photo: { photoId: '', thumbnailUrl: '', cardUrl: '', fullUrl: '', width: null, height: null },
    ingredients: '',
    allergens: '',
    portionSize: '',
    isAvailable: true,
    ...extra,
  };
}

const MENU = {
  branchId: 'b',
  fetchedAtUtc: '2026-10-16T16:00:00Z',
  categories: [
    {
      id: 'coffee',
      name: 'Coffee',
      displayOrder: 1,
      items: [
        item('latte', 'Latte', 1400, { description: 'Espresso with milk, 300 ml' }),
        item('raf', 'Vanilla raf', 1700, { isAvailable: false }),
      ],
    },
    { id: 'hot', name: 'Hot dishes', displayOrder: 2, items: [item('steak', 'Beef steak', 9800)] },
    { id: 'empty', name: 'Nothing yet', displayOrder: 3, items: [] },
  ],
} as unknown as BranchMenu;

function show(menu: BranchMenu | null = MENU) {
  return render(
    <I18nextProvider i18n={i18next}>
      <MenuSection menu={menu} />
    </I18nextProvider>,
  );
}

describe('the menu', () => {
  it('shows one category at a time, chosen from chips with their counts', async () => {
    show();
    const chips = screen.getByRole('group', { name: 'Menu sections' });
    const buttons = within(chips).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['Coffee2', 'Hot dishes1']);
    expect(buttons[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Latte')).toBeDefined();
    expect(screen.queryByText('Beef steak')).toBeNull();

    await userEvent.click(buttons[1]!);
    expect(buttons[1]!.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Beef steak')).toBeDefined();
    expect(screen.queryByText('Latte')).toBeNull();
  });

  it('says a sold-out dish is sold out, in words', () => {
    show();
    const raf = screen.getByText('Vanilla raf').closest('li')!;
    expect(within(raf).getByText('Sold out')).toBeDefined();
    expect(raf.className).toContain('is-sold-out');
  });

  it('stands the initial in for a dish with no photo', () => {
    show();
    const latte = screen.getByText('Latte').closest('li')!;
    expect(latte.querySelector('.pub-dish-initial')?.textContent).toBe('L');
  });

  it('prices in Armenian as "1 400 ֏" though the browser has no Armenian number data', async () => {
    await act(() => i18next.changeLanguage('hy'));
    show();
    const latte = screen.getByText('Latte').closest('li')!;
    expect(latte.querySelector('.pub-menu-price')?.textContent).toBe('1 400 ֏');
  });

  it('says there is no menu yet when there is none', () => {
    show(null);
    expect(screen.getByText('No menu published yet.')).toBeDefined();
    expect(screen.queryByRole('group', { name: 'Menu sections' })).toBeNull();
  });
});
