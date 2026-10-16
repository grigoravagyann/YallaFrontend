import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { createApiClient } from '../client';
import { StaffPermissionError, StaffPinTakenError } from '../contracts/errors';
import { ValidationError } from '../errors';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';

const BASE = 'https://api.test.yalla.am';

const PIN_TAKEN = 'Somebody who signs in on this tablet already uses that PIN. Choose another.';

function problem(status: number, code: string, detail: string, context?: unknown) {
  return new Response(
    JSON.stringify({
      code,
      status,
      title: 'Problem',
      detail,
      type: `https://yalla.am/problems/${code}`,
      traceId: 'trace-1',
      ...(context ? { context } : {}),
    }),
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

function gatewayOver(fetchImpl: typeof globalThis.fetch) {
  const auth = createAuthSession({
    storage: createMemoryTokenStorage('refresh-0'),
    refreshTokens: vi.fn(),
  });
  return createConsoleHttpGateway(
    createApiClient({ baseUrl: BASE, fetch: fetchImpl, getToken: () => 'held-token' }),
    { auth, identity: createMemoryIdentityStore() },
  );
}

const caught = (run: Promise<unknown>) => run.then(() => null).catch((error: unknown) => error);

/**
 * PINs are unique per tablet roster: the server answers 409 `pin-taken`,
 * `context.field = "pin"`, on every route that sets one. The console gets its
 * own error for it, so the sentence lands under the PIN field rather than as
 * a generic conflict.
 */
describe('a PIN somebody on the same tablet already uses', () => {
  const taken = () =>
    vi.fn().mockResolvedValue(problem(409, 'pin-taken', PIN_TAKEN, { field: 'pin' }));

  it('is the PIN refusal on create, with the field and the sentence', async () => {
    const error = await caught(
      gatewayOver(taken()).createStaff({
        venueId: 'v-1',
        staff: {
          fullName: 'Ani',
          phone: '+37477000000',
          role: 'waiter',
          pin: '1234',
          branchId: 'b-1',
        },
      }),
    );
    expect(error).toBeInstanceOf(StaffPinTakenError);
    expect((error as StaffPinTakenError).field).toBe('pin');
    expect((error as StaffPinTakenError).message).toBe(PIN_TAKEN);
    expect((error as StaffPinTakenError).status).toBe(409);
  });

  it('is the PIN refusal when the PIN is set on its own', async () => {
    const error = await caught(
      gatewayOver(taken()).setStaffPin({ venueId: 'v-1', staffMemberId: 's-1', pin: '1234' }),
    );
    expect(error).toBeInstanceOf(StaffPinTakenError);
    expect((error as StaffPinTakenError).message).toBe(PIN_TAKEN);
  });

  it('is the PIN refusal on an edit that would put two equal PINs on one tablet', async () => {
    const error = await caught(
      gatewayOver(taken()).updateStaff({
        venueId: 'v-1',
        staffMemberId: 's-1',
        patch: { setBranch: true, branchId: 'b-2' },
      }),
    );
    expect(error).toBeInstanceOf(StaffPinTakenError);
  });

  it("turns the PIN route's rank refusal into the staff error, as the mock throws it", async () => {
    // The mock has always thrown `StaffPermissionError` for a PIN the actor
    // may not set; over HTTP the 403 used to arrive as a bare ForbiddenError.
    const error = await caught(
      gatewayOver(
        vi
          .fn()
          .mockResolvedValue(
            problem(
              403,
              'forbidden',
              'Setting a PIN requires the Manager role; the caller is a Waiter.',
            ),
          ),
      ).setStaffPin({ venueId: 'v-1', staffMemberId: 's-1', pin: '1234' }),
    );
    expect(error).toBeInstanceOf(StaffPermissionError);
  });

  it('leaves any other 409 alone', async () => {
    const error = await caught(
      gatewayOver(
        vi
          .fn()
          .mockResolvedValue(
            problem(409, 'conflicting-state', 'That email address already has an account.'),
          ),
      ).setStaffPin({ venueId: 'v-1', staffMemberId: 's-1', pin: '1234' }),
    );
    expect(error).not.toBeInstanceOf(StaffPinTakenError);
  });
});

/**
 * The branch binding: a branch manager needs one, a general manager has none.
 * A 422 `validation-failed` naming `branchId`, which the client already turns
 * into a `ValidationError` carrying the field and the server's sentence.
 */
describe('the branch a role is bound to', () => {
  it('arrives as a field refusal on branchId, with the sentence', async () => {
    const sentence = 'A branch manager works at one branch. Choose it.';
    const error = await caught(
      gatewayOver(
        vi.fn().mockResolvedValue(
          problem(422, 'validation-failed', sentence, {
            field: 'branchId',
            fields: [{ field: 'branchId', message: sentence }],
          }),
        ),
      ).createStaff({
        venueId: 'v-1',
        staff: {
          fullName: 'Nare',
          phone: '+37477000000',
          role: 'manager',
          pin: '1234',
          branchId: null,
        },
      }),
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).field).toBe('branchId');
    expect((error as ValidationError).message).toBe(sentence);
  });
});
