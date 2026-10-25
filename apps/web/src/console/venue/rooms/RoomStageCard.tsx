import { MAX_ROOM_PHOTOS, type EditorTablePin, type Photo } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { ArrowLeftIcon, ChevronRightIcon, PlusIcon, TrashIcon } from '../../ui/icons';
import { RowMenu } from '../../ui/RowMenu';
import { PhotoStage } from './PhotoStage';
import type { DraftRoom, DraftTable } from './roomsModel';

export interface RoomStageCardProps {
  /** The room on the stage, or `null` with no rooms. */
  readonly room: DraftRoom | null;
  /** Its photo on the stage, or `null` while it has none. */
  readonly photo: Photo | null;
  readonly photoIndex: number;
  /** The table being placed: a click on the photo drops it there. */
  readonly placing: DraftTable | null;
  readonly menuFor: string | null;
  readonly onMenuFor: (id: string | null) => void;
  /** "Add in the middle" (or place there): a click at the photo's free spot. */
  readonly onAddInMiddle: () => void;
  readonly onMovePhoto: (delta: -1 | 1) => void;
  readonly onRemovePhoto: () => void;
  /** The tables pinned on the photo. */
  readonly tables: readonly DraftTable[];
  readonly selectedTableId: string | null;
  readonly focusTableId: string | null;
  readonly onFocused: () => void;
  readonly onClickAt: (pin: EditorTablePin) => void;
  readonly onSelect: (tableId: string) => void;
  readonly onMoveTable: (tableId: string, pin: EditorTablePin) => void;
  readonly onUnpinTable: (tableId: string) => void;
  readonly readOnly: boolean;
  readonly onShowPhoto: (photoId: string) => void;
  readonly onAddPhoto: () => void;
}

/** The room's photo with a pin for every table on it, its menu, and the strip of its photos. */
export function RoomStageCard({
  room,
  photo,
  photoIndex,
  placing,
  menuFor,
  onMenuFor,
  onAddInMiddle,
  onMovePhoto,
  onRemovePhoto,
  tables,
  selectedTableId,
  focusTableId,
  onFocused,
  onClickAt,
  onSelect,
  onMoveTable,
  onUnpinTable,
  readOnly,
  onShowPhoto,
  onAddPhoto,
}: RoomStageCardProps) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <section className="yc-card yc-stagecard" aria-labelledby="stage-title">
      <div className="yc-card-h yc-card-h-tight">
        <h2 className="yc-h2 yc-h2-sm" id="stage-title" tabIndex={-1}>
          {room
            ? photo
              ? t('rooms.stage.title', { name: room.name, position: photoIndex + 1 })
              : room.name.trim() || t('rooms.list.unnamed')
            : t('rooms.list.title')}
        </h2>
        {room && photo ? (
          <span className="yc-rm-stage-acts">
            <button type="button" className="yc-btn yc-btn-ghost yc-btn-sm" onClick={onAddInMiddle}>
              {placing
                ? t('rooms.stage.placeInMiddle', { label: placing.label })
                : t('rooms.stage.addInMiddle')}
            </button>
            <RowMenu
              id="room-photo"
              label={t('rooms.photos.menu', { position: photoIndex + 1 })}
              open={menuFor === 'room-photo'}
              onOpenChange={(open) => onMenuFor(open ? 'room-photo' : null)}
              items={[
                {
                  key: 'earlier',
                  label: t('rooms.photos.moveEarlier'),
                  icon: <ArrowLeftIcon />,
                  disabled: photoIndex === 0,
                  onSelect: () => onMovePhoto(-1),
                },
                {
                  key: 'later',
                  label: t('rooms.photos.moveLater'),
                  icon: <ChevronRightIcon />,
                  disabled: photoIndex === room.photos.length - 1,
                  onSelect: () => onMovePhoto(1),
                },
                {
                  key: 'remove',
                  label: t('rooms.photos.remove'),
                  icon: <TrashIcon />,
                  danger: true,
                  onSelect: onRemovePhoto,
                },
              ]}
            />
          </span>
        ) : null}
      </div>

      {room && photo ? (
        <>
          <PhotoStage
            photo={photo}
            label={t('rooms.stage.label', { position: photoIndex + 1, name: room.name })}
            tables={tables}
            selectedTableId={selectedTableId}
            placing={placing}
            focusTableId={focusTableId}
            onFocused={onFocused}
            onClickAt={onClickAt}
            onSelect={onSelect}
            onMove={onMoveTable}
            onUnpin={onUnpinTable}
            readOnly={readOnly}
          />
          <div className="yc-hintbar">
            <span role="status">
              {placing ? t('rooms.stage.placing', { label: placing.label }) : t('rooms.stage.hint')}
            </span>
            <ul className="yc-pinkey" aria-label={t('rooms.legend')}>
              <li>
                <i className="yc-leg-book" aria-hidden="true" />
                {t('rooms.pin.bookable')}
              </li>
              <li>
                <i className="yc-leg-walk" aria-hidden="true" />
                {t('rooms.pin.walkInOnly')}
              </li>
              <li>
                <i className="yc-leg-new" aria-hidden="true" />
                {t('rooms.pin.unsaved')}
              </li>
            </ul>
          </div>
        </>
      ) : room ? (
        <div className="yc-empty">
          <p>{t('rooms.photos.empty')}</p>
        </div>
      ) : (
        <div className="yc-empty">
          <p>{t('rooms.list.empty')}</p>
        </div>
      )}

      {room ? (
        <div className="yc-strip" role="group" aria-label={t('rooms.photos.strip')}>
          {room.photos.map((candidate, index) => (
            <button
              key={candidate.photoId}
              type="button"
              id={`room-photo-${index + 1}`}
              className={candidate === photo ? 'yc-thumbb is-on' : 'yc-thumbb'}
              aria-pressed={candidate === photo}
              aria-label={t('rooms.photos.show', { position: index + 1 })}
              onClick={() => onShowPhoto(candidate.photoId)}
            >
              <img src={candidate.cardUrl} alt="" />
              <span className="yc-tn">{index + 1}</span>
            </button>
          ))}
          {room.photos.length < MAX_ROOM_PHOTOS ? (
            <button type="button" className="yc-addph" onClick={onAddPhoto}>
              <PlusIcon />
              {t('rooms.photos.addShort')}
            </button>
          ) : null}
          <span className="yc-help yc-strip-n">
            {t('rooms.photos.summary', { used: room.photos.length, max: MAX_ROOM_PHOTOS })}
          </span>
        </div>
      ) : null}
    </section>
  );
}
