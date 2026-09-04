/**
 * The menu, as the diner app reads it.
 *
 * Only enough of it exists for this task: prices must be visible to anyone at
 * the table, including someone still waiting to be approved onto the tab, so
 * they can work out what their own order would cost. Ordering itself — adding
 * a line, options, notes to the kitchen — arrives with the next task and will
 * extend these shapes rather than replace them.
 */

export interface MenuItem {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  /**
   * Integer dram. There are no sub-unit coins in circulation, and the client
   * never sums prices — it only displays them. The bill is the server's.
   */
  readonly priceDram: number;
  /** False when the kitchen has 86'd it. Still listed, visibly unavailable. */
  readonly isAvailable: boolean;
}

export interface MenuSection {
  readonly id: string;
  readonly name: string;
  readonly items: readonly MenuItem[];
}

export interface Menu {
  readonly branchId: string;
  /** ISO-8601 UTC. Shown so a stale cached menu is visibly stale. */
  readonly updatedAtUtc: string;
  readonly sections: readonly MenuSection[];
}
