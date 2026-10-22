import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { colors } from '../theme';
import { Toggle } from './Toggle';

/**
 * The tab's "can order / see the total / pay" switches. On, the thumb was the
 * brand burgundy on the brand burgundy track — no thumb at all — and off, a
 * white track on a white card had no edge (S2, 2026-10-22). Read as the web
 * build draws them, which is also the only place the thumb's colour can be read.
 */

afterEach(cleanup);

/** `#RRGGBB` as the DOM reports it. */
function rgb(hex: string): string {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

/** The track and the thumb: the switch's two painted boxes, in that order. */
function parts(): [CSSStyleDeclaration, CSSStyleDeclaration] {
  const input = screen.getByRole('switch', { name: 'Can pay' });
  const painted = [...(input.parentElement?.querySelectorAll<HTMLElement>('div') ?? [])]
    .map((node) => getComputedStyle(node))
    .filter((style) => style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)');
  return [painted[0]!, painted[1]!];
}

describe('Toggle', () => {
  it('draws on as a white thumb on the brand track', () => {
    render(<Toggle value onValueChange={() => undefined} accessibilityLabel="Can pay" />);
    const [track, thumb] = parts();
    expect(track.backgroundColor).toBe(rgb(colors.brand));
    expect(thumb.backgroundColor).toBe('rgb(255, 255, 255)');
  });

  it('draws off as a white thumb on a track that shows against a white card', () => {
    render(<Toggle value={false} onValueChange={() => undefined} accessibilityLabel="Can pay" />);
    const [track, thumb] = parts();
    expect(track.backgroundColor).toBe(rgb(colors.borderStrong));
    expect(thumb.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(track.backgroundColor).not.toBe(rgb(colors.surface));
  });

  it('says whether it is on, and hands back the new value', () => {
    const onValueChange = vi.fn();
    render(<Toggle value={false} onValueChange={onValueChange} accessibilityLabel="Can pay" />);
    const input = screen.getByRole('switch', { name: 'Can pay' }) as HTMLInputElement;
    expect(input.checked).toBe(false);

    fireEvent.click(input);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });
});
