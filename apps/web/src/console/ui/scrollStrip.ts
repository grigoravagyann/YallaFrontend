import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

/** How wide the fade on an overflowing edge is (`phone-pages.css`): an item brought into view clears it. */
export const STRIP_FADE_PX = 32;

/**
 * Marks which edges of a sideways-scrolling strip have more beyond them:
 * `is-fade-start` and `is-fade-end`, which `phone-pages.css` turns into a fade
 * on a phone. A strip that fits has neither.
 */
export function markStripEdges(strip: HTMLElement): void {
  const room = strip.scrollWidth - strip.clientWidth;
  // Sub-pixel widths leave a pixel or so of "overflow" that is not there.
  const start = room > 1 && strip.scrollLeft > 1;
  const end = room > 1 && strip.scrollLeft < room - 1;
  strip.classList.toggle('is-fade-start', start);
  strip.classList.toggle('is-fade-end', end);
}

/**
 * Scrolls the strip, and only the strip, so the item is wholly in view and
 * clear of the fade. Never `scrollIntoView`: that would move the page too.
 */
export function revealInStrip(strip: HTMLElement, item: HTMLElement): void {
  if (strip.scrollWidth <= strip.clientWidth) return;
  const box = strip.getBoundingClientRect();
  const at = item.getBoundingClientRect();
  // Already in view and clear of any fade: the strip stays where it is.
  const room = strip.scrollWidth - strip.clientWidth;
  const startFade = strip.scrollLeft > 1 ? STRIP_FADE_PX : 0;
  const endFade = strip.scrollLeft < room - 1 ? STRIP_FADE_PX : 0;
  if (at.left >= box.left + startFade && at.right <= box.right - endFade) {
    markStripEdges(strip);
    return;
  }
  if (at.left < box.left + STRIP_FADE_PX) {
    strip.scrollLeft += at.left - box.left - STRIP_FADE_PX;
  } else if (at.right > box.right - STRIP_FADE_PX) {
    strip.scrollLeft += at.right - box.right + STRIP_FADE_PX;
  }
  markStripEdges(strip);
}

/**
 * A tab strip that scrolls sideways on a phone: the fade follows the scroll
 * and the strip's size, and the current item (`activeSelector`) is brought
 * into view when the strip appears and whenever one of `revealOn` changes — a
 * new tab, a badge that widened one. Returns the strip's ref: a callback, so
 * a strip drawn only once its data has loaded is still followed.
 */
export function useScrollStrip<E extends HTMLElement>(
  activeSelector: string,
  revealOn: readonly unknown[],
): (node: E | null) => void {
  const strip = useRef<E | null>(null);
  const detach = useRef<(() => void) | null>(null);

  const attach = useCallback(
    (node: E | null) => {
      detach.current?.();
      detach.current = null;
      strip.current = node;
      if (!node) return;
      const mark = () => markStripEdges(node);
      node.addEventListener('scroll', mark, { passive: true });
      window.addEventListener('resize', mark);
      const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(mark) : null;
      observer?.observe(node);
      detach.current = () => {
        node.removeEventListener('scroll', mark);
        window.removeEventListener('resize', mark);
        observer?.disconnect();
      };
      reveal(node, activeSelector);
    },
    [activeSelector],
  );

  useLayoutEffect(() => {
    if (strip.current) reveal(strip.current, activeSelector);
    // `revealOn` is the caller's list of what moves or widens the current item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSelector, ...revealOn]);

  useEffect(
    () => () => {
      detach.current?.();
      detach.current = null;
    },
    [],
  );

  return attach;
}

function reveal(strip: HTMLElement, activeSelector: string): void {
  const active = strip.querySelector<HTMLElement>(activeSelector);
  if (active) revealInStrip(strip, active);
  else markStripEdges(strip);
}
