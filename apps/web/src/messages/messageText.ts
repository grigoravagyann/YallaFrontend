import type { ConversationMessage, MessageAnswer, MessageStatus } from '@yalla/api';
import type { TFunction } from 'i18next';

/**
 * Guest messages as words, for every surface of this app that shows a thread:
 * the floor tablet's rail, inbox and thread (2026-10-23), and the console's
 * read-only history (2026-10-24).
 *
 * Only a `text` message carries words of its own. The venue's ask, the
 * guest's answer buttons and the system's "booking updated" line arrive as
 * structured fields and are said here, in the reader's language. The keys
 * name their namespace (`staff:`), so a console screen whose `t` opens on
 * `admin` says the same words as the tablet.
 */

/** "Անի Մ.": the first name and the family name's initial, as the design has it. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? '';
  const initial = parts[1]!.charAt(0);
  return `${parts[0]} ${initial}.`;
}

/** The first name alone: "Write to Ani…". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/u)[0] ?? '';
}

/** An answer button's words: "I'm coming", "Running 15 minutes late", "Not coming". */
export function answerText(t: TFunction, answer: MessageAnswer | null): string {
  switch (answer?.kind) {
    case 'coming':
      return t('staff:messages.thread.text.coming');
    case 'late':
      return answer.lateMinutes !== null
        ? t('staff:messages.thread.text.late', { count: answer.lateMinutes })
        : t('staff:messages.thread.text.answered');
    case 'notComing':
      return t('staff:messages.thread.text.notComing');
    default:
      return t('staff:messages.thread.text.answered');
  }
}

/**
 * The system line: "Booking updated · table held until 19:45", "Booking
 * updated · coming", "Booking cancelled" — said from the answer it names.
 */
export function statusText(t: TFunction, status: MessageStatus | null): string {
  if (status?.cancelled) return t('staff:messages.thread.text.cancelled');
  if (status?.heldUntilLocal) {
    return t('staff:messages.thread.text.heldUntil', { time: status.heldUntilLocal.slice(0, 5) });
  }
  if (status?.answer === 'coming') return t('staff:messages.thread.text.updatedComing');
  return t('staff:messages.thread.text.updated');
}

/** The venue's ask: "Are you coming at 19:30?". */
export function askText(t: TFunction, localTime: string | null | undefined): string {
  return localTime
    ? t('staff:messages.thread.text.ask', { time: localTime.slice(0, 5) })
    : t('staff:messages.thread.text.askPlain');
}

/** Any message's words, as its bubble shows them. */
export function messageBody(
  t: TFunction,
  message: Pick<ConversationMessage, 'kind' | 'text' | 'answer' | 'status'>,
  localTime: string | null | undefined,
): string {
  switch (message.kind) {
    case 'text':
      return message.text ?? '';
    case 'askComing':
      return askText(t, localTime);
    case 'answer':
      return answerText(t, message.answer);
    case 'status':
      return statusText(t, message.status);
    default:
      return message.text ?? t('staff:messages.thread.text.unknown');
  }
}

/** "19:45": a booking's start plus the minutes the guest said they would be late. */
export function heldUntil(localTime: string | null, lateMinutes: number | null): string | null {
  if (!localTime || lateMinutes === null) return null;
  const [hours, minutes] = localTime.split(':').map(Number);
  if (hours === undefined || minutes === undefined || Number.isNaN(hours + minutes)) return null;
  const total = (hours * 60 + minutes + lateMinutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
