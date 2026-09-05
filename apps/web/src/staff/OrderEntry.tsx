import type { Menu, MenuItem, PlaceOrderLine, StaffTab } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useMemo, useState } from 'react';
import { useBranchFormat } from './useBranchFormat';

/**
 * Spoken order entry.
 *
 * This is the screen that decides whether the tablet beats the notepad, so it
 * is a speed problem rather than a forms problem. A waiter standing at a table
 * with four people talking at once is not filling in a form; they are keeping
 * up.
 *
 * The rules that fall out of that, and the cost of breaking each:
 *
 * - **Under three taps per item**: category, item, done. Quantity is a stepper
 *   on the line already added, never a dialog before adding, because a dialog
 *   before adding turns "two cappuccinos" into four taps and a decision.
 * - **No page transitions.** Category, grid and the running order are on screen
 *   together. A waiter who loses the list they are building loses the order.
 * - **Search exists and is never required.** A waiter who has to type has
 *   already lost to paper, and on a tablet with a soft keyboard they have lost
 *   half the screen too.
 * - **Nothing here needs typing** except the optional per-line note.
 */

export interface OrderEntryProps {
  readonly menu: Menu | null;
  readonly tab: StaffTab | null;
  readonly tableLabel: string;
  readonly timeZoneId: string;
  readonly online: boolean;
  readonly loading: boolean;
  /** Nothing on this device and nothing reachable. Not a spinner. */
  readonly menuUnavailable: boolean;
  /** What is on screen came off this tablet's disk rather than the network. */
  readonly menuFromCache: boolean;
  /**
   * There is no tab on this table, and a waiter cannot open one.
   *
   * `POST /api/tabs/open` takes the QR token printed on the table, which a
   * staff session does not have — so an order has nowhere to go. Said before
   * the waiter builds one rather than after they try to send it.
   */
  readonly noTab: boolean;
  readonly onSubmit: (lines: readonly PlaceOrderLine[]) => void;
  readonly onClose: () => void;
}

interface DraftLine {
  readonly key: string;
  readonly item: MenuItem;
  quantity: number;
  note: string;
  isShared: boolean;
  /** `null` is the table. The default, and the one with a cost. */
  participantId: string | null;
}

export function OrderEntry(props: OrderEntryProps) {
  const { menu, tab, tableLabel, timeZoneId, online, loading, menuUnavailable, noTab } = props;
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);

  // Memoised so the item list below is not recomputed on every keystroke
  // just because `?? []` produced a new array.
  const sections = useMemo(() => menu?.sections ?? [], [menu]);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<readonly DraftLine[]>([]);
  const [sharedExplained, setSharedExplained] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);

  const activeSection = sectionId ?? sections[0]?.id ?? null;

  const items = useMemo(() => {
    if (search.trim().length > 0) {
      const needle = search.trim().toLocaleLowerCase();
      return sections.flatMap((section) =>
        section.items.filter((item) => item.name.toLocaleLowerCase().includes(needle)),
      );
    }
    return sections.find((section) => section.id === activeSection)?.items ?? [];
  }, [sections, activeSection, search]);

  // `canOrderNow` is the flag the ordering endpoints actually enforce, computed
  // by the same rule. Offering a name the server will then refuse is worse than
  // not offering it.
  const participants = (tab?.participants ?? []).filter((person) => person.canOrderNow);

  /**
   * Adding is one tap, always.
   *
   * A second tap on the same item bumps the quantity rather than adding a
   * second line — that is what a waiter means, and it keeps a round of four
   * coffees at four taps instead of four taps plus a stepper.
   */
  function add(item: MenuItem): void {
    setLines((current) => {
      const existing = current.find(
        (line) => line.item.id === item.id && line.note === '' && line.participantId === null,
      );
      if (existing) {
        return current.map((line) =>
          line.key === existing.key ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [
        ...current,
        {
          key: `${item.id}-${current.length}-${Date.now()}`,
          item,
          quantity: 1,
          note: '',
          isShared: false,
          participantId: null,
        },
      ];
    });
  }

  function update(key: string, change: Partial<DraftLine>): void {
    setLines((current) =>
      current
        .map((line) => (line.key === key ? { ...line, ...change } : line))
        .filter((line) => line.quantity > 0),
    );
  }

  const total = lines.reduce((sum, line) => sum + line.item.priceDram * line.quantity, 0);
  const anyToTable = lines.some((line) => line.participantId === null);

  return (
    <div className="staff-overlay order-entry" role="dialog" aria-label={t('order.title')}>
      <header className="staff-overlay-head">
        <div>
          <h1>{t('order.title', { label: tableLabel })}</h1>
          <p>
            {tab
              ? t('order.tabOpen', { time: format.time(tab.openedAtUtc) })
              : t('order.tabWillOpen')}
          </p>
        </div>
        <button type="button" className="button big" onClick={props.onClose}>
          {t('common:action.close')}
        </button>
      </header>

      {noTab ? (
        <div className="staff-overlay-body">
          <p className="table-warn">{t('order.noTab')}</p>
          <p className="table-note">{t('order.noTabWhy')}</p>
        </div>
      ) : menuUnavailable ? (
        <div className="staff-overlay-body">
          <p className="table-warn">{t('order.menuOffline')}</p>
        </div>
      ) : loading ? (
        <div className="staff-overlay-body">
          <p className="floor-todo">{t('floor.loading')}</p>
        </div>
      ) : (
        <div className="order-body">
          {/* Left: category strip and the grid. */}
          <div className="order-menu">
            {/* Said once, at the top, and never as a blocking state: a cached
                menu is a working menu, and a price that moved last week is a
                conversation rather than a reason to stop taking the order. */}
            {props.menuFromCache ? <p className="table-note">{t('order.menuFromCache')}</p> : null}
            <div className="order-categories" role="tablist" aria-label={t('order.categories')}>
              {sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  role="tab"
                  aria-selected={section.id === activeSection && search === ''}
                  className={`order-category ${
                    section.id === activeSection && search === '' ? 'is-active' : ''
                  }`}
                  onClick={() => {
                    setSearch('');
                    setSectionId(section.id);
                  }}
                >
                  {section.name}
                </button>
              ))}
            </div>

            {/* Available, never required. It is deliberately below the
                categories and half the width, so it is never the first thing
                a thumb lands on. */}
            <input
              className="field order-search"
              type="search"
              value={search}
              placeholder={t('order.search')}
              onChange={(event) => setSearch(event.target.value)}
            />

            <div className="order-grid">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="order-item"
                  disabled={!item.isAvailable}
                  onClick={() => add(item)}
                >
                  <span className="order-item-name">{item.name}</span>
                  <span className="order-item-price">{format.dram(item.priceDram)}</span>
                  {!item.isAvailable ? (
                    <span className="order-item-out">{t('order.unavailable')}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          {/* Right: the order being built. Always on screen. */}
          <div className="order-draft">
            <h2>{t('order.draft')}</h2>

            {lines.length === 0 ? (
              <p className="floor-todo">{t('order.empty')}</p>
            ) : (
              <ul className="order-lines">
                {lines.map((line) => (
                  <li key={line.key} className="order-line">
                    <div className="order-line-head">
                      <span className="order-line-name">{line.item.name}</span>
                      <span className="order-line-total">
                        {format.dram(line.item.priceDram * line.quantity)}
                      </span>
                    </div>

                    <div className="order-line-controls">
                      <div className="stepper" role="group" aria-label={t('order.quantity')}>
                        <button
                          type="button"
                          className="stepper-button"
                          onClick={() => update(line.key, { quantity: line.quantity - 1 })}
                          aria-label={t('table.fewer')}
                        >
                          −
                        </button>
                        <output className="stepper-value">{line.quantity}</output>
                        <button
                          type="button"
                          className="stepper-button"
                          onClick={() => update(line.key, { quantity: line.quantity + 1 })}
                          aria-label={t('table.more')}
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        className={`chip ${line.isShared ? 'is-on' : ''}`}
                        aria-pressed={line.isShared}
                        onClick={() => {
                          update(line.key, { isShared: !line.isShared });
                          setSharedExplained(true);
                        }}
                      >
                        {t('order.shared')}
                      </button>

                      <button
                        type="button"
                        className={`chip ${line.note ? 'is-on' : ''}`}
                        onClick={() => setNoteFor(noteFor === line.key ? null : line.key)}
                      >
                        {t('order.note')}
                      </button>
                    </div>

                    {/* Explained once, the first time it is used. A permanent
                        caption under every line would be noise after day one. */}
                    {line.isShared && !sharedExplained ? (
                      <p className="table-note">{t('order.sharedExplained')}</p>
                    ) : null}

                    {noteFor === line.key ? (
                      <input
                        className="field"
                        value={line.note}
                        autoFocus
                        placeholder={t('order.notePlaceholder')}
                        onChange={(event) => update(line.key, { note: event.target.value })}
                        onBlur={() => setNoteFor(null)}
                      />
                    ) : line.note ? (
                      <p className="order-line-note">{line.note}</p>
                    ) : null}

                    {/* Who ordered it. Defaults to the table, and says what
                        that costs — a waiter who leaves the default on for
                        everything quietly destroys the split-the-bill mode. */}
                    <label className="labelled small">
                      {t('order.who')}
                      <select
                        value={line.participantId ?? ''}
                        onChange={(event) =>
                          update(line.key, { participantId: event.target.value || null })
                        }
                      >
                        <option value="">{t('order.whoTable')}</option>
                        {participants.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.displayName ?? t('order.whoUnnamed')}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                ))}
              </ul>
            )}

            {anyToTable && lines.length > 0 ? (
              <p className="table-note">{t('order.tableDefaultCost')}</p>
            ) : null}

            <div className="order-total">
              <span>{t('order.total')}</span>
              <strong>{format.dram(total)}</strong>
            </div>

            {!online ? <p className="table-note">{t('order.offlineNote')}</p> : null}

            <button
              type="button"
              className="floor-button big full"
              disabled={lines.length === 0}
              onClick={() =>
                props.onSubmit(
                  lines.map((line): PlaceOrderLine => ({
                    menuItemId: line.item.id,
                    quantity: line.quantity,
                    isShared: line.isShared,
                    participantId: line.participantId,
                    ...(line.note.trim() ? { note: line.note.trim() } : {}),
                  })),
                )
              }
            >
              {t('order.send', { count: lines.reduce((sum, line) => sum + line.quantity, 0) })}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
