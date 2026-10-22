import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type * as I18nModule from '@yalla/i18n';
import type * as ApiReactModule from '@yalla/api/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlaceScreen from '../../app/place/[placeId]';
import { mockPlaces } from '../places/mockPlaces';
import type { Place } from '../places/model';
import { useSession } from '../stores/session';
import { availability } from './testFixtures';

/**
 * Takeaway on the place page (2026-10-22): the info card under the header and
 * the "Order to take away" button above "Book a table" for a place that takes
 * it and is open; "Takeaway from opening, 10:00" while it is shut; nothing at
 * a place that does not take takeaway.
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
vi.mock('../places/hooks', () => ({
  usePlace: () => ({ data: held.place, isLoading: false, isError: false, isFetching: false }),
  usePlaceRooms: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock('../places/PlaceMenu', () => ({ PlaceMenu: () => null }));
vi.mock('../places/ReviewList', () => ({ ReviewList: () => null }));
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

beforeEach(() => {
  useSession.setState({ signedIn: true });
});
afterEach(() => {
  cleanup();
  gateway.getTakeawayAvailability.mockReset();
  router.push.mockReset();
  useSession.setState({ signedIn: false });
});

describe('a place that takes takeaway', () => {
  it('shows the info card and the button, which opens the takeaway menu', async () => {
    held.place = placeWith({ takeaway: { enabled: true, prepMinutes: 20 } });
    gateway.getTakeawayAvailability.mockResolvedValue(availability());
    renderPage();

    expect(screen.getByText('takeaway.place.cardTitle')).toBeTruthy();
    expect(screen.getByText('takeaway.place.cardBody minutes=20')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'takeaway.place.cta' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/takeaway/menu/[placeId]',
      params: { placeId: 'p1' },
    });
    // Book a table stays, under it.
    expect(screen.getByRole('button', { name: 'place.bookTable' })).toBeTruthy();
  });

  it('says from when while takeaway is closed, and offers no button', async () => {
    held.place = placeWith({ takeaway: { enabled: true, prepMinutes: 20 } });
    gateway.getTakeawayAvailability.mockResolvedValue(
      availability({ open: false, slots: [], opensAt: '10:00', asapReadyAt: null }),
    );
    renderPage();

    expect(await screen.findByText(/^takeaway\.place\.closedFrom time=/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'takeaway.place.cta' })).toBeNull();
  });

  it("signed out, the place's own hours decide, and nothing is asked of the server", () => {
    useSession.setState({ signedIn: false });
    held.place = placeWith({
      takeaway: { enabled: true, prepMinutes: 20 },
      openState: { isOpen: false, todayLabel: '', opensAt: '10:00' },
    });
    renderPage();

    expect(screen.getByText(/^takeaway\.place\.closedFrom time=/)).toBeTruthy();
    expect(gateway.getTakeawayAvailability).not.toHaveBeenCalled();
  });
});

describe('a place that does not', () => {
  it('has neither the card nor the button', () => {
    held.place = placeWith({ takeaway: { enabled: false, prepMinutes: 20 } });
    renderPage();

    expect(screen.queryByText('takeaway.place.cardTitle')).toBeNull();
    expect(screen.queryByRole('button', { name: 'takeaway.place.cta' })).toBeNull();
    expect(gateway.getTakeawayAvailability).not.toHaveBeenCalled();
  });
});
