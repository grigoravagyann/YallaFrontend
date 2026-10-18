import {
  SHORT_NOTICE_HOURS,
  unavailableCopy,
  type PublicBranch,
  type TableAvailability,
} from '@yalla/api';
import { isOfflinePaused, PUBLIC_REFRESH_MS, useDaySlots, useSlotFloor } from '@yalla/api/react';
import { formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import RoomPhotos from './RoomPhotos';
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
 * The rooms, the three controls above them, and nothing else.
 *
 * The photos are behind an intersection observer: a visitor who reads the
 * free-table count and closes the tab — which is most of them — never
 * downloads a room photo.
 */

/**
 * True once `ref` has been near the viewport at least once.
 *
 * Sticky on purpose: it turns the photos on and never off, so scrolling back
 * up does not unmount a room somebody is using. `rootMargin` starts the fetch a
 * screen early, which on a slow connection is the difference between arriving
 * at a room and arriving at a placeholder.
 */
function useHasApproached(ref: React.RefObject<HTMLElement | null>): boolean {
  // No observer at all (an old browser): start visible rather than hide the
  // room forever. Failing open is right for content, and deciding it in the
  // initialiser rather than in an effect avoids a render that only exists to
  // undo the previous one.
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (seen) return;
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setSeen(true);
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, seen]);

  return seen;
}

/** Today, or under six hours away: the floor decides a request, not the guest before. */
function requestIsShortNotice(slotUtc: string, date: string, today: string): boolean {
  return date === today || Date.parse(slotUtc) - Date.now() < SHORT_NOTICE_HOURS * 3_600_000;
}

export interface RoomSectionProps {
  readonly branch: PublicBranch;
  readonly selection: SlotSelection;
  readonly onSelectionChange: (next: SlotSelection) => void;
  readonly slotUtc: string;
  readonly selectedTableId: string | null;
  readonly onTableTap: (availability: TableAvailability) => void;
  /** Set after a 409, cleared when another table is picked. */
  readonly takenTableLabel: string | null;
}

export function RoomSection({
  branch,
  selection,
  onSelectionChange,
  slotUtc,
  selectedTableId,
  onTableTap,
  takenTableLabel,
}: RoomSectionProps) {
  const { t } = useTranslation('public');
  const { locale } = useLocale();
  const holder = useRef<HTMLDivElement | null>(null);
  const approached = useHasApproached(holder);

  /*
   * The day's times, from the server's day of slots: every quarter hour whose
   * whole sitting fits the hours — a time that would run past closing is not
   * an option — struck when no table can be had, "on request" when only a
   * table somebody booked shortly before is left. The phone app's rules, from
   * the same read; the published hours stand in until it answers.
   */
  const daySlotsQuery = useDaySlots({
    branchId: branch.acceptsWebBookings ? branch.id : undefined,
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

  /*
   * The tables **as they will be at the chosen slot** — each with its pin on a
   * room photo — and every table's verdict for it, from one request.
   *
   * This used to be two calls, and the one that drew the room asked about
   * *now* — so a visitor picking Saturday at 20:00 was shown tonight's walk-ins
   * greyed out and 20:00's bookings drawn free, and the time control moved
   * nothing on screen at all.
   *
   * Still polled at the same cadence as the free-table count above it. A slot
   * an hour out gains and loses bookings while somebody reads the menu, and
   * this is the one surface genuinely left open on a table with nobody touching
   * it.
   */
  const slotFloorQuery = useSlotFloor({
    branchId: branch.id,
    slotUtc,
    partySize: selection.partySize,
    // The backend asks in wall-clock terms; the zone travels with the slot so
    // it is never inferred from whatever the visitor's phone is set to.
    timeZoneId: branch.timeZoneId,
    pollMs: PUBLIC_REFRESH_MS,
  });

  const today = branchToday(branch.timeZoneId);

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
   * below is rendered as a sentence *before* a table is chosen, so the late
   * refusal this bound exists to prevent does not happen either way. A guessed
   * `max` would instead forbid days the venue really does take.
   */
  const lastBookableDay =
    branch.bookingWindowDays === null ? undefined : addDays(today, branch.bookingWindowDays);

  const handleTap = (tableId: string) => {
    if (!branch.acceptsWebBookings) return;
    const availability = slotFloorQuery.data?.tables.find((entry) => entry.tableId === tableId);
    if (availability) onTableTap(availability);
  };

  /*
   * A rule that refused the whole request before any table was considered: the
   * slot has passed, it is beyond the branch's booking window, the venue is
   * shut then. Named by the server and said out loud — a room drawn with every
   * table greyed out reads as "fully booked", which is a different fact and
   * sends the visitor away instead of to the date picker.
   */
  /*
   * Only when booking is on offer. `availability` still answers for a venue with
   * web booking switched off — the room's free/taken colouring comes from it —
   * but "too soon to book this table" on a page with no booking on it is an
   * answer to a question nobody asked.
   */
  const rejection =
    branch.acceptsWebBookings && slotFloorQuery.data?.rejection
      ? unavailableCopy(slotFloorQuery.data.rejection, selection.partySize)
      : null;

  /*
   * Why each table the server will not give this party at this slot is
   * unavailable, in the reader's words: a pin free at the slot but too small,
   * kept for larger parties or in a closed hour is not drawn as free.
   */
  const unavailable: Record<string, string> = {};
  for (const entry of slotFloorQuery.data?.tables ?? []) {
    if (entry.isBookable) continue;
    const copy = unavailableCopy(
      entry.unavailableReason ?? slotFloorQuery.data?.rejection ?? null,
      selection.partySize,
    );
    unavailable[entry.tableId] = t(copy.key, { ns: 'diner', ...copy.params });
  }

  return (
    <section className="pub-section" aria-labelledby="room" ref={holder}>
      <h2 id="room">{t('section.room')}</h2>

      {branch.acceptsWebBookings ? (
        <div className="pub-slot">
          <label className="pub-field">
            <span>{t('booking.date', { ns: 'diner' })}</span>
            <input
              type="date"
              value={selection.date}
              min={today}
              max={lastBookableDay}
              onChange={(event) =>
                applySelection({ ...selection, date: event.currentTarget.value })
              }
            />
          </label>
          <label className="pub-field">
            <span>{t('booking.time', { ns: 'diner' })}</span>
            <select
              value={selection.time}
              onChange={(event) =>
                applySelection({ ...selection, time: event.currentTarget.value })
              }
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
      ) : (
        <p className="pub-notice">{t('booking.notOffered')}</p>
      )}

      {/* What the chosen time comes with: asked for, and freed by when. */}
      {branch.acceptsWebBookings && chosen?.state === 'requestable' ? (
        <p className="pub-muted">
          {t(
            requestIsShortNotice(slotUtc, selection.date, today)
              ? 'booking.approval.why'
              : 'table.requestable.earlierGuest',
            { ns: 'diner' },
          )}
        </p>
      ) : null}
      {branch.acceptsWebBookings && chosen?.mustFreeByUtc ? (
        <p className="pub-muted">
          {t('table.mustFreeBy', {
            ns: 'diner',
            time: formatTime(chosen.mustFreeByUtc, branch.timeZoneId, locale),
          })}
        </p>
      ) : null}

      {/*
        A lost table is information with a next step attached, not an error
        banner. It sits above the room because the room is where the next step
        is, and it survives until another table is picked.
      */}
      {branch.acceptsWebBookings && takenTableLabel ? (
        <p className="pub-notice pub-notice-alert" role="status">
          {t('confirm.error.tableTaken', { ns: 'diner', label: takenTableLabel })}
        </p>
      ) : null}

      {rejection ? (
        <p className="pub-notice pub-notice-alert" role="status">
          {t(rejection.key, { ns: 'diner', ...rejection.params })}
        </p>
      ) : null}

      {/* The room is what matters here; a stale answer is a line above it, not a
          screen of its own. The room is still worth seeing. */}
      {slotFloorQuery.isError || isOfflinePaused(slotFloorQuery) ? (
        <p className="pub-notice" role="status">
          {isOfflinePaused(slotFloorQuery)
            ? t('net.offline', { ns: 'diner' })
            : t('net.serverError', { ns: 'diner' })}
        </p>
      ) : null}

      {slotFloorQuery.isError && !slotFloorQuery.data ? (
        <p className="pub-muted">{t('room.empty')}</p>
      ) : !approached || !slotFloorQuery.data ? (
        <div className="pub-plan is-placeholder" aria-hidden="true" />
      ) : (
        <RoomPhotos
          rooms={branch.rooms}
          tables={slotFloorQuery.data.plan.tables}
          selectedTableId={selectedTableId}
          onTableTap={handleTap}
          bookable={branch.acceptsWebBookings}
          unavailable={unavailable}
        />
      )}
    </section>
  );
}
