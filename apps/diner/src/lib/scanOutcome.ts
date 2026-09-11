import {
  BranchUnavailableError,
  InviteExpiredError,
  NetworkError,
  TabClosedError,
  TableOutOfServiceError,
  TabsNotEnabledError,
  TimeoutError,
  UnknownTableCodeError,
} from '@yalla/api';

/**
 * Turn a failed scan into the one thing the screen needs: a translation key and
 * its parameters.
 *
 * Shared by the scan screen and the deep-link join screen so a code that fails
 * says the same thing whichever door it came through. Returning a key rather
 * than a string keeps the mapping testable and keeps `t` at the render site,
 * which is where the language actually is.
 */
export interface ScanFailure {
  readonly key: string;
  readonly params?: Record<string, string>;
}

export function scanFailureFor(error: unknown): ScanFailure {
  if (error instanceof TableOutOfServiceError) {
    return { key: 'scan.error.outOfService', params: { label: error.tableLabel } };
  }
  if (error instanceof UnknownTableCodeError) {
    return { key: 'scan.error.unknownCode' };
  }
  if (error instanceof TabClosedError) {
    return { key: 'scan.error.tabClosed' };
  }
  // A branch on a plan without tabs: the answer is a waiter, not another scan.
  if (error instanceof TabsNotEnabledError) {
    return { key: 'scan.error.notEnabled' };
  }
  if (error instanceof BranchUnavailableError) {
    return { key: 'scan.error.branchUnavailable' };
  }
  // The host can make a new invitation in a tap.
  if (error instanceof InviteExpiredError) {
    return { key: 'join.error.expired' };
  }
  if (error instanceof NetworkError) {
    // Worth its own message: nothing reached the server, so scanning again is safe.
    return { key: 'scan.error.network' };
  }
  if (error instanceof TimeoutError) {
    // It may have gone through. Scanning again replays the same command, so it
    // cannot open a second tab — and that is what the copy says.
    return { key: 'scan.error.uncertain' };
  }
  return { key: 'scan.error.generic' };
}

/**
 * Whether a failed scan's command id can be dropped.
 *
 * Only when the server definitely refused it. After a timeout the scan may have
 * opened a tab, and retrying with the same id is what gets that tab back rather
 * than opening a second one.
 */
export function scanWasRefused(error: unknown): boolean {
  return !(error instanceof TimeoutError);
}
