// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type * as I18nModule from '@yalla/i18n';
import { dinerResources } from '@yalla/i18n/diner';
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
});
