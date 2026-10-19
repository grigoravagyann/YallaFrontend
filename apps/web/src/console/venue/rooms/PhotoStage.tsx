import type { EditorTablePin, Photo } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { nudge, type DraftTable } from './roomsModel';

export interface PhotoStageProps {
  readonly photo: Photo;
  /** What the picture is, for a screen reader: the room and the photo's place in it. */
  readonly label: string;
  /** The active tables pinned on this photo. */
  readonly tables: readonly DraftTable[];
  readonly selectedTableId: string | null;
  /**
   * A selected table with no pin: a click on the photo places it rather than
   * adding a new one.
   */
  readonly placing: DraftTable | null;
  /** The table whose pin should take focus once drawn, after a keyboard placement. */
  readonly focusTableId: string | null;
  readonly onFocused: () => void;
  readonly onClickAt: (pin: EditorTablePin) => void;
  readonly onSelect: (tableId: string) => void;
  readonly onMove: (tableId: string, pin: EditorTablePin) => void;
  readonly onUnpin: (tableId: string) => void;
  /** While a save is in flight: pins neither move nor come off, and a click adds nothing. */
  readonly readOnly?: boolean;
}

/** Room photos are shown in the 4:3 frame of dish and cover photos (venue HANDOFF §3). */
const FRAME = 4 / 3;

/**
 * One room photo with its table pins on it, in a 4:3 frame (Rooms artboard).
 *
 * The photo is stored whole, at its own shape, and a pin is a fraction of
 * **that whole picture**, 0–1 from the left and the top (VC3 wire §3). So the
 * frame letterboxes rather than crops: the picture is drawn contained in it,
 * and the pins sit on the contained picture, never on the frame — a crop
 * would draw every pin of a photo that is not 4:3 in the wrong place, and
 * save it there. A 4:3 photo, the one the photo framer makes, fills the frame.
 *
 * A click on the picture adds a table there (or places the selected unpinned
 * one); a click on the bars beside it does nothing. A pin is dragged with the
 * pointer, or moved with the arrow keys once focused — Shift for steps of
 * five — and Delete takes it off the photo.
 *
 * Pins say how a table is booked: brand for a bookable one, muted for
 * walk-ins only, amber and dashed for one not saved yet.
 */
export function PhotoStage({
  photo,
  label,
  tables,
  selectedTableId,
  placing,
  focusTableId,
  onFocused,
  onClickAt,
  onSelect,
  onMove,
  onUnpin,
  readOnly = false,
}: PhotoStageProps) {
  const { t } = useTranslation(['admin', 'common']);
  const pictureRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<string | null>(null);
  /** The picture's own shape, when the photo record does not carry it (a migrated one). */
  const [natural, setNatural] = useState<{
    readonly photoId: string;
    readonly ratio: number;
  } | null>(null);

  const ratio =
    photo.width && photo.height
      ? photo.width / photo.height
      : natural?.photoId === photo.photoId
        ? natural.ratio
        : FRAME;
  // The contained picture's box, as a share of the frame.
  const box =
    ratio >= FRAME
      ? { width: '100%', height: `${(FRAME / ratio) * 100}%` }
      : { width: `${(ratio / FRAME) * 100}%`, height: '100%' };

  useEffect(() => {
    if (!focusTableId) return;
    const pin = Array.from(
      pictureRef.current?.querySelectorAll<HTMLButtonElement>('button[data-table-id]') ?? [],
    ).find((button) => button.dataset['tableId'] === focusTableId);
    if (!pin) return;
    pin.focus();
    onFocused();
  });

  function pinAt(event: PointerEvent): EditorTablePin | null {
    const rect = pictureRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return {
      photoId: photo.photoId,
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }

  function onPicturePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (readOnly || event.target !== event.currentTarget) return;
    // Keeps the press from moving focus to the page after the table's label
    // field has taken it.
    event.preventDefault();
    const pin = pinAt(event);
    if (pin) onClickAt(pin);
  }

  function onPinPointerDown(event: PointerEvent<HTMLButtonElement>, tableId: string) {
    event.stopPropagation();
    if (readOnly) return;
    onSelect(tableId);
    dragging.current = tableId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPinPointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (readOnly || !dragging.current) return;
    const pin = pinAt(event);
    if (pin) onMove(dragging.current, pin);
  }

  function onPinPointerUp(event: PointerEvent<HTMLButtonElement>) {
    dragging.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function onPinKeyDown(event: KeyboardEvent<HTMLButtonElement>, table: DraftTable) {
    if (readOnly || !table.pin) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onUnpin(table.id);
      return;
    }
    const moved = nudge(table.pin, event.key, event.shiftKey);
    if (!moved) return;
    event.preventDefault();
    onMove(table.id, moved);
  }

  return (
    <div
      className={`yc-stage${placing && !readOnly ? ' is-placing' : ''}`}
      role="group"
      aria-label={label}
    >
      <div
        ref={pictureRef}
        className="yc-stage-pic"
        style={box}
        data-testid="room-stage"
        onPointerDown={onPicturePointerDown}
      >
        <img
          src={photo.fullUrl || photo.cardUrl}
          alt=""
          draggable={false}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (naturalWidth > 0 && naturalHeight > 0) {
              setNatural({ photoId: photo.photoId, ratio: naturalWidth / naturalHeight });
            }
          }}
        />
        {tables.map((table) => {
          if (!table.pin) return null;
          const unsaved = table.status === null;
          const state = unsaved
            ? t('rooms.pin.unsaved')
            : table.isBookable
              ? t('rooms.pin.bookable')
              : t('rooms.pin.walkInOnly');
          return (
            <button
              key={table.id}
              type="button"
              data-table-id={table.id}
              className={[
                'yc-tpin',
                table.isBookable ? '' : 'is-walk',
                unsaved ? 'is-new' : '',
                table.id === selectedTableId ? 'is-sel' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ left: `${table.pin.x * 100}%`, top: `${table.pin.y * 100}%` }}
              aria-label={t('rooms.pin.label', { label: table.label, state })}
              aria-pressed={table.id === selectedTableId}
              onPointerDown={(event) => onPinPointerDown(event, table.id)}
              onPointerMove={onPinPointerMove}
              onPointerUp={onPinPointerUp}
              onPointerCancel={onPinPointerUp}
              onKeyDown={(event) => onPinKeyDown(event, table)}
              onClick={() => onSelect(table.id)}
            >
              {table.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
