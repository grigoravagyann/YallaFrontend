import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { createApiClient } from '../client';
import { checkedFetch } from './wireSchema.testkit';
import { VenueDeletionBlockedError } from '../contracts/errors';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';

const BASE = 'https://api.test.yalla.am';

/**
 * What `PlatformService.DeleteVenueAsync` answers when people are still eating
 * there or still booked to: 409 `venue-deletion-blocked`, with the table labels
 * and the booking codes in `context` (ApiExceptionMapper). The console used to
 * let this through as a bare ApiError, so the screen said "Something went
 * wrong" and the owner had no idea why the venue would not go.
 */
function blocked(openTabs: string[], futureReservations: string[]) {
  return new Response(
    JSON.stringify({
      type: 'https://yalla.am/problems/venue-deletion-blocked',
      title: 'Venue cannot be deleted',
      status: 409,
      code: 'venue-deletion-blocked',
      detail:
        'This venue cannot be deleted: it has 1 open tab(s) on table(s) 4 and 2 future confirmed ' +
        'reservation(s) (K7Q2LM, R9XP3D). Suspend it instead, or wait for them to close.',
      traceId: 'trace-1',
      context: { openTabs, futureReservations },
    }),
    { status: 409, headers: { 'content-type': 'application/problem+json' } },
  );
}

function gatewayOver(fetchImpl: typeof globalThis.fetch) {
  const auth = createAuthSession({
    storage: createMemoryTokenStorage('refresh-0'),
    refreshTokens: vi.fn(),
  });
  return createConsoleHttpGateway(
    createApiClient({
      baseUrl: BASE,
      fetch: checkedFetch(fetchImpl),
      getToken: () => 'held-token',
    }),
    { auth, identity: createMemoryIdentityStore() },
  );
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('deleting a venue that is still in use, over HTTP', () => {
  it('names the open tables and the upcoming bookings the server listed', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(blocked(['4'], ['K7Q2LM', 'R9XP3D']));

    const error = await caught(
      gatewayOver(fetchImpl).deleteVenue({ venueId: 'v-1', commandId: 'cmd-1' }),
    );

    expect(error).toBeInstanceOf(VenueDeletionBlockedError);
    const refusal = error as VenueDeletionBlockedError;
    expect(refusal.venueId).toBe('v-1');
    expect(refusal.openTables).toEqual(['4']);
    expect(refusal.futureBookings).toEqual(['K7Q2LM', 'R9XP3D']);
    // The server's own sentence survives, for anywhere that shows only a message.
    expect(refusal.message).toMatch(/Suspend it instead/);
  });

  it('reads a refusal with only bookings, and one whose context is missing', async () => {
    const onlyBookings = await caught(
      gatewayOver(vi.fn().mockResolvedValue(blocked([], ['K7Q2LM']))).deleteVenue({
        venueId: 'v-1',
        commandId: 'cmd-1',
      }),
    );
    expect(onlyBookings).toBeInstanceOf(VenueDeletionBlockedError);
    expect((onlyBookings as VenueDeletionBlockedError).openTables).toEqual([]);
    expect((onlyBookings as VenueDeletionBlockedError).futureBookings).toEqual(['K7Q2LM']);

    const bare = new Response(
      JSON.stringify({ status: 409, code: 'venue-deletion-blocked', title: 'x', detail: 'x' }),
      { status: 409, headers: { 'content-type': 'application/problem+json' } },
    );
    const noContext = await caught(
      gatewayOver(vi.fn().mockResolvedValue(bare)).deleteVenue({
        venueId: 'v-1',
        commandId: 'cmd-1',
      }),
    );
    expect(noContext).toBeInstanceOf(VenueDeletionBlockedError);
    expect((noContext as VenueDeletionBlockedError).openTables).toEqual([]);
    expect((noContext as VenueDeletionBlockedError).futureBookings).toEqual([]);
  });
});
