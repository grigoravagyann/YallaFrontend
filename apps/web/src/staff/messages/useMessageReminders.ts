import { needsReminder, type StaffConversationListItem } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useState } from 'react';
import { playChime } from '../chime';
import { railTitle } from './messageText';

/**
 * The floor's reminder (2026-10-23, the Policy artboard's "Remind the
 * tablet"): when a guest's message has waited `remindAfterMinutes` with no
 * answer, the tablet chimes — the same chime as a new booking request — and
 * the conversation is lifted to the top of the Now rail.
 *
 * Once per wait: a conversation chimes when it crosses the line, and again
 * only after it was answered and a guest wrote anew (a new oldest unanswered
 * message). Said for a screen reader too, as the booking chime is.
 */
export function useMessageReminders(
  items: readonly StaffConversationListItem[] | undefined,
  remindAfterMinutes: number,
  now: Date,
  enabled: boolean,
): { readonly due: readonly StaffConversationListItem[]; readonly announcement: string } {
  const { t } = useTranslation(['staff', 'common']);
  const due = enabled
    ? (items ?? []).filter((item) => needsReminder(item, remindAfterMinutes, now))
    : [];
  const keys = due.map((item) => `${item.conversationId}:${item.oldestUnansweredGuestMessageUtc}`);

  const [chimed, setChimed] = useState<ReadonlySet<string>>(new Set());
  const [round, setRound] = useState<{ readonly seq: number; readonly text: string }>({
    seq: 0,
    text: '',
  });

  // Compared while rendering, as the booking arrivals are; the sound is the effect's.
  const fresh = keys.filter((key) => !chimed.has(key));
  if (fresh.length > 0) {
    setChimed(new Set([...chimed, ...fresh]));
    const first = due.find(
      (item) => `${item.conversationId}:${item.oldestUnansweredGuestMessageUtc}` === fresh[0],
    );
    const minutes = first?.oldestUnansweredGuestMessageUtc
      ? Math.floor((now.getTime() - Date.parse(first.oldestUnansweredGuestMessageUtc)) / 60_000)
      : remindAfterMinutes;
    setRound({
      seq: round.seq + 1,
      text: first ? t('messages.reminder', { label: railTitle(t, first), count: minutes }) : '',
    });
  }

  useEffect(() => {
    if (round.seq === 0) return;
    void playChime();
  }, [round.seq]);

  return { due, announcement: round.text };
}
