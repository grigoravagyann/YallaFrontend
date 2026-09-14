import { useUnreadNotificationCount } from '../data/notificationQueries';

/**
 * Unread notifications, for the red count on the Profile row: the server's
 * `unreadCount` from `GET /api/diner/notifications` (K12), in real mode and on
 * the mock alike. Zero, and no request, while nobody is signed in.
 */
export function useNotificationCount(): number {
  return useUnreadNotificationCount();
}
