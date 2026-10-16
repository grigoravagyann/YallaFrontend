import { createMockGateway } from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import type * as I18nModule from '@yalla/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import BranchScreen from '../../app/branch/[branchId]';
import BookingScreen from '../../app/book/[placeId]';
import { roomsFromApi } from './httpMapping';
import type { Place, PlaceRoom } from './model';

/**
 * The two screens that show the rooms **at a slot** — the branch screen and
 * Book — against the `@yalla/api` mock: every pin is drawn on its room photo
 * from the slot floor, named by its table and its state then, and tapping a
 * free one acts on that table.
 */

const BRANCH = 'b-lumen-north';
const mock = createMockGateway({ latencyMs: 0 });
const held = vi.hoisted(() => ({
  rooms: [] as unknown[],
  place: null as unknown,
  roomsFailed: false,
  refetchRooms: (() => undefined) as () => void,
}));
const params = vi.hoisted(() => ({ current: {} as Record<string, string> }));
const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn(() => true),
}));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => router,
  useLocalSearchParams: () => params.current,
}));
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
        (lookup(key) === key && typeof values['count'] === 'number'
          ? lookup(`${key}_${values['count'] === 1 ? 'one' : 'other'}`)
          : lookup(key)
        ).replace(/\{\{(\w+)\}\}/gu, (_, name: string) => String(values[name])),
    }),
    useLocale: () => ({ locale: 'en' }),
  };
});
vi.mock('./hooks', () => ({
  placeKeys: { rooms: (id: string) => ['places', 'rooms', id] },
  usePlaceRooms: () =>
    held.roomsFailed
      ? {
          data: undefined,
          isLoading: false,
          isError: true,
          error: new Error('rooms read failed'),
          fetchStatus: 'idle',
          refetch: held.refetchRooms,
        }
      : { data: held.rooms, isLoading: false, isError: false, fetchStatus: 'idle' },
  usePlace: () => ({ data: held.place, isLoading: false, isError: false }),
}));
vi.mock('../data/accountQueries', () => ({ useDinerProfile: () => ({ data: undefined }) }));

afterEach(() => {
  cleanup();
  held.roomsFailed = false;
});

beforeAll(async () => {
  held.rooms = roomsFromApi((await mock.getBranchRooms(BRANCH))!.rooms);
  held.place = {
    id: BRANCH,
    venueId: 'v-lumen',
    venueSlug: 'lumen-coffee',
    branchSlug: 'northern-avenue',
    venueName: 'Lumen Coffee',
    branchName: 'Northern Avenue',
    name: 'Lumen Coffee · Northern Avenue',
    type: 'cafe',
    cuisine: '',
    distanceKm: null,
    rating: null,
    ratingCount: 0,
    badges: [],
    openState: { isOpen: true, todayLabel: '' },
    photos: [],
    coords: null,
    address: '',
    timeZoneId: 'Asia/Yerevan',
    // Open round the clock, so a slot is always on offer.
    hours: ([0, 1, 2, 3, 4, 5, 6] as const).map((day) => ({ day, open: '00:00', close: '00:00' })),
    amenities: [],
    about: '',
    acceptsAppBookings: true,
    reviews: [],
    rooms: held.rooms as PlaceRoom[],
  } satisfies Place;
});

function renderScreen(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <GatewayProvider gateway={mock}>
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    </GatewayProvider>,
  );
}

const firstFree = /^Table \w+, free$/u;

describe('the branch screen', () => {
  it('draws the room photos at the slot and opens a free table', async () => {
    params.current = { branchId: BRANCH, venueId: 'v-lumen', timeZoneId: 'Asia/Yerevan' };
    renderScreen(<BranchScreen />);

    const pins = await screen.findAllByRole('button', { name: firstFree });
    expect(pins.length).toBeGreaterThan(0);
    // The first room's chip, and the rooms the mock has.
    const names = (held.rooms as PlaceRoom[]).map((room) => room.name);
    expect(screen.getByRole('tab', { name: names[0]! })).toBeTruthy();

    fireEvent.click(pins[0]!);
    expect(await screen.findByText('Pick another')).toBeTruthy();
  });

  it('says the rooms failed to load, with a retry, rather than that there are none', async () => {
    held.roomsFailed = true;
    held.refetchRooms = vi.fn();
    params.current = { branchId: BRANCH, venueId: 'v-lumen', timeZoneId: 'Asia/Yerevan' };
    renderScreen(<BranchScreen />);

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(held.refetchRooms).toHaveBeenCalled();
    expect(screen.queryByText(/has not put its tables on a photo yet/u)).toBeNull();
  });
});

describe('the Book screen', () => {
  /*
   * Noon in Yerevan. On the real clock, from 23:30 there is no slot left today
   * past the 30-minute lead, so the screen has no slot, no slot floor and no
   * pins, and these tests failed every night for half an hour.
   */
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T08:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('picks the table tapped on the room photo at the slot', async () => {
    params.current = { placeId: BRANCH };
    renderScreen(<BookingScreen />);

    const pin = (await screen.findAllByRole('button', { name: firstFree }))[0]!;
    const label = /^Table (\w+), free$/u.exec(pin.getAttribute('aria-label') ?? '')![1]!;
    expect(screen.queryByText('Selected table')).toBeNull();

    fireEvent.click(pin);

    expect(await screen.findByText('Selected table')).toBeTruthy();
    expect(screen.getByText(new RegExp(`^Table ${label} ·`, 'u'))).toBeTruthy();
  });

  it('offers no free table too small for the party, and names why', async () => {
    params.current = { placeId: BRANCH };
    renderScreen(<BookingScreen />);
    await screen.findAllByRole('button', { name: firstFree });

    // The mock's two-seaters cannot take three.
    fireEvent.click(screen.getByRole('button', { name: '3' }));

    const unfit = await screen.findAllByRole('button', {
      name: /^Table \w+, free, not for a party of 3$/u,
    });
    fireEvent.click(unfit[0]!);
    expect(screen.queryByText('Selected table')).toBeNull();
    // QA 20261016T2 B3: the reason is on screen, not only in the pin's name.
    expect(screen.getByText(/Too small for 3 guests\./u)).toBeTruthy();
    // And the legend says what the hollow, dashed pin means.
    expect(screen.getByText('Not for your party')).toBeTruthy();
  });

  it('says the place is closed at that time, not that no table seats the party', async () => {
    // QA 20261016T2 B2: the server refuses every table, and the slot, as closed.
    const original = mock.getSlotFloor.bind(mock);
    const spy = vi.spyOn(mock, 'getSlotFloor').mockImplementation(async (input) => {
      const floor = await original(input);
      if (!floor) return floor;
      return {
        ...floor,
        rejection: 'closed',
        tables: floor.tables.map((table) => ({
          ...table,
          isBookable: false,
          unavailableReason: 'closed',
          window: null,
        })),
      };
    });
    params.current = { placeId: BRANCH };
    renderScreen(<BookingScreen />);

    expect(await screen.findByText('Closed at that time.')).toBeTruthy();
    expect(screen.queryByText(/No free table seats/u)).toBeNull();
    expect(screen.queryByRole('button', { name: /not for a party of/u })).toBeNull();
    expect(
      screen.getAllByRole('button', { name: /^Table \w+\. Closed at that time\.$/u }).length,
    ).toBeGreaterThan(0);
    spy.mockRestore();
  });
});
