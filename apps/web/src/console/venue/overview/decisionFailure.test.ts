import { ConcurrencyConflictError, ReservationCancelledByBlockError } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { decisionFailureText } from './decisionFailure';

/** A decision on a booking its guest's no-show block already cancelled (wire §0a). */

const COPY = {
  offline: 'offline',
  generic: 'generic',
  answeredElsewhere: 'somebody answered first',
  cancelledByBlock: 'cancelled automatically: blocked for no-shows',
};

describe('what a refused decision says', () => {
  it('says the block cancelled it, not that somebody answered first', () => {
    const error = new ReservationCancelledByBlockError({ url: '/api/reservations/r/approve' });
    expect(decisionFailureText(error, COPY)).toBe(COPY.cancelledByBlock);
  });

  it('still says somebody answered first for any other 409', () => {
    const error = new ConcurrencyConflictError({
      url: '/api/reservations/r/approve',
      problem: {
        type: '',
        title: 'Conflict',
        status: 409,
        detail: 'Only a pending reservation can be confirmed.',
        code: 'conflicting-state',
        traceId: 't',
      },
    });
    expect(decisionFailureText(error, COPY)).toBe(COPY.answeredElsewhere);
  });
});
