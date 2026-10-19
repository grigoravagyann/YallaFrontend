import { ApiError, describeFailure } from '@yalla/api';

/** The console's sentences for a refused row action, by what went wrong. */
export interface BookingActionFailureCopy {
  /** `conflicting-state`: the booking moved on — somebody on the floor acted first. */
  readonly moved: string;
  /** `table-state-conflict`: somebody sits at the table now; the party was not seated. */
  readonly tableTaken: string;
  /** `table-sitting-changed`: another party sits there now; nothing was ended. */
  readonly sittingChanged: string;
  /** `invalid-table-transition`: the table cannot take that step as it stands. */
  readonly tableCannot: string;
  /** A 403: not this person's branch. */
  readonly forbidden: string;
  /** A 404: the booking or the table is gone. */
  readonly gone: string;
  readonly offline: string;
  readonly generic: string;
}

/**
 * What to say when a row action is refused — always in the console's words.
 *
 * Unlike the approvals, whose 403 and 409 sentences were written to be shown,
 * the table and release routes answer in English made for logs ("Only a
 * confirmed reservation can be seated; K7Q2 is Seated."), which an Armenian
 * owner would read as a fault. Each refusal the routes document has a sentence
 * of its own; anything else is the generic one.
 */
export function bookingActionFailureText(error: unknown, copy: BookingActionFailureCopy): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'conflicting-state':
        return copy.moved;
      case 'table-state-conflict':
        return copy.tableTaken;
      case 'table-sitting-changed':
        return copy.sittingChanged;
      case 'invalid-table-transition':
        return copy.tableCannot;
      default:
        break;
    }
  }
  switch (describeFailure(error)) {
    case 'offline':
      return copy.offline;
    case 'forbidden':
      return copy.forbidden;
    case 'notFound':
      return copy.gone;
    case 'conflict':
      return copy.moved;
    default:
      return copy.generic;
  }
}
