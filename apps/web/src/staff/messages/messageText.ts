import {
  MESSAGE_MAX_LENGTH,
  type ConversationMessage,
  type ConversationSubjectKind,
  type MessageAnswer,
  type MessageFailure,
  type MessageKind,
  type MessageStatus,
  type StaffConversationListItem,
} from '@yalla/api';
import type { TFunction } from 'i18next';

/**
 * Guest messages on the floor tablet (2026-10-23, the Rail and Inbox
 * artboards): the words the rail, the inbox and the thread share.
 *
 * Only a `text` message carries words of its own. The venue's ask, the
 * guest's answer buttons and the system's "booking updated" line arrive as
 * structured fields and are said here, in the reader's language.
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

/** The keys of the app's four default ready replies for a subject's kind. */
const DEFAULT_TEMPLATE_KEYS = {
  reservation: [
    'common:messages.defaultTemplates.reservation1',
    'common:messages.defaultTemplates.reservation2',
    'common:messages.defaultTemplates.reservation3',
    'common:messages.defaultTemplates.reservation4',
  ],
  takeaway: [
    'common:messages.defaultTemplates.takeaway1',
    'common:messages.defaultTemplates.takeaway2',
    'common:messages.defaultTemplates.takeaway3',
    'common:messages.defaultTemplates.takeaway4',
  ],
} as const;

/** The localized default four for a kind: what the chips say while the venue has none of its own. */
export function defaultTemplates(t: TFunction, kind: ConversationSubjectKind): readonly string[] {
  return DEFAULT_TEMPLATE_KEYS[kind].map((key) => t(key));
}

/** The chips: the venue's replies, or the default four for the subject's kind. */
export function templatesFor(
  t: TFunction,
  templates: readonly string[] | null | undefined,
  kind: ConversationSubjectKind,
): readonly string[] {
  return templates ?? defaultTemplates(t, kind);
}

/**
 * What a chip puts in the field: its text, with a trailing ellipsis turned
 * into a space so the waiter carries on typing ("Something has run out ").
 */
export function templateDraft(template: string): string {
  return template.replace(/(…|\.\.\.)\s*$/u, ' ');
}

/** An answer button's words: "I'm coming", "Running 15 minutes late", "Not coming". */
export function answerText(t: TFunction, answer: MessageAnswer | null): string {
  switch (answer?.kind) {
    case 'coming':
      return t('messages.thread.text.coming');
    case 'late':
      return answer.lateMinutes !== null
        ? t('messages.thread.text.late', { count: answer.lateMinutes })
        : t('messages.thread.text.answered');
    case 'notComing':
      return t('messages.thread.text.notComing');
    default:
      return t('messages.thread.text.answered');
  }
}

/** The system line: "Booking updated · table held until 19:45". */
export function statusText(t: TFunction, status: MessageStatus | null): string {
  if (status?.cancelled) return t('messages.thread.text.cancelled');
  if (status?.heldUntilLocal) {
    return t('messages.thread.text.heldUntil', { time: status.heldUntilLocal.slice(0, 5) });
  }
  return t('messages.thread.text.updated');
}

/** The venue's ask: "Are you coming at 19:30?". */
export function askText(t: TFunction, localTime: string | null | undefined): string {
  return localTime
    ? t('messages.thread.text.ask', { time: localTime.slice(0, 5) })
    : t('messages.thread.text.askPlain');
}

/** Any message's words, as its bubble shows them. */
export function messageBody(
  t: TFunction,
  message: Pick<ConversationMessage, 'kind' | 'text' | 'answer' | 'status'>,
  localTime: string | null | undefined,
): string {
  return bodyOf(t, message.kind, message.text, message.answer, message.status, localTime);
}

function bodyOf(
  t: TFunction,
  kind: MessageKind,
  text: string | null,
  answer: MessageAnswer | null,
  status: MessageStatus | null,
  localTime: string | null | undefined,
): string {
  switch (kind) {
    case 'text':
      return text ?? '';
    case 'askComing':
      return askText(t, localTime);
    case 'answer':
      return answerText(t, answer);
    case 'status':
      return statusText(t, status);
    default:
      return text ?? t('messages.thread.text.unknown');
  }
}

/** The inbox row's second line: the last message, "You: …" when it was the venue's. */
export function lastLine(t: TFunction, item: StaffConversationListItem): string {
  const last = item.lastMessage;
  if (!last) return '';
  const body = bodyOf(t, last.kind, last.text, last.answer, null, item.subject.localTime);
  return last.author === 'venue' ? t('messages.inbox.you', { text: body }) : body;
}

/** The subject as a rail card's title: "Table 6 · Ani M. · 19:30", "Takeaway T-485 · Karen S.". */
export function railTitle(t: TFunction, item: StaffConversationListItem): string {
  const name = shortName(item.subject.guestName);
  if (item.subject.kind === 'takeaway') {
    return t('messages.rail.titleTakeaway', { code: item.subject.label, name });
  }
  return item.subject.localTime
    ? t('messages.rail.titleBooking', {
        label: item.subject.label,
        name,
        time: item.subject.localTime.slice(0, 5),
      })
    : t('messages.rail.titleBookingPlain', { label: item.subject.label, name });
}

/** The inbox row's title: "Ani M.", "Karen S. · T-485". */
export function rowTitle(t: TFunction, item: StaffConversationListItem): string {
  const name = shortName(item.subject.guestName);
  return item.subject.kind === 'takeaway'
    ? t('messages.inbox.rowTakeaway', { name, code: item.subject.label })
    : name;
}

/** A refused or lost send, in the floor's words. */
export function messageFailureText(t: TFunction, failure: MessageFailure): string {
  switch (failure.kind) {
    case 'closed':
      return t('messages.thread.error.closed');
    case 'waitersCannotWrite':
      return t('messages.thread.error.waitersCannotWrite');
    case 'forbidden':
    case 'guestsCannotWrite':
      return t('messages.thread.error.forbidden');
    case 'tooFast':
      return t('messages.thread.error.tooFast');
    case 'invalid':
      return t('messages.thread.error.invalid', { max: MESSAGE_MAX_LENGTH });
    case 'notFound':
      return t('messages.thread.error.notFound');
    case 'offline':
      return t('messages.thread.error.offline');
    case 'generic':
      return t('messages.thread.error.generic');
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
