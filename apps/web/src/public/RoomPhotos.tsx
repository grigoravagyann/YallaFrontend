import type { DerivedTableState, FloorTable, PublicRoom } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

/** The three colours a visitor reads a pin by. */
export type PinTone = 'free' | 'booked' | 'occupied';

export function pinTone(state: DerivedTableState): PinTone {
  switch (state) {
    case 'free':
      return 'free';
    case 'reservedSoon':
    case 'held':
      return 'booked';
    case 'occupied':
    case 'outOfService':
      return 'occupied';
  }
}

/** How far a finger has to travel sideways before it counts as a swipe. */
const SWIPE_PX = 40;

export interface RoomPhotosProps {
  /** The rooms with photos, in the venue's order. */
  readonly rooms: readonly PublicRoom[];
  /** The tables offered at the chosen slot, each with its pin and its state then. */
  readonly tables: readonly FloorTable[];
  readonly selectedTableId: string | null;
  readonly onTableTap: (tableId: string) => void;
  /**
   * Whether tapping a pin leads anywhere.
   *
   * False on a venue that has web booking switched off. The room is still worth
   * seeing — which tables are free is the question this page exists to answer —
   * but inviting a tap that goes nowhere is worse than not inviting one.
   */
  readonly bookable: boolean;
}

/**
 * The venue's rooms as photos, with every table a pin where it stands.
 *
 * A visitor picks a room, then moves through its photos with the arrows, the
 * arrow keys or a swipe. Pins are coloured by the table's state **at the slot
 * picked above** — green free, orange booked, red occupied — and a free pin the
 * server would give this party starts the booking. Every pin is a button named
 * "Table 4, free", so the colours are never the only way to know.
 */
export default function RoomPhotos({
  rooms,
  tables,
  selectedTableId,
  onTableTap,
  bookable,
}: RoomPhotosProps) {
  const { t } = useTranslation('public');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [photoIndexes, setPhotoIndexes] = useState<Readonly<Record<string, number>>>({});
  const swipeFrom = useRef<number | null>(null);

  const room = rooms.find((candidate) => candidate.roomId === roomId) ?? rooms[0];
  if (!room) return <p className="pub-muted">{t('room.empty')}</p>;

  const count = room.photos.length;
  const index = Math.min(photoIndexes[room.roomId] ?? 0, Math.max(0, count - 1));
  const photo = room.photos[index];
  const go = (next: number) => {
    if (next < 0 || next >= count) return;
    setPhotoIndexes((current) => ({ ...current, [room.roomId]: next }));
  };

  const pins = photo ? tables.filter((table) => table.pin?.photoId === photo.photoId) : [];
  const stageLabel = t('room.photoOf', { room: room.name, index: index + 1, count });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(index + 1);
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // A press on a pin is a tap on the pin, not the start of a swipe.
    swipeFrom.current = (event.target as HTMLElement).closest('button') ? null : event.clientX;
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const from = swipeFrom.current;
    swipeFrom.current = null;
    if (from === null) return;
    const moved = event.clientX - from;
    if (moved <= -SWIPE_PX) go(index + 1);
    else if (moved >= SWIPE_PX) go(index - 1);
  };

  return (
    <div className="pub-rooms">
      {rooms.length > 1 ? (
        <div className="pub-room-picker" role="group" aria-label={t('room.rooms')}>
          {rooms.map((candidate) => (
            <button
              key={candidate.roomId}
              type="button"
              aria-pressed={candidate.roomId === room.roomId}
              onClick={() => setRoomId(candidate.roomId)}
            >
              {candidate.name}
            </button>
          ))}
        </div>
      ) : null}

      <ul className="pub-legend" aria-label={t('room.legendLabel')}>
        {(['free', 'booked', 'occupied'] as const).map((tone) => (
          <li key={tone}>
            <span className={`pub-pin-dot tone-${tone}`} aria-hidden="true" />
            {t(`room.legend.${tone}`)}
          </li>
        ))}
      </ul>

      {bookable ? <p className="pub-muted pub-room-hint">{t('room.pick')}</p> : null}

      {/* Focusable so the arrow keys move through the photos; the pins inside
          are reached with Tab like any other button. */}
      <div
        className="pub-stage"
        role="group"
        aria-label={stageLabel}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          swipeFrom.current = null;
        }}
      >
        {photo ? (
          <img
            src={photo.fullUrl || photo.cardUrl}
            alt=""
            draggable={false}
            loading="lazy"
            {...(photo.width && photo.height ? { width: photo.width, height: photo.height } : {})}
          />
        ) : null}
        {pins.map((table) => {
          const tone = pinTone(table.state);
          const pickable = bookable && table.isBookable && table.state === 'free';
          return (
            <button
              key={table.id}
              type="button"
              className={`pub-pin tone-${tone}${table.id === selectedTableId ? ' is-selected' : ''}`}
              data-tone={tone}
              style={{ left: `${table.pin!.x * 100}%`, top: `${table.pin!.y * 100}%` }}
              aria-label={t('room.pin', {
                label: table.label,
                status: t(`room.status.${tone}`),
              })}
              aria-pressed={table.id === selectedTableId}
              aria-disabled={pickable ? undefined : true}
              onClick={() => {
                if (pickable) onTableTap(table.id);
              }}
            >
              {table.label}
            </button>
          );
        })}
      </div>

      {count > 1 ? (
        <div className="pub-photo-nav">
          <button
            type="button"
            className="pub-photo-step"
            onClick={() => go(index - 1)}
            disabled={index === 0}
            aria-label={t('room.previous')}
          >
            ‹
          </button>
          <span aria-hidden="true">
            {index + 1} / {count}
          </span>
          <button
            type="button"
            className="pub-photo-step"
            onClick={() => go(index + 1)}
            disabled={index === count - 1}
            aria-label={t('room.next')}
          >
            ›
          </button>
        </div>
      ) : null}
    </div>
  );
}
