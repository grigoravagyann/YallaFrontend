import { groupByRoom, type DerivedTableState, type FloorTable } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useRef } from 'react';

/**
 * The four colours a waiter reads the floor by.
 *
 * Booked-soon and held are one colour on purpose: both mean "somebody is
 * coming for this table", and the row's text says which.
 */
export type TableTone = 'free' | 'booked' | 'occupied' | 'out';

export function tableTone(state: DerivedTableState): TableTone {
  switch (state) {
    case 'free':
      return 'free';
    case 'reservedSoon':
    case 'held':
      return 'booked';
    case 'occupied':
      return 'occupied';
    case 'outOfService':
      return 'out';
  }
}

const LEGEND: readonly { readonly tone: TableTone; readonly key: string }[] = [
  { tone: 'free', key: 'common:tableStatus.free' },
  { tone: 'booked', key: 'floor.legend.booked' },
  { tone: 'occupied', key: 'common:tableStatus.occupied' },
  { tone: 'out', key: 'common:tableStatus.outOfService' },
];

export function TableLegend() {
  const { t } = useTranslation(['staff', 'common']);
  return (
    <ul className="table-legend" aria-label={t('floor.legend.label')}>
      {LEGEND.map(({ tone, key }) => (
        <li key={tone}>
          <span className={`table-dot tone-${tone}`} aria-hidden="true" />
          {t(key)}
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
  /** "Seated 25 min" for an occupied table, or null. */
  readonly seatedFor: (table: FloorTable) => string | null;
}

/**
 * The floor as a list: every table, grouped by room in the venue's room order
 * and by label within a room.
 *
 * Each row is a button, so the floor is walked with Tab and opened with Enter
 * or Space as well as by touch, and a screen reader hears "Table 4, 2 seats,
 * occupied" — the state the colour shows, in words.
 */
export function TableList({
  tables,
  selectedTableId,
  pendingTableIds,
  onSelect,
  seatedFor,
}: TableListProps) {
  const { t } = useTranslation(['staff', 'common']);
  const groups = groupByRoom(tables);
  const listRef = useRef<HTMLDivElement>(null);

  // The panel takes room beside the list and can push the chosen row below
  // the fold (QA 2026-10-16): keep it in view.
  useEffect(() => {
    if (!selectedTableId) return;
    const row = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('.table-row[data-table-id]') ?? [],
    ).find((candidate) => candidate.dataset['tableId'] === selectedTableId);
    row?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedTableId]);

  return (
    <div className="table-rooms" ref={listRef}>
      {groups.map((group) => {
        const name = group.roomName ?? t('floor.noRoom');
        const headingId = `room-${group.roomId ?? 'none'}`;
        return (
          <section key={group.roomId ?? 'none'} className="table-room" aria-labelledby={headingId}>
            <h2 id={headingId} className="table-room-name">
              {name}
            </h2>
            <ul className="table-rows" aria-labelledby={headingId}>
              {group.tables.map((table) => {
                const status = t(`common:tableStatus.${table.state}`);
                const pending = pendingTableIds.has(table.id);
                const seated = table.state === 'occupied' ? seatedFor(table) : null;
                return (
                  <li key={table.id}>
                    <button
                      type="button"
                      data-table-id={table.id}
                      className="table-row"
                      data-tone={tableTone(table.state)}
                      aria-pressed={table.id === selectedTableId}
                      aria-label={t('common:floorPlan.table', {
                        label: table.label,
                        count: table.seats,
                        status,
                      })}
                      onClick={() => onSelect(table.id)}
                    >
                      <span className={`table-dot tone-${tableTone(table.state)}`} />
                      <span className="table-row-label">{table.label}</span>
                      <span className="table-row-seats">
                        {t('table.seats', { count: table.seats })}
                      </span>
                      <span className="table-row-state">
                        {status}
                        {seated ? ` · ${seated}` : ''}
                      </span>
                      {pending ? (
                        <span className="table-row-pending">{t('floor.pendingMark')}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
