import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FloatingTabBar } from './FloatingTabBar';

/**
 * At 375px the Armenian labels — "Բացահայտել", "Ամրագրումներ" — ran into each
 * other: a label sized itself to its text, not to its slot. Each label is now
 * held to its slot's width, so a long one is cut short instead of overlapping.
 */

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

afterEach(cleanup);

const ARMENIAN: Record<string, string> = {
  index: 'Բացահայտել',
  bookings: 'Ամրագրումներ',
  scan: 'Սկանավորել',
  orders: 'Պատվերներ',
  profile: 'Պրոֆիլ',
};
const ENGLISH: Record<string, string> = {
  index: 'Explore',
  bookings: 'Bookings',
  scan: 'Scan',
  orders: 'Orders',
  profile: 'Profile',
};

function props(titles: Record<string, string> = ARMENIAN, index = 0) {
  const routes = ['index', 'bookings', 'scan', 'orders', 'profile'].map((name) => ({
    key: `${name}-key`,
    name,
  }));
  return {
    state: { index, routes },
    descriptors: Object.fromEntries(
      routes.map((route) => [route.key, { options: { title: titles[route.name] } }]),
    ),
    navigation: { emit: () => ({ defaultPrevented: false }), navigate: vi.fn() },
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  } as unknown as Parameters<typeof FloatingTabBar>[0];
}

describe('the bottom navigation', () => {
  it('holds each label, and the slot it sits in, to the slot width', () => {
    render(<FloatingTabBar {...props()} />);

    for (const label of ['Բացահայտել', 'Ամրագրումներ']) {
      const text = screen.getByText(label);
      expect(getComputedStyle(text).maxWidth, label).toBe('100%');
      const pair = text.parentElement!;
      expect(getComputedStyle(pair).maxWidth, label).toBe('100%');
      const slot = screen.getByRole('tab', { name: label });
      expect(getComputedStyle(slot).minWidth, label).toBe('0px');
    }
  });

  it('shows five tabs in order, every label always on, Scan in the middle', () => {
    render(<FloatingTabBar {...props(ENGLISH)} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.getAttribute('aria-label'))).toEqual([
      'Explore',
      'Bookings',
      'Scan',
      'Orders',
      'Profile',
    ]);
    for (const label of Object.values(ENGLISH)) expect(screen.getByText(label)).toBeTruthy();
  });

  it('marks only the current tab, its label in the brand ink', () => {
    render(<FloatingTabBar {...props(ENGLISH, 3)} />);

    const selected = screen
      .getAllByRole('tab')
      .filter((tab) => tab.getAttribute('aria-selected') === 'true')
      .map((tab) => tab.getAttribute('aria-label'));
    expect(selected).toEqual(['Orders']);
    const active = screen.getByText('Orders').style.color;
    const idle = screen.getByText('Bookings').style.color;
    expect(active).not.toBe(idle);
    // Every label is the same size, so all five sit on one baseline.
    const sizes = Object.values(ENGLISH).map((label) => screen.getByText(label).style.fontSize);
    expect(new Set(sizes)).toEqual(new Set(['11.5px']));
  });
});
