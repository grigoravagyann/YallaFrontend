import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type * as I18nModule from '@yalla/i18n';
import type * as ApiReactModule from '@yalla/api/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlaceScreen from '../../app/place/[placeId]';
import { mockPlaces } from './mockPlaces';
import { placeOffers, type Place } from './model';

/**
 * What the place page leaves out where the platform or the venue has a
 * feature off (2026-10-27): with reviews off, no rating, no Reviews tab and no
 * reviews section — not "no reviews yet". The rest of the page is unchanged.
 */

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: () => true,
}));
const held = vi.hoisted(() => ({ place: null as unknown }));
const gateway = vi.hoisted(() => ({ getTakeawayAvailability: vi.fn() }));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => router,
  useLocalSearchParams: () => ({ placeId: 'p1' }),
  useIsFocused: () => true,
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('@yalla/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof I18nModule>()),
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values && Object.keys(values).length > 0
        ? `${key} ${Object.entries(values)
            .map(([name, value]) => `${name}=${value}`)
            .join(' ')}`
        : key,
  }),
  useLocale: () => ({ locale: 'en' }),
}));
vi.mock('@yalla/api/react', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiReactModule>()),
  useGateway: () => gateway,
}));
vi.mock('./hooks', () => ({
  usePlace: () => ({ data: held.place, isLoading: false, isError: false, isFetching: false }),
  usePlaceRooms: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock('./PlaceMenu', () => ({ PlaceMenu: () => null }));
vi.mock('./ReviewList', () => ({ ReviewList: () => null }));
vi.mock('../components/place/ReviewComposer', () => ({ ReviewComposer: () => null }));
vi.mock('../data/bookingBlock', () => ({ useBookingBlock: () => null }));

function placeWith(extra: Partial<Place>): Place {
  const seed = mockPlaces.find((place) => place.venueName === 'Lumen Coffee')!;
  const { menu: _menu, ...rest } = seed;
  return {
    ...rest,
    id: 'p1',
    openState: { isOpen: true, todayLabel: '', opensAt: '10:00', closesAt: '23:00' },
    rooms: [],
    ...extra,
  } as Place;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlaceScreen />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe('placeOffers', () => {
  it('reads the place features, and offers everything where they are unknown', () => {
    expect(placeOffers({ features: ['appBookings'] }, 'reviews')).toBe(false);
    expect(placeOffers({ features: ['reviews'] }, 'reviews')).toBe(true);
    expect(placeOffers({ features: null }, 'reviews')).toBe(true);
    expect(placeOffers({}, 'reviews')).toBe(true);
  });
});

describe('a place with reviews off', () => {
  it('shows no rating, no Reviews tab and no reviews section', () => {
    held.place = placeWith({
      rating: null,
      ratingCount: 0,
      features: ['appBookings', 'webBookings', 'takeaway', 'guestMessages'],
    });
    renderPage();

    expect(screen.getByRole('tab', { name: 'place.tab.menu' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'place.tab.reviews' })).toBeNull();
    expect(screen.queryByText('place.noReviews')).toBeNull();
    expect(screen.queryByText('place.tab.reviews')).toBeNull();
  });

  it('keeps them all where reviews are on', () => {
    held.place = placeWith({ rating: null, ratingCount: 0, features: null });
    renderPage();

    expect(screen.getByRole('tab', { name: 'place.tab.reviews' })).toBeTruthy();
    expect(screen.getByText('place.noReviews')).toBeTruthy();
  });
});
