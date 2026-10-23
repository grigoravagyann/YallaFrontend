import type { ConversationSubjectRef } from '@yalla/api';
import {
  dinerConversationOptions,
  markConversationReadOptions,
  sendGuestMessageOptions,
  unreadMessagesOptions,
  useGateway,
  type ConversationQueryOptions,
} from '@yalla/api/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { dinerOrderKeys } from '../orders/keys';
import { useSession } from '../stores/session';
import { NOTIFICATIONS_KEY } from './notifications';

/**
 * Guest messages (2026-10-23), as the app reaches them.
 *
 * The same one line each over `@yalla/api/react`'s options — one definition of
 * each query, mutation and its cache work — through the app's own
 * `useGateway`, which the screen tests replace (see `preOrderQueries.ts` on
 * why). Every key is under `['messages']`, reset with the session
 * (`dinerScope`). What the app adds:
 *
 * - the thread and the summary are the signed-in diner's own: nothing is read
 *   signed out;
 * - a text on a takeaway thread reads the Orders tab again (its card's row),
 *   and any send reads the notifications feed again.
 */

/** One thread. Polled every ten seconds while `focused`; read once otherwise. */
export function useDinerConversation(
  subject: ConversationSubjectRef | null | undefined,
  options: ConversationQueryOptions = {},
) {
  const signedIn = useSession((state) => state.signedIn);
  const query = dinerConversationOptions(useGateway(), subject, options);
  return useQuery({ ...query, enabled: query.enabled && signedIn });
}

/** Send a text: shown at once, taken out again on a refusal (read it with `messageFailure`). */
export function useSendGuestMessage() {
  const queryClient = useQueryClient();
  return useMutation(
    sendGuestMessageOptions(queryClient, useGateway(), (_message, command) => {
      if (command.subject.kind === 'takeaway') {
        void queryClient.invalidateQueries({ queryKey: dinerOrderKeys.all });
      }
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    }),
  );
}

/** "Read up to now": the thread, the summary and the booking's row lose their unread at once. */
export function useMarkConversationRead() {
  return useMutation(markConversationReadOptions(useQueryClient(), useGateway()));
}

/** The nav's dot and the Bookings cards' rows: read every thirty seconds, signed in only. */
export function useUnreadMessages() {
  const signedIn = useSession((state) => state.signedIn);
  return useQuery(unreadMessagesOptions(useGateway(), signedIn));
}

/**
 * Whether the screen holding this is the one in front of the stack — the
 * thread's ten-second poll and its "read" run only then, never under the
 * screen pushed on top of it.
 */
export function useScreenFocused(): boolean {
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return focused;
}
