import { usingMockData } from '../data/gateway';

/**
 * Unread notifications, for the red count on the Profile row.
 *
 * There is no notifications feed on the backend yet, so in real mode the
 * answer is honestly zero and the badge stays hidden. The mock returns the
 * count the reference design shows, the same way the other mocks return the
 * reference's places and orders. When the feed exists this becomes a query
 * and no screen changes.
 */
const MOCK_UNREAD = 2;

export function useNotificationCount(): number {
  return usingMockData ? MOCK_UNREAD : 0;
}
