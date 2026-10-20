import type { DerivedTableState, FloorTable, PublicRoom } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { spreadPins } from './pinLayout';
import { freeCountByRoom, roomOf } from './tablePick';

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

/** A pin's target, and so how far apart two pins are drawn at least (review S7). */
const PIN_PX = 44;

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
  /** The party the room is drawn for, named when no table here fits it. */
  readonly partySize: number;
  /** Told which room is on screen, so "Choose for me" can look there first. */
  readonly onRoomShown?: ((roomId: string) => void) | undefined;
  /**
   * The whole slot was refused (too soon, shut): the booking card says why,
   * and the room does not add that it has no free table.
   */
  readonly refused?: boolean;
  /**
   * The tables are the last slot's or the last party's while the new answer
   * loads: no counts and no "no free table here" are drawn from them (review N5).
   */
  readonly stale?: boolean;
}

/** Where a table is drawn: its room, and which of the room's photos. */
function placeOf(
  tableId: string | null,
  tables: readonly FloorTable[],
  rooms: readonly PublicRoom[],
): { readonly roomId: string; readonly photoIndex: number } | null {
  const table = tableId ? tables.find((candidate) => candidate.id === tableId) : undefined;
  const room = table ? roomOf(table, rooms) : null;
  if (!table || !room) return null;
  return {
    roomId: room.roomId,
    photoIndex: room.photos.findIndex((photo) => photo.photoId === table.pin?.photoId),
  };
}

/**
 * The venue's rooms, with every table on them, for the slot picked on the
 * booking card.
 *
 * A visitor picks a room from the tabs — each says how many tables it has free
 * for them — and sees its tables either as **pins on its photos** (moved
 * through with the arrows, the arrow keys or a swipe) or as **a list**, the
 * same tables as rows with their seats and state. The list is the photo's
 * accessible alternative and reads better on a small screen; both take the
 * same taps. Pins are coloured by the table's state at the slot — green free,
 * orange booked, red occupied, grey out of service — and every pin is a button
 * named "Table 4, free", so the colours are never the only way to know.
 *
 * When a table is chosen elsewhere ("Choose for me"), the room and the photo
 * follow it.
 */
export default function RoomPhotos({
  rooms,
  tables,
  selectedTableId,
  onTableTap,
  bookable,
  unavailable = {},
  partySize,
  onRoomShown,
  refused = false,
  stale = false,
}: RoomPhotosProps) {
  const { t } = useTranslation('public');
  const [roomId, setRoomId] = useState<string | null>(
    () => placeOf(selectedTableId, tables, rooms)?.roomId ?? null,
  );
  const [photoIndexes, setPhotoIndexes] = useState<Readonly<Record<string, number>>>(() => {
    const place = placeOf(selectedTableId, tables, rooms);
    return place ? { [place.roomId]: Math.max(0, place.photoIndex) } : {};
  });
  const [view, setView] = useState<'photo' | 'list'>('photo');
  const swipeFrom = useRef<number | null>(null);
  /** Set by a swipe, so the click it ends with does not also tap a pin. */
  const swiped = useRef(false);
  /** The unbookable table last tapped, whose reason is said under the room. */
  const [hintFor, setHintFor] = useState<string | null>(null);
  /** Each unsized photo's shape once it has loaded, as a CSS aspect ratio. */
  const [loadedRatios, setLoadedRatios] = useState<Readonly<Record<string, string>>>({});
  /** The photo's drawn size, so pins that would collide are drawn apart. */
  const stage = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const node = stage.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setStageSize((current) =>
        current && current.width === width && current.height === height
          ? current
          : { width, height },
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  });

  /*
   * A table chosen from outside — "Choose for me", in the booking card — may
   * be in another room or on another photo: go there, so the visitor sees what
   * was chosen. Adjusted during render, React's pattern for state that follows
   * a prop, so no frame shows the old room with the new choice.
   */
  const [followed, setFollowed] = useState(selectedTableId);
  if (followed !== selectedTableId) {
    setFollowed(selectedTableId);
    const place = placeOf(selectedTableId, tables, rooms);
    if (place) {
      setRoomId(place.roomId);
      if (place.photoIndex >= 0) {
        setPhotoIndexes((current) => ({ ...current, [place.roomId]: place.photoIndex }));
      }
    }
  }

  const room = rooms.find((candidate) => candidate.roomId === roomId) ?? rooms[0];
  const shownRoomId = room?.roomId;
  useEffect(() => {
    if (shownRoomId) onRoomShown?.(shownRoomId);
  }, [shownRoomId, onRoomShown]);

  if (!room) return <p className="pub-muted">{t('room.empty')}</p>;

  const count = room.photos.length;
  const index = Math.min(photoIndexes[room.roomId] ?? 0, Math.max(0, count - 1));
  const photo = room.photos[index];
  const go = (next: number) => {
    if (next < 0 || next >= count) return;
    setPhotoIndexes((current) => ({ ...current, [room.roomId]: next }));
  };
  // A room with no photo can only be a list.
  const showList = view === 'list' || !photo;

  // A photo with no stored size has no height until it loads, and pins near
  // its top would be clipped meanwhile: a placeholder shape until then.
  const unsized = photo ? !(photo.width && photo.height) : false;
  const ratio = photo && unsized ? loadedRatios[photo.photoId] : undefined;
  const stageStyle = ratio ? ({ '--stage-ratio': ratio } as CSSProperties) : undefined;

  const pins = photo ? tables.filter((table) => table.pin?.photoId === photo.photoId) : [];
  /*
   * Where each pin is drawn: where the venue put it, unless it would sit on a
   * neighbour at this size — then pushed apart as little as will do. In
   * fractions until the photo has a size (and in a test, which has none).
   */
  // A few pins a photo: cheap enough to work out on every render.
  const placed =
    stageSize && stageSize.width > 0 && stageSize.height > 0
      ? spreadPins(
          pins.map((table) => table.pin!),
          stageSize,
          PIN_PX,
        )
      : null;
  const roomTables = tables
    .filter((table) => roomOf(table, rooms) === room)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const freeCounts = freeCountByRoom(tables, rooms, bookable);
  const stageLabel = t('room.photoOf', { room: room.name, index: index + 1, count });

  /** What a table is to this visitor at this slot — the same for its pin and its row. */
  const notBookable = t('table.unavailable.notBookable', { ns: 'diner' });
  const read = (table: FloorTable) => {
    const pickable = bookable && table.isBookable && table.state === 'free';
    // Free at the slot, but not for this party or this time: never the
    // bookable green, and its name says why.
    const blocked = bookable && table.state === 'free' && !pickable;
    const reason = blocked ? (unavailable[table.id] ?? notBookable) : null;
    const tone: PinTone = blocked ? 'unavailable' : pinTone(table.state);
    return { pickable, blocked, reason, tone };
  };
  const tap = (table: FloorTable) => {
    const { pickable, blocked } = read(table);
    if (pickable) {
      setHintFor(null);
      onTableTap(table.id);
    } else if (blocked) {
      setHintFor(table.id);
    }
  };

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

  // Only while that table is still one this party cannot book: a new slot may have freed it.
  const hintTable = hintFor
    ? roomTables.find((table) => table.id === hintFor && read(table).blocked)
    : undefined;
  const noneHere =
    bookable && !refused && !stale && roomTables.length > 0 && freeCounts[room.roomId] === 0;

  return (
    <div className="pub-rooms">
      {rooms.length > 1 ? (
        <div
          className="pub-chips pub-room-tabs"
          role="group"
          aria-label={t('room.rooms')}
          aria-busy={stale || undefined}
        >
          {rooms.map((candidate) => (
            <button
              key={candidate.roomId}
              type="button"
              className="pub-chip"
              aria-pressed={candidate.roomId === room.roomId}
              onClick={() => {
                setRoomId(candidate.roomId);
                setHintFor(null);
              }}
            >
              {candidate.name}
              {stale ? null : (
                <>
                  {' '}
                  <small>{t('room.freeIn', { count: freeCounts[candidate.roomId] ?? 0 })}</small>
                </>
              )}
            </button>
          ))}
        </div>
      ) : null}

      {photo ? (
        <div className="pub-room-view">
          <span className="pub-label" aria-hidden="true">
            {t('room.view.label')}
          </span>
          <div className="pub-seg" role="group" aria-label={t('room.view.group')}>
            {(['photo', 'list'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={(value === 'list') === showList}
                onClick={() => setView(value)}
              >
                {t(`room.view.${value}`)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {showList ? (
        <ul className="pub-table-list" aria-label={t('room.list.label', { room: room.name })}>
          {roomTables.map((table) => {
            const { pickable, reason, tone } = read(table);
            return (
              <li key={table.id}>
                <button
                  type="button"
                  className={`pub-table-row tone-${tone}`}
                  aria-pressed={table.id === selectedTableId}
                  aria-disabled={pickable ? undefined : true}
                  onClick={() => tap(table)}
                >
                  <span className="pub-table-badge" aria-hidden="true">
                    {table.label}
                  </span>
                  <span className="pub-table-text">
                    <b>{t('room.list.table', { label: table.label, count: table.seats })}</b>
                    <span>{reason ?? t(`room.legend.${tone}`)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <>
          {/* Focusable so the arrow keys move through the photos; the pins
              inside are reached with Tab like any other button. */}
          <div
            className={`pub-stage${unsized ? ' is-unsized' : ''}`}
            style={stageStyle}
            ref={stage}
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
                {...(photo.width && photo.height
                  ? { width: photo.width, height: photo.height }
                  : {})}
                onLoad={(event) => {
                  if (!unsized) return;
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  if (!naturalWidth || !naturalHeight) return;
                  const shape = `${naturalWidth} / ${naturalHeight}`;
                  setLoadedRatios((current) =>
                    current[photo.photoId] === shape
                      ? current
                      : { ...current, [photo.photoId]: shape },
                  );
                }}
              />
            ) : null}
            {pins.map((table, pinIndex) => {
              const { pickable, reason, tone } = read(table);
              const at = placed?.[pinIndex];
              const seats = t('booking.seats', { count: table.seats });
              return (
                // The button is the 44px target; the dot inside it is drawn smaller.
                <button
                  key={table.id}
                  type="button"
                  className={`pub-pin tone-${tone}${table.id === selectedTableId ? ' is-selected' : ''}`}
                  data-tone={tone}
                  style={
                    at
                      ? { left: `${at.x}px`, top: `${at.y}px` }
                      : { left: `${table.pin!.x * 100}%`, top: `${table.pin!.y * 100}%` }
                  }
                  // Seats in the name, as the list row says them (review N6).
                  aria-label={
                    reason !== null
                      ? t('room.pinUnavailable', { label: table.label, seats, reason })
                      : t('room.pin', {
                          label: table.label,
                          seats,
                          status: t(`room.status.${tone}`),
                        })
                  }
                  aria-pressed={table.id === selectedTableId}
                  aria-disabled={pickable ? undefined : true}
                  onClick={() => {
                    if (swiped.current) {
                      swiped.current = false;
                      return;
                    }
                    tap(table);
                  }}
                >
                  <span className="pub-pin-face">{table.label}</span>
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
        </>
      )}

      {hintTable ? (
        <p className="pub-notice" role="status">
          {t('room.unavailableHint', {
            label: hintTable.label,
            reason: unavailable[hintTable.id] ?? notBookable,
          })}
        </p>
      ) : null}

      {noneHere ? (
        <p className="pub-empty">
          {rooms.length > 1
            ? t('room.noneHere', { count: partySize })
            : t('booking.table.noneFits', { count: partySize })}
        </p>
      ) : null}
    </div>
  );
}
