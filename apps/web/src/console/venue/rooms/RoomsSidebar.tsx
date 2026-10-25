import { useTranslation } from '@yalla/i18n';
import type { FormEvent } from 'react';
import { ChevronDownIcon, ChevronRightIcon, ChevronUpIcon, TrashIcon } from '../../ui/icons';
import { RowMenu } from '../../ui/RowMenu';
import type { DraftRoom, DraftTable } from './roomsModel';

export interface RoomsListCardProps {
  readonly rooms: readonly DraftRoom[];
  /** The room on the stage. */
  readonly current: DraftRoom | null;
  /** The tables in service, counted per room. */
  readonly active: readonly DraftTable[];
  readonly menuFor: string | null;
  readonly onMenuFor: (id: string | null) => void;
  readonly onPick: (roomId: string) => void;
  readonly onMove: (roomId: string, delta: -1 | 1) => void;
  readonly onRename: (room: DraftRoom) => void;
  readonly onRemove: (room: DraftRoom) => void;
  /** The new room's name field. */
  readonly newRoomId: string;
  readonly newRoomName: string;
  readonly onNewRoomName: (name: string) => void;
  readonly onAddRoom: (event: FormEvent) => void;
}

/** The rooms, in the order diners see them, and a field to add one. */
export function RoomsListCard({
  rooms,
  current,
  active,
  menuFor,
  onMenuFor,
  onPick,
  onMove,
  onRename,
  onRemove,
  newRoomId,
  newRoomName,
  onNewRoomName,
  onAddRoom,
}: RoomsListCardProps) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <section className="yc-card" aria-labelledby="rooms-list-title">
      <div className="yc-card-h yc-card-h-tight">
        <h2 className="yc-h2" id="rooms-list-title" tabIndex={-1}>
          {t('rooms.list.title')}
        </h2>
      </div>
      {rooms.length === 0 ? (
        <p className="yc-empty-p">{t('rooms.list.empty')}</p>
      ) : (
        <ul className="yc-rooms">
          {rooms.map((candidate, index) => {
            const isCurrent = candidate === current;
            const name = candidate.name.trim() || t('rooms.list.unnamed');
            const tables = active.filter((table) => table.roomId === candidate.id).length;
            return (
              <li key={candidate.id} className={isCurrent ? 'is-on' : undefined}>
                <button
                  type="button"
                  className="yc-rpick"
                  aria-current={isCurrent}
                  onClick={() => onPick(candidate.id)}
                >
                  <b>{name}</b>
                  <span>
                    {t('rooms.list.meta', {
                      photos: t('rooms.list.photoCount', { count: candidate.photos.length }),
                      tables: t('rooms.list.tableCount', { count: tables }),
                    })}
                  </span>
                </button>
                <span className="yc-ordc">
                  <button
                    type="button"
                    className="yc-mini"
                    aria-label={t('rooms.list.moveUpAria', { name })}
                    aria-disabled={index === 0}
                    onClick={() => index > 0 && onMove(candidate.id, -1)}
                  >
                    <ChevronUpIcon />
                  </button>
                  <button
                    type="button"
                    className="yc-mini"
                    aria-label={t('rooms.list.moveDownAria', { name })}
                    aria-disabled={index === rooms.length - 1}
                    onClick={() => index < rooms.length - 1 && onMove(candidate.id, 1)}
                  >
                    <ChevronDownIcon />
                  </button>
                </span>
                <RowMenu
                  id={`room-${candidate.id}`}
                  label={t('rooms.room.menu', { name })}
                  open={menuFor === `room-${candidate.id}`}
                  onOpenChange={(open) => onMenuFor(open ? `room-${candidate.id}` : null)}
                  items={[
                    {
                      key: 'rename',
                      label: t('rooms.room.rename'),
                      icon: <ChevronRightIcon />,
                      onSelect: () => onRename(candidate),
                    },
                    {
                      key: 'remove',
                      label: t('rooms.room.remove'),
                      icon: <TrashIcon />,
                      danger: true,
                      onSelect: () => onRemove(candidate),
                    },
                  ]}
                />
              </li>
            );
          })}
        </ul>
      )}
      <form className="yc-addroom" noValidate onSubmit={onAddRoom}>
        <label htmlFor={newRoomId} className="yc-sr">
          {t('rooms.list.newName')}
        </label>
        <input
          id={newRoomId}
          className="yc-ctl"
          placeholder={t('rooms.list.newPlaceholder')}
          value={newRoomName}
          onChange={(event) => onNewRoomName(event.target.value)}
        />
        <button type="submit" className="yc-btn yc-btn-sec yc-btn-sm">
          {t('rooms.list.add')}
        </button>
      </form>
    </section>
  );
}

/** Tables in service on no photo, each with "Place". */
export function UnpinnedTablesCard({
  tables,
  selectedId,
  roomName,
  onPlace,
}: {
  readonly tables: readonly DraftTable[];
  readonly selectedId: string | null;
  readonly roomName: (roomId: string | null) => string;
  readonly onPlace: (table: DraftTable) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <section className="yc-card" aria-labelledby="rm-unp-h">
      <div className="yc-card-h yc-card-h-tight">
        <h2 className="yc-h2 yc-h2-sm" id="rm-unp-h">
          {t('rooms.unpinned.title')}
        </h2>
      </div>
      {tables.length === 0 ? (
        <p className="yc-empty-p">{t('rooms.unpinned.none')}</p>
      ) : (
        <ul className="yc-tlist">
          {tables.map((table) => (
            <li key={table.id} className={table.id === selectedId ? 'is-on' : undefined}>
              <span className="yc-ttag">{table.label}</span>
              <span className="yc-grow yc-tl-where">{roomName(table.roomId)}</span>
              <button
                type="button"
                id={`place-${table.id}`}
                className="yc-btn yc-btn-sec yc-btn-sm"
                aria-label={t('rooms.unpinned.placeAria', { label: table.label })}
                onClick={() => onPlace(table)}
              >
                {t('rooms.unpinned.place')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Tables out of service, each with "Restore". */
export function InactiveTablesCard({
  tables,
  onRestore,
}: {
  readonly tables: readonly DraftTable[];
  readonly onRestore: (table: DraftTable) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <section className="yc-card" aria-labelledby="rm-off-h">
      <div className="yc-card-h yc-card-h-tight">
        <div>
          <h2 className="yc-h2 yc-h2-sm" id="rm-off-h">
            {t('rooms.inactive.title')}
          </h2>
          <p className="yc-cap">{t('rooms.inactive.cap')}</p>
        </div>
      </div>
      {tables.length === 0 ? (
        <p className="yc-empty-p">{t('rooms.inactive.none')}</p>
      ) : (
        <ul className="yc-tlist">
          {tables.map((table) => (
            <li key={table.id}>
              <span className="yc-ttag">{table.label}</span>
              <span className="yc-grow yc-tl-where">
                {t('rooms.inactive.seats', { count: table.seats })}
              </span>
              <button
                type="button"
                className="yc-lnk"
                aria-label={t('rooms.inactive.restoreAria', { label: table.label })}
                onClick={() => onRestore(table)}
              >
                {t('rooms.inactive.restore')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
