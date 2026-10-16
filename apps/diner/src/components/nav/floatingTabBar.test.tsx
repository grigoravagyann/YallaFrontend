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

function props() {
  const routes = ['index', 'bookings', 'scan', 'orders', 'profile'].map((name) => ({
    key: `${name}-key`,
    name,
  }));
  const titles: Record<string, string> = {
    index: 'Բացահայտել',
    bookings: 'Ամրագրումներ',
    scan: 'Սկանավորել',
    orders: 'Պատվերներ',
    profile: 'Պրոֆիլ',
  };
  return {
    state: { index: 0, routes },
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
});
