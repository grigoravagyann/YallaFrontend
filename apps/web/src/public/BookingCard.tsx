import { isShortNotice, type PublicBranch } from '@yalla/api';
import { useDaySlots, useNow } from '@yalla/api/react';
import { formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useEffect, useMemo } from 'react';
import { formatPhone } from './phone';
import {
  PARTY_SIZES,
  addDays,
  branchToday,
  nearestChoice,
  slotProblem,
  timeChoices,
  type SlotSelection,
} from './slots';

/**
 * The booking card: the day, the time and the party, in the booking column.
 *
 * The column is the page's second slot (public-page HANDOFF §6.1): sticky on
 * the right from 960px, between the header and the room on a phone. This card
 * is still the page's own three controls — the redesigned card with day chips,
 * a stepper and time chips is the next phase — moved here out of the room so
 * the column has its content and the room keeps only the room.
 *
 * When the venue takes no web bookings the card says so in the same place, and
 * offers its phone.
 */
export interface BookingCardProps {
  readonly branch: PublicBranch;
  readonly selection: SlotSelection;
  readonly onSelectionChange: (next: SlotSelection) => void;
  /** The chosen slot as an instant, for the short-notice line. */
  readonly slotUtc: string;
  /** The id of the card's heading, which names the column around it. */
  readonly headingId: string;
}

export function BookingCard(props: BookingCardProps) {
  return props.branch.acceptsWebBookings ? (
    <SlotControls {...props} />
  ) : (
    <BookingOff branch={props.branch} headingId={props.headingId} />
  );
}

function BookingOff({
  branch,
  headingId,
}: {
  readonly branch: PublicBranch;
  readonly headingId: string;
}) {
  const { t } = useTranslation('public');
  return (
    <div className="pub-card">
      <h2 id={headingId}>{t('booking.offTitle')}</h2>
      <p className="pub-card-text">{t('booking.notOffered')}</p>
      {branch.phoneE164 ? (
        <a className="pub-button pub-button-primary" href={`tel:${branch.phoneE164}`}>
          {t('page.call', { phone: formatPhone(branch.phoneE164) })}
        </a>
      ) : null}
    </div>
  );
}

function SlotControls({
  branch,
  selection,
  onSelectionChange,
  slotUtc,
  headingId,
}: BookingCardProps) {
  const { t } = useTranslation('public');
  const { locale } = useLocale();

  /*
   * The day's times, from the server's day of slots: every quarter hour whose
   * whole sitting fits the hours — a time that would run past closing is not
   * an option — struck when no table can be had, "on request" when only a
   * table somebody booked shortly before is left. The phone app's rules, from
   * the same read; the published hours stand in until it answers.
   */
  const daySlotsQuery = useDaySlots({
    branchId: branch.id,
    date: selection.date,
    partySize: selection.partySize,
  });
  const dayAnswer = daySlotsQuery.isError ? undefined : daySlotsQuery.data;
  const choices = useMemo(
    () =>
      timeChoices({
        date: selection.date,
        day: dayAnswer,
        weeklyHours: branch.weeklyHours,
        turnTimeMinutes: branch.policy.turnTimeMinutes,
        timeZoneId: branch.timeZoneId,
      }),
    [
      selection.date,
      dayAnswer,
      branch.weeklyHours,
      branch.policy.turnTimeMinutes,
      branch.timeZoneId,
    ],
  );
  const chosen = choices.find((choice) => choice.time === selection.time) ?? null;

  /*
   * Never left on a time that cannot be had: once the day has answered, a
   * struck or absent selection moves to the nearest time that can.
   */
  useEffect(() => {
    if (!dayAnswer || dayAnswer.date !== selection.date) return;
    if (chosen && chosen.state !== 'busy') return;
    const next = nearestChoice(choices, selection.time);
    if (next && next.time !== selection.time) onSelectionChange({ ...selection, time: next.time });
  }, [dayAnswer, chosen, choices, selection, onSelectionChange]);

  const today = branchToday(branch.timeZoneId);
  // Short notice is the server's rule, by the instant: today, or under six hours.
  const now = useNow();

  /**
   * Apply a change to one control, refusing to store an unusable selection.
   *
   * A `type="date"` input is **empty** between a clear and the next keystroke,
   * and stays empty for as long as somebody leaves it that way. That used to
   * reach `slotInstant`, throw inside `Intl` during render, and white-screen
   * the page — on the one surface in the product that is opened by strangers
   * from a link, who have no reason to try again.
   *
   * So the control falls back rather than clearing: an empty date is not a
   * state a diner ever *means* to be in, and the nearest thing they do mean is
   * today. The room stays on screen throughout, which is the actual
   * requirement — a diner mid-edit has not asked to stop seeing the room.
   */
  const applySelection = (next: SlotSelection) => {
    const problem = slotProblem(next);
    if (problem === null) {
      onSelectionChange(next);
      return;
    }

    onSelectionChange({
      ...next,
      // Only the broken half is replaced; the other keeps whatever was picked.
      ...(problem === 'date' ? { date: today } : { time: selection.time }),
    });
  };
  /*
   * The venue's own horizon, so the platform's date picker cannot offer a day
   * the server will refuse once a table has already been chosen.
   *
   * Undefined when the branch does not publish a window — the public API serves
   * it only to authenticated console callers. An unbounded picker is the right
   * degradation rather than a guessed horizon: `availability` answers every slot
   * with `OutsideBookingWindow` when it is beyond the window, and the rejection
   * above the room is rendered as a sentence *before* a table is chosen, so the
   * late refusal this bound exists to prevent does not happen either way. A
   * guessed `max` would instead forbid days the venue really does take.
   */
  const lastBookableDay =
    branch.bookingWindowDays === null ? undefined : addDays(today, branch.bookingWindowDays);

  return (
    <div className="pub-card">
      <h2 id={headingId}>{t('booking.pick')}</h2>
      <div className="pub-slot">
        <label className="pub-field">
          <span>{t('booking.date', { ns: 'diner' })}</span>
          <input
            type="date"
            value={selection.date}
            min={today}
            max={lastBookableDay}
            onChange={(event) => applySelection({ ...selection, date: event.currentTarget.value })}
          />
        </label>
        <label className="pub-field">
          <span>{t('booking.time', { ns: 'diner' })}</span>
          <select
            value={selection.time}
            onChange={(event) => applySelection({ ...selection, time: event.currentTarget.value })}
          >
            {/* Quarter-hourly rather than a free-form time input: the backend
                reasons in slots, and a 20:07 request is one nobody can fill.
                A struck time is drawn and named, never chosen. */}
            {chosen === null ? <option value={selection.time}>{selection.time}</option> : null}
            {choices.map((choice) => (
              <option key={choice.time} value={choice.time} disabled={choice.state === 'busy'}>
                {choice.state === 'busy'
                  ? t('book.slotFull', { ns: 'diner', time: choice.time })
                  : choice.state === 'requestable'
                    ? t('booking.timeOnRequest', { time: choice.time })
                    : choice.time}
              </option>
            ))}
          </select>
        </label>
        <label className="pub-field">
          <span>{t('booking.partySize', { ns: 'diner' })}</span>
          <select
            value={selection.partySize}
            onChange={(event) => {
              // `Number('')` is `NaN`, which would reach the availability
              // query as a party size and come back as a refusal nobody
              // asked for. The list is fixed, so anything off it is a bug
              // rather than a choice.
              const partySize = Number(event.currentTarget.value);
              applySelection({
                ...selection,
                partySize: PARTY_SIZES.includes(partySize) ? partySize : selection.partySize,
              });
            }}
          >
            {PARTY_SIZES.map((size) => (
              <option key={size} value={size}>
                {t('booking.guests', { ns: 'diner', count: size })}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* What the chosen time comes with: asked for, and freed by when. */}
      {chosen?.state === 'requestable' ? (
        <p className="pub-muted">
          {t(
            isShortNotice({ startUtc: slotUtc, timeZoneId: branch.timeZoneId, now })
              ? 'booking.approval.why'
              : 'table.requestable.earlierGuest',
            { ns: 'diner' },
          )}
        </p>
      ) : null}
      {chosen?.mustFreeByUtc ? (
        <p className="pub-muted">
          {t('table.mustFreeBy', {
            ns: 'diner',
            time: formatTime(chosen.mustFreeByUtc, branch.timeZoneId, locale),
          })}
        </p>
      ) : null}
    </div>
  );
}
