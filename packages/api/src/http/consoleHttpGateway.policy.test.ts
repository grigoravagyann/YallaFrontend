import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { defaultPolicyFor } from '../contracts/branchSettings';
import { PolicyBoundsError } from '../contracts/errors';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';

/**
 * The reservation policy over HTTP (venue console, Policy artboard; VC4 wire
 * §2): the server's own defaults and bounds, and a refusal that names its
 * field in a 422 as well as in the older 400's prose.
 */

function gatewayOver(routes: Record<string, FakeRoute>) {
  const backend = fakeBackend(routes);
  const auth = createAuthSession({
    storage: createMemoryTokenStorage('refresh-0'),
    refreshTokens: vi.fn(),
  });
  const gateway = createConsoleHttpGateway(backend.client({ getToken: () => 'held-token' }), {
    auth,
    identity: createMemoryIdentityStore(),
  });
  return { gateway, backend };
}

const POLICY = { ...defaultPolicyFor('restaurant'), bufferMinutes: 5, minLeadMinutes: 10 };

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a refusal');
}

describe('the policy defaults', () => {
  it("read what the branch ships with and the server's bounds, a ceiling-less one as null", async () => {
    const { gateway, backend } = gatewayOver({
      'GET /api/branches/b-1/reservation-policy/defaults': {
        body: {
          defaults: POLICY,
          bounds: [
            { field: 'turnTimeMinutes', min: 15, max: 360 },
            { field: 'maxSeatOverhang', min: 0, max: null },
            { field: 'approvalRequiredAbovePartySize', min: 1 },
          ],
        },
      },
    });

    const answer = await gateway.getReservationPolicyDefaults('b-1');

    expect(backend.requests[0]?.method).toBe('GET');
    expect(answer.defaults).toEqual(POLICY);
    expect(answer.bounds).toEqual([
      { field: 'turnTimeMinutes', min: 15, max: 360 },
      { field: 'maxSeatOverhang', min: 0, max: null },
      { field: 'approvalRequiredAbovePartySize', min: 1, max: null },
    ]);
  });
});

describe('a policy refusal', () => {
  it('names the first field a 422 lists, for the form to put the refusal under', async () => {
    const { gateway } = gatewayOver({
      'PUT /api/branches/b-1/reservation-policy': problemReply(422, 'validation-failed', {
        fields: [
          { field: 'graceMinutes', message: 'Grace period must be between 0 and 180 minutes.' },
          { field: 'turnTimeMinutes', message: 'Turn time must be between 15 and 360 minutes.' },
        ],
      }),
    });

    const refusal = await caught(
      gateway.replaceReservationPolicy({ branchId: 'b-1', policy: POLICY }),
    );

    expect(refusal).toBeInstanceOf(PolicyBoundsError);
    expect((refusal as PolicyBoundsError).field).toBe('graceMinutes');
  });

  it("still reads the field out of an older server's 400 prose", async () => {
    const { gateway } = gatewayOver({
      'PUT /api/branches/b-1/reservation-policy': problemReply(
        400,
        'bad-request',
        undefined,
        'Turn time must be between 15 and 360 minutes; 5 minutes was given.',
      ),
    });

    const refusal = await caught(
      gateway.replaceReservationPolicy({ branchId: 'b-1', policy: POLICY }),
    );

    expect((refusal as PolicyBoundsError).field).toBe('turnTimeMinutes');
  });
});
