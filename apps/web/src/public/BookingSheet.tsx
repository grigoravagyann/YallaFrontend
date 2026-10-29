import {
  MAX_BOOKING_NOTE,
  approvalCopy,
  bookingFailure,
  newCommandId,
  tableCopy,
  timeFullGuestsLeft,
  type Booking,
  type CopyLine,
  type PublicBranch,
  type TableAvailability,
  type VerifiedPhone,
} from '@yalla/api';
import { useGateway } from '@yalla/api/react';
import { formatTime } from '@yalla/format';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useId, useRef, useState, type Ref } from 'react';
import { BookingDone } from './BookingDone';
import { freeCancellationWords, whenWords } from './dayNames';
import {
  EMPTY_PHONE,
  NO_CLOSED_DOORS,
  PhoneVerification,
  type ClosedDoors,
  type PhoneDraft,
  type VerifyStep,
} from './PhoneVerification';
import { formatPhone } from './phone';
import { numberRuleWords, otherBranchDay, overlapElsewhereWords } from './refusalWords';
import { SheetHead, SheetNote, SheetProgress } from './SheetParts';

/**
 * The whole booking flow, on the page, in one sheet (Book artboard).
 *
 * No navigation between steps and no route changes. A visitor arrived from a
 * chat with no account and no app; pushing them through four URLs would put
 * their browser's Back button in the middle of a booking, and Back in the
 * middle of a booking is how someone ends up with two tables or none. The
 * sheet's own Back, in its head, goes one step back instead.
 *
 * The steps, under a progress line (Table · Phone · Name): the table, with the
 * window it is held for and the promise to free it by the next booking; the
 * phone, Telegram first — always proved: there is no booking without a proved
 * number (guest record, 2026-10-20); the name, with an optional note to the
 * venue and a line on what venues see of the visitor's record; then booked,
 * waiting for the venue, or declined (`BookingDone`). A table lost to somebody
 * else while confirming is a step of its own, listing what is free at the same
 * time.
 *
 * At a branch that books by time only (2026-10-29) there is no table: the
 * first step is the time and the party, with "the venue chooses your table
 * when you arrive" where the table would be, and the note is a wish ("by the
 * window"). A time that filled up meanwhile (`409 time-full`) says how many it
 * could still take; the visitor picks another time or fewer guests on the card.
 *
 * Every sentence about the table comes from the phone app's copy through
 * `tableCopy`, `verificationFailureCopy` and `bookingFailure`. The one rule
 * this sheet enforces itself is the ordering of the first step, and it is the
 * important one: **the availability window is shown before any button.** This
 * product tells people how long a table is theirs rather than asking how long
 * they intend to stay, and a button above the window would make that a
 * disclosure instead of a choice.
 */

/** A table the taken step offers instead: free at the same time, for the same party. */
export interface SheetTable {
  readonly availability: TableAvailability;
  readonly roomName: string | null;
}

export interface BookingSheetProps {
  readonly branch: PublicBranch;
  /** The table's answer at the slot; `null` at a branch that books by time only. */
  readonly availability: TableAvailability | null;
  /**
   * Booking by time only: the chosen time waits for the venue's answer (short
   * notice, a large party, a venue that confirms every booking). The table's
   * answer says so itself otherwise.
   */
  readonly requiresApproval?: boolean | undefined;
  /** The room the table is in, for the summary. */
  readonly roomName?: string | null | undefined;
  readonly slotUtc: string;
  readonly partySize: number;
  readonly onClose: () => void;
  /**
   * Someone else took the table mid-flow. The sheet stays open on the taken
   * step; the page lets the table go, and says so where the sheet was once
   * the visitor closes it.
   */
  readonly onTableTaken: (tableLabel: string) => void;
  /**
   * The free tables at the same slot, from the room's answer the page already
   * holds — no new read. Offered on the taken step.
   */
  readonly alternatives?: readonly SheetTable[] | undefined;
  /** A table picked on the taken step: the page makes it the sheet's table, a new attempt. */
  readonly onPickTable?: ((availability: TableAvailability) => void) | undefined;
  /**
   * The booking was made. The page then knows its table is not free because of
   * this visitor, which is not a table lost (public page phase 3, review S1).
   */
  readonly onBooked?: (() => void) | undefined;
  /** Declined by the venue: close, and take the visitor to the card for another time. */
  readonly onChooseAnotherTime?: (() => void) | undefined;
}

type Step = 'table' | 'taken' | 'verify' | 'name' | 'done';

/** The longest note the sheet takes: what the server keeps, as the app takes (review N12). */
const NOTE_MAX = MAX_BOOKING_NOTE;
/** How many free tables the taken step lists; the room shows them all. */
const ALTERNATIVES_SHOWN = 6;
/** What the visitor last went on from when there is no table: the time itself. */
const TIME_ONLY = 'time';

export default function BookingSheet({
  branch,
  availability,
  requiresApproval = false,
  roomName = null,
  slotUtc,
  partySize,
  onClose,
  onTableTaken,
  alternatives = [],
  onPickTable,
  onBooked,
  onChooseAnotherTime,
}: BookingSheetProps) {
  const { t } = useTranslation('diner');
  const { t: tp } = useTranslation('public');
  const nameId = useId();
  const nameErrorId = useId();
  const nameHintId = useId();
  const noteId = useId();
  const noteHintId = useId();
  const continueHintId = useId();
  const { locale } = useLocale();
  const gateway = useGateway();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>('table');
  const [verifyStep, setVerifyStep] = useState<VerifyStep>('phone');
  const [phoneDraft, setPhoneDraft] = useState<PhoneDraft>(EMPTY_PHONE);
  const [verified, setVerified] = useState<VerifiedPhone | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  /** The name the venue asks for at the door. Required by the server. */
  const [guestName, setGuestName] = useState('');
  /**
   * No name given. `live`: the field already had the focus (Enter in it), so
   * the line is an alert; otherwise the focus moves to the field, which reads
   * it through `aria-describedby` — said once (review N1).
   */
  const [nameMissing, setNameMissing] = useState<false | 'live' | 'focused'>(false);
  /** A door the backend refused: closed until the sheet closes (review N2). */
  const [closedDoors, setClosedDoors] = useState<ClosedDoors>(NO_CLOSED_DOORS);
  /** What the visitor tells the venue: a birthday, a high chair. Optional. */
  const [note, setNote] = useState('');
  /** The last attempt may have committed, so the button checks rather than books. */
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  /** The table somebody else took, while the taken step shows. */
  const [lostLabel, setLostLabel] = useState<string | null>(null);
  /** The table whose step the visitor last went on from: its window was read. */
  const [readTable, setReadTable] = useState<string | null>(null);
  /*
   * Booking times: a booking follows on this table, so the sitting is cut to
   * the next one's start less the clearing time, and the visitor agrees to
   * free it by then before anything is sent — the server refuses without it.
   * The server's own time replaces the room's when they disagree.
   */
  const [requiredFreeBy, setRequiredFreeBy] = useState<string | null>(
    availability?.mustFreeByUtc ?? null,
  );
  const [agreedFreeBy, setAgreedFreeBy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const takenNote = useRef<HTMLDivElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  /*
   * One id per attempt, reused on every retry of it.
   *
   * This is what makes a bad connection unable to create two bookings: the
   * server treats a repeat of the same id as the same command and returns the
   * original. A fresh id on retry would be a *second* booking, which is the
   * exact failure the whole mechanism exists to prevent.
   *
   * An attempt is one table. The sheet stays open when the visitor taps
   * another table in the room — beside it on a desktop — or picks one on the
   * taken step, and that is a new attempt: under the old id the server would
   * replay the first table's booking, or refuse the id as in use. So a new
   * table gets a new id and its own free-by question, and loses the last
   * attempt's error and "check again", and goes back to the table step; the
   * verified phone, the name and the note carry over, because they are the
   * visitor's, not the table's. Adjusted during render, React's pattern for
   * state that follows a prop, so no frame shows the new table with the old
   * attempt's state.
   */
  const tableId = availability?.tableId ?? null;
  const [attempt, setAttempt] = useState(() => ({
    tableId,
    commandId: newCommandId(),
  }));
  if (attempt.tableId !== tableId) {
    setAttempt({ tableId, commandId: newCommandId() });
    setRequiredFreeBy(availability?.mustFreeByUtc ?? null);
    setAgreedFreeBy(false);
    setOutcomeUnknown(false);
    setErrorText(null);
    setLostLabel(null);
    setBooking(null);
    // The new table's window, before any button (see the module comment). A
    // visitor proving their phone carries on — a Telegram wait is not thrown
    // away — and sees the new table's step once proved.
    if (step !== 'verify') setStep('table');
  }
  const commandId = attempt.commandId;

  // No table to describe when booking by time only: the time and the party are the booking.
  const copy = availability
    ? tableCopy(availability, { partySize, timeZoneId: branch.timeZoneId, locale })
    : null;
  const line = (value: CopyLine): string => t(value.key, value.params);
  const title = copy ? line(copy.title) : tp('sheet.title.time');
  const approval = copy ? copy.approval : approvalCopy(requiresApproval);
  // By time only, the published deadline before the start stands in for the table's.
  const freeCancellationUntilUtc = availability
    ? availability.freeCancellationUntilUtc
    : new Date(
        Date.parse(slotUtc) - branch.policy.cancellationDeadlineMinutes * 60_000,
      ).toISOString();

  /*
   * Each step opens on its title, so the keyboard and a screen reader start
   * there — except the code, whose field takes the focus itself, and the
   * taken step, whose red line does.
   */
  useEffect(() => {
    if (step === 'done') return;
    if (step === 'verify' && verifyStep === 'code') return;
    if (step === 'taken') takenNote.current?.focus();
    else heading.current?.focus();
  }, [step, verifyStep]);

  const createBooking = useMutation({
    mutationFn: (who: {
      readonly guestPhone: string;
      readonly guestName: string;
      readonly note: string | null;
    }) =>
      gateway.createBooking({
        commandId,
        branchId: branch.id,
        // None by time only: the venue chooses the table when the party arrives.
        tableId,
        slotUtc,
        // The server takes the branch's wall-clock date and time.
        timeZoneId: branch.timeZoneId,
        partySize,
        guestName: who.guestName,
        guestPhone: who.guestPhone,
        // The public page's own route (2026-10-27), and no push channel: the
        // server knows not to promise one.
        channel: 'web',
        ...(who.note ? { note: who.note } : {}),
        ...(requiredFreeBy && agreedFreeBy ? { acceptsFreeByUtc: requiredFreeBy } : {}),
      }),
    retry: false,
  });

  const submit = useCallback(async () => {
    const name = guestName.trim();
    if (!verified) return;
    if (!name) {
      // Said under the field, not a dead button (Book artboard).
      const live = document.activeElement === nameInput.current;
      setNameMissing(live ? 'live' : 'focused');
      if (!live) nameInput.current?.focus();
      return;
    }
    if (requiredFreeBy && !agreedFreeBy) return;
    setErrorText(null);
    try {
      const created = await createBooking.mutateAsync({
        guestPhone: verified.phoneE164,
        guestName: name,
        note: note.trim() || null,
      });
      setBooking(created);
      setStep('done');
      onBooked?.();
      // The room has changed: this table is gone, and so is the free count
      // above it. Both are read from the server rather than patched here.
      void queryClient.invalidateQueries({ queryKey: ['availability', branch.id] });
      void queryClient.invalidateQueries({ queryKey: ['public', 'branch'] });
    } catch (error) {
      /*
       * By time only, the time filled up between the card and this tap: how
       * many it could still take, and the visitor changes the time or the
       * party on the card. Nothing to retry with the same choices.
       */
      const guestsLeft = timeFullGuestsLeft(error);
      if (guestsLeft !== null) {
        void queryClient.invalidateQueries({ queryKey: ['availability', branch.id] });
        setOutcomeUnknown(false);
        setErrorText(
          guestsLeft > 0 ? tp('sheet.time.full', { count: guestsLeft }) : tp('sheet.time.fullNone'),
        );
        return;
      }

      // The place being booked: an overlap elsewhere names the other one.
      const here = { venueName: branch.venue.name, branchName: branch.name };
      const failure = bookingFailure(error, branch.timeZoneId, locale, { here });

      /*
       * Losing the race is an expected Friday-night outcome, not a failure
       * screen. The room is told to redraw — every slot-aware read of the
       * branch sits under `['availability', branchId]` — and the sheet turns
       * to the taken step: what else is free at this time, from the room's
       * answer, with the day, time and party kept. Never retried: this answer
       * will not change.
       */
      if (failure.kind === 'tableTaken') {
        void queryClient.invalidateQueries({ queryKey: ['availability', branch.id] });
        void queryClient.invalidateQueries({ queryKey: ['public', 'branch'] });
        setOutcomeUnknown(false);
        setLostLabel(failure.error.tableLabel);
        setStep('taken');
        onTableTaken(failure.error.tableLabel);
        return;
      }

      // A booking landed meanwhile: the table now needs the promise, or a
      // different time for it. Back to the table step to ask again, unticked,
      // with the server's time.
      if (failure.kind === 'freeByRequired') {
        setOutcomeUnknown(false);
        if (failure.requiredFreeByUtc) setRequiredFreeBy(failure.requiredFreeByUtc);
        setAgreedFreeBy(false);
        setErrorText(t(failure.line.key, failure.line.params));
        setStep('table');
        return;
      }

      // One table at a time per visitor: said with the booking they already
      // hold, and nothing about this table changed — the sheet stays.
      if (failure.kind === 'overlapsOwn') {
        const { localStartTime: time, tableLabel: table } = failure.error;
        // Its day too when it is not the one being booked: last night's 23:30.
        const date = otherBranchDay(failure.error.localDate, slotUtc, branch.timeZoneId, tp);
        // At another venue or branch, half an hour apart: that place named.
        const elsewhere = overlapElsewhereWords(
          failure.error,
          here,
          slotUtc,
          branch.timeZoneId,
          tp,
        );
        setOutcomeUnknown(false);
        setErrorText(
          elsewhere ??
            (!time
              ? t(failure.line.key, failure.line.params)
              : date
                ? tp(table ? 'booking.overlapsOwnOn' : 'booking.overlapsOwnOnPlain', {
                    date,
                    time,
                    table,
                  })
                : tp(table ? 'booking.overlapsOwn' : 'booking.overlapsOwnPlain', { time, table })),
        );
        return;
      }

      // Three bookings held, or blocked for no-shows: the next booking named,
      // or until when — in our own day words (`Intl` writes hy dates in English
      // where it has no data). Nothing to retry; the sheet stays.
      const numberRule = numberRuleWords(failure, branch.timeZoneId, locale, tp);
      if (numberRule) {
        setOutcomeUnknown(false);
        setErrorText(numberRule);
        return;
      }

      setOutcomeUnknown(failure.kind === 'unknown');
      setErrorText(t(failure.line.key, failure.line.params));
    }
  }, [
    verified,
    requiredFreeBy,
    agreedFreeBy,
    guestName,
    note,
    createBooking,
    branch.id,
    branch.timeZoneId,
    branch.venue.name,
    branch.name,
    locale,
    queryClient,
    onTableTaken,
    onBooked,
    t,
    tp,
    slotUtc,
  ]);

  const onVerified = useCallback(
    (result: VerifiedPhone) => {
      setVerified(result);
      // Another table tapped while proving the phone: its window first.
      setStep(readTable === (tableId ?? TIME_ONLY) ? 'name' : 'table');
    },
    [readTable, tableId],
  );

  const needsPromise = requiredFreeBy !== null && !agreedFreeBy;
  const goOn = () => {
    if (needsPromise) return;
    setErrorText(null);
    setReadTable(tableId ?? TIME_ONLY);
    if (verified) {
      setStep('name');
    } else {
      setVerifyStep('phone');
      setStep('verify');
    }
  };

  const back =
    step === 'verify'
      ? () => (verifyStep === 'phone' ? setStep('table') : setVerifyStep('phone'))
      : step === 'name'
        ? () => {
            setVerifyStep('phone');
            setStep('verify');
          }
        : undefined;

  const progress = step === 'table' ? 0 : step === 'verify' ? 1 : step === 'name' ? 2 : null;
  const headTitle =
    step === 'table'
      ? title
      : step === 'taken'
        ? tp('sheet.title.taken')
        : step === 'verify'
          ? tp(`sheet.title.${verifyStep}`)
          : tp('sheet.title.name');

  const guestsCount = String(partySize);
  const seats = availability ? tp('booking.seats', { count: availability.seats }) : '';
  const tableValue = !availability
    ? tp('sheet.time.onArrival')
    : roomName
      ? tp('sheet.table.value', { label: availability.tableLabel, seats, room: roomName })
      : tp('sheet.table.valueNoRoom', { label: availability.tableLabel, seats });
  const when = whenWords(slotUtc, branch.timeZoneId, locale, tp);
  const freeByTime = requiredFreeBy ? formatTime(requiredFreeBy, branch.timeZoneId, locale) : null;

  return (
    <div className="pub-sheet" role="dialog" aria-modal="false" aria-label={title} tabIndex={-1}>
      <div className="pub-sheet-grab" aria-hidden="true" />
      {step === 'done' && booking ? (
        <BookingDone
          booking={booking}
          branch={branch}
          onClose={onClose}
          onChooseAnotherTime={onChooseAnotherTime}
        />
      ) : (
        <>
          <SheetHead title={headTitle} headingRef={heading} onBack={back} onClose={onClose} />
          {progress === null ? null : <SheetProgress step={progress} timeOnly={!availability} />}

          {step === 'table' ? (
            <div className="pub-sheet-step">
              <div className="pub-sheet-body">
                <dl className="pub-sum">
                  <div>
                    <dt>{t('confirm.when')}</dt>
                    <dd>{when}</dd>
                  </div>
                  <div>
                    <dt>{t('confirm.party')}</dt>
                    <dd>{guestsCount}</dd>
                  </div>
                  <div>
                    <dt>{t('confirm.tableRow')}</dt>
                    <dd>{tableValue}</dd>
                  </div>
                </dl>

                {copy?.unavailable ? (
                  /* One line, no action. Explaining why beats a dead button. */
                  <SheetNote tone="amber">{line(copy.unavailable)}</SheetNote>
                ) : (
                  <>
                    {/* The window, before the action. Always. */}
                    {copy?.window ? (
                      <SheetNote tone="green">
                        <p>{line(copy.window.primary)}</p>
                        {copy.window.nextBooking ? <p>{line(copy.window.nextBooking)}</p> : null}
                      </SheetNote>
                    ) : null}
                    {copy?.window?.shortWindow ? (
                      <SheetNote tone="amber">{line(copy.window.shortWindow)}</SheetNote>
                    ) : null}
                    {/* By time only: how long the sitting is, as a table's window would say. */}
                    {!availability ? (
                      <SheetNote tone="green">
                        {tp('sheet.time.sitting', { count: branch.policy.turnTimeMinutes })}
                      </SheetNote>
                    ) : null}
                    {approval ? <SheetNote tone="amber">{line(approval)}</SheetNote> : null}

                    {errorText ? (
                      <p className="pub-field-error" role="alert">
                        {errorText}
                      </p>
                    ) : null}

                    {/* A booking follows: the promise, asked for before any send. */}
                    {requiredFreeBy && freeByTime ? (
                      <label className={agreedFreeBy ? 'pub-promise is-on' : 'pub-promise'}>
                        <input
                          type="checkbox"
                          checked={agreedFreeBy}
                          onChange={(event) => setAgreedFreeBy(event.currentTarget.checked)}
                        />
                        <span>{tp('sheet.table.agree', { time: freeByTime })}</span>
                      </label>
                    ) : null}

                    {freeCancellationUntilUtc ? (
                      <div className="pub-sheet-terms">
                        <p className="pub-muted">
                          {freeCancellationWords(
                            freeCancellationUntilUtc,
                            branch.timeZoneId,
                            locale,
                            tp,
                          )}
                        </p>
                        <p className="pub-muted">{tp('sheet.table.lateOk')}</p>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
              {copy?.unavailable ? null : (
                <div className="pub-sheet-foot">
                  <button
                    type="button"
                    className="pub-button pub-button-primary"
                    aria-disabled={needsPromise || undefined}
                    aria-describedby={needsPromise ? continueHintId : undefined}
                    onClick={goOn}
                  >
                    {tp('sheet.table.continue')}
                  </button>
                  {needsPromise ? (
                    <p className="pub-muted pub-sheet-hint" id={continueHintId}>
                      {tp('sheet.table.agreeFirst')}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {step === 'taken' && lostLabel && availability ? (
            <TakenStep
              lostLabel={lostLabel}
              lostTableId={availability.tableId}
              partySize={partySize}
              alternatives={alternatives}
              noteRef={takenNote}
              onPick={onPickTable}
              onSeeRoom={onClose}
            />
          ) : null}

          {step === 'verify' ? (
            <PhoneVerification
              step={verifyStep}
              onStepChange={setVerifyStep}
              number={phoneDraft}
              onNumberChange={setPhoneDraft}
              onVerified={onVerified}
              closedDoors={closedDoors}
              onDoorClosed={(door) => setClosedDoors((closed) => ({ ...closed, [door]: true }))}
            />
          ) : null}

          {step === 'name' && verified ? (
            <form
              className="pub-sheet-step"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                if (!createBooking.isPending) void submit();
              }}
            >
              <div className="pub-sheet-body">
                <SheetNote tone="green">
                  {tp('sheet.name.verified', { phone: formatPhone(verified.phoneE164) })}
                </SheetNote>

                <div className="pub-sheet-field">
                  <label htmlFor={nameId}>{tp('sheet.name.label')}</label>
                  <input
                    id={nameId}
                    ref={nameInput}
                    className={nameMissing ? 'pub-input is-bad' : 'pub-input'}
                    value={guestName}
                    onChange={(event) => {
                      setGuestName(event.target.value);
                      setNameMissing(false);
                    }}
                    maxLength={200}
                    autoComplete="name"
                    aria-invalid={nameMissing ? true : undefined}
                    aria-describedby={nameMissing ? `${nameErrorId} ${nameHintId}` : nameHintId}
                  />
                  <p className="pub-muted" id={nameHintId}>
                    {tp('sheet.name.hint')}
                  </p>
                  {nameMissing ? (
                    <p
                      className="pub-field-error"
                      id={nameErrorId}
                      role={nameMissing === 'live' ? 'alert' : undefined}
                    >
                      {tp('sheet.name.missing')}
                    </p>
                  ) : null}
                </div>

                <div className="pub-sheet-field">
                  <label htmlFor={noteId}>
                    {tp(availability ? 'sheet.name.note' : 'sheet.name.wish')}{' '}
                    <span className="pub-field-optional">{tp('sheet.name.optional')}</span>
                  </label>
                  <textarea
                    id={noteId}
                    className="pub-input pub-textarea"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={NOTE_MAX}
                    placeholder={tp(
                      availability ? 'sheet.name.notePlaceholder' : 'sheet.name.wishPlaceholder',
                    )}
                    aria-describedby={noteHintId}
                  />
                  <p className="pub-muted" id={noteHintId}>
                    {tp('sheet.name.noteHint', { length: note.length, max: NOTE_MAX })}
                  </p>
                </div>

                <dl className="pub-sum">
                  <div>
                    <dt>{t('confirm.when')}</dt>
                    <dd>{when}</dd>
                  </div>
                  <div>
                    <dt>{t('confirm.party')}</dt>
                    <dd>{guestsCount}</dd>
                  </div>
                  <div>
                    <dt>{t('confirm.tableRow')}</dt>
                    <dd>{tableValue}</dd>
                  </div>
                  {requiredFreeBy && agreedFreeBy && freeByTime ? (
                    <div>
                      <dt>{tp('sheet.name.freeBy')}</dt>
                      <dd>{freeByTime}</dd>
                    </div>
                  ) : null}
                </dl>
                {approval ? <SheetNote tone="amber">{line(approval)}</SheetNote> : null}

                {/* Said before the booking is sent: venues see the visitor's
                    record — counts over twelve months, never where (guest record). */}
                <div className="pub-sheet-terms">
                  <p className="pub-muted">{tp('sheet.name.record')}</p>
                  {/* The page's cached plan: whether this branch takes pre-orders
                      (2026-10-21). The done step offers one once booked. */}
                  {branch.policy.acceptsPreOrders ? (
                    <p className="pub-muted">{tp('sheet.name.preOrders')}</p>
                  ) : null}
                </div>

                {errorText ? (
                  <p className="pub-field-error" role="alert">
                    {errorText}
                  </p>
                ) : null}
              </div>
              <div className="pub-sheet-foot">
                <button
                  type="submit"
                  className="pub-button pub-button-primary"
                  aria-disabled={createBooking.isPending || undefined}
                >
                  {/* No optimistic success: a booking either exists on the
                      server or it does not, and telling someone they have a
                      table when they might not is the worst lie available. */}
                  {createBooking.isPending
                    ? t('confirm.submitting')
                    : outcomeUnknown
                      ? t('confirm.checkAgain')
                      : approval
                        ? t('confirm.requiresApproval')
                        : t('confirm.submit')}
                </button>
              </div>
            </form>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * The table went to somebody else while confirming (Book artboard, taken).
 * What is free at the same time for the same party, from the room's answer
 * the page already holds — tapping one is a new attempt on it — and the way
 * back to the room for everything else.
 */
function TakenStep({
  lostLabel,
  lostTableId,
  partySize,
  alternatives,
  noteRef,
  onPick,
  onSeeRoom,
}: {
  readonly lostLabel: string;
  readonly lostTableId: string;
  readonly partySize: number;
  readonly alternatives: readonly SheetTable[];
  readonly noteRef: Ref<HTMLDivElement>;
  readonly onPick: ((availability: TableAvailability) => void) | undefined;
  readonly onSeeRoom: () => void;
}) {
  const { t } = useTranslation('public');
  const listId = useId();
  /*
   * The order as the step opened: the room answers again a moment after the
   * 409, and a list re-sorting under a finger moves the table about to be
   * tapped (review N4). Tables that went drop out; any new one goes last.
   */
  const [order] = useState(() => alternatives.map((entry) => entry.availability.tableId));
  const rank = (entry: SheetTable) => {
    const at = order.indexOf(entry.availability.tableId);
    return at < 0 ? order.length : at;
  };
  // Never the table just lost, whatever an answer read before the loss says.
  const free = alternatives
    .filter((entry) => entry.availability.tableId !== lostTableId)
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, ALTERNATIVES_SHOWN);
  return (
    <div className="pub-sheet-step">
      <div className="pub-sheet-body">
        <SheetNote tone="red" noteRef={noteRef}>
          {t('sheet.taken.body', { label: lostLabel })}
        </SheetNote>
        {free.length > 0 && onPick ? (
          <>
            <h3 className="pub-sheet-sub" id={listId}>
              {t('sheet.taken.free')}
            </h3>
            <ul className="pub-alts" aria-labelledby={listId}>
              {free.map(({ availability, roomName }) => (
                <li key={availability.tableId}>
                  <button type="button" className="pub-alt" onClick={() => onPick(availability)}>
                    <span className="pub-alt-badge" aria-hidden="true">
                      {availability.tableLabel}
                    </span>
                    <span>
                      <b>
                        {t('sheet.taken.alt', {
                          label: availability.tableLabel,
                          seats: t('booking.seats', { count: availability.seats }),
                        })}
                      </b>
                      {roomName ? <span>{roomName}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="pub-muted">{t('sheet.taken.none', { count: partySize })}</p>
        )}
      </div>
      <div className="pub-sheet-foot">
        <button type="button" className="pub-button" onClick={onSeeRoom}>
          {t('sheet.taken.seeRoom')}
        </button>
      </div>
    </div>
  );
}
