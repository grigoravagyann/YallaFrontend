import {
  NetworkError,
  TabClosedError,
  TableOutOfServiceError,
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
  if (error instanceof NetworkError) {
    // Worth its own message: nothing was opened, so scanning again is safe.
    return { key: 'scan.error.network' };
  }
  return { key: 'scan.error.generic' };
}
