import { cleanup, render, screen } from '@testing-library/react';
import { contrastRatio } from '@yalla/tokens';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { colors, space } from '../../theme';
import { FloatingTabBar, NAV_DOT } from './FloatingTabBar';
import { NAV_CLEARANCE, SCAN_RISE, navBottomOffset, tabBarMetrics } from './metrics';

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
    emitter: { emit: () => ({ defaultPrevented: false }) },
    navigateToTab: vi.fn(),
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
    expect(screen.getByText('Orders').style.color).toBe(rgb(colors.primary));
    const idle = new Set(
      ['Explore', 'Bookings', 'Scan', 'Profile'].map(
        (label) => screen.getByText(label).style.color,
      ),
    );
    expect(idle.size).toBe(1);
    expect([...idle][0]).not.toBe(rgb(colors.primary));
    // Every label is the same size, so all five sit on one baseline.
    const sizes = Object.values(ENGLISH).map((label) => screen.getByText(label).style.fontSize);
    expect(new Set(sizes).size).toBe(1);
  });

  it('frosts the bar and the Scan circle with the same glass', () => {
    render(<FloatingTabBar {...props(ENGLISH)} />);
    // One glass layer in the pill, one in the circle, washed alike.
    const washes = screen.getAllByTestId('nav-glass');
    expect(washes).toHaveLength(2);
    const [bar, circle] = washes.map((node) => getComputedStyle(node).backgroundColor);
    expect(circle).toBe(bar);
    // See-through, but white enough to read on.
    expect(alphaOf(bar!)).toBeLessThan(0.9);
    expect(alphaOf(bar!)).toBeGreaterThanOrEqual(0.5);
  });

  it('keeps an idle label readable on the glass over the app light grounds', () => {
    render(<FloatingTabBar {...props(ENGLISH)} />);
    const wash = getComputedStyle(screen.getAllByTestId('nav-glass')[0]!).backgroundColor;
    const ink = toHex(screen.getByText('Bookings').style.color);
    for (const under of ['#FFFFFF', '#F7F6F1']) {
      expect(contrastRatio(ink, over(wash, under)), under).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('the room the bar takes', () => {
  it('clears the pill and the Scan circle rising out of it, with ground to spare', () => {
    // Measured from the pill's lower edge; the screen adds navBottomOffset.
    const pillTop = tabBarMetrics.height;
    const circleTop = pillTop + SCAN_RISE;
    expect(SCAN_RISE).toBe(
      tabBarMetrics.scanBottom + tabBarMetrics.scanSize - tabBarMetrics.height,
    );
    expect(NAV_CLEARANCE).toBeGreaterThanOrEqual(pillTop + space.lg);
    expect(NAV_CLEARANCE).toBeGreaterThanOrEqual(circleTop + space.sm);
    // And no more than that: a screen's last card ends just above the bar.
    expect(NAV_CLEARANCE).toBe(Math.max(pillTop + space.lg, circleTop + space.sm));
  });

  it('tucks into the home-indicator area instead of floating a full gap above it', () => {
    // An iPhone's 34 pt inset: the pill sits 26 pt off the screen's edge, as designed.
    expect(navBottomOffset(34)).toBe(26);
    // No inset (old Android, web): never flush with the edge.
    expect(navBottomOffset(0)).toBe(tabBarMetrics.minBottom);
    // A tall Android 3-button bar keeps the pill above it.
    expect(navBottomOffset(48)).toBe(40);
  });
});

/** `#RRGGBB` as the DOM reports it. */
function rgb(hex: string): string {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

function channels(css: string): number[] {
  return (/rgba?\(([^)]+)\)/u.exec(css)?.[1] ?? '').split(',').map((part) => Number(part.trim()));
}

function alphaOf(css: string): number {
  return channels(css)[3] ?? 1;
}

function toHex(css: string): string {
  return `#${channels(css)
    .slice(0, 3)
    .map((value) => Math.round(value).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** A translucent fill as it reads laid over a ground. */
function over(css: string, ground: string): string {
  const [r = 0, g = 0, b = 0, a = 1] = channels(css);
  const [gr = 0, gg = 0, gb = 0] = [1, 3, 5].map((i) => parseInt(ground.slice(i, i + 2), 16));
  return toHex(`rgb(${r * a + gr * (1 - a)}, ${g * a + gg * (1 - a)}, ${b * a + gb * (1 - a)})`);
}

/**
 * Guest messages (2026-10-23): a venue's message waits unread — a dot on
 * Bookings, no number, and the tab's name says it in words.
 */
describe('the unread-messages dot', () => {
  it('draws a dot, not a count, and the tab says why', () => {
    const base = props(ENGLISH);
    const bookings = base.state.routes[1]!.key;
    const withDot = {
      ...base,
      descriptors: {
        ...base.descriptors,
        [bookings]: {
          options: {
            title: 'Bookings',
            tabBarBadge: NAV_DOT,
            tabBarAccessibilityLabel: 'Bookings, new messages',
          },
        },
      },
    } as unknown as Parameters<typeof FloatingTabBar>[0];
    render(<FloatingTabBar {...withDot} />);

    const tab = screen.getByRole('tab', { name: 'Bookings, new messages' });
    // No count is drawn: the badge's text would be its only text besides the label.
    expect(tab.textContent).toBe('Bookings');
  });
});
