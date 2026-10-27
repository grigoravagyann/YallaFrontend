import type { StaffSessionIdentity } from '@yalla/api';

/**
 * What the floor offers at this branch, from the session's features — read
 * again on every renewal (2026-10-27). A feature the platform has not allowed
 * is not drawn: its tab, its rail section and its actions go, and its queries
 * are not asked. Work already in flight is not stranded: a takeaway already
 * placed keeps its counter until it is collected.
 */
export interface FloorFeatures {
  /** The Takeaway tab and the rail's takeaway section. */
  readonly takeaway: boolean;
  /** The Messages tab, the inbox and the rail's message section. */
  readonly messages: boolean;
  /** The Kitchen view (the board on the floor tablet). */
  readonly kitchen: boolean;
  /** Tabs, ordering from the table and payments: starting a tab or an order. */
  readonly tableService: boolean;
}

/** From the session; a session that does not say (an older server, the dev switcher) offers all. */
export function floorFeatures(identity: Pick<StaffSessionIdentity, 'features'>): FloorFeatures {
  const features = (identity as { features?: readonly string[] | undefined }).features;
  const has = (name: string) => !Array.isArray(features) || features.includes(name);
  return {
    takeaway: has('takeaway'),
    messages: has('guestMessages'),
    kitchen: has('kitchenDisplay'),
    tableService: has('tableService'),
  };
}
