import {
  NOTIFICATION_PAGE_SIZE,
  staleTime,
  type DinerNotificationPage,
  type MarkNotificationsReadCommand,
} from '@yalla/api';
import { useGateway } from '@yalla/api/react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useSession } from '../stores/session';
import { notificationKeys } from './notifications';

/**
 * The notifications feed (K12): pages of rows, newest first, and the unread
 * count for the Profile badge. Both belong to whoever is signed in and are
 * reset with the rest of the diner's answers (`dinerScope`); a push that lands
 * invalidates both (`push/invalidation`).
 */

export function useNotificationFeed() {
  const gateway = useGateway();
  const signedIn = useSession((state) => state.signedIn);
  return useInfiniteQuery({
    queryKey: notificationKeys.feed(),
    queryFn: ({ pageParam }) =>
      gateway.listNotifications({ before: pageParam, limit: NOTIFICATION_PAGE_SIZE }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: DinerNotificationPage) => last.nextCursor ?? undefined,
    enabled: signedIn,
    staleTime: staleTime.frequent,
  });
}

/** The badge's number: the feed's `unreadCount`, read with the smallest page. Zero signed out. */
export function useUnreadNotificationCount(): number {
  const gateway = useGateway();
  const signedIn = useSession((state) => state.signedIn);
  const query = useQuery({
    queryKey: notificationKeys.unread(),
    queryFn: () => gateway.getUnreadNotificationCount(),
    enabled: signedIn,
    staleTime: staleTime.frequent,
  });
  return signedIn ? (query.data ?? 0) : 0;
}

type Feed = InfiniteData<DinerNotificationPage, string | null>;

function markedRead(
  feed: Feed | undefined,
  command: MarkNotificationsReadCommand,
): Feed | undefined {
  if (!feed) return feed;
  const ids = command.ids ? new Set(command.ids) : null;
  // Newest first, so "up to" is that row and everything after it.
  let reached = false;
  let marked = 0;
  const pages = feed.pages.map((page) => ({
    ...page,
    items: page.items.map((item) => {
      if (command.upTo !== undefined && item.notificationId === command.upTo) reached = true;
      const hit = ids ? ids.has(item.notificationId) : reached;
      if (!hit || item.read) return item;
      marked += 1;
      return { ...item, read: true };
    }),
  }));
  return {
    ...feed,
    pages: pages.map((page) => ({ ...page, unreadCount: Math.max(0, page.unreadCount - marked) })),
  };
}

/**
 * Mark rows read. The rows and the badge change at once; the server's answer is
 * read back afterwards either way, so a refused call corrects itself.
 */
export function useMarkNotificationsRead() {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: MarkNotificationsReadCommand) => gateway.markNotificationsRead(command),
    onMutate: async (command) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.feed() });
      queryClient.setQueryData<Feed>(notificationKeys.feed(), (feed) => markedRead(feed, command));
      if (command.upTo !== undefined)
        queryClient.setQueryData<number>(notificationKeys.unread(), 0);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
