import {
  isShortNotice,
  unavailableCopy,
  type PublicBranch,
  type SlotFloor,
  type TableAvailability,
} from '@yalla/api';
import { useDaySlots, useNow } from '@yalla/api/react';
import { formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { dayWords, freeCancellationWords } from './dayNames';
import { formatPhone } from './phone';
import {
  addDays,
  bookingDays,
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
  type TimeChoice,
} from './slots';
import { largestOfferedTable } from './tablePick';
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

      <DayChips
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

function DayChips({
  branch,
  today,
  calendarToday,
  shownDay,
  labelId,
  onPick,
}: {
  readonly branch: PublicBranch;
  /**
   * The branch's service day now: the first chip — "Today", or "Tonight" while
   * last night is still open past midnight.
   */
  readonly today: string;
  /** The branch's calendar day, which the words "Today" and "Tomorrow" are about. */
  readonly calendarToday: string;
  readonly shownDay: string;
  readonly labelId: string;
  readonly onPick: (date: string) => void;
}) {
  const { t } = useTranslation('public');
  const inputId = useId();
  const days = bookingDays(today, branch.bookingWindowDays);
  const onChip = days.chips.includes(shownDay);
  const [otherOpen, setOtherOpen] = useState(false);
  // A day past the chips — picked in the input, or the page's own default after
  // a shut week — keeps the input that shows it open.
  const showInput = days.more && (otherOpen || !onChip);

  return (
    <div className="pub-book-part">
      <span className="pub-label" id={labelId}>
        {t('booking.day')}
      </span>
      <div className="pub-days" role="group" aria-labelledby={labelId}>
        {days.chips.map((date) => {
          const words = dayWords(date, calendarToday, t, today);
          return (
            <button
              key={date}
              type="button"
              className="pub-day"
              aria-pressed={date === shownDay}
              // Holds every word the chip shows ("Today", "20"), WCAG 2.5.3.
              aria-label={words.full}
              onClick={() => {
                setOtherOpen(false);
                onPick(date);
              }}
            >
              <small>{words.name ?? words.weekday}</small>
              <b>{words.day}</b>
            </button>
          );
        })}
        {days.more ? (
          <button
            type="button"
            className={`pub-day pub-day-other${onChip ? '' : ' is-chosen'}`}
            aria-expanded={showInput}
            aria-controls={showInput ? inputId : undefined}
            onClick={() => setOtherOpen((open) => !open)}
          >
            {/* The day chosen here is said in words, not only drawn (review N7). */}
            {onChip
              ? t('booking.otherDay')
              : t('booking.otherDayChosen', {
                  date: dayWords(shownDay, calendarToday, t, today).date,
                })}
          </button>
        ) : null}
      </div>
      {showInput ? (
        <label className="pub-field pub-date-other" id={inputId}>
          <span>{t('booking.otherDate', { count: branch.bookingWindowDays })}</span>
          <input
            type="date"
            value={shownDay}
            min={today}
            max={days.last}
            onChange={(event) => onPick(event.currentTarget.value)}
          />
        </label>
      ) : null}
    </div>
  );
}

function PartyStepper({
  branch,
  bounds,
  partySize,
  labelId,
  onChange,
}: {
  readonly branch: PublicBranch;
  readonly bounds: { readonly min: number; readonly max: number };
  readonly partySize: number;
  readonly labelId: string;
  readonly onChange: (partySize: number) => void;
}) {
  const { t } = useTranslation('public');
  const { min, max } = bounds;
  const atMin = partySize <= min;
  const atMax = partySize >= max;

  return (
    <div className="pub-book-part">
      <span className="pub-label" id={labelId}>
        {t('booking.partySize', { ns: 'diner' })}
      </span>
      <div className="pub-party" role="group" aria-labelledby={labelId}>
        {/* `aria-disabled` rather than `disabled`, so a keyboard stays on the
            button at the end of its run instead of being dropped to the page. */}
        <button
          type="button"
          className="pub-step"
          aria-label={t('booking.fewer')}
          aria-disabled={atMin || undefined}
          onClick={() => {
            if (!atMin) onChange(partySize - 1);
          }}
        >
          −
        </button>
        <output aria-live="polite">{t('booking.guests', { ns: 'diner', count: partySize })}</output>
        <button
          type="button"
          className="pub-step"
          aria-label={t('booking.more')}
          aria-disabled={atMax || undefined}
          onClick={() => {
            if (!atMax) onChange(partySize + 1);
          }}
        >
          +
        </button>
      </div>
      {atMax ? (
        <p className="pub-hint">
          {branch.phoneE164 ? (
            <>
              {t('booking.bigParty', { count: max })}{' '}
              <a href={`tel:${branch.phoneE164}`}>{formatPhone(branch.phoneE164)}</a>
            </>
          ) : (
            t('booking.bigPartyAsk', { count: max })
          )}
        </p>
      ) : null}
    </div>
  );
}

/** The arrows' steps through the time grid: across a row, and down a column. */
function gridStep(key: string, columns: number): number | null {
  switch (key) {
    case 'ArrowRight':
      return 1;
    case 'ArrowLeft':
      return -1;
    case 'ArrowDown':
      return columns;
    case 'ArrowUp':
      return -columns;
    default:
      return null;
  }
}

function TimeChips({
  choices,
  selection,
  pending,
  shownDay,
  isToday,
  split,
  preferredPart,
  unchecked,
  labelId,
  onPick,
  onPart,
}: {
  readonly choices: readonly TimeChoice[];
  readonly selection: SlotSelection;
  /** A tapped day whose answer is on its way: its times are shown, none chosen yet. */
  readonly pending: boolean;
  readonly shownDay: string;
  readonly isToday: boolean;
  readonly split: boolean;
  readonly preferredPart: DayPart;
  /** The day's read failed: the times are the published hours, unchecked. */
  readonly unchecked: boolean;
  readonly labelId: string;
  readonly onPick: (choice: TimeChoice) => void;
  /** The visitor switched to a half of the day. */
  readonly onPart: (part: DayPart) => void;
}) {
  const { t } = useTranslation('public');
  const grid = useRef<HTMLDivElement>(null);
  /** The part the visitor switched to, on that day; otherwise the time's own. */
  const [partFor, setPartFor] = useState<{ readonly date: string; readonly part: DayPart } | null>(
    null,
  );

  const part =
    partFor && partFor.date === shownDay
      ? partFor.part
      : pending
        ? preferredPart
        : dayPartOf(selection.time);
  const shown = split ? choices.filter((choice) => dayPartOf(choice.time) === part) : choices;
  const isChosen = (choice: TimeChoice) =>
    !pending &&
    choice.state !== 'busy' &&
    choice.date === selection.date &&
    choice.time === selection.time;

  const pickPart = (next: DayPart) => {
    setPartFor({ date: shownDay, part: next });
    onPart(next);
    // Within the half asked for only: a switch to the evening is not answered
    // with a time in the afternoon.
    const first = defaultChoice(choices.filter((choice) => dayPartOf(choice.time) === next));
    if (first) onPick(first);
  };

  /*
   * One tab stop for the whole grid, the chosen time (or the first that can be
   * had), and the arrows move through it — thirty-odd chips are otherwise
   * thirty-odd presses of Tab between the party and the table (review N8).
   */
  const stop = Math.max(
    0,
    shown.findIndex(isChosen) >= 0
      ? shown.findIndex(isChosen)
      : shown.findIndex((choice) => choice.state !== 'busy'),
  );
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const node = grid.current;
    if (!node) return;
    const columns =
      getComputedStyle(node).gridTemplateColumns.split(' ').filter(Boolean).length || 4;
    const step = gridStep(event.key, columns);
    const target =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? shown.length - 1
          : step === null
            ? null
            : index + step;
    if (target === null || target < 0 || target >= shown.length) return;
    event.preventDefault();
    node.querySelectorAll<HTMLButtonElement>('button')[target]?.focus();
  };

  const empty =
    choices.length === 0
      ? t('booking.noTimesLeft', { ns: 'diner' })
      : part === 'day'
        ? t(isToday ? 'booking.noTimes.dayToday' : 'booking.noTimes.day')
        : t('booking.noTimes.evening');

  return (
    <div className="pub-book-part">
      <span className="pub-label" id={labelId}>
        {t('booking.time', { ns: 'diner' })}
      </span>
      {split ? (
        <div className="pub-seg" role="group" aria-label={t('booking.dayParts')}>
          {(['day', 'evening'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={part === value}
              onClick={() => pickPart(value)}
            >
              {t(`booking.dayPart.${value}`)}
            </button>
          ))}
        </div>
      ) : null}
      {unchecked ? <p className="pub-notice">{t('booking.timesUnchecked')}</p> : null}
      {shown.length > 0 ? (
        <div
          className="pub-times"
          role="group"
          aria-labelledby={labelId}
          aria-busy={pending || undefined}
          ref={grid}
        >
          {shown.map((choice, index) => {
            const full = choice.state === 'busy';
            const onRequest = !full && choice.confirmsAtOnce === false;
            return (
              <button
                key={`${choice.date} ${choice.time}`}
                type="button"
                className={`pub-time${full ? ' is-full' : ''}`}
                aria-pressed={isChosen(choice)}
                aria-disabled={full || undefined}
                aria-label={
                  full
                    ? t('book.slotFull', { ns: 'diner', time: choice.time })
                    : onRequest
                      ? t('booking.timeOnRequest', { time: choice.time })
                      : undefined
                }
                tabIndex={index === stop ? 0 : -1}
                onKeyDown={(event) => onKeyDown(event, index)}
                onClick={() => {
                  if (!full) onPick(choice);
                }}
              >
                {choice.time}
                {onRequest ? <small>{t('booking.onRequest')}</small> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="pub-empty">{empty}</p>
      )}
    </div>
  );
}

function TablePart({
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
