import {
  MESSAGE_MAX_LENGTH,
  type ConversationSubjectKind,
  type MessageFailure,
  type StaffConversationListItem,
} from '@yalla/api';
import type { TFunction } from 'i18next';
import { heldUntil, messageBody, shortName, statusText } from '../../messages/messageText';

/**
 * Guest messages on the floor tablet (2026-10-23, the Rail and Inbox
 * artboards): the words the rail, the inbox and the thread share. The words
 * of a message itself — a text, the ask, an answer, a system line — are
 * shared with the console's history (`messages/messageText.ts`) and
 * re-exported here.
 */
export {
  answerText,
  askText,
  firstName,
  heldUntil,
  messageBody,
  shortName,
  statusText,
} from '../../messages/messageText';

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

/**
 * The inbox row's second line: the last message that is not a system line —
 * the guest's words or answer, "You: …" when it was the venue's. After a late
 * answer, the time the table is held until, from the latest status line:
 * "Running 15 minutes late · held until 19:45".
 */
export function lastLine(t: TFunction, item: StaffConversationListItem): string {
  const last = item.lastMessage;
  if (!last) return item.latestStatus ? statusText(t, item.latestStatus) : '';
  const body = messageBody(
    t,
    { kind: last.kind, text: last.text, answer: last.answer, status: null },
    item.subject.localTime,
  );
  if (last.author === 'venue') return t('messages.inbox.you', { text: body });
  const held = heldAfter(item);
  return held ? t('messages.inbox.lastHeld', { text: body, time: held }) : body;
}

/**
 * "19:45": the table is held until then, when the row's last message is the
 * guest's late answer — from the latest status line, else worked out from the
 * booking's start.
 */
export function heldAfter(item: StaffConversationListItem): string | null {
  const last = item.lastMessage;
  if (last?.author !== 'guest' || last.kind !== 'answer' || last.answer?.kind !== 'late') {
    return null;
  }
  const status = item.latestStatus;
  if (status?.heldUntilLocal && !status.cancelled) return status.heldUntilLocal.slice(0, 5);
  return heldUntil(item.subject.localTime, last.answer.lateMinutes);
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
