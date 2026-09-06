import {
  bookingFailure,
  newCommandId,
  tableCopy,
  type Booking,
  type CopyLine,
  type PublicBranch,
  type TableAvailability,
  type VerifiedPhone,
} from '@yalla/api';
import { queryKeys, useGateway } from '@yalla/api/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BookingDone } from './BookingDone';
import { PhoneVerification } from './PhoneVerification';

/**
 * The whole booking flow, on the page, in one panel.
 *
 * No navigation between steps and no route changes. A visitor arrived from a
 * chat with no account and no app; pushing them through four URLs would put
 * their browser's Back button in the middle of a booking, and Back in the
 * middle of a booking is how someone ends up with two tables or none.
 *
 * The steps are the phone app's, in the phone app's order, and every sentence
 * in them comes from the phone app's copy through `tableCopy`,
 * `verificationFailureCopy` and `bookingFailure`. The one rule this panel
 * enforces itself is the ordering of the first step, and it is the important
 * one: **the availability window is shown before any confirm button exists.**
 * This product tells people how long a table is theirs rather than asking how
 * long they intend to stay, and a Reserve button above the window would make
 * that a disclosure instead of a choice.
 */
export interface BookingSheetProps {
  readonly branch: PublicBranch;
  readonly availability: TableAvailability;
  readonly slotUtc: string;
  readonly partySize: number;
  readonly onClose: () => void;
  /**
   * Someone else took the table mid-flow. The page refreshes the room and says
   * so; this panel does not, because the answer is back in the room.
   */
  readonly onTableTaken: (tableLabel: string) => void;
}

type Step = 'table' | 'verify' | 'confirm' | 'done';

export default function BookingSheet({
  branch,
  availability,
  slotUtc,
  partySize,
  onClose,
  onTableTaken,
}: BookingSheetProps) {
  const { t } = useTranslation('diner');
  const { t: tp } = useTranslation('public');
  const { locale } = useLocale();
  const gateway = useGateway();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>('table');
  const [verified, setVerified] = useState<VerifiedPhone | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  /*
   * One id per panel, reused on every retry.
   *
   * This is what makes a bad connection unable to create two bookings: the
   * server treats a repeat of the same id as the same command and returns the
   * original. Generated once per mount rather than per attempt — a fresh id on
   * retry would be a *second* booking, which is the exact failure the whole
   * mechanism exists to prevent.
   */
  const commandId = useRef(newCommandId()).current;

  const copy = tableCopy(availability, { partySize, timeZoneId: branch.timeZoneId, locale });
  const line = (value: CopyLine): string => t(value.key, value.params);

  // The panel opens under the visitor's thumb, below a room they were just
  // looking at. Moving focus into it is what makes that work with a keyboard
  // and with a screen reader, both of which otherwise stay up in the plan.
  useEffect(() => {
    panel.current?.focus();
  }, []);

  const createBooking = useMutation({
    mutationFn: (token: string) =>
      gateway.createBooking({
        commandId,
        branchId: branch.id,
        tableId: availability.tableId,
        slotUtc,
        partySize,
        verificationToken: token,
      }),
    retry: false,
  });

  const submit = useCallback(
    async (token: string) => {
      setErrorText(null);
      try {
        const created = await createBooking.mutateAsync(token);
        setBooking(created);
        setStep('done');
        // The room has changed: this table is gone, and so is the free count
        // above it. Both are read from the server rather than patched here.
        void queryClient.invalidateQueries({ queryKey: queryKeys.floor(branch.id) });
        void queryClient.invalidateQueries({ queryKey: ['availability', branch.id] });
        void queryClient.invalidateQueries({ queryKey: ['public', 'branch'] });
      } catch (error) {
        const failure = bookingFailure(error, branch.timeZoneId, locale);

        /*
         * Losing the race is an expected Friday-night outcome, not a failure
         * screen. The 409 carries the refreshed floor, so it goes straight into
         * the cache — the plan repaints without a round trip — and the panel
         * closes, because the next thing to do is pick another table and that
         * happens in the room. Never retried: this answer will not change.
         */
        if (failure.kind === 'tableTaken') {
          queryClient.setQueryData(queryKeys.floor(branch.id), failure.error.floor);
          void queryClient.invalidateQueries({ queryKey: ['availability', branch.id] });
          void queryClient.invalidateQueries({ queryKey: ['public', 'branch'] });
          onTableTaken(failure.error.tableLabel);
          onClose();
          return;
        }

        setErrorText(t(failure.line.key, failure.line.params));
      }
    },
    [createBooking, branch.id, branch.timeZoneId, locale, queryClient, onTableTaken, onClose, t],
  );

  const onVerified = useCallback((result: VerifiedPhone) => {
    setVerified(result);
    setStep('confirm');
  }, []);

  return (
    <div
      className="pub-sheet"
      role="dialog"
      aria-modal="false"
      aria-label={line(copy.title)}
      tabIndex={-1}
      ref={panel}
    >
      <div className="pub-sheet-head">
        <p className="pub-sheet-title">{line(copy.title)}</p>
        <button
          type="button"
          className="pub-button pub-button-quiet pub-button-small"
          onClick={onClose}
        >
          {t('table.close')}
        </button>
      </div>

      {step === 'table' || step === 'confirm' ? (
        <div className="pub-sheet-body">
          <p className="pub-muted">{line(copy.seats)}</p>

          {copy.unavailable ? (
            /* One line, no action. Explaining why beats a dead button. */
            <p className="pub-notice">{line(copy.unavailable)}</p>
          ) : (
            <>
              {/* The window, before the action. Always. */}
              <div className="pub-window">
                {copy.window ? (
                  <>
                    <p
                      className={
                        copy.window.isBounded ? 'pub-window-main' : 'pub-window-main is-open-ended'
                      }
                    >
                      {line(copy.window.primary)}
                    </p>
                    {copy.window.nextBooking ? (
                      <p className="pub-muted">{line(copy.window.nextBooking)}</p>
                    ) : null}
                    {copy.window.shortWindow ? (
                      <p className="pub-warn">{line(copy.window.shortWindow)}</p>
                    ) : null}
                  </>
                ) : null}
              </div>

              {copy.freeCancellation ? (
                <p className="pub-muted">{line(copy.freeCancellation)}</p>
              ) : null}
              {copy.approval ? <p className="pub-notice">{line(copy.approval)}</p> : null}

              {errorText ? <p className="pub-error">{errorText}</p> : null}

              {step === 'table' ? (
                <button
                  type="button"
                  className="pub-button pub-button-primary"
                  onClick={() => setStep(verified ? 'confirm' : 'verify')}
                >
                  {line(copy.reserve)}
                </button>
              ) : (
                <button
                  type="button"
                  className="pub-button pub-button-primary"
                  disabled={createBooking.isPending}
                  onClick={() => void submit(verified?.verificationToken ?? '')}
                >
                  {/* No optimistic success: a booking either exists on the
                      server or it does not, and telling someone they have a
                      table when they might not is the worst lie available. */}
                  {createBooking.isPending
                    ? t('confirm.submitting')
                    : copy.approval
                      ? t('confirm.requiresApproval')
                      : t('confirm.submit')}
                </button>
              )}
            </>
          )}
        </div>
      ) : null}

      {step === 'verify' ? (
        <div className="pub-sheet-body">
          <PhoneVerification onVerified={onVerified} />
        </div>
      ) : null}

      {step === 'done' && booking ? (
        <div className="pub-sheet-body">
          <BookingDone booking={booking} branch={branch} />
          <button type="button" className="pub-button pub-button-quiet" onClick={onClose}>
            {tp('booking.back')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
