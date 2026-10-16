import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FavoritesScreen from '../../app/favorites';
import type { Place } from '../places/model';
import type * as I18nModule from '@yalla/i18n';

/**
 * A favourite row is a card that opens the place, with a heart that un-saves
 * it. Both are buttons, so the heart must not sit inside the card's button:
 * `<button>` inside `<button>` is invalid HTML, which on the web build was a
 * hydration error and a red toast on every visit to Favourites.
 */

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn(() => true),
}));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-router', () => ({ useRouter: () => router }));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('@yalla/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof I18nModule>()),
  useTranslation: () => ({ t: (key: string) => key }),
  useLocale: () => ({ locale: 'en' }),
}));
vi.mock('../components/places/placeCopy', () => ({
  PlaceMetaRow: () => null,
  usePlaceCopy: () => ({ typeLine: 'Café · Armenian' }),
}));
vi.mock('./useFavoritePlaces', () => ({
  useFavoritePlaces: () => ({
    places: [PLACE],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

const PLACE = {
  id: 'b-1',
  name: 'The Green Table',
  venueName: 'The Green Table',
  branchName: 'Cascade',
  badges: [],
  photos: [],
  openState: { isOpen: true, opensAt: null, closesAt: null },
} as unknown as Place;

afterEach(cleanup);

describe('the Favourites list', () => {
  it('nests no button inside another', () => {
    const client = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={client}>
        <FavoritesScreen />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('button', { name: 'place.unfavorite' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'The Green Table' })).toBeTruthy();
    expect(
      container.querySelectorAll('button button, [role="button"] [role="button"]'),
    ).toHaveLength(0);
  });
});
