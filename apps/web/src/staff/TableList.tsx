import { groupByRoom, type DerivedTableState, type FloorTable } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useRef } from 'react';
import { tableTone, type TableCardText } from './tableCard';

const LEGEND: readonly DerivedTableState[] = [
  'free',
  'reservedSoon',
  'held',
  'occupied',
  'outOfService',
];

/** The key to the cards: each state's swatch is the card's own tint and edge. */
export function TableLegend() {
  const { t } = useTranslation(['staff', 'common']);
  return (
    <ul className="ft-legend" aria-label={t('floor.legend.label')}>
      {LEGEND.map((state) => (
        <li key={state}>
          <i className="ft-swatch" data-tone={tableTone(state)} aria-hidden="true" />
          {t(`common:tableStatus.${state}`)}
        </li>
      ))}
    </ul>
  );
}

export interface TableListProps {
  readonly tables: readonly FloorTable[];
  readonly selectedTableId: string | null;
  readonly pendingTableIds: ReadonlySet<string>;
  readonly onSelect: (tableId: string) => void;
  /** What the card says. The screen knows the clock, the details and the debts. */
  readonly describe: (table: FloorTable) => TableCardText;
  /**
   * The room chip that is on, by {@link roomKey}, or null for all of them.
   * Kept by the screen, so the kitchen tab and back finds the same room.
   */
  readonly room: string | null;
  readonly onRoom: (room: string | null) => void;
}

/** A room's key: by id, or by name for a room with no id. */
export function roomKey(roomId: string | null, roomName: string | null): string {
  return roomId !== null ? `id:${roomId}` : `name:${roomName ?? ''}`;
}

/**
 * The floor: a room filter, the legend, and a grid of table cards (the Main
 * artboard).
 *
 * The cards are in the venue's room order and then by label, so "All" reads
 * the room the way a waiter walks it; a chip narrows it to one room. Each card
 * is a button, so the floor is walked with Tab and opened with Enter or Space
 * as well as by touch, and a screen reader hears "Table 4, 2 seats, Occupied,
 * seated 48 min, Bar" — the state the tint and the edge show, in words, as the
 * card itself says it.
 */
export function TableList({
  tables,
  selectedTableId,
  pendingTableIds,
  onSelect,
  describe,
  room,
  onRoom,
}: TableListProps) {
  const { t } = useTranslation(['staff', 'common']);
  const groups = groupByRoom(tables);
  const gridRef = useRef<HTMLUListElement>(null);

  // A room that has gone (renamed, emptied) falls back to every room rather
  // than to an empty grid.
  const shown =
    room === null
      ? groups
      : groups.filter((group) => roomKey(group.roomId, group.roomName) === room);
  const visible = (shown.length > 0 ? shown : groups).flatMap((group) => group.tables);
  const current = shown.length > 0 ? room : null;

  // The panel can cover the chosen card (QA 2026-10-16): keep it in view.
  useEffect(() => {
    if (!selectedTableId) return;
    const card = Array.from(
      gridRef.current?.querySelectorAll<HTMLElement>('.table-row[data-table-id]') ?? [],
    ).find((candidate) => candidate.dataset['tableId'] === selectedTableId);
    card?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedTableId]);

  return (
    <>
      <div className="ft-floor-head">
        {groups.length > 1 ? (
          <div className="ft-rooms" role="group" aria-label={t('floor.rooms.label')}>
            <button type="button" aria-pressed={current === null} onClick={() => onRoom(null)}>
              {t('floor.rooms.all', { count: tables.length })}
            </button>
            {groups.map((group) => {
              const key = roomKey(group.roomId, group.roomName);
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={current === key}
                  onClick={() => onRoom(key)}
                >
                  {group.roomName ?? t('floor.noRoom')}
                </button>
              );
            })}
          </div>
        ) : null}
        <TableLegend />
      </div>

      <ul className="ft-grid" ref={gridRef} aria-label={t('floor.tables')}>
        {visible.map((table) => {
          const card = describe(table);
          const pending = pendingTableIds.has(table.id);
          const status = t(`common:tableStatus.${table.state}`);
          const tone = tableTone(table.state);
          // The card's own words where they begin with the state's ("Reserved
          // 19:00", "Held · running late"), so the state is not said twice.
          const leads = card.state.startsWith(status);
          const name = [
            t('common:floorPlan.table', {
              label: table.label,
              count: table.seats,
              status: leads ? card.state : status,
            }),
            leads ? null : card.state,
            card.sub,
            pending ? t('floor.pendingMark') : null,
            table.floorAreaName,
          ]
            .filter(Boolean)
            .join(', ');
          return (
            <li key={table.id}>
              <button
                type="button"
                data-table-id={table.id}
                className="table-row"
                data-tone={tone}
                data-late={card.late ? 'true' : undefined}
                aria-pressed={table.id === selectedTableId}
                aria-label={name}
                onClick={() => onSelect(table.id)}
              >
                <span className="ft-table-seats">{t('table.seats', { count: table.seats })}</span>
                <span className="ft-table-label">{table.label}</span>
                <span className="ft-table-text">
                  <span className={`ft-table-state${card.long ? ' is-long' : ''}`}>
                    {card.state}
                  </span>
                  {card.sub ? <span className="ft-table-sub">{card.sub}</span> : null}
                </span>
                {pending ? (
                  <span className="ft-table-pending">{t('floor.pendingMark')}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
