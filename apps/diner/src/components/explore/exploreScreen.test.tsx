import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExploreScreen from '../../../app/(tabs)/index';
import { mockPlaces } from '../../places/mockPlaces';
import type { Place } from '../../places/model';
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
  useFavorites: (select: (state: { toggle: () => void }) => unknown) =>
    select({ toggle: () => undefined }),
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

beforeEach(() => {
  held.places = [];
  held.lastInput = undefined;
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
    const all = screen.getByRole('radio', { name: 'All' });
    expect(all.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByRole('radio', { name: 'Bars' }));
    expect(held.lastInput).toEqual({ query: '', filter: { type: 'bar' } });
    expect(screen.getByRole('radio', { name: 'Bars' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    expect(held.lastInput).toEqual({ query: '' });
  });

  it('keeps Open now behind the filter button, applied to the list', () => {
    const [green, lumen] = placesOf(['The Green Table', 'Lumen Coffee']);
    held.places = [green!, { ...lumen!, openState: { isOpen: false, todayLabel: '' } }];
    render(<ExploreScreen />);
    expect(cardOrder()).toEqual(['The Green Table', 'Lumen Coffee']);

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open now' }));

    expect(cardOrder()).toEqual(['The Green Table']);
    expect(screen.getByRole('button', { name: 'Filters, 1' })).toBeTruthy();
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
});
