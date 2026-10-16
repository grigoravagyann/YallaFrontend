import type { DerivedTableState, FloorTable, PublicRoom } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';

/**
 * The four colours a visitor reads a pin by — the diner's and the staff's
 * four: a table out of service is grey, never the occupied red.
 */
export type PinTone = 'free' | 'booked' | 'occupied' | 'outOfService' | 'unavailable';

export function pinTone(state: DerivedTableState): PinTone {
  switch (state) {
    case 'free':
      return 'free';
    case 'reservedSoon':
    case 'held':
      return 'booked';
    case 'occupied':
      return 'occupied';
    case 'outOfService':
      return 'outOfService';
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
  /**
   * Why a table that is free at the slot still cannot be booked by this party
   * then — too small, kept for larger parties, closed — by table id, in the
   * reader's language. Such a pin is not drawn as free.
   */
  readonly unavailable?: Readonly<Record<string, string>>;
}

/**
 * The venue's rooms as photos, with every table a pin where it stands.
 *
 * A visitor picks a room, then moves through its photos with the arrows, the
 * arrow keys or a swipe. Pins are coloured by the table's state **at the slot
 * picked above** — green free, orange booked, red occupied, grey out of
 * service — and a free pin the
 * server would give this party starts the booking. Every pin is a button named
 * "Table 4, free", so the colours are never the only way to know.
 */
export default function RoomPhotos({
  rooms,
  tables,
  selectedTableId,
  onTableTap,
  bookable,
  unavailable = {},
}: RoomPhotosProps) {
  const { t } = useTranslation('public');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [photoIndexes, setPhotoIndexes] = useState<Readonly<Record<string, number>>>({});
  const swipeFrom = useRef<number | null>(null);
  /** Set by a swipe, so the click it ends with does not also tap a pin. */
  const swiped = useRef(false);
  /** The unbookable pin last tapped, whose reason is said under the photo. */
  const [hintFor, setHintFor] = useState<string | null>(null);
  /** Each unsized photo's shape once it has loaded, as a CSS aspect ratio. */
  const [loadedRatios, setLoadedRatios] = useState<Readonly<Record<string, string>>>({});

  const room = rooms.find((candidate) => candidate.roomId === roomId) ?? rooms[0];
  if (!room) return <p className="pub-muted">{t('room.empty')}</p>;

  const count = room.photos.length;
  const index = Math.min(photoIndexes[room.roomId] ?? 0, Math.max(0, count - 1));
  const photo = room.photos[index];
  const go = (next: number) => {
    if (next < 0 || next >= count) return;
    setPhotoIndexes((current) => ({ ...current, [room.roomId]: next }));
  };

  // A photo with no stored size has no height until it loads, and pins near
  // its top would be clipped meanwhile: a placeholder shape until then.
  const unsized = photo ? !(photo.width && photo.height) : false;
  const ratio = photo && unsized ? loadedRatios[photo.photoId] : undefined;
  const stageStyle = ratio ? ({ '--stage-ratio': ratio } as CSSProperties) : undefined;

  const pins = photo ? tables.filter((table) => table.pin?.photoId === photo.photoId) : [];
  const stageLabel = t('room.photoOf', { room: room.name, index: index + 1, count });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // An arrow pressed on a pin is not the stage's: changing the photo would
    // take the pin, and the focus with it, off the screen.
    if (event.target !== event.currentTarget) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(index + 1);
    }
  };

  // A swipe can start anywhere, a pin included: on a crowded photo the pins
  // cover most of it. Only a press that travels counts; a still one is a tap.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    swipeFrom.current = event.clientX;
    swiped.current = false;
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const from = swipeFrom.current;
    swipeFrom.current = null;
    if (from === null) return;
    const moved = event.clientX - from;
    if (Math.abs(moved) >= SWIPE_PX) swiped.current = true;
    if (moved <= -SWIPE_PX) go(index + 1);
    else if (moved >= SWIPE_PX) go(index - 1);
  };

  // Only while that pin is still one this party cannot book: a new slot may have freed it.
  const notBookable = t('table.unavailable.notBookable', { ns: 'diner' });
  const hintTable = hintFor
    ? pins.find(
        (table) => table.id === hintFor && bookable && table.state === 'free' && !table.isBookable,
      )
    : undefined;

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
        {(bookable
          ? (['free', 'unavailable', 'booked', 'occupied', 'outOfService'] as const)
          : (['free', 'booked', 'occupied', 'outOfService'] as const)
        ).map((tone) => (
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
        className={`pub-stage${unsized ? ' is-unsized' : ''}`}
        style={stageStyle}
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
            onLoad={(event) => {
              if (!unsized) return;
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if (!naturalWidth || !naturalHeight) return;
              const shape = `${naturalWidth} / ${naturalHeight}`;
              setLoadedRatios((current) =>
                current[photo.photoId] === shape ? current : { ...current, [photo.photoId]: shape },
              );
            }}
          />
        ) : null}
        {pins.map((table) => {
          const pickable = bookable && table.isBookable && table.state === 'free';
          // Free at the slot, but not for this party or this time: never the
          // bookable green, and its name says why.
          const blocked = bookable && table.state === 'free' && !pickable;
          const reason = blocked ? (unavailable[table.id] ?? notBookable) : null;
          const tone: PinTone = blocked ? 'unavailable' : pinTone(table.state);
          return (
            <button
              key={table.id}
              type="button"
              className={`pub-pin tone-${tone}${table.id === selectedTableId ? ' is-selected' : ''}`}
              data-tone={tone}
              style={{ left: `${table.pin!.x * 100}%`, top: `${table.pin!.y * 100}%` }}
              aria-label={
                reason !== null
                  ? t('room.pinUnavailable', { label: table.label, reason })
                  : t('room.pin', { label: table.label, status: t(`room.status.${tone}`) })
              }
              aria-pressed={table.id === selectedTableId}
              aria-disabled={pickable ? undefined : true}
              onClick={() => {
                if (swiped.current) {
                  swiped.current = false;
                  return;
                }
                if (pickable) {
                  setHintFor(null);
                  onTableTap(table.id);
                } else if (blocked) {
                  setHintFor(table.id);
                }
              }}
            >
              {table.label}
            </button>
          );
        })}
      </div>

      {hintTable ? (
        <p className="pub-notice" role="status">
          {t('room.unavailableHint', {
            label: hintTable.label,
            reason: unavailable[hintTable.id] ?? notBookable,
          })}
        </p>
      ) : null}

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
