import type {
  OrderStatus,
  ServiceRequest,
  StaffTab,
  TabLine,
  TabTotals,
  UserRole,
} from '@yalla/api';

/** The radio value for "none of these requests": the keypad starts from the balance. */
export const NO_REQUEST = '__none__';

/** The roles the server lets decide about money on a tab: a branch manager and everyone above. */
const MANAGER_ROLES: readonly UserRole[] = ['owner', 'generalManager', 'manager', 'platformAdmin'];

/**
 * Whether this role gets the tab's manager controls: comp a line, take a
 * percentage or an amount off the whole tab, and mark it unpaid — the server's
 * `ManagerOrAbove`. Voiding a line, taking cash and answering the bill request
 * are every waiter's.
 */
export function isTabManager(role: UserRole): boolean {
  return MANAGER_ROLES.includes(role);
}

/** The pill on a line: where it is. A voided line says so whatever its order did. */
export function lineStage(line: TabLine): OrderStatus {
  return line.status === 'voided' ? 'voided' : line.orderStatus;
}

/** Two letters for a face with no photo: the first of the first two words that are names. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/u)
    .filter((word) => /^\p{L}/u.test(word))
    .slice(0, 2)
    .map((word) => word[0]!.toLocaleUpperCase())
    .join('');
}

/**
 * The bill request the keypad is for: the waiter's pick, none at all for
 * {@link NO_REQUEST}, else — no pick, or a pick since handled elsewhere —
 * the newest.
 */
export function chosenBillRequest(
  requests: readonly ServiceRequest[],
  choice: string | null,
): ServiceRequest | null {
  return choice === NO_REQUEST
    ? null
    : (requests.find((request) => request.id === choice) ?? requests[0] ?? null);
}

/**
 * What the keypad will open on: a share capped at what is left; the whole
 * bill as it stands now. Nothing with no totals.
 */
export function cashAmountFor(
  totals: TabTotals | undefined,
  chosen: ServiceRequest | null,
): number {
  return totals
    ? chosen?.bill?.scope === 'mine'
      ? Math.min(chosen.bill.amountDram, totals.remainingDram)
      : totals.remainingDram
    : 0;
}

/** The tab's lines and adjustments, summed from its one snapshot. */
export function tabSums(tab: StaffTab | null) {
  const lines = tab?.lines ?? [];
  // Reversed ones stay on the record and take nothing off.
  const adjustments = (tab?.adjustments ?? []).filter((adjustment) => !adjustment.isVoided);
  const activeLines = lines.filter((line) => line.status === 'active');
  return {
    lines,
    linesKnown: tab?.linesKnown ?? false,
    adjustments,
    activeLines,
    linesDram: activeLines.reduce((sum, line) => sum + line.lineTotalDram, 0),
    dishCount: activeLines.reduce((sum, line) => sum + line.quantity, 0),
    // What the adjustments took off, as the server worked each out.
    adjustedDram: adjustments.reduce((sum, adjustment) => sum + adjustment.reductionDram, 0),
    // The tab has been paid against: the server refuses a void then (a refund).
    paidAgainst: (tab?.totals.paidDram ?? 0) > 0,
  };
}

/** Whole minutes from `utc` to `now`, never below zero. */
export function wholeMinutesSince(now: Date, utc: string): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(utc).getTime()) / 60_000));
}
