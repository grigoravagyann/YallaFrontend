// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initConsoleTestI18n } from '../reports/testHarness';
import { SalesChart } from './SalesChart';

/**
 * The person page's sales chart answers a tap (2026-10-27): iOS gives a
 * tapped button no focus, and a finger's pointer leaves as it lifts, so the
 * day's tip comes from the click and stays until the next one.
 */

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(cleanup);

const DAILY = [
  { date: '2026-10-25', salesAmd: 120_000, tables: 4 },
  { date: '2026-10-26', salesAmd: 80_000, tables: 3 },
  { date: '2026-10-27', salesAmd: 200_000, tables: 6 },
];

const tip = () => document.querySelector('.yc-sc-tip')?.textContent ?? null;

describe('the sales chart', () => {
  it('shows a day’s sales when its column is tapped, without focus', () => {
    render(<SalesChart daily={DAILY} today="2026-10-27" locale="en" />);
    const bars = screen.getAllByRole('button').filter((button) => button.hasAttribute('data-bar'));
    expect(tip()).toBeNull();
    fireEvent.click(bars[0]!);
    expect(tip()).toBe(bars[0]!.getAttribute('aria-label'));
    // The finger lifting is not the mouse leaving: the tip stays.
    fireEvent.pointerLeave(bars[0]!.closest('[role="group"]')!, { pointerType: 'touch' });
    expect(tip()).toBe(bars[0]!.getAttribute('aria-label'));
    fireEvent.click(bars[1]!);
    expect(tip()).toBe(bars[1]!.getAttribute('aria-label'));
    // The tapped day is the group's one Tab stop, as the arrow keys would leave it.
    expect(bars[1]!.tabIndex).toBe(0);
    expect(bars[2]!.tabIndex).toBe(-1);
  });
});
