// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { Skeleton } from '../components/Skeleton';
import { SlidingChoice } from '../components/motion/SlidingChoice';
import { badgeColors, bookingBadgeVariant, lineBadge } from './badges';
import { colors } from './colors';

/**
 * The SHURJ restyle's rules, held where a person would see them break: white
 * secondary buttons with the hairline and a charcoal label (never the soft
 * pink), burgundy for the one thing to press, the two burgundy status pills,
 * and the warm skeleton block.
 */

vi.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { readonly name: string }) => <span data-testid="glyph" data-name={name} />,
}));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('@yalla/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

/** `#RRGGBB` as `getComputedStyle` reports it. */
function rgb(hex: string): string {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

/** The element carrying the pill's fill: the nearest ancestor with a background. */
function filled(element: HTMLElement): CSSStyleDeclaration {
  let node: HTMLElement | null = element;
  while (node) {
    const style = getComputedStyle(node);
    if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)') return style;
    node = node.parentElement;
  }
  throw new Error('No filled ancestor');
}

describe('the palette', () => {
  it('is white everywhere a screen, card or sheet is drawn', () => {
    expect(colors.background).toBe('#FFFFFF');
    expect(colors.surface).toBe('#FFFFFF');
    expect(colors.surfaceMuted).toBe('#FFFFFF');
    expect(colors.sheet).toBe('#FFFFFF');
    expect(colors.border).toBe('#E7E0D7');
  });

  it('keeps the ivory to the Explore header and the burgundy to the brand', () => {
    expect(colors.exploreGround).toBe('#F7F6F1');
    expect(colors.brand).toBe('#6E1F2C');
    expect(colors.primary).toBe('#6E1F2C');
    expect(colors.accent).toBe('#6E1F2C');
    expect(colors.primarySoft).toBe('#F1E4E4');
  });
});

describe('buttons', () => {
  it('fills the primary button with the brand and labels it cream', () => {
    render(<Button label="Book" onPress={() => undefined} />);
    const label = screen.getByText('Book');
    expect(getComputedStyle(label).color).toBe(rgb(colors.onPrimary));
    expect(filled(label).backgroundColor).toBe(rgb(colors.brand));
  });

  it.each(['secondary', 'outline'] as const)(
    'draws a %s button white with the hairline and a charcoal label',
    (variant) => {
      render(<Button label="Share" variant={variant} onPress={() => undefined} />);
      const label = screen.getByText('Share');
      expect(getComputedStyle(label).color).toBe(rgb(colors.text));
      const pill = filled(label);
      expect(pill.backgroundColor).toBe(rgb(colors.surface));
      expect(pill.borderTopColor).toBe(rgb(colors.border));
      expect(pill.borderTopWidth).toBe('1px');
    },
  );

  it('draws an unselected chip white with the hairline, a selected one in the brand', () => {
    render(
      <>
        <Chip label="Tomorrow" onPress={() => undefined} />
        <Chip label="Today" selected onPress={() => undefined} />
      </>,
    );
    const idle = filled(screen.getByText('Tomorrow'));
    expect(idle.backgroundColor).toBe(rgb(colors.surface));
    expect(idle.borderTopColor).toBe(rgb(colors.border));
    expect(filled(screen.getByText('Today')).backgroundColor).toBe(rgb(colors.brand));
  });
});

describe('SlidingChoice', () => {
  const options = [
    { value: 'a', label: 'Whole bill' },
    { value: 'b', label: 'My share' },
  ] as const;

  /** The pressable cell a label sits in. */
  function cellOf(label: string): CSSStyleDeclaration {
    return getComputedStyle(screen.getByText(label).parentElement as HTMLElement);
  }

  it('draws a free-standing cell at rest as a white pill with the hairline', () => {
    render(
      <SlidingChoice
        options={options}
        value="a"
        onChange={() => undefined}
        columns={2}
        accessibilityLabel="Pay"
      />,
    );
    expect(cellOf('My share').borderTopColor).toBe(rgb(colors.border));
    expect(cellOf('My share').backgroundColor).toBe(rgb(colors.surface));
  });

  it('leaves the edge to the track when it sits in one', () => {
    render(
      <SlidingChoice
        options={options}
        value="a"
        onChange={() => undefined}
        columns={2}
        inTrack
        accessibilityLabel="Pay"
      />,
    );
    expect(cellOf('My share').borderTopColor).toBe('rgba(0, 0, 0, 0)');
  });
});

describe('status pills', () => {
  it('draws Preparing and Awaiting confirmation as the soft burgundy pill, on any ground', () => {
    for (const variant of ['preparing', 'awaiting'] as const) {
      for (const tone of ['soft', 'solid'] as const) {
        expect(badgeColors(variant, tone)).toEqual({
          background: colors.primarySoft,
          foreground: colors.primary,
        });
      }
    }
  });

  it('draws Served as the filled burgundy pill, on any ground', () => {
    for (const tone of ['soft', 'solid'] as const) {
      expect(badgeColors('served', tone)).toEqual({
        background: colors.brand,
        foreground: colors.onPrimary,
      });
    }
  });

  it('gives a bill line in the kitchen Preparing and a served one Served', () => {
    expect(lineBadge('inKitchen')).toEqual({ variant: 'preparing' });
    expect(lineBadge('served')).toEqual({ variant: 'served' });
    expect(lineBadge('voided')).toBeNull();
  });

  it('gives a booking waiting on the venue the Awaiting confirmation pill', () => {
    expect(bookingBadgeVariant.pendingApproval).toBe('awaiting');
  });

  it('is 24 high with a 6px dot before the label', () => {
    render(<Badge variant="served" tone="soft" size="status" dot />);
    const label = screen.getByText('bill.lineStatus.served');
    const pill = filled(label);
    expect(pill.height).toBe('24px');
    expect(pill.backgroundColor).toBe(rgb(colors.brand));
    const dot = label.previousElementSibling as HTMLElement;
    expect(getComputedStyle(dot).width).toBe('6px');
    expect(getComputedStyle(dot).backgroundColor).toBe(rgb(colors.onPrimary));
  });
});

describe('Skeleton', () => {
  it('draws its block in the warm skeleton colour, not white', () => {
    const { container } = render(<Skeleton />);
    const block = container.firstElementChild as HTMLElement;
    expect(getComputedStyle(block).backgroundColor).toBe(rgb(colors.skeleton));
  });
});
