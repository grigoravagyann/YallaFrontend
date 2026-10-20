import {
  ConcurrencyConflictError,
  LIFT_REASON_MAX,
  LIFT_REASON_MIN,
  type BookingBlock,
} from '@yalla/api';
import { useBookingBlocks, useLiftBookingBlock } from '@yalla/api/react';
import { formatDayAndTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Dialog } from '../ui/Dialog';
import { LockIcon } from '../ui/icons';
import { useToast } from '../ui/toast';

/** Every venue in the pilot is in Yerevan, as Home's other dates are. */
const CONSOLE_TIME_ZONE = 'Asia/Yerevan';

/**
 * Guests blocked from booking for no-shows (guest record, 2026-10-20), on
 * Home: three no-shows in three days block booking for a week and cancel the
 * guest's bookings still to come. Nobody can undo that but the platform admin,
 * and the one reason to is a venue that marked a no-show by mistake.
 *
 * Only while a block is in force: an empty card on every visit is a card
 * nobody reads when it matters. A list that could not be read says so.
 *
 * Lifting asks for a reason (3 to 500 characters, kept in the activity log)
 * and says plainly what it does not do: the bookings the block cancelled stay
 * cancelled. The guest is told they can book again.
 */
export function BookingBlocksCard() {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const titleId = useId();
  const query = useBookingBlocks();
  const [lifting, setLifting] = useState<BookingBlock | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const blocks = query.data ?? [];

  if (!query.isError && blocks.length === 0) return null;

  const nameOf = (block: BookingBlock) => block.dinerDisplayName ?? t('home.blocks.noName');

  return (
    <section className="yc-card" aria-labelledby={titleId}>
      <div className="yc-card-h">
        <div>
          <h2 className="yc-h2" id={titleId}>
            {t('home.blocks.title')}
          </h2>
          <p className="yc-cap">{t('home.blocks.cap')}</p>
        </div>
      </div>
      {query.isError ? (
        <div className="yc-alert yc-ov-pad" role="alert">
          <span className="yc-grow">{t('home.blocks.failed')}</span>
          <button
            type="button"
            className="yc-btn yc-btn-sec yc-btn-sm"
            onClick={() => void query.refetch()}
          >
            {t('home.retry')}
          </button>
        </div>
      ) : (
        <ul className="yc-blocks">
          {blocks.map((block) => {
            const until = formatDayAndTime(block.blockedUntilUtc, CONSOLE_TIME_ZONE, locale);
            return (
              <li key={block.blockId}>
                <LockIcon className="yc-i yc-blocks-i" />
                <span className="yc-grow yc-blocks-who">
                  <b>{nameOf(block)}</b>
                  {block.phoneE164 ? <span className="yc-mono">{block.phoneE164}</span> : null}
                  <span className="yc-muted yc-small">
                    {t('home.blocks.until', { date: until.date, time: until.time })}
                  </span>
                </span>
                <button
                  type="button"
                  className="yc-btn yc-btn-sec yc-btn-sm"
                  aria-label={t('home.blocks.liftLabel', { name: nameOf(block) })}
                  onClick={(event) => {
                    opener.current = event.currentTarget;
                    setLifting(block);
                  }}
                >
                  {t('home.blocks.lift')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {lifting ? (
        <LiftDialog
          block={lifting}
          name={nameOf(lifting)}
          onClose={() => setLifting(null)}
          returnFocusTo={() =>
            opener.current?.isConnected ? opener.current : document.getElementById(titleId)
          }
        />
      ) : null}
    </section>
  );
}

function LiftDialog({
  block,
  name,
  onClose,
  returnFocusTo,
}: {
  readonly block: BookingBlock;
  readonly name: string;
  readonly onClose: () => void;
  readonly returnFocusTo: () => HTMLElement | null;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const toast = useToast();
  const lift = useLiftBookingBlock();
  const fieldId = useId();
  const hintId = useId();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const trimmed = reason.trim();
  const fits = trimmed.length >= LIFT_REASON_MIN && trimmed.length <= LIFT_REASON_MAX;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lift.isPending) return;
    if (!fits) {
      setProblem(
        t('home.blocks.dialog.reasonNeeded', { min: LIFT_REASON_MIN, max: LIFT_REASON_MAX }),
      );
      fieldRef.current?.focus();
      return;
    }
    setProblem(null);
    try {
      await lift.mutateAsync({ blockId: block.blockId, reason: trimmed });
      toast.say(t('home.blocks.lifted', { name }));
      onClose();
    } catch (error) {
      // Ended by itself meanwhile: nothing left to lift.
      setProblem(
        error instanceof ConcurrencyConflictError
          ? t('home.blocks.dialog.ended')
          : t('home.blocks.dialog.failed'),
      );
    }
  }

  return (
    <Dialog
      alert
      title={t('home.blocks.dialog.title')}
      description={t('home.blocks.dialog.body', { name })}
      onClose={lift.isPending ? () => undefined : onClose}
      dismissible={!lift.isPending}
      returnFocusTo={returnFocusTo}
    >
      <form className="yc-form" noValidate onSubmit={(event) => void submit(event)}>
        <div className="yc-fld">
          <label htmlFor={fieldId}>{t('home.blocks.dialog.reasonLabel')}</label>
          <textarea
            ref={fieldRef}
            id={fieldId}
            className="yc-ctl"
            rows={3}
            maxLength={LIFT_REASON_MAX}
            data-autofocus=""
            value={reason}
            aria-describedby={hintId}
            aria-invalid={problem !== null && !fits}
            onChange={(event) => setReason(event.target.value)}
          />
          <span className="yc-help" id={hintId}>
            {t('home.blocks.dialog.reasonHint', { min: LIFT_REASON_MIN, max: LIFT_REASON_MAX })}
          </span>
        </div>
        {problem ? (
          <p className="yc-err" role="alert">
            {problem}
          </p>
        ) : null}
        <div className="yc-acts">
          <button
            type="button"
            className="yc-btn yc-btn-sec"
            disabled={lift.isPending}
            onClick={onClose}
          >
            {t('home.blocks.dialog.keep')}
          </button>
          <button type="submit" className="yc-btn yc-btn-pri" aria-busy={lift.isPending}>
            {lift.isPending ? <span className="yc-spin" aria-hidden="true" /> : null}
            {t('home.blocks.dialog.confirm')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
