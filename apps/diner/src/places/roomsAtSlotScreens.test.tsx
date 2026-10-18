import {
  BookingOverlapsOwnError,
  FreeByRequiredError,
  LeadTimeExceededError,
  createMockGateway,
  type Booking,
  type DaySlots,
  type SlotFloor,
} from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import type * as I18nModule from '@yalla/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import BranchScreen from '../../app/branch/[branchId]';
import BookingScreen from '../../app/book/[placeId]';
import { useSession } from '../stores/session';
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
  dismissTo: vi.fn(),
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
    district: null,
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

/*
 * The time wheel, as a screen reader and a keyboard meet it — and as e2e does:
 * one adjustable control named "Time" whose value is the chosen time, stepping
 * to the next or previous time that can be had, past the busy ones.
 */
const timeWheel = () => screen.getByRole('slider', { name: 'Time' });
/** "19:00" — the chosen time, without the notes a screen reader hears after it. */
const chosenTime = () => (timeWheel().getAttribute('aria-valuetext') ?? '').split(',')[0]!;
/** Step the wheel until `time` is chosen; fails when stepping never reaches it. */
function stepTo(time: string) {
  fireEvent.keyDown(timeWheel(), { key: 'Home' });
  for (let i = 0; i < 200 && chosenTime() !== time; i += 1) {
    const before = chosenTime();
    fireEvent.keyDown(timeWheel(), { key: 'ArrowUp' });
    if (chosenTime() === before) break;
  }
  expect(chosenTime()).toBe(time);
}
/** Whether stepping one way from `from` passes over `time` without stopping on it. */
function skips(from: string, time: string): boolean {
  stepTo(from);
  fireEvent.keyDown(timeWheel(), { key: 'ArrowUp' });
  return chosenTime() !== time;
}

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

    // The chosen time and party size are exposed as chosen (QA 20261016T2 B5).
    expect(screen.getByRole('radiogroup', { name: 'Party Size' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '2', checked: true })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '3', checked: false })).toBeTruthy();
    // One time chosen, on the wheel.
    expect(chosenTime()).toMatch(/^\d{2}:\d{2}$/u);
  });

  it('offers no free table too small for the party, and names why', async () => {
    params.current = { placeId: BRANCH };
    renderScreen(<BookingScreen />);
    await screen.findAllByRole('button', { name: firstFree });

    // The mock's two-seaters cannot take three.
    fireEvent.click(screen.getByRole('radio', { name: '3' }));

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

describe('the Book screen against the day of slots', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T08:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** The mock's day, with `times` taken: no table for anyone then. */
  function strike(...times: string[]) {
    const original = mock.getDaySlots.bind(mock);
    return vi.spyOn(mock, 'getDaySlots').mockImplementation(async (input) => {
      const day = await original(input);
      if (!day) return day;
      return {
        ...day,
        slots: day.slots.map((slot) =>
          times.includes(slot.time)
            ? { ...slot, isAvailable: false, freeTableCount: 0, unavailableReason: 'alreadyBooked' }
            : slot,
        ),
      } satisfies DaySlots;
    });
  }

  it('strikes a time with no free table, names it so, and never picks it', async () => {
    strike('12:15', '12:30', '19:00');
    params.current = { placeId: BRANCH };
    renderScreen(<BookingScreen />);

    expect(await screen.findByText('Struck-out times have no free table')).toBeTruthy();
    // Stepping goes over a struck time, never onto it; a free one is chosen by
    // its time alone (the e2e path).
    expect(skips('18:45', '19:00')).toBe(true);
    expect(chosenTime()).toBe('19:15');
    stepTo('19:30');
    // The first times of the day are struck, so they are never the one chosen.
    fireEvent.keyDown(timeWheel(), { key: 'Home' });
    expect(['12:15', '12:30']).not.toContain(chosenTime());
  });

  it('strikes every time on a day the branch refuses, and says why', async () => {
    vi.spyOn(mock, 'getDaySlots').mockResolvedValue({
      branchId: BRANCH,
      date: '2026-10-16',
      partySize: 2,
      stepMinutes: 30,
      unavailableReason: 'closed',
      slots: [],
    });
    params.current = { placeId: BRANCH };
    renderScreen(<BookingScreen />);

    expect(await screen.findByText('Closed that day. Pick another day.')).toBeTruthy();
    // Every time struck — "in 10 min" too, on a day refused — so none is chosen.
    expect(chosenTime()).toBe('No free time');
    expect(screen.queryByRole('button', { name: /^In \d+ min/u })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Confirm Booking' }).getAttribute('aria-disabled'),
    ).toBe('true');
  });

  it('opens a change on the booking, saves only a real change, and goes back to it', async () => {
    // A table free for two at both 19:00 and 19:30 today, by the mock itself.
    const at = (time: string) => new Date(`2026-10-16T${time}:00+04:00`).toISOString();
    const [seven, half] = await Promise.all(
      ['19:00', '19:30'].map((time) =>
        mock.getSlotFloor({
          branchId: BRANCH,
          slotUtc: at(time),
          partySize: 2,
          timeZoneId: 'Asia/Yerevan',
        }),
      ),
    );
    const table = seven!.tables.find(
      (candidate) =>
        candidate.isBookable &&
        half!.tables.find((other) => other.tableId === candidate.tableId)?.isBookable,
    )!;
    const reschedule = vi
      .spyOn(mock, 'rescheduleBooking')
      .mockImplementation(
        async (command) => ({ id: command.bookingId, status: 'confirmed' }) as Booking,
      );
    params.current = {
      placeId: BRANCH,
      bookingId: 'r-change',
      slotUtc: at('19:00'),
      party: '2',
      tableId: table.tableId,
      tableLabel: table.tableLabel,
    };
    renderScreen(<BookingScreen />);

    expect(await screen.findByText('Change booking')).toBeTruthy();
    await waitFor(() => expect(chosenTime()).toBe('19:00'));
    // Nothing changed yet: nothing to save. And the note stays with the booking.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^Save changes, / }).getAttribute('aria-disabled'),
      ).toBe('true'),
    );
    expect(screen.queryByLabelText('Note for the venue')).toBeNull();

    stepTo('19:30');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^Save changes, / }).getAttribute('aria-disabled'),
      ).not.toBe('true'),
    );
    fireEvent.click(screen.getByRole('button', { name: /^Save changes, / }));

    await waitFor(() =>
      expect(router.dismissTo).toHaveBeenCalledWith({
        pathname: '/booking/[bookingId]',
        params: { bookingId: 'r-change' },
      }),
    );
    expect(reschedule).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 'r-change',
        tableId: table.tableId,
        slotUtc: at('19:30'),
        partySize: 2,
      }),
    );
  });

  it('hides a time the day leaves out, and strikes one it lists with no free table', async () => {
    const original = mock.getDaySlots.bind(mock);
    vi.spyOn(mock, 'getDaySlots').mockImplementation(async (input) => {
      const day = await original(input);
      if (!day) return day;
      return {
        ...day,
        slots: day.slots
          // 20:00 is not listed: its sitting would not fit the hours.
          .filter((slot) => slot.time !== '20:00')
          .map((slot) =>
            slot.time === '19:00'
              ? {
                  ...slot,
                  isAvailable: false,
                  freeTableCount: 0,
                  unavailableReason: 'alreadyBooked',
                }
              : slot,
          ),
      } satisfies DaySlots;
    });
    params.current = { placeId: BRANCH };
    renderScreen(<BookingScreen />);

    expect(await screen.findByText('Struck-out times have no free table')).toBeTruthy();
    // Struck: drawn, never stopped on. Left out: not there to step onto at all.
    expect(skips('18:45', '19:00')).toBe(true);
    expect(skips('19:45', '20:00')).toBe(true);
    expect(chosenTime()).toBe('20:15');
    stepTo('20:30');
  });

  it('leaves a change with no time when its own is struck for the new party, and says so', async () => {
    const at = (time: string) => new Date(`2026-10-16T${time}:00+04:00`).toISOString();
    const original = mock.getDaySlots.bind(mock);
    // 19:00 has no table for four; for two it is free.
    vi.spyOn(mock, 'getDaySlots').mockImplementation(async (input) => {
      const day = await original(input);
      if (!day || input.partySize !== 4) return day;
      return {
        ...day,
        slots: day.slots.map((slot) =>
          slot.time === '19:00'
            ? { ...slot, isAvailable: false, freeTableCount: 0, unavailableReason: 'alreadyBooked' }
            : slot,
        ),
      } satisfies DaySlots;
    });
    params.current = { placeId: BRANCH, bookingId: 'r-change', slotUtc: at('19:00'), party: '2' };
    renderScreen(<BookingScreen />);

    await waitFor(() => expect(chosenTime()).toBe('19:00'));
    const note = /isn't available for this party/u;
    expect(screen.queryByText(note)).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: '4' }));

    // Never another time in its place: nothing chosen, and why.
    expect(await screen.findByText(note)).toBeTruthy();
    expect(chosenTime()).toBe('No time chosen');
    expect(screen.getByRole('button', { name: 'Save changes' }).getAttribute('aria-disabled')).toBe(
      'true',
    );

    // A time the diner picks is theirs, and the note goes.
    stepTo('19:30');
    expect(screen.queryByText(note)).toBeNull();
  });

  it('says a change that would overlap the diner’s own booking names that booking', async () => {
    const at = (time: string) => new Date(`2026-10-16T${time}:00+04:00`).toISOString();
    const [seven, half] = await Promise.all(
      ['19:00', '19:30'].map((time) =>
        mock.getSlotFloor({
          branchId: BRANCH,
          slotUtc: at(time),
          partySize: 2,
          timeZoneId: 'Asia/Yerevan',
        }),
      ),
    );
    const table = seven!.tables.find(
      (candidate) =>
        candidate.isBookable &&
        half!.tables.find((other) => other.tableId === candidate.tableId)?.isBookable,
    )!;
    vi.spyOn(mock, 'rescheduleBooking').mockRejectedValue(
      new BookingOverlapsOwnError({
        url: '/api/reservations/r-change/reschedule',
        existingReservationId: 'r-other',
        localStartTime: '19:45',
        tableLabel: '2',
      }),
    );
    params.current = {
      placeId: BRANCH,
      bookingId: 'r-change',
      slotUtc: at('19:00'),
      party: '2',
      tableId: table.tableId,
      tableLabel: table.tableLabel,
    };
    router.dismissTo.mockClear();
    renderScreen(<BookingScreen />);
    await waitFor(() => expect(chosenTime()).toBe('19:00'));
    stepTo('19:30');
    const save = screen.getByRole('button', { name: /^Save changes, / });
    await waitFor(() => expect(save.getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(save);

    expect(
      await screen.findByText(
        'You already have a booking here at 19:45 (table 2). Choose another time, or change that booking.',
      ),
    ).toBeTruthy();
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it('opens a new booking after a declined one on its day and party, with no time chosen', async () => {
    // Declined for 19:30 on Sunday the 18th, for three.
    params.current = { placeId: BRANCH, dayOf: '2026-10-18T15:30:00Z', party: '3' };
    renderScreen(<BookingScreen />);

    expect(await screen.findByText('Book a Table')).toBeTruthy();
    expect(await screen.findByRole('radio', { name: '3', checked: true })).toBeTruthy();
    const chosenDay = screen
      .getAllByRole('button')
      .find((button) => button.getAttribute('aria-selected') === 'true');
    expect(chosenDay?.getAttribute('aria-label')).toMatch(/18/u);
    // A new booking: nothing to change, and the time is the diner's to choose.
    expect(screen.queryByText('Change booking')).toBeNull();
  });

  it('keeps a party bigger than the list as it is, chosen', async () => {
    const at = (time: string) => new Date(`2026-10-16T${time}:00+04:00`).toISOString();
    params.current = { placeId: BRANCH, bookingId: 'r-big', slotUtc: at('19:00'), party: '15' };
    renderScreen(<BookingScreen />);

    // Not 12, the top of the list: the booking's own 15, shown as chosen.
    expect(await screen.findByRole('radio', { name: '15', checked: true })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '5+', checked: true })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: '12', checked: true })).toBeNull();
  });
});

describe('the Book screen, booking times', () => {
  const at = (time: string) => new Date(`2026-10-16T${time}:00+04:00`).toISOString();
  const confirmButton = () => screen.getByRole('button', { name: /^Confirm Booking/u });
  const confirmEnabled = () =>
    waitFor(() => expect(confirmButton().getAttribute('aria-disabled')).not.toBe('true'));

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T08:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    useSession.setState({ signedIn: false, phoneE164: null, guestName: null });
    router.replace.mockReset();
  });

  /** A verified diner with a name: Confirm books from this screen. */
  function signIn() {
    useSession.setState({ signedIn: true, phoneE164: '+37499000000', guestName: 'Ani' });
  }

  /** The mock's floors, each table changed by `edit` (by the slot asked about). */
  function editFloors(
    edit: (
      table: SlotFloor['tables'][number],
      slotMs: number,
    ) => Partial<SlotFloor['tables'][number]> | null,
  ) {
    const original = mock.getSlotFloor.bind(mock);
    return vi.spyOn(mock, 'getSlotFloor').mockImplementation(async (input) => {
      const floor = await original(input);
      if (!floor) return floor;
      const slotMs = Date.parse(input.slotUtc);
      return {
        ...floor,
        tables: floor.tables.map((table) => ({ ...table, ...(edit(table, slotMs) ?? {}) })),
      };
    });
  }

  it("never books on the last time's answer while the new time's is still coming", async () => {
    const original = mock.getSlotFloor.bind(mock);
    vi.spyOn(mock, 'getSlotFloor').mockImplementation((input) =>
      Date.parse(input.slotUtc) === Date.parse(at('19:30'))
        ? new Promise<SlotFloor | null>(() => undefined)
        : original(input),
    );
    params.current = { placeId: BRANCH };
    renderScreen(<BookingScreen />);
    await screen.findAllByRole('button', { name: firstFree });

    stepTo('19:00');
    await confirmEnabled();

    // 19:00's room is still the one on screen; it says nothing about 19:30.
    stepTo('19:30');
    expect(confirmButton().getAttribute('aria-disabled')).toBe('true');
    await act(async () => {
      await Promise.resolve();
    });
    expect(confirmButton().getAttribute('aria-disabled')).toBe('true');
  });

  it("sends the server's time to free the table by, once agreed, without asking again", async () => {
    signIn();
    // The room says 20:25 for every table; the server, a booking later, 20:20.
    editFloors((table, slotMs) =>
      table.isBookable && slotMs === Date.parse(at('19:00'))
        ? { mustFreeByUtc: at('20:25'), isRequestable: false }
        : null,
    );
    const create = vi
      .spyOn(mock, 'createBooking')
      .mockRejectedValueOnce(
        new FreeByRequiredError({
          url: '/api/reservations',
          // The server's own spelling of the instant, without milliseconds.
          requiredFreeByUtc: '2026-10-16T16:20:00Z',
          nextBookingStartUtc: '2026-10-16T16:25:00Z',
        }),
      )
      .mockResolvedValueOnce({ id: 'r-new', status: 'confirmed' } as Booking);
    params.current = { placeId: BRANCH };
    renderScreen(<BookingScreen />);
    await screen.findAllByRole('button', { name: firstFree });

    stepTo('19:00');
    await confirmEnabled();
    fireEvent.click(confirmButton());
    fireEvent.click(await screen.findByRole('button', { name: "Yes, I'll free it by 20:25" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]![0]).toMatchObject({ acceptsFreeByUtc: at('20:25') });

    // Asked again with the server's time, and that is what goes — no third question.
    fireEvent.click(await screen.findByRole('button', { name: "Yes, I'll free it by 20:20" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(Date.parse(create.mock.calls[1]![0].acceptsFreeByUtc!)).toBe(Date.parse(at('20:20')));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/reserve/success',
        params: { bookingId: 'r-new' },
      }),
    );
    expect(screen.queryByRole('button', { name: /^Yes, I'll free it by/u })).toBeNull();
  });

  it('after a no, offers only times the chosen table has no limit at', async () => {
    const seven = await mock.getSlotFloor({
      branchId: BRANCH,
      slotUtc: at('19:00'),
      partySize: 2,
      timeZoneId: 'Asia/Yerevan',
    });
    const onPhoto = new Set(
      (held.rooms as PlaceRoom[])[0]!.photos[0]!.tables.map((marker) => marker.tableId),
    );
    const table = seven!.tables.find(
      (candidate) =>
        candidate.isBookable && !candidate.isRequestable && onPhoto.has(candidate.tableId),
    )!;
    // That table is cut short at every time but 19:30; every other table at none.
    editFloors((candidate, slotMs) =>
      candidate.tableId === table.tableId &&
      candidate.isBookable &&
      slotMs !== Date.parse(at('19:30'))
        ? { mustFreeByUtc: new Date(slotMs + 85 * 60_000).toISOString(), isRequestable: false }
        : null,
    );
    params.current = { placeId: BRANCH };
    renderScreen(<BookingScreen />);
    await screen.findAllByRole('button', { name: firstFree });

    stepTo('19:00');
    fireEvent.click(
      await screen.findByRole('button', {
        name: new RegExp(`^Table ${table.tableLabel}, free`, 'u'),
      }),
    );
    expect(await screen.findByText('Selected table')).toBeTruthy();
    await confirmEnabled();
    fireEvent.click(confirmButton());
    fireEvent.click(
      await screen.findByRole('button', { name: "No, I'll choose another table or time" }),
    );

    const other = await screen.findByText(
      'Choose another table or time. These times have no limit:',
    );
    const box = other.parentElement!;
    expect(await within(box).findByRole('button', { name: '19:30' })).toBeTruthy();
    // 19:15 has no limit for the other tables — but this one is cut short then.
    expect(within(box).queryByRole('button', { name: '19:15' })).toBeNull();
    expect(within(box).queryByRole('button', { name: '18:45' })).toBeNull();
  });

  it('moves on to the first time still on offer when the chosen one became too soon', async () => {
    signIn();
    vi.spyOn(mock, 'createBooking').mockRejectedValueOnce(
      new LeadTimeExceededError({
        url: '/api/reservations',
        leadTimeMinutes: 10,
        earliestSlotUtc: at('19:20'),
      }),
    );
    params.current = { placeId: BRANCH };
    renderScreen(<BookingScreen />);
    await screen.findAllByRole('button', { name: firstFree });

    stepTo('19:00');
    await confirmEnabled();
    fireEvent.click(confirmButton());

    expect(await screen.findByText(/That time is too soon now/u)).toBeTruthy();
    await waitFor(() => expect(chosenTime()).toBe('19:30'));
  });
});

describe('changing a late-night booking at a bar', () => {
  const BAR = 'b-copperfox-saryan';
  let saved: { place: unknown; rooms: unknown[] };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // Noon in Yerevan on the 16th.
    vi.setSystemTime(new Date('2026-10-16T08:00:00Z'));
    saved = { place: held.place, rooms: held.rooms };
    held.rooms = roomsFromApi((await mock.getBranchRooms(BAR))!.rooms);
    held.place = {
      ...(held.place as Place),
      id: BAR,
      venueId: 'v-copperfox',
      venueSlug: 'copper-fox',
      branchSlug: 'saryan-street',
      venueName: 'Copper Fox',
      branchName: 'Saryan Street',
      name: 'Copper Fox · Saryan Street',
      type: 'bar',
      district: 'Kentron',
      // The mock's own hours for the bar: 17:00 until 02:00.
      hours: ([0, 1, 2, 3, 4, 5, 6] as const).map((day) => ({
        day,
        open: '17:00',
        close: '02:00',
      })),
      rooms: held.rooms as PlaceRoom[],
    } satisfies Place;
  });
  afterEach(() => {
    held.place = saved.place;
    held.rooms = saved.rooms;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens on the evening it belongs to and keeps its 00:30 when only the party changes', async () => {
    // 00:30 on the 17th: the evening of the 16th.
    const slotUtc = new Date('2026-10-17T00:30:00+04:00').toISOString();
    const [forTwo, forThree] = await Promise.all(
      [2, 3].map((partySize) =>
        mock.getSlotFloor({ branchId: BAR, slotUtc, partySize, timeZoneId: 'Asia/Yerevan' }),
      ),
    );
    const table = forTwo!.tables.find(
      (candidate) =>
        candidate.isBookable &&
        forThree!.tables.find((other) => other.tableId === candidate.tableId)?.isBookable,
    )!;
    const reschedule = vi
      .spyOn(mock, 'rescheduleBooking')
      .mockImplementation(
        async (command) => ({ id: command.bookingId, status: 'confirmed' }) as Booking,
      );
    params.current = {
      placeId: BAR,
      bookingId: 'r-late',
      slotUtc,
      party: '2',
      tableId: table.tableId,
      tableLabel: table.tableLabel,
    };
    renderScreen(<BookingScreen />);

    // Today's strip, the evening's 00:30 chosen; the header says where.
    await screen.findByRole('slider', { name: 'Time' });
    await waitFor(() => expect(chosenTime()).toBe('00:30'));
    expect(screen.getByText('Copper Fox · Saryan Street · Kentron')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: '3' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^Save changes, / }).getAttribute('aria-disabled'),
      ).not.toBe('true'),
    );
    expect(chosenTime()).toBe('00:30');
    fireEvent.click(screen.getByRole('button', { name: /^Save changes, / }));

    await waitFor(() =>
      expect(reschedule).toHaveBeenCalledWith(
        expect.objectContaining({ bookingId: 'r-late', slotUtc, partySize: 3 }),
      ),
    );
  });
  it("says the guest before is asked for a late-night time on tonight's strip that is tomorrow", async () => {
    // 00:30 on the 17th: on the evening of the 16th, but another day, twelve hours off.
    const original = mock.getDaySlots.bind(mock);
    vi.spyOn(mock, 'getDaySlots').mockImplementation(async (input) => {
      const day = await original(input);
      if (!day) return day;
      return {
        ...day,
        slots: day.slots.map((slot) =>
          slot.time === '00:30'
            ? {
                ...slot,
                isAvailable: false,
                freeTableCount: 0,
                requestable: true,
                requestableTableCount: 1,
              }
            : slot,
        ),
      } satisfies DaySlots;
    });
    params.current = { placeId: BAR };
    renderScreen(<BookingScreen />);
    await screen.findByRole('slider', { name: 'Time' });
    await waitFor(() => expect(chosenTime()).not.toBe('No free time'));

    stepTo('00:30');
    expect(
      await screen.findByText(
        'The guest before you will be asked whether they will have left by then.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/so the venue checks the table is free/u)).toBeNull();
  });
});
