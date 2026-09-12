import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { createApiClient } from '../client';
import { BranchNotReadyError } from '../contracts/errors';
import { ConcurrencyConflictError } from '../errors';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';

const BASE = 'https://api.test.yalla.am';

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

function sent(fetchImpl: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
  return { url, method: init.method, body: JSON.parse(init.body as string) as unknown };
}

/**
 * Changing a branch's tier over HTTP.
 *
 * The tier lives on the general branch patch, and the server's two refusals
 * are the whole reason the screen exists: going Paid with an unfinished menu
 * answers `branch-not-ready` with how many dishes are left, and going Free
 * with open tabs answers a plain 409 whose sentence names the tables.
 */
describe('changing a branch tier over HTTP', () => {
  it('patches the platform branch route with the wire integer for the tier', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(problem(409, 'branch-not-ready', 'Finish the menu first.'));

    await gatewayOver(fetchImpl)
      .setBranchTier({ branchId: 'b-1', tier: 'paid', commandId: 'c-1' })
      .catch(() => null);

    const request = sent(fetchImpl);
    expect(request.url).toBe(`${BASE}/api/platform/branches/b-1`);
    expect(request.method).toBe('PATCH');
    expect(request.body).toEqual({ subscriptionTier: 2 });
  });

  it('turns branch-not-ready into a typed error carrying how many dishes are left', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        problem(
          409,
          'branch-not-ready',
          'This branch has 3 menu item(s) that are not ready to show a diner.',
          { branchId: 'b-1', incompleteMenuItemCount: 3 },
        ),
      );

    const caught = await gatewayOver(fetchImpl)
      .setBranchTier({ branchId: 'b-1', tier: 'paid', commandId: 'c-1' })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(BranchNotReadyError);
    expect((caught as BranchNotReadyError).incompleteMenuItemCount).toBe(3);
    expect((caught as BranchNotReadyError).branchId).toBe('b-1');
  });

  it('lets the open-tabs refusal through with the server sentence, since it names the tables', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        problem(
          409,
          'conflicting-state',
          'This branch has 2 open tab(s) on table(s) 4, 7. Wait until they are settled.',
        ),
      );

    const caught = await gatewayOver(fetchImpl)
      .setBranchTier({ branchId: 'b-1', tier: 'free', commandId: 'c-1' })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ConcurrencyConflictError);
    expect((caught as Error).message).toContain('table(s) 4, 7');
  });
});
