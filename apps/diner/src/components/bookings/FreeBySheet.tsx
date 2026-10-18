import { freeByQuestion } from '@yalla/api';
import { formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { ConfirmSheet } from '../ConfirmSheet';

export interface FreeBySheetProps {
  readonly visible: boolean;
  /** What the diner would promise: the next booking's start less the clearing time. */
  readonly freeByUtc: string;
  /** The next booking's start, when known — it is what makes the time make sense. */
  readonly nextStartUtc: string | null;
  /** The branch's zone. Never the device's. */
  readonly timeZoneId: string;
  /** In flight: the yes has been sent. */
  readonly busy?: boolean;
  /** "Yes, I'll free it by 21:25": send, with the promise. */
  readonly onAccept: () => void;
  /** No (or the veil): nothing is sent, and the screen offers another table or time. */
  readonly onDecline: () => void;
}

/**
 * "There is a booking at 21:30. Will you free the table by 21:25?" — asked
 * before a booking the next one cuts short is sent, never after.
 *
 * The product does not ask people how long they will stay; it tells them how
 * long the table is theirs. This is the one time it has to ask, because the
 * sitting is shorter than usual and the next party is real: a yes is recorded
 * on the booking as a promise the venue sees, so it is the diner's to give.
 */
export function FreeBySheet({
  visible,
  freeByUtc,
  nextStartUtc,
  timeZoneId,
  busy = false,
  onAccept,
  onDecline,
}: FreeBySheetProps) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const question = freeByQuestion({ nextStartUtc, freeByUtc }, timeZoneId, locale);
  const time = formatTime(freeByUtc, timeZoneId, locale);
  return (
    <ConfirmSheet
      visible={visible}
      title={t('book.freeBy.title')}
      body={t(question.key, question.params)}
      confirmLabel={t('book.freeBy.yes', { time })}
      cancelLabel={t('book.freeBy.no')}
      busy={busy}
      onConfirm={onAccept}
      onCancel={onDecline}
    />
  );
}
