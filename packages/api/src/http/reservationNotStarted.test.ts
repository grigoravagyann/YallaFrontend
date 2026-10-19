import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { ReservationNotStartedError } from '../contracts/errors';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';
import { fakeBackend, problemReply } from './fakeBackend.testkit';
import { createStaffHttpGateway } from './staffHttpGateway';

/**
 * A no-show before the booking's start (FT2 wire): 409
 * `reservation-not-started`, with `context.startUtc` — the instant from which
 * one is accepted. Both routes that record a no-show can answer it.
 */

const START = '2026-10-21T15:00:00Z';
const REFUSAL = problemReply(409, 'reservation-not-started', {
  reservationId: 'r-1',
  startUtc: START,
});

describe('a no-show before the booking starts', () => {
  it('comes back from the tablet as its own error, with the start', async () => {
    const backend = fakeBackend({ 'POST /api/reservations/r-1/release': REFUSAL });
    const gateway = createStaffHttpGateway(backend.client());
    const error = await gateway
      .releaseReservation({ reservationId: 'r-1', outcome: 'noShow', clientCommandId: 'c-1' })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ReservationNotStartedError);
    expect((error as ReservationNotStartedError).startUtc).toBe(START);
  });

  it('comes back from the console row menu the same way', async () => {
    const backend = fakeBackend({ 'POST /api/reservations/r-1/no-show': REFUSAL });
    const auth = createAuthSession({
      storage: createMemoryTokenStorage('refresh-0'),
      refreshTokens: vi.fn(),
    });
    const gateway = createConsoleHttpGateway(backend.client({ getToken: () => 'held-token' }), {
      auth,
      identity: createMemoryIdentityStore(),
    });
    const error = await gateway
      .actOnBooking({
        branchId: 'b-1',
        reservationId: 'r-1',
        tableId: 't-5',
        clientCommandId: '6f1c2a40-1b8e-4c1a-9d43-2f6c7f0b9e11',
        kind: 'noShow',
      })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ReservationNotStartedError);
    expect((error as ReservationNotStartedError).startUtc).toBe(START);
  });
});
