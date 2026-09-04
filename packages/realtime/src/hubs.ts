/**
 * The two hub concepts the product needs, typed now so that later tasks wire up
 * handlers against a contract instead of stringly-typed payloads.
 *
 * Payload shapes mirror what the .NET hubs send. Once `pnpm api:generate` has a
 * real OpenAPI document these should be narrowed to the generated DTOs, but the
 * hub method names and group conventions below are the stable part.
 */

/** Server-to-client method names on the branch floor hub. */
export const BRANCH_FLOOR_EVENTS = {
  /** A table changed status — seated, freed, reserved, held. */
  tableStateChanged: 'TableStateChanged',
  /** A whole-floor resync, sent after a reconnect or a floor plan edit. */
  floorStateReplaced: 'FloorStateReplaced',
} as const;

/** Server-to-client method names on the tab hub. */
export const TAB_EVENTS = {
  /** A line item was added, removed or changed quantity. */
  tabUpdated: 'TabUpdated',
  /** The bill was settled and the tab closed. */
  tabClosed: 'TabClosed',
} as const;

export type BranchFloorEvent = (typeof BRANCH_FLOOR_EVENTS)[keyof typeof BRANCH_FLOOR_EVENTS];
export type TabEvent = (typeof TAB_EVENTS)[keyof typeof TAB_EVENTS];

/**
 * Group naming. Both apps and the backend must agree on these strings, so they
 * are derived here rather than typed at each call site.
 */
export const group = {
  branchFloor: (branchId: string): string => `branch:${branchId}:floor`,
  tab: (tabId: string): string => `tab:${tabId}`,
} as const;

/** A single table's state as pushed by the floor hub. */
export interface TableStatePayload {
  readonly tableId: string;
  readonly status: string;
  /** Row version, so a client can discard an update older than what it holds. */
  readonly version: string;
  /** ISO-8601, UTC. Rendered in the branch timezone by `@yalla/format`. */
  readonly changedAtUtc: string;
}

export interface FloorStatePayload {
  readonly branchId: string;
  readonly tables: readonly TableStatePayload[];
  readonly version: string;
  readonly asOfUtc: string;
}

/**
 * Live totals for one tab.
 *
 * Every amount is whole dram computed by the backend. The client displays these
 * and never sums line items itself — that is the rule `@yalla/format` enforces.
 */
export interface TabTotalsPayload {
  readonly tabId: string;
  readonly subtotalDram: number;
  readonly serviceChargeDram: number;
  readonly totalDram: number;
  readonly lineItemCount: number;
  readonly version: string;
  readonly asOfUtc: string;
}

export interface TabClosedPayload {
  readonly tabId: string;
  readonly totalDram: number;
  readonly closedAtUtc: string;
}
