import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type * as I18nModule from '@yalla/i18n';
import { contrastRatio } from '@yalla/tokens';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlaceScreen from '../../app/place/[placeId]';
import { mockPlaces } from './mockPlaces';
import type { Place } from './model';
import { colors } from '../theme';

/**
 * The place page draws its status bar light over the photo and dark once the
 * white compact bar is under it — and only while it is the screen in front.
 * A pushed Book, Reviews or booking screen leaves it mounted underneath, and
 * a style it kept would sit white-on-white over that screen (B2, 2026-10-22).
 */

const focus = vi.hoisted(() => ({ current: true }));
const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: () => true,
}));
const held = vi.hoisted(() => ({ place: null as unknown }));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('expo-status-bar', () => ({
  StatusBar: ({ style }: { readonly style: string }) => (
    <span data-testid="status-bar" data-style={style} />
  ),
}));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => router,
  useLocalSearchParams: () => ({ placeId: 'p1' }),
  useIsFocused: () => focus.current,
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('@yalla/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof I18nModule>()),
  useTranslation: () => ({ t: (key: string) => key }),
  useLocale: () => ({ locale: 'en' }),
}));
vi.mock('./hooks', () => ({
  usePlace: () => ({ data: held.place, isLoading: false, isError: false, isFetching: false }),
  usePlaceRooms: () => ({ data: [], isLoading: false, isError: false }),
}));
// The page's own sections read their own queries; none of them is the point here.
vi.mock('./PlaceMenu', () => ({ PlaceMenu: () => null }));
vi.mock('./ReviewList', () => ({ ReviewList: () => null }));
vi.mock('../components/place/ReviewComposer', () => ({ ReviewComposer: () => null }));
vi.mock('../data/bookingBlock', () => ({ useBookingBlock: () => null }));

function statusBar(): string | null {
  return screen.queryByTestId('status-bar')?.getAttribute('data-style') ?? null;
}

/** The page's own vertical scroll: the first scrollable element in the tree. */
function scrollPage(y: number) {
  const scroller = [...document.querySelectorAll<HTMLElement>('div')].find(
    (node) => getComputedStyle(node).overflowY === 'auto' || node.style.overflowY === 'auto',
  )!;
  scroller.scrollTop = y;
  act(() => {
    fireEvent.scroll(scroller);
  });
}

beforeEach(() => {
  focus.current = true;
  const seed = mockPlaces.find((place) => place.venueName === 'Lumen Coffee')!;
  const { menu: _menu, ...rest } = seed;
  held.place = { ...rest, openState: { isOpen: true, todayLabel: '' }, rooms: [] } as Place;
});
afterEach(cleanup);

describe('the place page’s status bar', () => {
  it('is light over the photo, and dark once the compact bar is under it', () => {
    render(<PlaceScreen />);
    expect(statusBar()).toBe('light');

    scrollPage(400);
    expect(statusBar()).toBe('dark');

    scrollPage(0);
    expect(statusBar()).toBe('light');
  });

  it('is not the page’s to set while another screen is in front of it', () => {
    const { rerender } = render(<PlaceScreen />);
    expect(statusBar()).toBe('light');

    focus.current = false;
    rerender(<PlaceScreen />);
    expect(statusBar()).toBeNull();
  });
});

/**
 * The photo pager's dots sat on the hero's fade into the white page, cream on
 * near-white at 1.04:1 (S3, 2026-10-22). They now sit on a dark pill of their
 * own, which holds whatever the photo or the fade does under it.
 */
describe('the place hero’s photo dots', () => {
  /** `rgb(a)` from the DOM laid over white, as `#RRGGBB`. */
  function overWhite(css: string, under = 'rgb(255, 255, 255)'): string {
    const parse = (value: string) =>
      (/rgba?\(([^)]+)\)/u.exec(value)?.[1] ?? '').split(',').map((part) => Number(part.trim()));
    const [r = 0, g = 0, b = 0, a = 1] = parse(css);
    const [R = 255, G = 255, B = 255] = parse(under);
    const mix = (top: number, bottom: number) => Math.round(top * a + bottom * (1 - a));
    return `#${[mix(r, R), mix(g, G), mix(b, B)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }

  it('sit on a dark pill, every dot clearing 3:1 on it even over a white photo', () => {
    render(<PlaceScreen />);
    const dots = [...document.querySelectorAll<HTMLElement>('div')].filter(
      (node) => getComputedStyle(node).height === '6px',
    );
    expect(dots.length).toBe(4);
    const pill = dots[0]!.parentElement!;
    const ground = overWhite(getComputedStyle(pill).backgroundColor);
    const groundRgb = `rgb(${[1, 3, 5].map((i) => Number.parseInt(ground.slice(i, i + 2), 16)).join(', ')})`;
    for (const dot of dots) {
      const ink = overWhite(getComputedStyle(dot).backgroundColor, groundRgb);
      expect(contrastRatio(ink, ground)).toBeGreaterThanOrEqual(3);
    }
    // The photo on screen is the wide one, in full cream.
    const active = dots.filter((dot) => getComputedStyle(dot).width === '18px');
    expect(active).toHaveLength(1);
    expect(overWhite(getComputedStyle(active[0]!).backgroundColor).toUpperCase()).toBe(
      colors.onImage,
    );
  });
});
