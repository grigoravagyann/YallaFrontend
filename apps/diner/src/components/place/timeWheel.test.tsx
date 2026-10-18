import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

// jsdom has no `matchMedia`, which React Native Web reads as reduced motion.
const motion = vi.hoisted(() => ({ reduced: true }));
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => motion.reduced }));

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

describe('the time wheel with nothing chosen', () => {
  it('highlights no row, and the first row of either column can be tapped', () => {
    const { onChange, control } = wheel(null);
    expect(screen.queryAllByTestId('time-wheel-chosen')).toHaveLength(0);
    const columns = control.querySelector('[aria-hidden="true"]') as HTMLElement;
    // 18 is the first hour; tapping it chooses its time.
    fireEvent.click(within(columns).getByText('18'));
    expect(onChange).toHaveBeenLastCalledWith(BASE - 15 * MINUTE, { snappedFrom: null });
    // 45, the first (and only) minute of 18, as well.
    onChange.mockClear();
    fireEvent.click(within(columns).getByText('45'));
    expect(onChange).toHaveBeenLastCalledWith(BASE - 15 * MINUTE, { snappedFrom: null });
  });

  it('highlights the chosen hour and minute once there is a time', () => {
    wheel(BASE);
    expect(screen.getAllByTestId('time-wheel-chosen').map((row) => row.textContent)).toEqual([
      '19',
      '00',
    ]);
  });
});

/*
 * The columns' own scrolling, as the app's embedded browser does it: a smooth
 * (animated) `scroll()` is accepted and never moves the column, and a column
 * can still get a scroll event later — the page scrolling, a sheet opening —
 * with nobody's hand on it. The 2026-10-18 QA: the chosen 19:30 became 13:30
 * that way while the "free by 21:25" sheet was open, and was booked.
 */
describe('the time wheel takes a choice only from the diner’s hand', () => {
  const top = new WeakMap<Element, number>();
  const scrolls: { el: Element; top: number; behavior: string | undefined }[] = [];
  const saved = {
    scroll: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scroll'),
    scrollTop: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop'),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    // Motion on: a move made for the diner is a smooth scroll.
    motion.reduced = false;
    scrolls.length = 0;
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get(this: Element) {
        return top.get(this) ?? 0;
      },
      set(this: Element, value: number) {
        top.set(this, value);
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scroll', {
      configurable: true,
      value(this: Element, options: { top?: number; behavior?: string }) {
        scrolls.push({ el: this, top: options.top ?? 0, behavior: options.behavior });
        // The embedded browser: a smooth scroll goes nowhere.
        if (options.behavior !== 'smooth') top.set(this, options.top ?? 0);
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    motion.reduced = true;
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
    }
  });

  function setup(value: number) {
    const onChange = vi.fn();
    const props = {
      slots: SLOTS,
      onChange,
      accessibilityLabel: 'Time',
      accessibilityValueText: '19:00',
    };
    const view = render(<TimeWheel {...props} value={value} />);
    const columns = screen
      .getByRole('slider', { name: 'Time' })
      .querySelector('[aria-hidden="true"]') as HTMLElement;
    const hours = columns.children[0] as HTMLElement;
    const minutes = columns.children[2] as HTMLElement;
    // Past the first placement's own window.
    act(() => vi.advanceTimersByTime(2_000));
    return {
      onChange,
      hours,
      minutes,
      choose: (at: number) => view.rerender(<TimeWheel {...props} value={at} />),
    };
  }

  /** A scroll event on a column that stands at `y`, and the wait for it to settle. */
  function scrolled(column: HTMLElement, y: number) {
    act(() => {
      column.scrollTop = y;
      fireEvent.scroll(column);
    });
    act(() => vi.advanceTimersByTime(1_000));
  }

  it('a scroll event with no diner interaction never calls onChange', () => {
    const { onChange, hours, minutes } = setup(BASE);
    scrolled(hours, 0);
    scrolled(minutes, 2 * 44);
    expect(onChange).not.toHaveBeenCalled();
    // And the column goes back where the chosen time is, at once.
    expect(hours.scrollTop).toBe(44);
    expect(minutes.scrollTop).toBe(0);
  });

  it.each([
    ['a mouse wheel', (el: HTMLElement) => fireEvent.wheel(el, { deltaY: -100 })],
    ['a pointer down', (el: HTMLElement) => fireEvent.pointerDown(el)],
    [
      'a touch',
      (el: HTMLElement) => {
        const touch = { identifier: 0, clientX: 0, clientY: 0, pageX: 0, pageY: 0, target: el };
        fireEvent.touchStart(el, { touches: [touch], changedTouches: [touch] });
      },
    ],
  ])('takes where the diner stops it after %s', (_, touch) => {
    const { onChange, hours } = setup(BASE);
    touch(hours);
    scrolled(hours, 0);
    // Hour 18 has only :45.
    expect(onChange).toHaveBeenCalledWith(BASE - 15 * MINUTE, { snappedFrom: null });
  });

  it('takes one stop per touch: a later event with no hand on the column chooses nothing', () => {
    const { onChange, hours } = setup(BASE);
    fireEvent.wheel(hours, { deltaY: -100 });
    scrolled(hours, 0);
    expect(onChange).toHaveBeenCalledTimes(1);
    scrolled(hours, 2 * 44);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('forgets the diner’s hand once the column is moved for them', () => {
    const { onChange, hours, choose } = setup(BASE);
    fireEvent.wheel(hours, { deltaY: 100 });
    // A chip, a sheet's suggestion: 20:00. Then a stray scroll on the hours.
    choose(BASE + 60 * MINUTE);
    act(() => vi.advanceTimersByTime(2_000));
    scrolled(hours, 44);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('realigns a column that did not follow, without animation, instead of choosing', () => {
    const { onChange, hours, choose } = setup(BASE);
    choose(BASE + 60 * MINUTE);
    // Sent to 20:00 smoothly — and, in the embedded browser, still on 19.
    expect(scrolls.filter((s) => s.el === hours).at(-1)).toMatchObject({
      top: 88,
      behavior: 'smooth',
    });
    expect(hours.scrollTop).toBe(44);
    act(() => vi.advanceTimersByTime(2_000));
    expect(scrolls.filter((s) => s.el === hours).at(-1)).toMatchObject({
      top: 88,
      behavior: 'auto',
    });
    expect(hours.scrollTop).toBe(88);
    // A later stray event finds it where it belongs, and chooses nothing.
    scrolled(hours, 88);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('the time wheel on the web', () => {
  it('is one tab stop: the slider, never a row', () => {
    const { control } = wheel();
    expect(control.getAttribute('tabindex')).toBe('0');
    const stops = [...control.querySelectorAll('[tabindex]')];
    expect(stops.length).toBeGreaterThan(0);
    for (const stop of stops) expect(stop.getAttribute('tabindex')).toBe('-1');
  });
});
