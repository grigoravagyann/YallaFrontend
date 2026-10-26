import { isShortNotice, unavailableCopy, type PublicBranch, type SlotFloor } from '@yalla/api';
import { useDaySlots, useNow } from '@yalla/api/react';
import { formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { dayWords } from './dayNames';
import { formatPhone } from './phone';
import {
  addDays,
  branchServiceToday,
  branchToday,
  dayPartOf,
  defaultChoice,
  nearestChoice,
  needsNextDay,
  partyBounds,
  serviceDayChoices,
  serviceDayOf,
  slotProblem,
  type DayPart,
  type SlotSelection,
} from './slots';
import { BookingDayChips } from './BookingDayChips';
import { TablePart, type ChosenTable } from './BookingTable';
import { PartyStepper } from './PartyStepper';
import { largestOfferedTable } from './tablePick';
import { TimeChips } from './TimeChips';
import { useSettled } from './useSettled';

/**
 * The booking card (Main artboard): the day, the party and the time, then the
 * table — in the booking column, sticky beside the room from 960px and between
 * the header and the room on a phone.
 *
 * - **Days** are chips for the first week the branch's booking window reaches,
 *   and "Other day…" opens a date input for the rest of it. A day is a
 *   **service day**, as the backend files bookings: a bar's Thursday runs on
 *   past midnight into Friday's small hours (`serviceDayChoices`).
 * - **The party** is a stepper from one guest to the branch's largest table.
 * - **Times** are chips from the server's day of slots (`slots.ts`): every
 *   quarter hour whose sitting fits, struck when full, "on request" when the
 *   venue answers first. A day opens on the first time that confirms at once
 *   (`defaultChoice`), and a time the visitor picks is kept.
 * - **The table** is chosen in the room; the card says which, books it, or
 *   chooses one for the visitor.
 *
 * When the venue takes no web bookings the card says so in the same place, and
 * offers its phone.
 */

export { ChosenTableLine, TakenNotice, type ChosenTable } from './BookingTable';

/** Who moved the selection: the visitor, or the card keeping it on a time that can be had. */
export interface SelectionChange {
  readonly automatic: boolean;
}

export interface BookingCardProps {
  readonly branch: PublicBranch;
  readonly selection: SlotSelection;
  /**
   * `automatic`: the card moved the time (to the day's default, off a time
   * that filled up) or the party (down to the largest table), not the visitor
   * — what the page has said about the last attempt stays (review B2).
   */
  readonly onSelectionChange: (next: SlotSelection, how?: SelectionChange) => void;
  /** The chosen slot as an instant, for the short-notice line. */
  readonly slotUtc: string;
  /** The id of the card's heading, which names the column around it. */
  readonly headingId: string;
  /**
   * The room's latest answer: its largest table bounds the stepper — an answer
   * for another party will do, the tables are the same — and, once it is the
   * answer for this slot and party, a refusal of the whole slot is said here,
   * under the time that caused it.
   */
  readonly floor?: SlotFloor | undefined;
  /** The table chosen in the room, or `null`. */
  readonly table?: ChosenTable | null | undefined;
  /** Opens the booking panel for the chosen table. Absent: no table part. */
  readonly onBook?: (() => void) | undefined;
  /** "Choose for me". */
  readonly onPickForMe?: (() => void) | undefined;
  /** Whether the room has answered for this slot, so "Choose for me" can act. */
  readonly roomReady?: boolean | undefined;
  /** What happened to the table: chosen for the visitor, none fits, no longer free. */
  readonly tableNote?: string | null | undefined;
  /**
   * The table somebody else just took while the visitor confirmed it in this
   * column: said here, in red, and focused, because this is where they were.
   */
  readonly takenTableLabel?: string | null | undefined;
  /** True while the booking panel is open, which then takes the Book button's place. */
  readonly panelOpen?: boolean | undefined;
  /** The open panel is in this column, under the card: the card folds to its summary. */
  readonly panelInColumn?: boolean | undefined;
  /** Moves nothing by itself — just after a booking, until the visitor changes something. */
  readonly holdTime?: boolean | undefined;
  /**
   * Called once, when the opening time is settled: the server's day has
   * answered and the card is on its default (or on the visitor's time), or
   * the day could not be read. The page reads the room only from then — not
   * for the first guess from the published hours, which by day is often a
   * time the card then moves off (a second read, and a room drawn for a time
   * nobody chose).
   */
  readonly onTimeSettled?: (() => void) | undefined;
  /**
   * Changing a booking from its manage link: the booking being moved, left
   * out of the day's times so its own slot and table read as free to it.
   */
  readonly excludeReservationId?: string | undefined;
  /**
   * The selection is a time already chosen — a booking's own, on its manage
   * link — kept as a picked time rather than moved to the day's default.
   */
  readonly keepTime?: boolean | undefined;
  /** The card's heading, when it is not "Book a table". */
  readonly title?: string | undefined;
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
      <h2 id={headingId} tabIndex={-1}>
        {t('booking.offTitle')}
      </h2>
      <p className="pub-card-text">{t('booking.notOffered')}</p>
      {branch.phoneE164 ? (
        <a className="pub-button pub-button-primary" href={`tel:${branch.phoneE164}`}>
          {t('page.call', { phone: formatPhone(branch.phoneE164) })}
        </a>
      ) : null}
    </div>
  );
}

const AUTOMATIC: SelectionChange = { automatic: true };

function SlotControls({
  branch,
  selection,
  onSelectionChange,
  slotUtc,
  headingId,
  floor,
  table = null,
  onBook,
  onPickForMe,
  roomReady = true,
  tableNote = null,
  takenTableLabel = null,
  panelOpen = false,
  panelInColumn = false,
  holdTime = false,
  onTimeSettled,
  excludeReservationId,
  keepTime = false,
  title,
}: BookingCardProps) {
  const { t } = useTranslation('public');
  const { locale } = useLocale();
  const dayLabelId = useId();
  const partyLabelId = useId();
  const timeLabelId = useId();
  const { timeZoneId, weeklyHours } = branch;
  const turnTimeMinutes = branch.policy.turnTimeMinutes;
  const hours = useMemo(
    () => ({ weeklyHours, turnTimeMinutes, timeZoneId }),
    [weeklyHours, turnTimeMinutes, timeZoneId],
  );
  /**
   * Changing a booking (`keepTime`): the card opens on the booking as it
   * stands and moves nothing — no nearer time, no smaller party — until the
   * visitor touches the day, the time or the party (PP5-FE-REVIEW S3). A
   * change they never chose must not ride along with one they did.
   */
  const [touched, setTouched] = useState(!keepTime);
  /** Nothing moves by itself while a panel is open, just after a booking, or before a change is touched. */
  const hold = panelOpen || holdTime || !touched;

  // Short notice is the server's rule, by the instant: today, or under six hours.
  const now = useNow();
  const today = branchToday(timeZoneId, now);
  const clockMinute = Math.floor(now.getTime() / 60_000);
  const serviceToday = useMemo(
    () => branchServiceToday(timeZoneId, weeklyHours, new Date(clockMinute * 60_000)),
    [timeZoneId, weeklyHours, clockMinute],
  );

  /** The service day the selection is on: the night a 00:30 belongs to. */
  const serviceDate = useMemo(
    () => serviceDayOf(selection.date, selection.time, weeklyHours, timeZoneId),
    [selection.date, selection.time, weeklyHours, timeZoneId],
  );

  /**
   * A day tapped and not yet answered. The selection moves to it once — on its
   * default time — when its day of slots is in, so no room is read for the new
   * day at the old time nobody chose (review S5).
   */
  const [pendingDay, setPendingDay] = useState<string | null>(null);
  if (pendingDay !== null && pendingDay === serviceDate) setPendingDay(null);
  const shownDay = pendingDay ?? serviceDate;

  /*
   * The day's times, from the server's day of slots — and, for a night past
   * midnight, the next date's. A run along the day chips asks about the day it
   * stops on (`useSettled`); the party settles inside `useDaySlots`.
   */
  const readDay = useSettled(shownDay);
  const readNext = addDays(readDay, 1);
  const readNeedsNext = useMemo(
    () => needsNextDay(readDay, weeklyHours, timeZoneId, turnTimeMinutes),
    [readDay, weeklyHours, timeZoneId, turnTimeMinutes],
  );
  const dayQuery = useDaySlots({
    branchId: branch.id,
    date: readDay,
    partySize: selection.partySize,
    excludeBookingId: excludeReservationId,
  });
  const nextQuery = useDaySlots({
    branchId: branch.id,
    date: readNext,
    partySize: selection.partySize,
    excludeBookingId: excludeReservationId,
    enabled: readNeedsNext,
  });
  const shownNeedsNext = useMemo(
    () => needsNextDay(shownDay, weeklyHours, timeZoneId, turnTimeMinutes),
    [shownDay, weeklyHours, timeZoneId, turnTimeMinutes],
  );
  const dayAnswer =
    !dayQuery.isError && dayQuery.data?.date === shownDay ? dayQuery.data : undefined;
  const nextAnswer =
    shownNeedsNext && !nextQuery.isError && nextQuery.data?.date === addDays(shownDay, 1)
      ? nextQuery.data
      : undefined;
  /** For this day and this party, from the server — not the published hours. */
  const answered =
    dayAnswer?.partySize === selection.partySize &&
    (!shownNeedsNext || nextAnswer?.partySize === selection.partySize);
  const failed =
    readDay === shownDay && (dayQuery.isError || (shownNeedsNext && nextQuery.isError));

  const choices = useMemo(
    () =>
      serviceDayChoices({ serviceDate: shownDay, day: dayAnswer, nextDay: nextAnswer, ...hours }),
    [shownDay, dayAnswer, nextAnswer, hours],
  );
  /** Whether the day's hours have a day half and an evening half: read once per day. */
  const split = useMemo(() => {
    const parts = new Set(
      serviceDayChoices({
        serviceDate: shownDay,
        day: undefined,
        nextDay: undefined,
        ...hours,
      }).map((choice) => dayPartOf(choice.time)),
    );
    return parts.size > 1;
  }, [shownDay, hours]);
  const chosen =
    pendingDay === null
      ? (choices.find(
          (choice) => choice.date === selection.date && choice.time === selection.time,
        ) ?? null)
      : null;

  /**
   * The service day the visitor picked a time on. Until they pick one, a day
   * sits on its default; once they have, their time is kept — moved only when
   * it can no longer be had, and then to the nearest that can. Switching to
   * the day or the evening half counts as picking (review N11).
   */
  const [pickedOn, setPickedOn] = useState<string | null>(() => (keepTime ? serviceDate : null));
  const timePicked = pickedOn === serviceDate;
  /**
   * The half of the day the visitor is looking at: where a new day's default
   * is looked for first, so somebody choosing among evenings stays in the
   * evening (Main artboard).
   */
  const [preferredPart, setPreferredPart] = useState<DayPart>(() => dayPartOf(selection.time));

  /** A tapped day, moved to once its answer is in — once per tap. */
  const committed = useRef<string | null>(null);
  useEffect(() => {
    if (pendingDay === null || committed.current === pendingDay) return;
    if (readDay !== pendingDay || (!answered && !failed)) return;
    committed.current = pendingDay;
    const open = choices.filter((choice) => choice.state !== 'busy');
    const next = answered
      ? defaultChoice(choices, preferredPart)
      : (open.find((choice) => dayPartOf(choice.time) === preferredPart) ?? open[0]);
    onSelectionChange(
      next
        ? { ...selection, date: next.date, time: next.time }
        : { ...selection, date: pendingDay },
    );
  }, [pendingDay, readDay, answered, failed, choices, preferredPart, selection, onSelectionChange]);

  /*
   * Once the server has answered for this day and this party: on the default
   * while nothing was picked, and never left on a time that cannot be had.
   *
   * Never while the booking panel is open, or just after a booking. The day
   * reads again when a booking lands, and the table just booked may have been
   * that time's last: moving the time then would close the panel on the
   * confirmation it is showing.
   */
  /** Where the card keeps the time once the day has answered: `undefined` until then. */
  const target =
    pendingDay !== null || !answered
      ? undefined
      : timePicked
        ? chosen && chosen.state !== 'busy'
          ? null
          : nearestChoice(choices, selection.time, selection.date)
        : defaultChoice(choices, preferredPart);
  const moves =
    target !== undefined &&
    target !== null &&
    (target.time !== selection.time || target.date !== selection.date);
  useEffect(() => {
    if (hold || !target || !moves) return;
    onSelectionChange({ ...selection, date: target.date, time: target.time }, AUTOMATIC);
  }, [hold, target, moves, selection, onSelectionChange]);

  /** The opening time is settled: on the day's answer and staying there, or held, or unreadable. */
  const timeKnown = hold || failed || (target !== undefined && !moves);
  const reported = useRef(false);
  useEffect(() => {
    if (!timeKnown || reported.current || !onTimeSettled) return;
    reported.current = true;
    onTimeSettled();
  }, [timeKnown, onTimeSettled]);

  /* A page left open past midnight: a day that has gone moves to today (review N1). */
  useEffect(() => {
    if (hold || pendingDay !== null || serviceDate >= serviceToday) return;
    onSelectionChange({ ...selection, date: serviceToday }, AUTOMATIC);
  }, [hold, pendingDay, serviceDate, serviceToday, selection, onSelectionChange]);

  /*
   * The stepper's top: the largest table the venue books online. A party past
   * it — set before the tables answered — comes down to it (review N2).
   */
  const largest = useMemo(() => {
    if (!floor) return null;
    const offline = new Set(
      floor.tables
        .filter((entry) => entry.unavailableReason === 'notBookable')
        .map((entry) => entry.tableId),
    );
    return largestOfferedTable(floor.plan.tables, branch.rooms, offline);
  }, [floor, branch.rooms]);
  const bounds = partyBounds(largest);
  useEffect(() => {
    if (hold || largest === null || selection.partySize <= bounds.max) return;
    onSelectionChange({ ...selection, partySize: bounds.max }, AUTOMATIC);
  }, [hold, largest, bounds.max, selection, onSelectionChange]);

  /** The card folded to its summary while the panel is open under it (QA 1). */
  const [unfolded, setUnfolded] = useState(false);
  if (!panelOpen && unfolded) setUnfolded(false);

  /*
   * A rule that refused the whole slot before any table was considered — too
   * soon, past the window, shut then — said under the time that caused it,
   * where the visitor changes it, rather than over a room on the other side of
   * the page. A room drawn with every table greyed out reads as "fully
   * booked", which is a different fact and sends the visitor away.
   */
  const rejection =
    floor?.rejection &&
    floor.partySize === selection.partySize &&
    Date.parse(floor.slotUtc) === Date.parse(slotUtc)
      ? unavailableCopy(floor.rejection, selection.partySize)
      : null;

  const day = dayWords(selection.date, today, t);
  const guests = t('booking.guests', { ns: 'diner', count: selection.partySize });

  if (panelOpen && panelInColumn && !unfolded) {
    return (
      <div className="pub-card pub-book is-folded">
        <h2 id={headingId} tabIndex={-1}>
          {title ?? t('booking.pick')}
        </h2>
        <div className="pub-book-summary">
          <p>{t('room.slot', { date: day.short, time: selection.time, guests })}</p>
          <button
            type="button"
            className="pub-button pub-button-small"
            onClick={() => setUnfolded(true)}
          >
            {t('booking.change')}
          </button>
        </div>
      </div>
    );
  }

  /** Why the chosen time waits for the venue, from what the slot's answer says (review S3). */
  const waitReason =
    chosen && chosen.state !== 'busy' && chosen.confirmsAtOnce === false
      ? isShortNotice({ startUtc: slotUtc, timeZoneId, now })
        ? 'booking.approval.why'
        : chosen.state === 'requestable'
          ? 'table.requestable.earlierGuest'
          : // Auto-confirm off, or a party over the limit: the wire does not say which.
            'booking.approval.venueWillConfirm'
      : null;

  return (
    <div className="pub-card pub-book">
      <h2 id={headingId} tabIndex={-1}>
        {title ?? t('booking.pick')}
      </h2>

      <BookingDayChips
        branch={branch}
        today={serviceToday}
        calendarToday={today}
        shownDay={shownDay}
        labelId={dayLabelId}
        onPick={(date) => {
          setTouched(true);
          const valid = slotProblem({ ...selection, date }) === 'date' ? serviceToday : date;
          setPendingDay(valid === serviceDate ? null : valid);
        }}
      />

      <PartyStepper
        branch={branch}
        bounds={bounds}
        partySize={selection.partySize}
        labelId={partyLabelId}
        onChange={(partySize) => {
          setTouched(true);
          onSelectionChange({ ...selection, partySize });
        }}
      />

      <TimeChips
        choices={choices}
        selection={selection}
        pending={pendingDay !== null}
        shownDay={shownDay}
        isToday={shownDay === serviceToday}
        split={split}
        preferredPart={preferredPart}
        unchecked={failed && !answered}
        labelId={timeLabelId}
        onPick={(choice) => {
          setTouched(true);
          setPickedOn(serviceDate);
          setPreferredPart(dayPartOf(choice.time));
          onSelectionChange({ ...selection, date: choice.date, time: choice.time });
        }}
        onPart={(part) => {
          setTouched(true);
          setPreferredPart(part);
          setPickedOn(shownDay);
        }}
      />

      {/* A booking's own time the venue no longer offers: said, never moved (S3). */}
      {!touched && answered && (!chosen || chosen.state === 'busy') ? (
        <p className="pub-notice pub-notice-alert">{t('booking.timeNotOffered')}</p>
      ) : null}

      {/* Always mounted, so a refusal that appears is heard (review N12). */}
      <div role="status">
        {rejection ? (
          <p className="pub-notice pub-notice-alert">
            {t(rejection.key, { ns: 'diner', ...rejection.params })}
          </p>
        ) : null}
      </div>

      {/* Why the chosen time waits — left to the panel while it is open (QA 2). */}
      {waitReason && !panelOpen ? (
        <p className="pub-notice pub-notice-alert">{t(waitReason, { ns: 'diner' })}</p>
      ) : null}
      {chosen?.mustFreeByUtc ? (
        <p className="pub-muted">
          {t('table.mustFreeBy', {
            ns: 'diner',
            time: formatTime(chosen.mustFreeByUtc, timeZoneId, locale),
          })}
        </p>
      ) : null}

      {onBook ? (
        <TablePart
          branch={branch}
          selection={selection}
          today={today}
          table={table}
          onBook={onBook}
          onPickForMe={onPickForMe}
          roomReady={roomReady}
          note={tableNote}
          takenTableLabel={takenTableLabel}
          panelOpen={panelOpen}
        />
      ) : null}
    </div>
  );
}
