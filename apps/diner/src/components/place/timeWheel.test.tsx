import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WheelSlot } from '../../places/wheelTimes';
import { TimeWheel } from './TimeWheel';

/**
 * The time wheel, as a screen reader and a keyboard meet it: one adjustable
 * control named "Time" whose spoken value is the chosen time, stepping to the
 * next or previous time that can be had — past the busy ones — and jumping to
 * either end. The rows themselves are hidden from assistive tech, and a time
 * the day does not offer is not a row at all.
 */

vi.mock('../../lib/haptics', () => ({
  haptics: { select: vi.fn(), success: vi.fn(), tap: vi.fn() },
}));

const MINUTE = 60_000;
const BASE = Date.parse('2026-10-20T15:00:00.000Z'); // 19:00 Yerevan

const SLOTS: readonly WheelSlot[] = [
  { at: BASE - 15 * MINUTE, label: '18:45', state: 'free' },
  { at: BASE, label: '19:00', state: 'free' },
  { at: BASE + 15 * MINUTE, label: '19:15', state: 'busy' },
  { at: BASE + 30 * MINUTE, label: '19:30', state: 'busy' },
  { at: BASE + 45 * MINUTE, label: '19:45', state: 'requestable' },
  { at: BASE + 60 * MINUTE, label: '20:00', state: 'free' },
];

afterEach(cleanup);

function wheel(value: number | null = BASE) {
  const onChange = vi.fn();
  render(
    <TimeWheel
      slots={SLOTS}
      value={value}
      onChange={onChange}
      accessibilityLabel="Time"
      accessibilityValueText="19:00"
      accessibilityHint="Swipe up or down to change the time"
    />,
  );
  return { onChange, control: screen.getByRole('slider', { name: 'Time' }) };
}

describe('the time wheel', () => {
  it('is one adjustable control named by its label, with the chosen time as its value', () => {
    const { control } = wheel();
    expect(control.getAttribute('aria-valuetext')).toBe('19:00');
    expect(control.getAttribute('tabindex')).toBe('0');
  });

  it('steps to the next time that can be had, past the busy ones, and back', () => {
    const { onChange, control } = wheel();
    fireEvent.keyDown(control, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith(BASE + 45 * MINUTE, { snappedFrom: null });
    fireEvent.keyDown(control, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith(BASE - 15 * MINUTE, { snappedFrom: null });
  });

  it('jumps to the first and the last time that can be had', () => {
    const { onChange, control } = wheel();
    fireEvent.keyDown(control, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith(BASE + 60 * MINUTE, { snappedFrom: null });
    fireEvent.keyDown(control, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith(BASE - 15 * MINUTE, { snappedFrom: null });
  });

  it('goes nowhere past either end', () => {
    const onChange = vi.fn();
    render(
      <TimeWheel
        slots={SLOTS}
        value={BASE + 60 * MINUTE}
        onChange={onChange}
        accessibilityLabel="Time"
        accessibilityValueText="20:00"
      />,
    );
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'ArrowUp' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('draws the two columns for the eye only: the hours, and the chosen hour’s minutes', () => {
    const { control } = wheel();
    const columns = control.querySelector('[aria-hidden="true"]');
    expect(columns).not.toBeNull();
    const text = columns!.textContent ?? '';
    // Hours 18, 19 and 20; the minutes of 19 — busy ones included, struck.
    expect(text).toContain('18');
    expect(text).toContain('20');
    for (const minutes of ['00', '15', '30', '45']) expect(text).toContain(minutes);
  });

  it('stops on a busy row by moving to the nearest time that can be had, saying which it left', () => {
    const { onChange, control } = wheel();
    // A tap on the busy 19:15 in the minute column: back to 19:00, the nearest.
    const columns = control.querySelector('[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(within(columns).getByText('15'));
    expect(onChange).toHaveBeenCalledWith(BASE, {
      snappedFrom: SLOTS[2],
    });
  });
});
