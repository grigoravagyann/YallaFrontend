// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { STRIP_FADE_PX, markStripEdges, revealInStrip } from './scrollStrip';
import { Tabs } from './Tabs';

/**
 * Tab strips on a phone (2026-10-27): they scroll sideways, the edge with
 * more beyond it fades, and the current tab is brought into view — the strip
 * scrolled, never the page. jsdom lays nothing out, so each strip is given
 * its widths and each item its place by hand.
 */

afterEach(cleanup);

/** A strip `client` wide over `scroll` of content, items laid out by `left`/`width` in content space. */
function laidOut(strip: HTMLElement, client: number, scroll: number) {
  Object.defineProperty(strip, 'clientWidth', { configurable: true, get: () => client });
  Object.defineProperty(strip, 'scrollWidth', { configurable: true, get: () => scroll });
  strip.getBoundingClientRect = () => new DOMRect(0, 0, client, 44);
}

function placed(strip: HTMLElement, item: HTMLElement, left: number, width: number) {
  item.getBoundingClientRect = () => new DOMRect(left - strip.scrollLeft, 0, width, 44);
}

describe('a strip’s edges', () => {
  it('fades the end only while there is more past it, the start only once scrolled', () => {
    const strip = document.createElement('div');
    laidOut(strip, 300, 600);
    markStripEdges(strip);
    expect([...strip.classList]).toEqual(['is-fade-end']);
    strip.scrollLeft = 150;
    markStripEdges(strip);
    expect(strip.classList.contains('is-fade-start')).toBe(true);
    expect(strip.classList.contains('is-fade-end')).toBe(true);
    strip.scrollLeft = 300;
    markStripEdges(strip);
    expect([...strip.classList]).toEqual(['is-fade-start']);
  });

  it('fades nothing on a strip that fits', () => {
    const strip = document.createElement('div');
    laidOut(strip, 600, 600);
    markStripEdges(strip);
    expect(strip.className).toBe('');
  });

  it('scrolls a tab past the end into view, clear of the fade', () => {
    const strip = document.createElement('div');
    const item = document.createElement('button');
    strip.append(item);
    laidOut(strip, 300, 600);
    placed(strip, item, 450, 100);
    revealInStrip(strip, item);
    expect(strip.scrollLeft).toBe(450 + 100 - 300 + STRIP_FADE_PX);
  });

  it('leaves the strip alone when the tab is already in view', () => {
    const strip = document.createElement('div');
    const item = document.createElement('button');
    strip.append(item);
    laidOut(strip, 300, 600);
    placed(strip, item, 0, 100);
    revealInStrip(strip, item);
    expect(strip.scrollLeft).toBe(0);
  });
});

describe('Tabs', () => {
  it('marks its overflowing edge and scrolls the selected tab into view on mount', () => {
    // Every element is 300 wide over 600 (the strip is all that reads it), on
    // HTMLElement over jsdom's own Element getters, deleted afterwards.
    const rect = HTMLElement.prototype.getBoundingClientRect;
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 300,
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get: () => 600,
    });
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.getAttribute('role') === 'tablist') return new DOMRect(0, 0, 300, 44);
      // Three tabs of 200 each: the last starts at 400.
      const index = [...(this.parentElement?.children ?? [])].indexOf(this);
      const strip = this.parentElement as HTMLElement;
      return new DOMRect(index * 200 - strip.scrollLeft, 0, 200, 44);
    };
    try {
      render(
        <Tabs
          label="Staff"
          idPrefix="t"
          selected="phones"
          onSelect={() => undefined}
          tabs={[
            { id: 'people', label: 'People' },
            { id: 'tablets', label: 'Tablets' },
            { id: 'phones', label: 'Phones' },
          ]}
        />,
      );
      const strip = screen.getByRole('tablist', { name: 'Staff' });
      expect(strip.scrollLeft).toBe(600 - 300 + STRIP_FADE_PX);
      expect(strip.classList.contains('is-fade-start')).toBe(true);
    } finally {
      delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
      delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
      HTMLElement.prototype.getBoundingClientRect = rect;
    }
  });
});
