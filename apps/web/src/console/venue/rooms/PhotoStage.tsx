import type { EditorTablePin, Photo } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
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
}

/**
 * One room photo with its table pins on it.
 *
 * Positions are fractions of the picture, 0–1 from the left and the top, so a
 * pin stays on its table at whatever size the photo is drawn. A click on the
 * picture adds a table there (or places the selected unpinned one); a pin is
 * dragged with the pointer, or moved with the arrow keys once focused — shift
 * for bigger steps — and Delete takes it off the photo.
 *
 * Pin colours are the live palette the staff floor and the diner app use, by
 * the table's state when the plan was read: free green, held orange, occupied
 * red, out of service grey. A table not saved yet has no state, and no colour
 * of the palette.
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
}: PhotoStageProps) {
  const { t } = useTranslation(['admin', 'common']);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<string | null>(null);

  useEffect(() => {
    if (!focusTableId) return;
    const pin = Array.from(
      stageRef.current?.querySelectorAll<HTMLButtonElement>('button[data-table-id]') ?? [],
    ).find((button) => button.dataset['tableId'] === focusTableId);
    if (!pin) return;
    pin.focus();
    onFocused();
  });

  function pinAt(event: PointerEvent): EditorTablePin | null {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return {
      photoId: photo.photoId,
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }

  function onStagePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const pin = pinAt(event);
    if (pin) onClickAt(pin);
  }

  function onPinPointerDown(event: PointerEvent<HTMLButtonElement>, tableId: string) {
    event.stopPropagation();
    onSelect(tableId);
    dragging.current = tableId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPinPointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!dragging.current) return;
    const pin = pinAt(event);
    if (pin) onMove(dragging.current, pin);
  }

  function onPinPointerUp(event: PointerEvent<HTMLButtonElement>) {
    dragging.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function onPinKeyDown(event: KeyboardEvent<HTMLButtonElement>, table: DraftTable) {
    if (!table.pin) return;
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
      ref={stageRef}
      className={`room-stage${placing ? ' is-placing' : ''}`}
      role="group"
      aria-label={label}
      data-testid="room-stage"
      onPointerDown={onStagePointerDown}
    >
      <img src={photo.fullUrl || photo.cardUrl} alt="" draggable={false} />
      {tables.map((table) => {
        if (!table.pin) return null;
        const state = table.status
          ? t(`common:tableStatus.${table.status}`)
          : t('rooms.pin.unsaved');
        return (
          <button
            key={table.id}
            type="button"
            data-table-id={table.id}
            className={`room-pin is-${table.status ?? 'new'}${
              table.id === selectedTableId ? ' is-selected' : ''
            }`}
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
  );
}
