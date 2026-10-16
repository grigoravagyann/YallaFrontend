// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type * as I18nModule from '@yalla/i18n';
import { dinerResources } from '@yalla/i18n/diner';
import { Image } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlaceRoom, RoomPhoto, TablePhotoMarker } from '../../places/model';
import { RoomPhotosView } from './RoomPhotosView';

/**
 * The rooms a diner books from: pick a room, see its photo, read every pin by
 * its name and state, and book a free one. Real English copy, so the names
 * asserted are the ones a screen reader says.
 */

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('@yalla/i18n', async (importOriginal) => {
  const en = dinerResources.en.diner as Record<string, unknown>;
  const lookup = (key: string): string =>
    String(
      key.split('.').reduce<unknown>((at, part) => (at as Record<string, unknown>)?.[part], en),
    );
  return {
    ...(await importOriginal<typeof I18nModule>()),
    useTranslation: () => ({
      t: (key: string, params: Record<string, unknown> = {}) =>
        lookup(key).replace(/\{\{(\w+)\}\}/gu, (_, name: string) => String(params[name])),
    }),
    useLocale: () => ({ locale: 'en' }),
  };
});

afterEach(cleanup);

const pin = (tableId: string, status: TablePhotoMarker['status'], isBookable = true) => ({
  tableId,
  label: tableId,
  status,
  isBookable,
  capacityMin: 1,
  capacityMax: 4,
  x: 0.5,
  y: 0.5,
});

const photo = (photoId: string, tables: TablePhotoMarker[]): RoomPhoto => ({
  photoId,
  url: `https://example.test/${photoId}.jpg`,
  thumbUrl: `https://example.test/${photoId}-t.jpg`,
  width: 1600,
  height: 900,
  tables,
});

const ROOMS: PlaceRoom[] = [
  {
    roomId: 'hall',
    name: 'Hall',
    photos: [photo('h1', [pin('4', 'free'), pin('5', 'reserved')]), photo('h2', [])],
  },
  {
    roomId: 'terrace',
    name: 'Terrace',
    photos: [photo('t1', [pin('7', 'free'), pin('8', 'outOfService'), pin('9', 'free', false)])],
  },
];

describe('RoomPhotosView', () => {
  it('names every pin by its table and state, and switches rooms', () => {
    render(<RoomPhotosView rooms={ROOMS} selectedTableId={null} onSelect={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Table 4, free' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Table 5, reserved' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Table 7, free' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Terrace' }));

    expect(screen.getByRole('button', { name: 'Table 7, free' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Table 8, out of service' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Table 4, free' })).toBeNull();
  });

  it('opens on the room of the selected table', () => {
    render(<RoomPhotosView rooms={ROOMS} selectedTableId="7" onSelect={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Table 7, free' })).toBeTruthy();
  });

  it('places each pin on the box the photo is drawn in, not on the frame', () => {
    render(<RoomPhotosView rooms={ROOMS} selectedTableId={null} onSelect={() => undefined} />);
    // A 16:9 photo in the 4:3 frame is drawn full width, 75% high, 12.5% down.
    const box = screen.getByRole('button', { name: 'Table 4, free' }).parentElement!.parentElement!;
    expect(box.style.top).toBe('12.5%');
    expect(box.style.height).toBe('75%');
    expect(box.style.width).toBe('100%');
  });

  it('books a free bookable pin from the bar, and offers nothing for any other', () => {
    const onBook = vi.fn();
    const onSelect = vi.fn();
    const { rerender } = render(
      <RoomPhotosView rooms={ROOMS} selectedTableId={null} onSelect={onSelect} onBook={onBook} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Table 4, free' }));
    expect(onSelect).toHaveBeenCalledWith('4');

    rerender(
      <RoomPhotosView rooms={ROOMS} selectedTableId="4" onSelect={onSelect} onBook={onBook} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Book' }));
    expect(onBook).toHaveBeenCalledWith(expect.objectContaining({ tableId: '4' }));

    // Free, but a table the venue never takes bookings for.
    rerender(
      <RoomPhotosView rooms={ROOMS} selectedTableId="9" onSelect={onSelect} onBook={onBook} />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Terrace' }));
    expect(screen.queryByRole('button', { name: 'Book' })).toBeNull();
    expect(screen.getByText('This table cannot be booked right now')).toBeTruthy();
  });

  it('explains on the bar, without Book, where the venue takes no app bookings', () => {
    render(
      <RoomPhotosView
        rooms={ROOMS}
        selectedTableId="4"
        onSelect={() => undefined}
        onBook={() => undefined}
        canBook={false}
      />,
    );
    expect(screen.getByText('Table 4')).toBeTruthy();
    expect(screen.getByText('Not taking bookings in the app')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Book' })).toBeNull();
  });

  it('draws a free pin this party cannot have as not selectable, and says why', () => {
    const onSelect = vi.fn();
    render(
      <RoomPhotosView rooms={ROOMS} selectedTableId={null} onSelect={onSelect} partySize={6} />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Terrace' }));

    // Free at the slot, but not for six: never green, never "Table 9, free".
    expect(screen.queryByRole('button', { name: 'Table 9, free' })).toBeNull();
    const unfit = screen.getByRole('button', { name: 'Table 9, free, not for a party of 6' });
    expect(unfit.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(unfit);
    expect(onSelect).not.toHaveBeenCalled();

    // A free table the party fits is still offered.
    fireEvent.click(screen.getByRole('button', { name: 'Table 7, free' }));
    expect(onSelect).toHaveBeenCalledWith('7');
  });
});

/**
 * React Native Web measures through a ResizeObserver jsdom does not have; it
 * still hangs each `onLayout` on its node, so a test can lay a view out.
 */
function layOut(width: number, height: number) {
  for (const node of Array.from(document.querySelectorAll('div'))) {
    const handler = (node as unknown as Record<string, unknown>)['__reactLayoutHandler'];
    if (typeof handler === 'function') {
      act(() => handler({ nativeEvent: { layout: { x: 0, y: 0, width, height } } }));
    }
  }
}

/** The pager's scrolling node: the one that holds every photo of the room. */
function pager(): HTMLElement {
  const counter = screen.getByText(/^\d+\/\d+$/u);
  const frame = counter.parentElement!.parentElement!;
  const scroller = Array.from(frame.querySelectorAll<HTMLElement>('div')).find(
    (node) => node.querySelectorAll('[aria-label="Zoom in"]').length > 1,
  );
  return scroller!;
}

describe('RoomPhotosView paging', () => {
  it('counts the photo swiped to, from the scroll itself (web has no momentum end)', () => {
    render(<RoomPhotosView rooms={ROOMS} selectedTableId={null} onSelect={() => undefined} />);
    layOut(400, 300);
    expect(screen.getByText('1/2')).toBeTruthy();

    const scroller = pager();
    scroller.scrollLeft = 400;
    fireEvent.scroll(scroller);

    expect(screen.getByText('2/2')).toBeTruthy();
  });

  it('holds the pager still while the photo on screen is zoomed, whatever another page reports', () => {
    render(<RoomPhotosView rooms={ROOMS} selectedTableId={null} onSelect={() => undefined} />);
    layOut(400, 300);
    const scroller = pager();
    const [firstZoomIn, secondZoomIn] = screen.getAllByRole('button', { name: 'Zoom in' });
    const [, secondZoomOut] = screen.getAllByRole('button', { name: 'Zoom out' });

    fireEvent.click(firstZoomIn!);
    expect(getComputedStyle(scroller).overflowX).toBe('hidden');

    // The page off screen zooms and unzooms: the photo on screen is still zoomed.
    fireEvent.click(secondZoomIn!);
    fireEvent.click(secondZoomOut!);
    expect(getComputedStyle(scroller).overflowX).toBe('hidden');
  });
});

describe('a photo stored without its size', () => {
  const UNSIZED: PlaceRoom[] = [
    {
      roomId: 'hall',
      name: 'Hall',
      photos: [{ ...photo('old', [pin('4', 'free')]), width: null, height: null }],
    },
  ];

  /** A browser image that loads (or fails) on the next tick, as a real one would. */
  function stubBrowserImage(loads: { width: number; height: number } | null) {
    class StubImage {
      onload: ((event: unknown) => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 0;
      naturalHeight = 0;
      set src(_: string) {
        setTimeout(() => {
          if (!loads) return this.onerror?.();
          this.naturalWidth = loads.width;
          this.naturalHeight = loads.height;
          this.onload?.({ target: this });
        }, 0);
      }
    }
    vi.stubGlobal('Image', StubImage);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('measures it as it loads when it cannot be measured first, and pins its tables', async () => {
    vi.spyOn(Image, 'getSize').mockImplementation((_, __, failure) => failure?.(new Error('no')));
    stubBrowserImage({ width: 1600, height: 900 });
    render(<RoomPhotosView rooms={UNSIZED} selectedTableId={null} onSelect={() => undefined} />);

    expect(await screen.findByRole('button', { name: 'Table 4, free' })).toBeTruthy();
  });

  it('says its tables cannot be shown when it cannot be measured at all', async () => {
    stubBrowserImage(null);
    render(<RoomPhotosView rooms={UNSIZED} selectedTableId={null} onSelect={() => undefined} />);

    expect(await screen.findByText("Tables can't be shown on this photo")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Table 4, free' })).toBeNull();
  });
});
