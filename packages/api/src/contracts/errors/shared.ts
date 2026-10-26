/**
 * Option shapes the error classes share. Not part of the public API:
 * `contracts/errors.ts` re-exports the area files, never this one.
 */

/** Facts the server sends with a refused booking, for the copy to use. */
export interface BookingRefusal {
  readonly url: string;
  readonly reservationId?: string | undefined;
  readonly startUtc?: string | undefined;
  readonly endUtc?: string | undefined;
  readonly requestId?: string | undefined;
}

export interface RefusalOptions {
  readonly url: string;
  readonly requestId?: string | undefined;
}
