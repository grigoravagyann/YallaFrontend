import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExploreScreen from '../../../app/(tabs)/index';
import { mockPlaces } from '../../places/mockPlaces';
import type { Place } from '../../places/model';
import { useSession } from '../../stores/session';
import type * as I18nModule from '@yalla/i18n';

/**
 * Explore as the SHURJ design draws it: All / Cafés / Restaurants / Bars and
 * nothing else in the chip row (the user removed Popular and New on
 * 2026-10-22), "Discover places" over full-width cards, nearest first.
 */

const held = vi.hoisted(() => ({
  places: [] as unknown[],
  lastInput: undefined as unknown,
}));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
const favorites = vi.hoisted(() => ({ toggle: vi.fn() }));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('expo-router', () => ({ useRouter: () => router }));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('@yalla/i18n', async (importOriginal) => {
  const { dinerResources: resources } = await import('@yalla/i18n/diner');
  const en = resources.en.diner as Record<string, unknown>;
  const lookup = (key: string): string =>
    String(
      key.split('.').reduce<unknown>((at, part) => (at as Record<string, unknown>)?.[part], en) ??
        key,
    );
  return {
    ...(await importOriginal<typeof I18nModule>()),
    useTranslation: () => ({
      t: (key: string, values: Record<string, unknown> = {}) =>
        lookup(key).replace(/\{\{(\w+)\}\}/gu, (_, name: string) => String(values[name])),
    }),
    useLocale: () => ({ locale: 'en' }),
  };
});
vi.mock('../../places/hooks', () => ({
  usePlaces: (input: unknown) => {
    held.lastInput = input;
    return {
      data: held.places,
      isLoading: false,
      isError: false,
      isFetching: false,
      isPlaceholderData: false,
      fetchStatus: 'idle',
      refetch: vi.fn(),
    };
  },
}));
vi.mock('../../data/accountQueries', () => ({ useDinerProfile: () => ({ data: undefined }) }));
vi.mock('../../hooks/useNotificationCount', () => ({ useNotificationCount: () => 0 }));
vi.mock('../../stores/favorites', () => ({
  useIsFavorite: () => false,
  useFavorites: (select: (state: { toggle: (placeId: string) => void }) => unknown) =>
    select({ toggle: favorites.toggle }),
}));

/** The mock venues as places, open, in the order given. */
function placesOf(names: readonly string[]): Place[] {
  return names.map((name) => {
    const seed = mockPlaces.find((place) => place.venueName === name)!;
    const { menu: _menu, ...rest } = seed;
    return { ...rest, openState: { isOpen: true, todayLabel: '' }, rooms: [] } as Place;
  });
}

/** The card buttons in screen order, by the venue each is named for. */
function cardOrder(): string[] {
  return screen
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label') ?? '')
    .filter((label) => /\. (Open|Closed)$/u.test(label))
    .map((label) => label.split(' · ')[0]!);
}

const SEARCH = 'Search cafes & restaurants';

function search(text: string) {
  fireEvent.change(screen.getByLabelText(SEARCH), { target: { value: text } });
}

function checked(role: 'radio' | 'switch', name: string): string | null {
  return screen.getByRole(role, { name }).getAttribute('aria-checked');
}

/** Hands a node the size react-native-web would report from its ResizeObserver. */
function layout(node: Element, width: number) {
  act(() => {
    (node as unknown as Record<string, (event: unknown) => void>)['__reactLayoutHandler']!({
      nativeEvent: { layout: { x: 0, y: 0, width, height: 20 } },
    });
  });
}

const measured = (node: Element) =>
  typeof (node as unknown as Record<string, unknown>)['__reactLayoutHandler'] === 'function';

beforeEach(() => {
  held.places = [];
  held.lastInput = undefined;
  router.push.mockClear();
  favorites.toggle.mockClear();
  useSession.setState({ signedIn: false, guestName: null, profile: null });
});
afterEach(cleanup);

describe('Explore', () => {
  it('offers All, Cafes, Restaurants and Bars, and no Popular or New chip', () => {
    held.places = placesOf(['Lumen Coffee']);
    render(<ExploreScreen />);

    const row = screen.getByRole('radiogroup', { name: 'Categories' });
    const chips = within(row)
      .getAllByRole('radio')
      .map((chip) => chip.textContent);
    expect(chips).toEqual(['All', 'Cafes', 'Restaurants', 'Bars']);
    expect(screen.queryByText('Popular')).toBeNull();
    expect(screen.queryByText('New')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Discover places' })).toBeTruthy();
  });

  it('lists the places nearest first, whatever order they arrive in', () => {
    // 1.4, 0.3, 0.8, 0.4 km.
    held.places = placesOf(['Tavern Yerevan', 'The Green Table', 'Copper Fox', 'Lumen Coffee']);
    render(<ExploreScreen />);

    expect(cardOrder()).toEqual([
      'The Green Table',
      'Lumen Coffee',
      'Copper Fox',
      'Tavern Yerevan',
    ]);
  });

  it('a category chip narrows the search to that kind, and All clears it', () => {
    held.places = placesOf(['Lumen Coffee']);
    render(<ExploreScreen />);
    expect(checked('radio', 'All')).toBe('true');

    fireEvent.click(screen.getByRole('radio', { name: 'Bars' }));
    expect(held.lastInput).toEqual({ query: '', filter: { type: 'bar' } });
    expect(checked('radio', 'Bars')).toBe('true');

    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    expect(held.lastInput).toEqual({ query: '' });
  });

  it('sends what is typed in the search field to the search, with the category', () => {
    held.places = placesOf(['Lumen Coffee']);
    render(<ExploreScreen />);

    search('lumen');
    expect(held.lastInput).toEqual({ query: 'lumen' });

    fireEvent.click(screen.getByRole('radio', { name: 'Cafes' }));
    expect(held.lastInput).toEqual({ query: 'lumen', filter: { type: 'cafe' } });
  });

  it('opens a card’s place, and keeps the Map and the bell', () => {
    held.places = placesOf(['Lumen Coffee']);
    render(<ExploreScreen />);

    fireEvent.click(screen.getByRole('button', { name: /^Lumen Coffee · Northern Avenue\./u }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/place/[placeId]',
      params: { placeId: held.places[0] && (held.places[0] as Place).id },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open map' }));
    expect(router.push).toHaveBeenCalledWith('/map');
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(router.push).toHaveBeenCalledWith('/notifications');
  });

  it('saves a place from its heart without opening it', () => {
    held.places = placesOf(['Lumen Coffee']);
    render(<ExploreScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Save to favorites' }));

    expect(favorites.toggle).toHaveBeenCalledWith((held.places[0] as Place).id);
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('the filter sheet', () => {
  it('keeps Open now behind the filter button, applied to the list', () => {
    const [green, lumen] = placesOf(['The Green Table', 'Lumen Coffee']);
    held.places = [green!, { ...lumen!, openState: { isOpen: false, todayLabel: '' } }];
    render(<ExploreScreen />);
    expect(cardOrder()).toEqual(['The Green Table', 'Lumen Coffee']);

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Open now' }));

    expect(cardOrder()).toEqual(['The Green Table']);
    expect(screen.getByRole('button', { name: 'Filters, 1' })).toBeTruthy();
  });

  it('says, on the web too, whether each of its filters is on', () => {
    held.places = placesOf(['Lumen Coffee']);
    render(<ExploreScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(checked('switch', 'Open now')).toBe('false');

    fireEvent.click(screen.getByRole('switch', { name: 'Open now' }));

    expect(checked('switch', 'Open now')).toBe('true');
    expect(checked('switch', 'Nearby')).toBe('false');
  });

  it('keeps Nearby to places under 2 km, leaving out any with no distance yet', () => {
    const [green, lumen, copper] = placesOf(['The Green Table', 'Lumen Coffee', 'Copper Fox']);
    held.places = [
      { ...green!, distanceKm: 1.9 },
      { ...lumen!, distanceKm: 2 },
      { ...copper!, distanceKm: null },
    ];
    render(<ExploreScreen />);
    expect(cardOrder()).toEqual(['The Green Table', 'Lumen Coffee', 'Copper Fox']);

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Nearby' }));

    expect(cardOrder()).toEqual(['The Green Table']);
  });

  it('clears only its own filters from its Clear, not the search or the category', () => {
    held.places = placesOf(['Lumen Coffee']);
    render(<ExploreScreen />);
    search('lumen');
    fireEvent.click(screen.getByRole('radio', { name: 'Cafes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Open now' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Nearby' }));
    expect(screen.getByRole('button', { name: 'Filters, 2' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(checked('switch', 'Open now')).toBe('false');
    expect(checked('switch', 'Nearby')).toBe('false');
    expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy();
    expect(held.lastInput).toEqual({ query: 'lumen', filter: { type: 'cafe' } });
    expect(checked('radio', 'Cafes')).toBe('true');
  });
});

describe('an empty result', () => {
  it('clears the search, the category and the sheet’s filters together', () => {
    held.places = [];
    render(<ExploreScreen />);
    search('zzz');
    fireEvent.click(screen.getByRole('radio', { name: 'Bars' }));
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Open now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText('Nothing matches that')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(held.lastInput).toEqual({ query: '' });
    expect((screen.getByLabelText(SEARCH) as HTMLInputElement).value).toBe('');
    expect(checked('radio', 'All')).toBe('true');
    expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy();
    expect(screen.queryByText('Nothing matches that')).toBeNull();
  });
});

describe('the header', () => {
  it('greets nobody signed in with the SHURJ wordmark, and a diner by name', () => {
    held.places = placesOf(['Lumen Coffee']);
    const { unmount } = render(<ExploreScreen />);
    expect(screen.getByRole('heading', { name: /, SHURJ$/u })).toBeTruthy();
    // Set as the wordmark: letter-spaced, as no person's name is.
    expect(['', 'normal']).not.toContain(getComputedStyle(screen.getByText('SHURJ')).letterSpacing);
    unmount();

    useSession.setState({ signedIn: true, guestName: 'Ani' });
    render(<ExploreScreen />);
    expect(screen.getByRole('heading', { name: /, Ani$/u })).toBeTruthy();
    expect(screen.queryByText('SHURJ')).toBeNull();
    expect(['', 'normal']).toContain(getComputedStyle(screen.getByText('Ani')).letterSpacing);
  });

  it('keeps "Open map" as the Map button’s name when it drops its word', () => {
    held.places = placesOf(['Lumen Coffee']);
    render(<ExploreScreen />);
    expect(screen.getByRole('button', { name: 'Open map' }).textContent).toBe('Map');

    // A narrow phone: beside the word, the greeting would be cut short.
    const greeting = screen.getAllByText(/^Good (morning|afternoon|evening),$/u).find(measured)!;
    const word = screen.getAllByText('Map').find(measured)!;
    let row: Element | null = greeting.parentElement;
    while (row && !measured(row)) row = row.parentElement;
    layout(greeting, 200);
    layout(word, 40);
    layout(row!, 360);

    const map = screen.getByRole('button', { name: 'Open map' });
    expect(map.textContent).toBe('');
    fireEvent.click(map);
    expect(router.push).toHaveBeenCalledWith('/map');
  });
});
