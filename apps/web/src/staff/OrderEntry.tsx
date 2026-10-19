import type { Menu, MenuItem, PlaceOrderLine, StaffTab } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { OrderRefusal } from './commands/types';
import { OverlayBar } from './OverlayBar';
import { useBranchFormat } from './useBranchFormat';

/**
 * Spoken order entry (floor-tablet `Order`).
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
 * - **No page transitions.** Categories, the dishes and the order being built
 *   are on screen together (184 / 1fr / 420). A waiter who loses the list they
 *   are building loses the order.
 * - **Search exists and is never required**, and says so when it found
 *   nothing rather than showing an empty grid.
 * - **Who each line is for is one tap on the line**: the table, shared — the
 *   default — or one guest the host has let on. The whole draft goes as one
 *   order, one kitchen ticket, each line on the person who ate it.
 * - **Nothing here needs typing** except the optional per-line note.
 *
 * After a send the screen says what became of it — on its way, in the kitchen,
 * kept on the tablet while offline, or refused and why — rather than claiming
 * the kitchen has something it does not.
 */

/** What became of the last send, while its confirmation is up. */
export interface OrderSent {
  readonly count: number;
  /**
   * `saved`: queued with no connection. `sending`: on its way. `sent`: the
   * server took it. `refused`: the server said no; nothing was placed.
   */
  readonly state: 'saved' | 'sending' | 'sent' | 'refused';
  readonly refusal: OrderRefusal | null;
  /** When the waiter sent it. */
  readonly atUtc: string;
}

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
   * There is no tab on this table yet, so an order has nowhere to go.
   *
   * A guest opens one by scanning, or the waiter starts one from the table's
   * panel. Said before the waiter builds an order rather than after they try
   * to send it.
   */
  readonly noTab: boolean;
  /** Who is taking the order, for the bar. */
  readonly staffName?: string | null | undefined;
  /** How many sat down, from the floor. */
  readonly partySize?: number | null | undefined;
  readonly sent: OrderSent | null;
  readonly onSubmit: (lines: readonly PlaceOrderLine[]) => void;
  /** The confirmation is put away; `restored` when the refused draft came back. */
  readonly onSentDismiss: (how: { readonly restored: boolean }) => void;
  readonly onClose: () => void;
}

/** The table, shared, or one guest's id. */
type Who = 'table' | string;

interface DraftLine {
  readonly key: string;
  readonly item: MenuItem;
  readonly quantity: number;
  readonly note: string;
  readonly who: Who;
  /** The guest's name when it was picked, to say who went if they leave the tab. */
  readonly whoName: string | null;
}

/** How long a "sold out" word stays at the foot of the screen. */
const NOTICE_MS = 3_000;

export function OrderEntry(props: OrderEntryProps) {
  const { menu, tab, tableLabel, timeZoneId, online, loading, menuUnavailable, noTab } = props;
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  const ids = useId();

  // Memoised so the item list below is not recomputed on every keystroke
  // just because `?? []` produced a new array.
  const sections = useMemo(() => menu?.sections ?? [], [menu]);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<readonly DraftLine[]>([]);
  /** The draft as it was sent, to give back if the server refuses it. */
  const [sentDraft, setSentDraft] = useState<readonly DraftLine[]>([]);
  /**
   * Guests the server refused to name, kept off the lines until the tab is
   * read again: the tablet's copy of the tab can still list them as approved.
   */
  const [refusedGuests, setRefusedGuests] = useState<ReadonlySet<string>>(new Set());
  const [noteFor, setNoteFor] = useState<string | null>(null);
  /** Photos that did not load, by item: the tile draws the letter instead. */
  const [brokenPhotos, setBrokenPhotos] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  const activeSection = sectionId ?? sections[0]?.id ?? null;
  const query = search.trim();

  const items = useMemo(() => {
    if (query.length > 0) {
      const needle = query.toLocaleLowerCase();
      return sections.flatMap((section) =>
        section.items.filter((item) => item.name.toLocaleLowerCase().includes(needle)),
      );
    }
    return sections.find((section) => section.id === activeSection)?.items ?? [];
  }, [sections, activeSection, query]);

  // The rule the server names a guest by (`RequireNameable`): approved on this
  // tab. Not `canOrderNow`, which is the guest's own phone permission — a child
  // whose host turned their ordering off still eats their own dish. Somebody
  // still waiting for the host is not offered, and nobody is on a tab that no
  // longer takes orders.
  const participants =
    tab?.status === 'open' ? tab.participants.filter((person) => person.status === 'approved') : [];
  const guestName = (id: string): string => {
    const index = participants.findIndex((person) => person.id === id);
    const person = participants[index];
    return person?.displayName ?? t('order.whoGuest', { n: index + 1 });
  };
  /**
   * Who a line is really for now: its guest while they can still be named, the
   * table once they cannot — taken off by the host, or refused on the last send.
   */
  const whoOf = (line: DraftLine): Who =>
    line.who === 'table' ||
    (participants.some((person) => person.id === line.who) && !refusedGuests.has(line.who))
      ? line.who
      : 'table';

  function say(text: string): void {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), NOTICE_MS);
  }

  /**
   * Adding is one tap, always.
   *
   * A second tap on the same item bumps the quantity rather than adding a
   * second line — that is what a waiter means, and it keeps a round of four
   * coffees at four taps instead of four taps plus a stepper. Only a line still
   * as it was added: one already put on a guest or given a note is its own.
   */
  function add(item: MenuItem): void {
    if (!item.isAvailable) {
      say(t('order.soldOutNotice', { name: item.name }));
      return;
    }
    setLines((current) => {
      const existing = current.find(
        (line) => line.item.id === item.id && line.note === '' && whoOf(line) === 'table',
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
          who: 'table',
          whoName: null,
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

  function send(): void {
    if (lines.length === 0) return;
    props.onSubmit(
      lines.map((line): PlaceOrderLine => ({
        menuItemId: line.item.id,
        quantity: line.quantity,
        // The table's line is shared and names nobody; a guest's is theirs
        // alone. Never both: the server refuses a line that is.
        isShared: whoOf(line) === 'table',
        participantId: whoOf(line) === 'table' ? null : whoOf(line),
        ...(line.note.trim() ? { note: line.note.trim() } : {}),
      })),
    );
    setSentDraft(lines);
    setLines([]);
    setNoteFor(null);
  }

  const quantityIn = (itemId: string) =>
    lines.filter((line) => line.item.id === itemId).reduce((sum, line) => sum + line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + line.item.priceDram * line.quantity, 0);
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);

  const sub = [
    tab ? t('order.tabOpen', { time: format.time(tab.openedAtUtc) }) : t('order.noTab'),
    props.partySize ? t('order.people', { count: props.partySize }) : null,
    props.staffName ?? null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className="staff-overlay ft-order"
      role="dialog"
      aria-label={t('order.title', { label: tableLabel })}
    >
      <OverlayBar
        back={t('order.back', { label: tableLabel })}
        backName={t('order.backName', { label: tableLabel })}
        title={t('order.title', { label: tableLabel })}
        sub={sub}
        online={online}
        offlineText={t('order.offline')}
        onBack={props.onClose}
      />

      {noTab ? (
        <div className="staff-overlay-body">
          <p className="ft-note ft-note-waiting">{t('order.noTab')}</p>
          <p className="ft-hint">{t('order.noTabWhy')}</p>
        </div>
      ) : menuUnavailable ? (
        <div className="staff-overlay-body">
          <p className="ft-note ft-note-waiting">{t('order.menuOffline')}</p>
        </div>
      ) : loading ? (
        <div className="staff-overlay-body">
          <p className="floor-todo">{t('floor.loading')}</p>
        </div>
      ) : (
        <div className="ft-order-body">
          {/* --- Categories, each with how many dishes it has ---------------- */}
          <nav className="ft-cats" aria-label={t('order.categories')}>
            {sections.map((section) => {
              const on = section.id === activeSection && query === '';
              return (
                <button
                  key={section.id}
                  type="button"
                  aria-pressed={on}
                  aria-label={t('order.categoryName', {
                    name: section.name,
                    count: section.items.length,
                  })}
                  onClick={() => {
                    setSearch('');
                    setSectionId(section.id);
                  }}
                >
                  <span>{section.name}</span>
                  <span className="ft-cats-count" aria-hidden="true">
                    {section.items.length}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* --- Search and the dishes ---------------------------------------- */}
          <section className="ft-menu" aria-label={t('order.menu')}>
            <div className="ft-search">
              <label className="ft-search-field">
                <span className="visually-hidden">{t('order.searchLabel')}</span>
                <svg
                  className="ft-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="search"
                  value={search}
                  placeholder={t('order.searchPlaceholder')}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              {/* Said once, beside the search, never as a blocking state: a
                  cached menu is a working menu, and a price that moved last
                  week is a conversation rather than a reason to stop. */}
              {props.menuFromCache ? (
                <span className="ft-search-note">{t('order.menuFromCache')}</span>
              ) : null}
            </div>

            {query.length > 0 && items.length === 0 ? (
              <div className="ft-empty">
                <p>{t('order.noMatch', { query })}</p>
                <button
                  type="button"
                  className="ft-btn ft-btn-secondary"
                  onClick={() => setSearch('')}
                >
                  {t('order.clearSearch')}
                </button>
              </div>
            ) : (
              <div className="ft-dishes">
                {items.map((item) => {
                  const inDraft = quantityIn(item.id);
                  const out = !item.isAvailable;
                  const photo =
                    item.photo && !brokenPhotos.has(item.id) ? item.photo.thumbnailUrl : null;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`ft-dish ${inDraft > 0 ? 'is-in' : ''} ${out ? 'is-out' : ''}`}
                      aria-disabled={out}
                      onClick={() => add(item)}
                      // Name, price, and whether it is off or already in: what a
                      // sighted waiter reads off the tile, in that order.
                      aria-label={[
                        item.name,
                        format.dram(item.priceDram),
                        out
                          ? t('order.tileSoldOut')
                          : inDraft > 0
                            ? t('order.tileInOrder', { count: inDraft })
                            : null,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    >
                      {photo ? (
                        <img
                          src={photo}
                          alt=""
                          onError={() =>
                            setBrokenPhotos((current) => new Set(current).add(item.id))
                          }
                        />
                      ) : (
                        <span className="ft-dish-letter" aria-hidden="true">
                          {item.name.charAt(0)}
                        </span>
                      )}
                      <span className="ft-dish-text">
                        <b>{item.name}</b>
                        <span>{format.dram(item.priceDram)}</span>
                      </span>
                      {inDraft > 0 ? (
                        <span className="ft-dish-count" aria-hidden="true">
                          {inDraft}
                        </span>
                      ) : null}
                      {out ? <span className="ft-dish-out">{t('order.soldOut')}</span> : null}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* --- The order being built. Always on screen. --------------------- */}
          <aside className="ft-draft" aria-labelledby={`${ids}-draft`}>
            <div className="ft-draft-head">
              <h2 id={`${ids}-draft`}>{t('order.draft')}</h2>
              <span>{count > 0 ? t('order.dishes', { count }) : t('order.draftEmpty')}</span>
            </div>

            <div className="ft-draft-lines">
              {lines.length === 0 ? (
                <p className="ft-empty">{t('order.emptyDraft')}</p>
              ) : (
                <ul>
                  {lines.map((line) => {
                    const editing = noteFor === line.key;
                    return (
                      <li key={line.key} className={editing ? 'is-editing' : undefined}>
                        <div className="ft-draft-line">
                          <b>{line.item.name}</b>
                          <div
                            className="ft-stepper"
                            role="group"
                            aria-label={`${line.item.name}, ${line.quantity}`}
                          >
                            <button
                              type="button"
                              aria-label={t('order.less', { name: line.item.name })}
                              onClick={() => update(line.key, { quantity: line.quantity - 1 })}
                            >
                              −
                            </button>
                            <span>{line.quantity}</span>
                            <button
                              type="button"
                              aria-label={t('order.more', { name: line.item.name })}
                              onClick={() => update(line.key, { quantity: line.quantity + 1 })}
                            >
                              +
                            </button>
                          </div>
                          <span className="ft-draft-total">
                            {format.dram(line.item.priceDram * line.quantity)}
                          </span>
                        </div>

                        <div className="ft-draft-meta">
                          {tab?.status === 'open' ? (
                            <div className="ft-order-who" role="group" aria-label={t('order.who')}>
                              {(['table', ...participants.map((person) => person.id)] as const).map(
                                (who) => (
                                  <button
                                    key={who}
                                    type="button"
                                    aria-pressed={whoOf(line) === who}
                                    onClick={() =>
                                      update(line.key, {
                                        who,
                                        whoName: who === 'table' ? null : guestName(who),
                                      })
                                    }
                                  >
                                    {who === 'table' ? t('order.whoTable') : guestName(who)}
                                  </button>
                                ),
                              )}
                            </div>
                          ) : null}
                          <button
                            type="button"
                            className={`ft-note-pill ${line.note ? 'has-note' : ''}`}
                            aria-expanded={editing}
                            onClick={() => setNoteFor(editing ? null : line.key)}
                          >
                            {line.note || t('order.note')}
                          </button>
                        </div>

                        {whoOf(line) !== line.who ? (
                          // Said on the line, so the waiter sees which one moved.
                          <p className="ft-line-flag">
                            {t('order.guestGone', {
                              name: line.whoName ?? t('order.whoUnnamed'),
                            })}
                          </p>
                        ) : null}

                        {editing ? (
                          <div className="ft-note-edit">
                            <input
                              className="ft-field"
                              aria-label={t('order.noteLabel')}
                              value={line.note}
                              autoFocus
                              placeholder={t('order.notePlaceholder')}
                              onChange={(event) => update(line.key, { note: event.target.value })}
                            />
                            <button
                              type="button"
                              className="ft-btn ft-btn-secondary"
                              onClick={() => setNoteFor(null)}
                            >
                              {t('order.noteDone')}
                            </button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="ft-draft-foot">
              <p className="ft-hint">{t('order.whoExplained')}</p>
              <div className="ft-draft-sum">
                <span>{t('order.total')}</span>
                <span>{format.dram(total)}</span>
              </div>
              <button
                type="button"
                className="ft-btn ft-btn-primary ft-btn-big"
                aria-disabled={count === 0}
                onClick={send}
              >
                {count > 0 ? t('order.send', { count }) : t('order.sendNothing')}
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* The foot-of-screen word: a dish that cannot be added. */}
      <p className={notice ? 'floor-notice ft-order-notice' : 'visually-hidden'} role="status">
        {notice}
      </p>

      {props.sent ? (
        <SentCard
          sent={props.sent}
          guestName={(id) =>
            sentDraft.find((line) => line.who === id)?.whoName ??
            tab?.participants.find((person) => person.id === id)?.displayName ??
            t('order.whoUnnamed')
          }
          tableLabel={tableLabel}
          time={format.time(props.sent.atUtc)}
          onMore={() => props.onSentDismiss({ restored: false })}
          onBack={() => {
            const refusal = props.sent?.refusal;
            if (refusal?.kind === 'guestUnavailable' && refusal.participantId) {
              const refused = refusal.participantId;
              setRefusedGuests((current) => new Set(current).add(refused));
            }
            setLines(sentDraft);
            props.onSentDismiss({ restored: true });
          }}
          onFloor={props.onClose}
        />
      ) : null}
    </div>
  );
}

function SentCard(props: {
  readonly sent: OrderSent;
  /** The name of a guest the refusal named, as the draft knew them. */
  readonly guestName: (participantId: string) => string;
  readonly tableLabel: string;
  readonly time: string;
  readonly onMore: () => void;
  readonly onBack: () => void;
  readonly onFloor: () => void;
}) {
  const { t } = useTranslation('staff');
  const headingId = useId();
  const first = useRef<HTMLButtonElement>(null);
  const { sent } = props;
  const refused = sent.state === 'refused';

  useEffect(() => {
    first.current?.focus();
  }, []);

  const title = refused
    ? t('order.refusedTitle')
    : sent.state === 'sent'
      ? t('order.sentTitle', { count: sent.count })
      : sent.state === 'sending'
        ? t('order.sendingTitle', { count: sent.count })
        : t('order.savedTitle', { count: sent.count });
  const refusal = sent.refusal;
  const body = refused
    ? refusal?.kind === 'soldOut'
      ? t('order.refused.soldOut', { name: refusal.itemName })
      : refusal?.kind === 'guestUnavailable' && refusal.participantId && refusal.guestState
        ? t(`order.refused.guest.${refusal.guestState}`, {
            name: props.guestName(refusal.participantId),
          })
        : refusal?.kind === 'notAccepting' && refusal.tabStatus
          ? t(`order.refused.tab.${refusal.tabStatus}`)
          : t(`order.refused.${refusal?.kind ?? 'other'}`)
    : sent.state === 'sent'
      ? t('order.sentBody', { label: props.tableLabel, time: props.time })
      : sent.state === 'sending'
        ? t('order.sendingBody')
        : t('order.savedBody');

  return (
    <div className="ft-scrim">
      <div
        className="ft-done"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        data-state={sent.state}
      >
        <span className="ft-done-mark" aria-hidden="true">
          {refused ? '!' : '✓'}
        </span>
        <h2 id={headingId} aria-live="polite">
          {title}
        </h2>
        <p>{body}</p>
        <div className="ft-done-actions">
          {refused ? (
            <button
              ref={first}
              type="button"
              className="ft-btn ft-btn-secondary"
              onClick={props.onBack}
            >
              {t('order.backToOrder')}
            </button>
          ) : (
            <button
              ref={first}
              type="button"
              className="ft-btn ft-btn-secondary"
              onClick={props.onMore}
            >
              {t('order.addMore')}
            </button>
          )}
          <button type="button" className="ft-btn ft-btn-primary" onClick={props.onFloor}>
            {t('order.toFloor')}
          </button>
        </div>
      </div>
    </div>
  );
}
