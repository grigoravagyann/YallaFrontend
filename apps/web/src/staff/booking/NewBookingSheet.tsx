import {
  STAFF_BOOKING_MAX_PARTY,
  newCommandId,
  type StaffBooking,
  type StaffDaySlot,
  type StaffDaySlotTable,
} from '@yalla/api';
import { useCreateStaffBooking, useStaffDaySlots } from '@yalla/api/react';
import { branchDayKey, formatPhone, instantFromZonedClock, type TimeZone } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { OverlayBar } from '../OverlayBar';
import { useBranchFormat } from '../useBranchFormat';
import {
  addDays,
  newBookingFailure,
  newBookingFailureText,
  normalisePhone,
  type NewBookingFailure,
} from './bookingFailure';

/**
 * A booking taken by hand (2026-10-31, "Ձեռքով ամրագրում"): the sheet over
 * the floor where a waiter, a manager or the owner enters a booking a guest
 * phoned in or asked for at the door.
 *
 * Name, number, how many, which day, which time, which table (or none, where
 * the branch books by time only), a note — then "Book". The times come from
 * the floor's own read with the staff rules: every in-service table, no lead
 * time, no visibility gate. Confirmed at once, linked to whoever is signed
 * in, who is reminded thirty minutes before to call the guest.
 *
 * Online only and never queued: a booking the server has not confirmed is
 * one a second waiter may give the same table to.
 */

/** How many day chips the sheet shows before "Other day…". */
const DAY_CHIPS = 7;
/** How far ahead the date input reaches; the server's window is the last word. */
const WINDOW_DAYS = 60;

export interface NewBookingSheetProps {
  readonly branchId: string;
  readonly timeZoneId: string;
  readonly online: boolean;
  /** Who is signed in: "Taken by …" on the success card, until the server names them. */
  readonly me: string;
  /** Opened from a free table's panel: that table, chosen already. */
  readonly preselectedTableId?: string | null | undefined;
  readonly preselectedTableLabel?: string | null | undefined;
  /** The tablet's full-screen overlay, or the phone's. */
  readonly variant: 'tablet' | 'phone';
  readonly onClose: () => void;
}

type Outcome =
  { readonly kind: 'form' } | { readonly kind: 'done'; readonly booking: StaffBooking };

export function NewBookingSheet(props: NewBookingSheetProps) {
  const { branchId, timeZoneId, online, onClose } = props;
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  const zone = timeZoneId as TimeZone;
  const ids = {
    name: useId(),
    phone: useId(),
    party: useId(),
    day: useId(),
    time: useId(),
    table: useId(),
    note: useId(),
    error: useId(),
  };

  const today = branchDayKey(new Date(), zone);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState(today);
  const [otherDay, setOtherDay] = useState(false);
  const [time, setTime] = useState<string | null>(null);
  const [tableId, setTableId] = useState<string | null>(props.preselectedTableId ?? null);
  const [note, setNote] = useState('');
  const [missing, setMissing] = useState<'name' | 'phone' | 'time' | 'table' | null>(null);
  const [failure, setFailure] = useState<NewBookingFailure | null>(null);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'form' });
  /** One command per attempt, kept across retries of the same form. */
  const commandId = useRef(newCommandId());

  const create = useCreateStaffBooking(branchId);
  const slotsQuery = useStaffDaySlots({ branchId, date, partySize }, outcome.kind === 'form');
  const day = slotsQuery.data ?? null;
  const timeOnly = day?.bookingMode === 'timeOnly';

  // Into the sheet when it opens: its first field, not the floor behind it.
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameRef.current?.focus({ preventScroll: true });
  }, []);

  /** The times on offer: a time already gone today is left out, as the public page leaves it out. */
  const choices = useMemo(
    () => (day?.slots ?? []).filter((slot) => slot.unavailableReason !== 'pastLeadTime'),
    [day],
  );
  const chosenSlot: StaffDaySlot | null = choices.find((slot) => slot.time === time) ?? null;
  /** The tables for the chosen time: the closest fit first, then by label. */
  const tables: readonly StaffDaySlotTable[] = useMemo(
    () =>
      [...(chosenSlot?.tables ?? [])].sort(
        (a, b) => a.seats - b.seats || a.label.localeCompare(b.label, undefined, { numeric: true }),
      ),
    [chosenSlot],
  );
  const chosenTable = tables.find((table) => table.tableId === tableId) ?? null;

  const dayChips = Array.from({ length: DAY_CHIPS }, (_, index) => addDays(today, index));
  const onChip = dayChips.includes(date);
  const lastDay = addDays(today, WINDOW_DAYS);

  function dayLabel(key: string): string {
    if (key === today) return t('newBooking.today');
    if (key === addDays(today, 1)) return t('newBooking.tomorrow');
    const [year, month, dayOfMonth] = key.split('-').map(Number) as [number, number, number];
    return format.dayAndTime(
      instantFromZonedClock({ year, month, day: dayOfMonth, hour: 12, minute: 0 }, zone),
    ).date;
  }

  function pickDay(next: string) {
    setDate(next);
    setTime(null);
    setFailure(null);
  }

  function pickTime(slot: StaffDaySlot) {
    if (!slot.isAvailable) return;
    setTime(slot.time);
    setFailure(null);
    setMissing((current) => (current === 'time' ? null : current));
    // A table chosen before that is not free at this time is let go of.
    if (tableId && !slot.tables.some((table) => table.tableId === tableId)) setTableId(null);
  }

  function submit() {
    if (!online || create.isPending) return;
    const name = guestName.trim();
    const phone = normalisePhone(guestPhone);
    if (!name) return setMissing('name');
    if (!phone) return setMissing('phone');
    if (!time || !chosenSlot?.isAvailable) return setMissing('time');
    if (!timeOnly && !chosenTable) return setMissing('table');
    setMissing(null);
    setFailure(null);
    create.mutate(
      {
        branchId,
        guestName: name,
        guestPhone: phone,
        partySize,
        date,
        time,
        tableId: timeOnly ? null : chosenTable!.tableId,
        note: note.trim() || null,
        clientCommandId: commandId.current,
      },
      {
        onSuccess: (booking) => setOutcome({ kind: 'done', booking }),
        onError: (error) => {
          const why = newBookingFailure(error);
          setFailure(why);
          // A fresh id for a changed attempt: the server keeps the refused one spent.
          if (why.kind !== 'offline' && why.kind !== 'busy') commandId.current = newCommandId();
          if (why.kind === 'tableTaken' || why.kind === 'tableOccupied') setTableId(null);
          void slotsQuery.refetch();
        },
      },
    );
  }

  function another() {
    setGuestName('');
    setGuestPhone('');
    setPartySize(2);
    setDate(today);
    setOtherDay(false);
    setTime(null);
    setTableId(null);
    setNote('');
    setMissing(null);
    setFailure(null);
    commandId.current = newCommandId();
    setOutcome({ kind: 'form' });
  }

  const title = props.preselectedTableLabel
    ? t('newBooking.titleTable', { label: props.preselectedTableLabel })
    : t('newBooking.title');
  const seatsOf = (table: StaffDaySlotTable) => t('table.seats', { count: table.seats });
  const problem =
    missing !== null
      ? t(`newBooking.missing.${missing}`)
      : failure !== null
        ? newBookingFailureText(t, failure)
        : null;

  return (
    <div
      className={`staff-overlay ft-book nb-${props.variant}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        onClose();
      }}
    >
      <OverlayBar
        back={t('newBooking.back')}
        backName={t('newBooking.backName')}
        title={title}
        sub={outcome.kind === 'form' ? t('newBooking.sub') : ''}
        online={online}
        offlineText={t('newBooking.offline')}
        onBack={onClose}
      />

      {outcome.kind === 'done' ? (
        <Done
          booking={outcome.booking}
          me={props.me}
          dayLabel={dayLabel}
          time={format.time}
          onAnother={another}
          onClose={onClose}
        />
      ) : (
        <form
          className="staff-overlay-body nb-body"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="nb-col nb-who">
            <label className="nb-field" htmlFor={ids.name}>
              <span className="ft-field-label">{t('newBooking.guestName')}</span>
              <input
                ref={nameRef}
                id={ids.name}
                className={`ft-field${missing === 'name' ? ' is-bad' : ''}`}
                type="text"
                autoComplete="off"
                maxLength={200}
                value={guestName}
                onChange={(event) => {
                  setGuestName(event.currentTarget.value);
                  if (missing === 'name') setMissing(null);
                }}
              />
            </label>
            <div className="nb-field">
              <label className="nb-field" htmlFor={ids.phone}>
                <span className="ft-field-label">{t('newBooking.guestPhone')}</span>
                <input
                  id={ids.phone}
                  className={`ft-field${missing === 'phone' ? ' is-bad' : ''}`}
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  maxLength={32}
                  aria-describedby={`${ids.phone}-hint`}
                  value={guestPhone}
                  onChange={(event) => {
                    setGuestPhone(event.currentTarget.value);
                    if (missing === 'phone') setMissing(null);
                  }}
                  onBlur={() => {
                    const e164 = normalisePhone(guestPhone);
                    if (e164) setGuestPhone(formatPhone(e164));
                  }}
                />
              </label>
              <span className="ft-hint" id={`${ids.phone}-hint`}>
                {t('newBooking.phoneHint')}
              </span>
            </div>

            <div className="nb-field">
              <span className="ft-field-label" id={ids.party}>
                {t('newBooking.party')}
              </span>
              <div className="tp-stepper nb-stepper" role="group" aria-labelledby={ids.party}>
                <button
                  type="button"
                  aria-label={t('newBooking.fewer')}
                  disabled={partySize <= 1}
                  onClick={() => setPartySize((size) => Math.max(1, size - 1))}
                >
                  −
                </button>
                <output aria-live="polite">{partySize}</output>
                <button
                  type="button"
                  aria-label={t('newBooking.more')}
                  disabled={partySize >= STAFF_BOOKING_MAX_PARTY}
                  onClick={() =>
                    setPartySize((size) => Math.min(STAFF_BOOKING_MAX_PARTY, size + 1))
                  }
                >
                  +
                </button>
              </div>
            </div>

            <label className="nb-field" htmlFor={ids.note}>
              <span className="ft-field-label">{t('newBooking.note')}</span>
              <input
                id={ids.note}
                className="ft-field"
                type="text"
                autoComplete="off"
                maxLength={500}
                placeholder={t('newBooking.noteHint')}
                value={note}
                onChange={(event) => setNote(event.currentTarget.value)}
              />
            </label>
          </div>

          <div className="nb-col nb-when">
            <div className="nb-field">
              <span className="ft-field-label" id={ids.day}>
                {t('newBooking.day')}
              </span>
              <div className="nb-chips" role="group" aria-labelledby={ids.day}>
                {dayChips.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="nb-chip"
                    aria-pressed={key === date}
                    onClick={() => {
                      setOtherDay(false);
                      pickDay(key);
                    }}
                  >
                    {dayLabel(key)}
                  </button>
                ))}
                <button
                  type="button"
                  className="nb-chip"
                  aria-pressed={!onChip}
                  aria-expanded={otherDay || !onChip}
                  onClick={() => setOtherDay((open) => !open)}
                >
                  {onChip ? t('newBooking.otherDay') : dayLabel(date)}
                </button>
              </div>
              {otherDay || !onChip ? (
                <label className="nb-field nb-other-day">
                  <span className="ft-hint">{t('newBooking.otherDate')}</span>
                  <input
                    className="ft-field"
                    type="date"
                    value={date}
                    min={today}
                    max={lastDay}
                    onChange={(event) => {
                      if (event.currentTarget.value) pickDay(event.currentTarget.value);
                    }}
                  />
                </label>
              ) : null}
            </div>

            <div className="nb-field">
              <span className="ft-field-label" id={ids.time}>
                {t('newBooking.time')}
              </span>
              {slotsQuery.isError && !day ? (
                <p className="ft-error" role="alert">
                  {t('newBooking.timesFailed')}
                </p>
              ) : !day ? (
                <p className="ft-hint" role="status">
                  {t('newBooking.timesLoading')}
                </p>
              ) : day.unavailableReason !== null ? (
                <p className="ft-hint">
                  {day.unavailableReason === 'closed'
                    ? t('newBooking.dayClosed')
                    : t('newBooking.noTimes')}
                </p>
              ) : choices.length === 0 ? (
                <p className="ft-hint">{t('newBooking.noTimes')}</p>
              ) : (
                <div
                  className="nb-chips nb-times"
                  role="group"
                  aria-labelledby={ids.time}
                  aria-busy={slotsQuery.isFetching || undefined}
                >
                  {choices.map((slot) => (
                    <button
                      key={slot.time}
                      type="button"
                      className={`nb-chip nb-time${slot.isAvailable ? '' : ' is-full'}`}
                      aria-pressed={slot.time === time}
                      aria-disabled={slot.isAvailable ? undefined : true}
                      aria-label={
                        slot.isAvailable
                          ? undefined
                          : t('newBooking.timeFullLabel', { time: slot.time })
                      }
                      onClick={() => pickTime(slot)}
                    >
                      {slot.time}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {timeOnly ? (
              <div className="nb-field">
                <p className="ft-hint">{t('newBooking.noTable')}</p>
                {chosenSlot ? (
                  <p className="nb-left" role="status">
                    {t('newBooking.guestsLeft', { count: chosenSlot.guestsLeft ?? 0 })}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="nb-field">
                <span className="ft-field-label" id={ids.table}>
                  {t('newBooking.table')}
                </span>
                {!chosenSlot ? (
                  <p className="ft-hint">{t('newBooking.pickTime')}</p>
                ) : tables.length === 0 ? (
                  <p className="ft-hint">{t('newBooking.noTables')}</p>
                ) : (
                  <>
                    <p className="ft-hint">{t('newBooking.tableHint', { count: partySize })}</p>
                    <ul className="wt-tables nb-tables" role="group" aria-labelledby={ids.table}>
                      {tables.map((table) => (
                        <li key={table.tableId}>
                          <button
                            type="button"
                            className="wt-table nb-table"
                            data-table-id={table.tableId}
                            aria-pressed={table.tableId === tableId}
                            aria-label={
                              table.roomName
                                ? t('newBooking.tableLabelRoom', {
                                    label: table.label,
                                    seats: seatsOf(table),
                                    room: table.roomName,
                                  })
                                : t('newBooking.tableLabel', {
                                    label: table.label,
                                    seats: seatsOf(table),
                                  })
                            }
                            onClick={() => {
                              setTableId(table.tableId);
                              setFailure(null);
                              if (missing === 'table') setMissing(null);
                            }}
                          >
                            <b aria-hidden="true">{table.label}</b>
                            <span aria-hidden="true">
                              {table.roomName
                                ? t('table.subRoom', {
                                    seats: seatsOf(table),
                                    room: table.roomName,
                                  })
                                : seatsOf(table)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="nb-foot">
            {problem ? (
              <p className="ft-error" id={ids.error} role="alert">
                {problem}
              </p>
            ) : !online ? (
              <p className="ft-hint">{t('newBooking.needsOnline')}</p>
            ) : null}
            <button
              type="submit"
              className="ft-btn ft-btn-primary ft-btn-big nb-submit"
              disabled={!online || create.isPending}
              aria-describedby={problem ? ids.error : undefined}
            >
              {create.isPending ? t('newBooking.submitting') : t('newBooking.submit')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** "Booked": what was taken, its code, who took it, and the reminder to come. */
function Done({
  booking,
  me,
  dayLabel,
  time,
  onAnother,
  onClose,
}: {
  readonly booking: StaffBooking;
  readonly me: string;
  readonly dayLabel: (dateKey: string) => string;
  readonly time: (value: string) => string;
  readonly onAnother: () => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation(['staff', 'common']);
  const headingId = useId();
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="staff-overlay-body nb-done-body">
      <div className="ft-done nb-done" role="status" aria-labelledby={headingId}>
        <span className="ft-done-mark" aria-hidden="true">
          ✓
        </span>
        <h2 id={headingId}>{t('newBooking.done.title')}</h2>
        <p className="nb-done-when">
          {t('newBooking.done.when', {
            day: dayLabel(booking.localDate),
            time: time(booking.startUtc),
          })}
        </p>
        <p>
          {booking.tableLabel
            ? t('newBooking.done.table', { label: booking.tableLabel })
            : t('newBooking.done.noTable')}
          {' · '}
          {t('newBooking.done.party', { count: booking.partySize })}
        </p>
        <p>
          {booking.guestName} · {booking.guestPhone ? formatPhone(booking.guestPhone) : ''}
        </p>
        <p className="nb-done-code">{t('newBooking.done.code', { code: booking.code })}</p>
        <p>{t('newBooking.done.takenBy', { name: booking.takenByName ?? me })}</p>
        <p className="nb-done-reminder">{t('newBooking.done.reminder')}</p>
        {booking.wasReplay ? <p>{t('newBooking.done.replay')}</p> : null}
        <div className="ft-done-actions">
          <button type="button" className="ft-btn ft-btn-secondary" onClick={onAnother}>
            {t('newBooking.done.another')}
          </button>
          <button ref={first} type="button" className="ft-btn ft-btn-primary" onClick={onClose}>
            {t('newBooking.done.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
