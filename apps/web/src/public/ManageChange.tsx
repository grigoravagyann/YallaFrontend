import {
  BookingLinkAccountUnavailableError,
  BookingNotChangeableError,
  BookingsNotAcceptedError,
  BranchUnavailableError,
  ConcurrencyConflictError,
  NotFoundError,
  TooManyRequestsError,
  bookingFailure,
  isApprovalExpired,
  newCommandId,
  type ManagedBooking,
  type PublicBranch,
} from '@yalla/api';
import { useRescheduleManagedBooking, useSlotFloor } from '@yalla/api/react';
import { branchDayKey, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import {
  BookingCard,
  ChosenTableLine,
  type ChosenTable,
  type SelectionChange,
} from './BookingCard';
import { dayWords } from './dayNames';
import { numberRuleWords, overlapElsewhereWords } from './refusalWords';
import { RoomSection } from './RoomSection';
import { branchClock, branchToday, slotInstant, type SlotSelection } from './slots';
import { isPickable, pickTableFor, roomOf } from './tablePick';
import { useSettled } from './useSettled';

/**
 * Changing a booking from its manage link (Manage artboard, "Փոխել ժամը կամ
 * հյուրերին"; HANDOFF §5.1).
 *
 * The branch page's own booking card and room, opened on the booking as it
 * stands — its day, its time, its party and its table — and read with the
 * booking itself left out (`excludeReservationId`), so the slot and the table
 * it already holds read as free to it. One press sends the whole new slot to
 * `POST /api/public/bookings/{token}/reschedule`.
 *
 * What the venue makes of a change is the server's to decide — a party that
 * does not grow can still go back to the venue (tonight, a branch that
 * approves every booking, a no-show history), and one that grows can stay
 * confirmed (PP5 wire) — so the page never predicts it. Before sending it says
 * only that the venue *may* need to confirm; after, the page shows the status
 * the answer carries.
 *
 * The reads are the app's anonymous availability routes
 * (`/api/branches/{id}/availability[/slots]`, the backend's availability rate
 * policy — as the branch page's room has read since phase 3, not the
 * `/api/public/...` twins the PP5 wire names): the day is read once per day and
 * party, the room once the time has settled, and nothing here polls but the
 * room, at the page's own cadence.
 * The change itself spends the link's (20 a minute, shared with its read and
 * its cancel), and a refusal is never retried by itself.
 */
export interface ManageChangeProps {
  readonly token: string;
  readonly booking: ManagedBooking;
  readonly branch: PublicBranch;
  readonly onClose: () => void;
  /** The server's answer: the booking as it now stands. */
  readonly onChanged: (booking: ManagedBooking) => void;
  /** The booking's account cannot take a change from the link (403): changing is over here. */
  readonly onLocked: () => void;
  /** The booking moved on meanwhile — cancelled, started, past its window: said on the page. */
  readonly onStale: (message: string) => void;
  /** Read the link again; resolves with what it says now. */
  readonly onReread: () => Promise<ManagedBooking | null | undefined>;
}

interface Failure {
  readonly text: string;
  /** Red only for a real failure — the table gone (HANDOFF §3); amber for what needs attention. */
  readonly tone: 'error' | 'alert';
}

export default function ManageChange({
  token,
  booking,
  branch,
  onClose,
  onChanged,
  onLocked,
  onStale,
  onReread,
}: ManageChangeProps) {
  const { t } = useTranslation('public');
  const { t: td } = useTranslation('diner');
  const { locale } = useLocale();
  const queryClient = useQueryClient();
  const headingId = useId();
  const freeById = useId();
  const zone = branch.timeZoneId;

  /** What the booking holds now: the change starts here, and "nothing changed" is measured from it. */
  const [original] = useState(() => ({
    slotUtc: booking.slotUtc,
    partySize: booking.partySize,
    tableId: booking.tableId,
  }));
  const [selection, setSelection] = useState<SlotSelection>(() => {
    const start = new Date(booking.slotUtc);
    return {
      date: branchToday(zone, start),
      time: branchClock(start, zone),
      partySize: booking.partySize,
    };
  });
  const [picked, setPicked] = useState<{ readonly id: string; readonly label: string } | null>(
    () => (booking.tableId ? { id: booking.tableId, label: booking.tableLabel } : null),
  );
  /** What happened to the table: chosen for the visitor, none fits, no longer free. */
  const [tableNote, setTableNote] = useState<string | null>(null);
  const [roomShown, setRoomShown] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  // The heading names the region; the keyboard lands on it as the card opens.
  useEffect(() => {
    document.getElementById(headingId)?.focus();
  }, [headingId]);

  const slotUtc = useMemo(
    () => (slotInstant(selection, zone) ?? new Date(booking.slotUtc)).toISOString(),
    [selection, zone, booking.slotUtc],
  );

  /*
   * The room's answer for the new slot — the very query the room draws from
   * and polls, read here without a second poll: whether the chosen table is
   * still to be had, and which one "Choose for me" takes.
   */
  const floorQuery = useSlotFloor({
    branchId: branch.id,
    slotUtc: useSettled(slotUtc),
    partySize: selection.partySize,
    timeZoneId: zone,
    excludeBookingId: booking.reservationId,
  });
  const floor = floorQuery.data ?? undefined;
  const current =
    floor &&
    !floorQuery.isPlaceholderData &&
    floor.partySize === selection.partySize &&
    Date.parse(floor.slotUtc) === Date.parse(slotUtc)
      ? floor
      : undefined;

  const reschedule = useRescheduleManagedBooking(token);
  const saving = reschedule.isPending;

  /*
   * A table the new slot no longer gives is let go, and the card says so — as
   * on the branch page. Not while a change is on its way: a table taken
   * mid-save is the server's 409 to tell. Adjusted during render.
   */
  if (picked && !saving && current) {
    const table = current.plan.tables.find((entry) => entry.id === picked.id);
    if (!table || !isPickable(table) || !roomOf(table, branch.rooms)) {
      setPicked(null);
      setTableNote(t('booking.table.lost', { label: picked.label }));
    }
  }

  const pickedTable = picked
    ? floor?.plan.tables.find((table) => table.id === picked.id)
    : undefined;
  const chosenTable: ChosenTable | null = picked
    ? {
        label: pickedTable?.label ?? picked.label,
        seats: pickedTable?.seats ?? null,
        roomName: (pickedTable && roomOf(pickedTable, branch.rooms)?.name) ?? null,
        availability:
          current?.tables.find((entry) => entry.tableId === picked.id && entry.isBookable) ?? null,
      }
    : null;

  /*
   * The promise to free the table by a time, when a booking follows it: the
   * room's time, or the server's once a refusal named one for this very slot,
   * table and party. Agreed per slot, table and party: another choice asks
   * again, unticked.
   */
  const choiceKey = `${slotUtc}|${picked?.id ?? ''}|${selection.partySize}`;
  const [serverFreeBy, setServerFreeBy] = useState<{
    readonly key: string;
    readonly at: string;
  } | null>(null);
  const requiredFreeBy =
    (serverFreeBy?.key === choiceKey ? serverFreeBy.at : null) ??
    chosenTable?.availability?.mustFreeByUtc ??
    null;
  const [agreedFor, setAgreedFor] = useState<string | null>(null);
  const agreed = agreedFor === choiceKey;

  /*
   * One command id per change attempt, reused on every retry of it. A retry
   * after a lost answer, or a table lock that timed out, is the same command,
   * and the server answers it with the booking as it stands rather than
   * moving it twice. Another choice is another attempt and gets its own id: the
   * server refuses an id reused for a different change. Adjusted during render.
   */
  const [attempt, setAttempt] = useState(() => ({ key: choiceKey, commandId: newCommandId() }));
  if (attempt.key !== choiceKey) setAttempt({ key: choiceKey, commandId: newCommandId() });

  const unchanged =
    picked?.id === original.tableId &&
    selection.partySize === original.partySize &&
    Date.parse(slotUtc) === Date.parse(original.slotUtc);
  const canSave =
    Boolean(chosenTable?.availability) &&
    !unchanged &&
    !saving &&
    (requiredFreeBy === null || agreed);

  /** The selection moved: by the visitor it is a new attempt, and what was said about the last goes. */
  const changeSelection = (next: SlotSelection, how?: SelectionChange) => {
    setSelection(next);
    if (how?.automatic) return;
    setFailure(null);
    setTableNote(null);
  };

  const choose = (id: string, label: string) => {
    setFailure(null);
    setTableNote(null);
    setPicked({ id, label });
  };

  const pickForMe = () => {
    if (!current) {
      setTableNote(t(floorQuery.isError ? 'booking.table.roomFailed' : 'booking.table.checking'));
      return;
    }
    const table = pickTableFor({
      tables: current.plan.tables,
      rooms: branch.rooms,
      partySize: selection.partySize,
      currentRoomId: roomShown,
    });
    if (!table) {
      setPicked(null);
      setTableNote(t('booking.table.noneFits', { count: selection.partySize }));
      return;
    }
    choose(table.id, table.label);
    setTableNote(
      t('booking.table.chosen', {
        label: table.label,
        seats: t('booking.seats', { count: table.seats }),
        room: roomOf(table, branch.rooms)?.name ?? '',
      }),
    );
  };

  const save = async () => {
    if (!canSave || !picked) return;
    setFailure(null);
    try {
      const moved = await reschedule.mutateAsync({
        commandId: attempt.commandId,
        tableId: picked.id,
        slotUtc,
        timeZoneId: zone,
        partySize: selection.partySize,
        ...(requiredFreeBy && agreed ? { acceptsFreeByUtc: requiredFreeBy } : {}),
      });
      onChanged(moved);
    } catch (error) {
      await refused(error);
    }
  };

  /** Every refusal, in words, and what the page does about it. Never retried by itself. */
  async function refused(error: unknown) {
    const alert = (text: string) => setFailure({ text, tone: 'alert' });

    // Not this visitor's to fix: the booking's account can take no change.
    if (error instanceof BookingLinkAccountUnavailableError) {
      onLocked();
      return;
    }
    // Cancelled, started, answered or past its window meanwhile: the link is
    // read again and the page shows what the booking is now.
    if (error instanceof BookingNotChangeableError || isApprovalExpired(error)) {
      onStale(
        td(
          isApprovalExpired(error)
            ? 'book.changeError.approvalExpired'
            : 'book.changeError.notChangeable',
        ),
      );
      return;
    }
    if (error instanceof ConcurrencyConflictError) {
      void onReread();
      alert(td('book.changeError.generic'));
      return;
    }
    // A dead link and a table that is gone both answer 404: read the link
    // again to tell them apart. A dead link turns the page to "no longer works".
    if (error instanceof NotFoundError) {
      const fresh = await onReread();
      if (!fresh) return;
      setPicked(null);
      void floorQuery.refetch();
      setFailure({ text: t('manage.changing.error.tableGone'), tone: 'error' });
      return;
    }
    // The link's budget, shared with every tab holding it: wait, then press again.
    if (error instanceof TooManyRequestsError) {
      alert(t('manage.changing.error.rateLimited'));
      return;
    }
    if (error instanceof BookingsNotAcceptedError || error instanceof BranchUnavailableError) {
      alert(t('manage.changing.error.notAccepted'));
      return;
    }

    const here = { venueName: booking.venueName, branchName: booking.branchName };
    const read = bookingFailure(error, zone, locale, { here });
    switch (read.kind) {
      case 'tableTaken':
        // The room redraws and the visitor picks again, with the day, time and party kept.
        void queryClient.invalidateQueries({ queryKey: ['availability', branch.id] });
        setPicked(null);
        setTableNote(null);
        // A real failure, so red (HANDOFF §3).
        setFailure({ text: td(read.line.key, read.line.params), tone: 'error' });
        return;
      case 'freeByRequired':
        if (read.requiredFreeByUtc) setServerFreeBy({ key: choiceKey, at: read.requiredFreeByUtc });
        setAgreedFor(null);
        alert(td(read.line.key, read.line.params));
        return;
      case 'overlapsOwn':
        // Another venue or branch, too close to the new time: named, as the
        // Book sheet names it. One here, at this venue: said without naming it.
        alert(
          overlapElsewhereWords(read.error, here, slotUtc, zone, t) ??
            t('manage.changing.error.overlapsOwn'),
        );
        return;
      case 'blockedNoShows': {
        // Three no-shows in three days: no change until the block ends; cancelling stays.
        const until = read.error.blockedUntilUtc;
        alert(
          until
            ? t('manage.changing.error.blocked', {
                date: dayWords(branchDayKey(until, zone), branchToday(zone), t).inSentence,
                time: formatTime(until, zone, locale),
              })
            : t('manage.changing.error.blockedPlain'),
        );
        return;
      }
      case 'phoneHasActiveBooking':
        // A move adds no booking, so the server never says this of one; worded all the same.
        alert(numberRuleWords(read, zone, locale, t) ?? td(read.line.key, read.line.params));
        return;
      case 'busy':
        // The same attempt: pressed again, it is the same command.
        alert(t('manage.changing.error.busy'));
        return;
      case 'commandInUse':
        setAttempt({ key: choiceKey, commandId: newCommandId() });
        alert(t('manage.changing.error.commandInUse'));
        return;
      case 'unknown':
        // Moved or not, the next press with the same id cannot move it twice.
        void onReread();
        alert(td('book.changeError.unknownOutcome'));
        return;
      case 'generic':
        alert(td('book.changeError.generic'));
        return;
      default:
        alert(td(read.line.key, read.line.params));
    }
  }

  const today = branchToday(zone);

  return (
    <section className="pub-section pub-manage-change" aria-labelledby={headingId}>
      <BookingCard
        branch={branch}
        selection={selection}
        onSelectionChange={changeSelection}
        slotUtc={slotUtc}
        headingId={headingId}
        title={t('manage.change')}
        floor={floor}
        excludeReservationId={booking.reservationId}
        keepTime
      />

      <RoomSection
        branch={branch}
        selection={selection}
        slotUtc={slotUtc}
        selectedTableId={picked?.id ?? null}
        onTableTap={(availability) => choose(availability.tableId, availability.tableLabel)}
        takenTableLabel={null}
        onRoomShown={setRoomShown}
        excludeReservationId={booking.reservationId}
      />

      <div className="pub-card pub-manage-save">
        <ChosenTableLine table={chosenTable} selection={selection} today={today} />
        {!chosenTable ? (
          <button
            type="button"
            className="pub-button pub-pick-me"
            aria-disabled={!current || undefined}
            onClick={pickForMe}
          >
            {t('booking.table.forMe')}
          </button>
        ) : null}
        <p
          className={chosenTable ? 'pub-pick-note visually-hidden' : 'pub-pick-note'}
          role="status"
        >
          {tableNote}
        </p>

        {requiredFreeBy ? (
          <label className="pub-check" htmlFor={freeById}>
            <input
              id={freeById}
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreedFor(event.currentTarget.checked ? choiceKey : null)}
            />
            <span>
              {td('book.freeBy.agree', { time: formatTime(requiredFreeBy, zone, locale) })}
            </span>
          </label>
        ) : null}

        {/* Neutral: what the venue makes of it is the server's to say, after. */}
        <p className="pub-muted">{t('manage.changing.intro')}</p>
        {unchanged ? <p className="pub-muted">{t('manage.changing.unchanged')}</p> : null}

        {/* Always mounted, so a refusal that appears is heard. */}
        <div role="status">
          {failure ? (
            <p
              className={`pub-notice ${failure.tone === 'error' ? 'pub-notice-error' : 'pub-notice-alert'}`}
            >
              {failure.text}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          className="pub-button pub-button-primary"
          disabled={!canSave}
          onClick={() => void save()}
        >
          {saving ? t('manage.changing.saving') : t('manage.changing.save')}
        </button>
        <button
          type="button"
          className="pub-button pub-button-quiet pub-button-wide"
          onClick={onClose}
        >
          {t('manage.changing.close')}
        </button>
      </div>
    </section>
  );
}
