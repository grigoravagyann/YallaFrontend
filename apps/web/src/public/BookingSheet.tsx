import {
  MAX_BOOKING_NOTE,
  ValidationError,
  bookingFailure,
  newCommandId,
  tableCopy,
  type Booking,
  type CopyLine,
  type PublicBranch,
  type TableAvailability,
  type VerifiedPhone,
} from '@yalla/api';
import { useCreateUnverifiedBooking, useGateway } from '@yalla/api/react';
import { formatTime } from '@yalla/format';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useId, useRef, useState, type Ref } from 'react';
import { BookingDone } from './BookingDone';
import { dayWords, freeCancellationWords, whenWords } from './dayNames';
import {
  EMPTY_PHONE,
  NO_CLOSED_DOORS,
  PhoneVerification,
  type ClosedDoors,
  type PhoneDraft,
  type VerifyStep,
} from './PhoneVerification';
import { useLangPath } from './language';
import { formatPhone } from './phone';
import { SheetHead, SheetNote, SheetProgress } from './SheetParts';
import { branchToday } from './slots';
import {
  browserDeviceId,
  keepManageToken,
  keptManageToken,
  lastKeptManageToken,
  withoutProofDoor,
} from './unverifiedBooking';

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
 * phone, Telegram first — or, where the branch takes it, on without proving
 * the number, which the name step then asks for (unverified guests,
 * 2026-10-20); the name, with an optional note to the venue; then
 * booked, waiting for the venue, or declined (`BookingDone`). A table lost to
 * somebody else while confirming is a step of its own, listing what is free at
 * the same time.
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
  readonly availability: TableAvailability;
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
/** Fewer digits than this after the country code is not a whole number (as the phone step says). */
const PHONE_MIN_DIGITS = 6;

export default function BookingSheet({
  branch,
  availability,
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
  const phoneId = useId();
  const phoneHintId = useId();
  const phoneErrorId = useId();
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
  /**
   * On without proving the number: the name step asks for it, and the booking
   * goes through the public door. Dropped once the number is proved.
   */
  const [withoutProof, setWithoutProof] = useState(false);
  /** The typed number, said under its field: too short, or not a number. */
  const [phoneError, setPhoneError] = useState<string | null>(null);
  /** The last refusal is one proving the number lifts: Telegram is offered beside it. */
  const [proofLifts, setProofLifts] = useState(false);
  /**
   * Refused because this page already made a booking without proof: its
   * manage link, the visitor's only way back to it (review S6).
   */
  const [ownLink, setOwnLink] = useState<string | null>(null);
  const langPath = useLangPath();
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
    availability.mustFreeByUtc ?? null,
  );
  const [agreedFreeBy, setAgreedFreeBy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const takenNote = useRef<HTMLDivElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const phoneInput = useRef<HTMLInputElement>(null);

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
  const [attempt, setAttempt] = useState(() => ({
    tableId: availability.tableId,
    commandId: newCommandId(),
  }));
  if (attempt.tableId !== availability.tableId) {
    setAttempt({ tableId: availability.tableId, commandId: newCommandId() });
    setRequiredFreeBy(availability.mustFreeByUtc ?? null);
    setAgreedFreeBy(false);
    setOutcomeUnknown(false);
    setErrorText(null);
    setProofLifts(false);
    setOwnLink(null);
    setLostLabel(null);
    setBooking(null);
    // The new table's window, before any button (see the module comment). A
    // visitor proving their phone carries on — a Telegram wait is not thrown
    // away — and sees the new table's step once proved.
    if (step !== 'verify') setStep('table');
  }
  const commandId = attempt.commandId;

  const copy = tableCopy(availability, { partySize, timeZoneId: branch.timeZoneId, locale });
  const line = (value: CopyLine): string => t(value.key, value.params);
  const title = line(copy.title);

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
        tableId: availability.tableId,
        slotUtc,
        // The server takes the branch's wall-clock date and time.
        timeZoneId: branch.timeZoneId,
        partySize,
        guestName: who.guestName,
        guestPhone: who.guestPhone,
        // No app, so no push channel: the server knows not to promise one.
        channel: 'web',
        ...(who.note ? { note: who.note } : {}),
        ...(requiredFreeBy && agreedFreeBy ? { acceptsFreeByUtc: requiredFreeBy } : {}),
      }),
    retry: false,
  });

  /** The public door, without proof: its answer carries the manage link once. */
  const createUnverified = useCreateUnverifiedBooking();
  const sending = createBooking.isPending || createUnverified.isPending;
  const door = withoutProofDoor(branch.policy, partySize);
  const unproved = withoutProof && !verified;

  /** What a refused or failed booking says, and where the sheet goes — for both doors. */
  const fail = useCallback(
    (error: unknown) => {
      // A 429 is the hourly budget only for a booking without proof (review S4).
      const failure = bookingFailure(error, branch.timeZoneId, locale, { unverified: unproved });

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
        setOutcomeUnknown(false);
        setErrorText(
          !time
            ? t(failure.line.key, failure.line.params)
            : date
              ? tp(table ? 'booking.overlapsOwnOn' : 'booking.overlapsOwnOnPlain', {
                  date,
                  time,
                  table,
                })
              : tp(table ? 'booking.overlapsOwn' : 'booking.overlapsOwnPlain', { time, table }),
        );
        return;
      }

      // One number, one booking: named only to its own account, with our own
      // day words (`Intl` writes hy dates in English where it has no data).
      if (failure.kind === 'phoneHasActiveBooking' && failure.error.held) {
        const { held } = failure.error;
        setOutcomeUnknown(false);
        setErrorText(
          t('confirm.error.phoneHasBookingHeld', {
            venue: held.venueName || held.branchName,
            date: dayWords(held.localDate, branchToday(branch.timeZoneId), tp).inSentence,
            time: held.localStartTime,
          }),
        );
        return;
      }

      // Not a phone number: said under the number typed.
      if (
        unproved &&
        error instanceof ValidationError &&
        (error.field?.toLowerCase() === 'guestphone' ||
          error.violations.some((violation) => violation.field.toLowerCase() === 'guestphone'))
      ) {
        setOutcomeUnknown(false);
        setPhoneError(tp('sheet.unverified.badPhone'));
        phoneInput.current?.focus();
        return;
      }

      // The limits on booking without proof, each lifted by proving the number
      // — a number somebody else booked without proof too (review N7).
      setProofLifts(
        unproved &&
          (failure.kind === 'deviceHasActiveBooking' ||
            failure.kind === 'unverifiedPartyTooLarge' ||
            failure.kind === 'unverifiedQueueFull' ||
            failure.kind === 'rateLimited' ||
            failure.kind === 'phoneHasActiveBooking' ||
            failure.kind === 'verifiedPhoneRequired'),
      );
      // This page's own booking without proof holds the browser: offer it.
      const kept = failure.kind === 'deviceHasActiveBooking' ? lastKeptManageToken() : null;
      setOwnLink(kept ? langPath(`/booking/${kept}`) : null);
      setOutcomeUnknown(failure.kind === 'unknown');
      setErrorText(t(failure.line.key, failure.line.params));
    },
    [
      branch.id,
      branch.timeZoneId,
      locale,
      queryClient,
      onTableTaken,
      t,
      tp,
      slotUtc,
      unproved,
      langPath,
    ],
  );

  /**
   * Booking without proof: the typed number and this page's id, through the
   * public door. The manage link is kept before anything else is done with
   * the answer — a retry of the same command answers without it.
   */
  const submitUnproved = useCallback(
    async (name: string) => {
      const digits = phoneDraft.local.replace(/\D/gu, '');
      if (digits.length < PHONE_MIN_DIGITS) {
        setPhoneError(tp('sheet.phone.short'));
        phoneInput.current?.focus();
        return;
      }
      try {
        const result = await createUnverified.mutateAsync({
          branchId: branch.id,
          commandId,
          tableId: availability.tableId,
          slotUtc,
          timeZoneId: branch.timeZoneId,
          partySize,
          guestName: name,
          guestPhone: `${phoneDraft.prefix.trim()}${digits}`,
          deviceId: browserDeviceId(),
          note: note.trim() || null,
          ...(requiredFreeBy && agreedFreeBy ? { acceptsFreeByUtc: requiredFreeBy } : {}),
        });
        keepManageToken(commandId, result.manageToken);
        setOutcomeUnknown(false);
        setBooking({
          ...result.booking,
          manageToken: result.manageToken ?? keptManageToken(commandId),
        });
        setStep('done');
        onBooked?.();
      } catch (error) {
        fail(error);
      }
    },
    [
      phoneDraft,
      tp,
      createUnverified,
      branch.id,
      branch.timeZoneId,
      commandId,
      availability.tableId,
      slotUtc,
      partySize,
      note,
      requiredFreeBy,
      agreedFreeBy,
      onBooked,
      fail,
    ],
  );

  const submit = useCallback(async () => {
    const name = guestName.trim();
    if (!verified && !unproved) return;
    if (!name) {
      // Said under the field, not a dead button (Book artboard).
      const live = document.activeElement === nameInput.current;
      setNameMissing(live ? 'live' : 'focused');
      if (!live) nameInput.current?.focus();
      return;
    }
    if (requiredFreeBy && !agreedFreeBy) return;
    setErrorText(null);
    setProofLifts(false);
    setOwnLink(null);
    if (!verified) {
      await submitUnproved(name);
      return;
    }
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
      fail(error);
    }
  }, [
    verified,
    unproved,
    requiredFreeBy,
    agreedFreeBy,
    guestName,
    note,
    createBooking,
    submitUnproved,
    branch.id,
    queryClient,
    onBooked,
    fail,
  ]);

  const onVerified = useCallback(
    (result: VerifiedPhone) => {
      setVerified(result);
      setWithoutProof(false);
      // Another table tapped while proving the phone: its window first.
      setStep(readTable === availability.tableId ? 'name' : 'table');
    },
    [readTable, availability.tableId],
  );

  const needsPromise = requiredFreeBy !== null && !agreedFreeBy;
  const goOn = () => {
    if (needsPromise) return;
    setErrorText(null);
    setReadTable(availability.tableId);
    if (verified) {
      setStep('name');
    } else {
      setWithoutProof(false);
      setVerifyStep('phone');
      setStep('verify');
    }
  };

  /** On without proving: the number and the name, on the name step. */
  const goOnWithoutProof = () => {
    setErrorText(null);
    setProofLifts(false);
    setPhoneError(null);
    setWithoutProof(true);
    setStep('name');
  };

  /**
   * From a refusal proving the number lifts, to Telegram — a new attempt: the
   * unproved one was refused, and a verified booking is another command.
   */
  const proveInstead = () => {
    setErrorText(null);
    setProofLifts(false);
    setWithoutProof(false);
    setAttempt({ tableId: availability.tableId, commandId: newCommandId() });
    setVerifyStep('phone');
    setStep('verify');
  };

  const back =
    step === 'verify'
      ? () => (verifyStep === 'phone' ? setStep('table') : setVerifyStep('phone'))
      : step === 'name'
        ? () => {
            setWithoutProof(false);
            setErrorText(null);
            setProofLifts(false);
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
  const seats = tp('booking.seats', { count: availability.seats });
  const tableValue = roomName
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
          {progress === null ? null : <SheetProgress step={progress} />}

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

                {copy.unavailable ? (
                  /* One line, no action. Explaining why beats a dead button. */
                  <SheetNote tone="amber">{line(copy.unavailable)}</SheetNote>
                ) : (
                  <>
                    {/* The window, before the action. Always. */}
                    {copy.window ? (
                      <SheetNote tone="green">
                        <p>{line(copy.window.primary)}</p>
                        {copy.window.nextBooking ? <p>{line(copy.window.nextBooking)}</p> : null}
                      </SheetNote>
                    ) : null}
                    {copy.window?.shortWindow ? (
                      <SheetNote tone="amber">{line(copy.window.shortWindow)}</SheetNote>
                    ) : null}
                    {copy.approval ? (
                      <SheetNote tone="amber">{line(copy.approval)}</SheetNote>
                    ) : null}

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

                    {availability.freeCancellationUntilUtc ? (
                      <div className="pub-sheet-terms">
                        <p className="pub-muted">
                          {freeCancellationWords(
                            availability.freeCancellationUntilUtc,
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
              {copy.unavailable ? null : (
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

          {step === 'taken' && lostLabel ? (
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
              onDoorClosed={(shut) => setClosedDoors((closed) => ({ ...closed, [shut]: true }))}
              withoutProof={door}
              onWithoutProof={goOnWithoutProof}
            />
          ) : null}

          {step === 'name' && (verified || unproved) ? (
            <form
              className="pub-sheet-step"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                if (!sending) void submit();
              }}
            >
              <div className="pub-sheet-body">
                {verified ? (
                  <SheetNote tone="green">
                    {tp('sheet.name.verified', { phone: formatPhone(verified.phoneE164) })}
                  </SheetNote>
                ) : (
                  <>
                    {/* Before the number, what going without proof means here. */}
                    <SheetNote tone="amber">
                      {tp(
                        door?.needsApproval !== false
                          ? 'sheet.unverified.note'
                          : 'sheet.unverified.noteNoApproval',
                      )}
                    </SheetNote>
                    <div className="pub-sheet-field">
                      <label htmlFor={phoneId}>{t('verify.phoneLabel')}</label>
                      <div className="pub-phone-row">
                        <input
                          className="pub-input pub-input-prefix"
                          value={phoneDraft.prefix}
                          onChange={(event) => {
                            setPhoneDraft({ ...phoneDraft, prefix: event.currentTarget.value });
                            setPhoneError(null);
                          }}
                          inputMode="tel"
                          autoComplete="tel-country-code"
                          maxLength={5}
                          aria-label={t('verify.countryCode')}
                        />
                        <input
                          id={phoneId}
                          ref={phoneInput}
                          className={phoneError ? 'pub-input is-bad' : 'pub-input'}
                          value={phoneDraft.local}
                          onChange={(event) => {
                            setPhoneDraft({ ...phoneDraft, local: event.currentTarget.value });
                            setPhoneError(null);
                          }}
                          placeholder={t('verify.phonePlaceholder')}
                          inputMode="tel"
                          autoComplete="tel-national"
                          aria-invalid={phoneError ? true : undefined}
                          aria-describedby={
                            phoneError ? `${phoneErrorId} ${phoneHintId}` : phoneHintId
                          }
                        />
                      </div>
                      <p className="pub-muted" id={phoneHintId}>
                        {tp('sheet.unverified.phoneHint')}
                      </p>
                      {phoneError ? (
                        <p className="pub-field-error" id={phoneErrorId}>
                          {phoneError}
                        </p>
                      ) : null}
                    </div>
                  </>
                )}

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
                    {tp('sheet.name.note')}{' '}
                    <span className="pub-field-optional">{tp('sheet.name.optional')}</span>
                  </label>
                  <textarea
                    id={noteId}
                    className="pub-input pub-textarea"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={NOTE_MAX}
                    placeholder={tp('sheet.name.notePlaceholder')}
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
                {copy.approval ? <SheetNote tone="amber">{line(copy.approval)}</SheetNote> : null}

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
                  aria-disabled={sending || undefined}
                >
                  {/* No optimistic success: a booking either exists on the
                      server or it does not, and telling someone they have a
                      table when they might not is the worst lie available. */}
                  {sending
                    ? t('confirm.submitting')
                    : outcomeUnknown
                      ? t('confirm.checkAgain')
                      : copy.approval || (unproved && door?.needsApproval !== false)
                        ? t('confirm.requiresApproval')
                        : t('confirm.submit')}
                </button>
                {/* The booking this page made already: the way back to it. */}
                {unproved && ownLink ? (
                  <a className="pub-button" href={ownLink}>
                    {tp('sheet.unverified.openYours')}
                  </a>
                ) : null}
                {/* Refused for want of proof: the door that lifts it. */}
                {unproved && proofLifts ? (
                  <button
                    type="button"
                    className="pub-button pub-button-telegram"
                    onClick={proveInstead}
                  >
                    {tp('sheet.unverified.verifyInstead')}
                  </button>
                ) : null}
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

/**
 * "Tue 20 October" for a branch day (`YYYY-MM-DD`) that is not the day of
 * `slotUtc` on the branch's calendar; `null` for the same day, or none given.
 * Our own words, as the rest of the sheet's dates (`dayNames.ts`).
 */
function otherBranchDay(
  localDate: string | null,
  slotUtc: string,
  timeZoneId: string,
  t: Parameters<typeof dayWords>[2],
): string | null {
  if (!localDate || !/^\d{4}-\d{2}-\d{2}$/u.test(localDate)) return null;
  const today = branchToday(timeZoneId);
  if (localDate === branchToday(timeZoneId, new Date(slotUtc))) return null;
  return dayWords(localDate, today, t).inSentence;
}
