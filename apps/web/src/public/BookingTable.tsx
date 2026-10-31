import type { PublicBranch, TableAvailability } from '@yalla/api';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useEffect, useRef } from 'react';
import { dayWords, freeCancellationWords } from './dayNames';
import type { SlotSelection } from './slots';

/** The table the visitor has chosen in the room, as the card names it. */
export interface ChosenTable {
  readonly label: string;
  /** `null` while the room's answer does not carry the table. */
  readonly seats: number | null;
  readonly roomName: string | null;
  /**
   * The server's answer for it at the slot on screen; `null` while that answer
   * is on its way, when the table is shown but cannot be booked yet.
   */
  readonly availability: TableAvailability | null;
}

/** The table part of the card: which table, Book it, or Choose for me. */
export function TablePart({
  branch,
  selection,
  today,
  table,
  onBook,
  onPickForMe,
  roomReady,
  note,
  takenTableLabel,
  panelOpen,
}: {
  readonly branch: PublicBranch;
  readonly selection: SlotSelection;
  readonly today: string;
  readonly table: ChosenTable | null;
  readonly onBook: () => void;
  readonly onPickForMe: (() => void) | undefined;
  readonly roomReady: boolean;
  readonly note: string | null;
  readonly takenTableLabel: string | null;
  readonly panelOpen: boolean;
}) {
  const { t } = useTranslation('public');
  const { locale } = useLocale();

  // The server's deadline in our own words for the date: `Intl` writes hy
  // dates in English where the browser has no Armenian data (phase 4).
  const until = table?.availability?.isBookable
    ? table.availability.freeCancellationUntilUtc
    : null;
  const freeCancellation = until
    ? freeCancellationWords(until, branch.timeZoneId, locale, t)
    : null;

  return (
    <div className="pub-pick">
      {takenTableLabel ? <TakenNotice label={takenTableLabel} /> : null}
      <ChosenTableLine table={table} selection={selection} today={today} />
      {table ? (
        <button
          type="button"
          className="pub-button pub-button-primary"
          hidden={panelOpen}
          // Until the room has answered for this slot the table is shown and
          // not yet bookable: the panel needs that answer's window.
          disabled={!table.availability}
          onClick={onBook}
        >
          {t('booking.table.book', { label: table.label })}
        </button>
      ) : onPickForMe ? (
        // Pressable while the room loads, to say why it cannot act yet (review S9).
        <button
          type="button"
          className="pub-button pub-pick-me"
          aria-disabled={!roomReady || undefined}
          onClick={onPickForMe}
        >
          {t('booking.table.forMe')}
        </button>
      ) : null}
      {freeCancellation ? <p className="pub-muted">{freeCancellation}</p> : null}
      {/* Always mounted, so what "Choose for me" did is heard when it happens;
          read but not shown once the badge above says the same (QA 3). */}
      <p className={table ? 'pub-pick-note visually-hidden' : 'pub-pick-note'} role="status">
        {note}
      </p>
    </div>
  );
}

/**
 * The chosen table with its badge, room, seats and slot — or the line saying
 * none is chosen yet. The card and the phone's booking bar both show it.
 */
export function ChosenTableLine({
  table,
  selection,
  today,
}: {
  readonly table: ChosenTable | null;
  readonly selection: SlotSelection;
  readonly today: string;
}) {
  const { t } = useTranslation('public');
  const day = dayWords(selection.date, today, t);
  const guests = t('booking.guests', { ns: 'diner', count: selection.partySize });
  return (
    <div className="pub-pick-what">
      <span className={`pub-pick-badge${table ? ' is-on' : ''}`} aria-hidden="true">
        {table ? table.label : '?'}
      </span>
      <div>
        <b>
          {table
            ? table.roomName
              ? t('booking.table.table', { label: table.label, room: table.roomName })
              : t('booking.table.tableOnly', { label: table.label })
            : t('booking.table.none')}
        </b>
        <span>
          {table
            ? table.seats === null
              ? t('booking.table.summaryNoSeats', { date: day.short, time: selection.time, guests })
              : t('booking.table.summary', {
                  seats: t('booking.seats', { count: table.seats }),
                  date: day.short,
                  time: selection.time,
                  guests,
                })
            : t('booking.table.prompt')}
        </span>
      </div>
    </div>
  );
}

/**
 * "Table 4 was just taken", where the visitor was when it happened: red (a real
 * failure, HANDOFF §3) and focused — the panel it replaces held the focus, and
 * without this it fell to the page's body. Not an alert as well: a focused
 * alert is read twice (review S8).
 */
export function TakenNotice({ label }: { readonly label: string }) {
  const { t } = useTranslation('public');
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [label]);
  return (
    <p className="pub-notice pub-notice-error" tabIndex={-1} ref={ref}>
      {t('confirm.error.tableTaken', { ns: 'diner', label })}
    </p>
  );
}

/**
 * The booking part of the card at a branch that books by time only
 * (2026-10-29): no table to choose — the venue chooses it when the party
 * arrives — so the time and the party are the booking. How many more guests
 * the chosen time takes, when the server says, and Book.
 */
export function TimePart({
  branch,
  selection,
  slotUtc,
  today,
  guestsLeft,
  canBook,
  panelOpen,
  onBook,
}: {
  readonly branch: PublicBranch;
  readonly selection: SlotSelection;
  /** The chosen slot as an instant, for the free-cancellation line. */
  readonly slotUtc: string;
  readonly today: string;
  /** How many more guests the chosen time takes; `null` while unknown. */
  readonly guestsLeft: number | null;
  /** The chosen time takes this party, as the server's day says. */
  readonly canBook: boolean;
  readonly panelOpen: boolean;
  readonly onBook: () => void;
}) {
  const { t } = useTranslation('public');
  const { locale } = useLocale();
  const day = dayWords(selection.date, today, t);
  const guests = t('booking.guests', { ns: 'diner', count: selection.partySize });
  // The published deadline before the start: there is no table's answer to carry one.
  const until = new Date(
    Date.parse(slotUtc) - branch.policy.cancellationDeadlineMinutes * 60_000,
  ).toISOString();

  return (
    <div className="pub-pick">
      <div className="pub-pick-what">
        <span className="pub-pick-badge is-on" aria-hidden="true">
          {selection.partySize}
        </span>
        <div>
          <b>{t('booking.time.what', { date: day.short, time: selection.time, guests })}</b>
          <span>{t('booking.time.onArrival')}</span>
        </div>
      </div>
      {canBook && guestsLeft !== null ? (
        <p className="pub-muted">{t('booking.time.placesLeft', { count: guestsLeft })}</p>
      ) : null}
      <button
        type="button"
        className="pub-button pub-button-primary"
        hidden={panelOpen}
        disabled={!canBook}
        onClick={onBook}
      >
        {t('booking.time.book', { time: selection.time })}
      </button>
      {canBook ? (
        <p className="pub-muted">{freeCancellationWords(until, branch.timeZoneId, locale, t)}</p>
      ) : null}
    </div>
  );
}
