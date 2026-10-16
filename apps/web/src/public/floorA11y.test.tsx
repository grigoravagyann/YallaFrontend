// @vitest-environment jsdom
import { cafeFloorPlan } from '@yalla/floorplan/mocks';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import FloorPlanCanvas from './FloorPlanCanvas';
import { initTestI18n } from './testHarness';

/**
 * The room says "Tap a free table to book it" and, until this, offered a
 * keyboard or screen-reader user nothing to tap: every table was a bare SVG
 * group with a click handler. Each one is a named button now, and the tables
 * that cannot be picked are still named, so the room reads as a room.
 *
 * The same render used to log six "Unknown event handler property" errors —
 * react-native-svg's responder props reaching the DOM — on every page with a
 * floor plan. Noise that hides real errors is a defect, so it is asserted on.
 */

const SIZE = { width: 640, height: 480 };

beforeAll(async () => {
  await initTestI18n();
  // The canvas measures its box; jsdom gives it none.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: SIZE.width,
    bottom: SIZE.height,
    ...SIZE,
    toJSON: () => ({}),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function drawRoom(onTableTap = vi.fn()) {
  render(
    <I18nextProvider i18n={i18next}>
      <FloorPlanCanvas
        plan={cafeFloorPlan}
        partySize={2}
        selectedTableId={null}
        onTableTap={onTableTap}
        bookable
      />
    </I18nextProvider>,
  );
  return onTableTap;
}

describe('the public room, read without a pointer', () => {
  // First, deliberately: React reports an unknown prop once per process, so a
  // later render would find the warning already spent and pass for nothing.
  it('logs no unknown-event-handler errors while drawing', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    drawRoom();
    const noise = errors.mock.calls.filter((call) =>
      String(call[0]).includes('Unknown event handler property'),
    );
    expect(noise, noise.map((call) => String(call[0]).slice(0, 80)).join('\n')).toHaveLength(0);
  });

  it('names every free table as a button a keyboard can reach', () => {
    drawRoom();
    const table2 = screen.getByRole('button', { name: 'Table 2, 2 seats, Free' });
    expect(table2.getAttribute('tabindex')).toBe('0');
  });

  it('still names a table that cannot be picked, without offering it', () => {
    drawRoom();
    expect(screen.getByRole('img', { name: 'Table 1, 2 seats, Occupied' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Table 1,/u })).toBeNull();
  });

  it('picks a table on Enter and on Space', async () => {
    const onTableTap = drawRoom();
    const user = userEvent.setup();
    const table2 = screen.getByRole('button', { name: 'Table 2, 2 seats, Free' });

    table2.focus();
    await user.keyboard('{Enter}');
    expect(onTableTap.mock.lastCall?.[0]).toBe('t2');
    await user.keyboard(' ');
    expect(onTableTap).toHaveBeenCalledTimes(2);
  });
});
