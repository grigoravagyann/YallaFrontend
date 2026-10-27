import type { StaffSessionIdentity } from '@yalla/api';

/**
 * What the floor offers at this branch, from the session's features — read
 * again on every renewal (2026-10-27). A feature the platform has not allowed
 * is not drawn: its tab, its rail section and its actions go, and its queries
 * are not asked. Work already in flight is not stranded: a takeaway already
 * placed keeps its counter until it is collected.
 *
 * KitchenDisplay is not here: it gates the kitchen **account** (its own
 * screen), never the floor's Kitchen view, where waiters and managers mark
 * orders ready — the server refuses only the Kitchen role.
 */
export interface FloorFeatures {
  /** The Takeaway tab and the rail's takeaway section. */
  readonly takeaway: boolean;
  /**
   * Writing to guests. Off, the inbox and the rail stay, read only: staff
   * still need a guest's "on my way" and "running late".
   */
  readonly messages: boolean;
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
    tableService: has('tableService'),
  };
}
