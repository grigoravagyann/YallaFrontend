import { beforeEach, describe, expect, it } from 'vitest';
import type { ConsoleGateway } from '../consoleGateway';
import { BranchNotReadyError } from '../contracts/errors';
import { ConcurrencyConflictError } from '../errors';
import { createConsoleMockGateway } from './consoleMock';

let n = 0;
const cmd = () => `cmd_${(n += 1)}`;

/**
 * The mock honours the server's two tier rules, so the platform screen can be
 * driven into both refusals without a backend. Lumen Coffee's fixture has one
 * branch of each kind on purpose: Northern Avenue is Paid with tabs open,
 * Cascade is Free with a seeded incomplete dish, Saryan Street is Paid and
 * quiet.
 */
describe('changing a branch tier in the mock', () => {
  let gateway: ConsoleGateway;

  beforeEach(() => {
    n = 0;
    gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
  });

  it('refuses Paid while a dish is unfinished, and says how many', async () => {
    const caught = await gateway
      .setBranchTier({ branchId: 'b-lumen-cascade', tier: 'paid', commandId: cmd() })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(BranchNotReadyError);
    // The number the refusal quotes is the number the menu editor shows as
    // unfinished, by the server's six-field rule. Counted from the menu the
    // admin actually sees, so the two cannot drift.
    const menu = await gateway.getAdminMenu('b-lumen-cascade');
    const unfinished = menu
      .flatMap((category) => category.items)
      .filter(
        (item) =>
          !item.photo.photoId ||
          !item.description ||
          !item.ingredients ||
          !item.allergens ||
          !item.portionSize ||
          item.prepMinutes <= 0,
      ).length;
    expect(unfinished).toBeGreaterThan(0);
    expect((caught as BranchNotReadyError).incompleteMenuItemCount).toBe(unfinished);

    const venue = await gateway.getVenue('v-lumen');
    expect(venue?.branches.find((b) => b.id === 'b-lumen-cascade')?.subscriptionTier).toBe('free');
  });

  it('refuses Free while a tab is open, naming the count in the sentence', async () => {
    const caught = await gateway
      .setBranchTier({ branchId: 'b-lumen-north', tier: 'free', commandId: cmd() })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ConcurrencyConflictError);
    expect((caught as Error).message).toMatch(/2 open tab/u);
  });

  it('moves a quiet Paid branch to Free and answers with the whole venue', async () => {
    const venue = await gateway.setBranchTier({
      branchId: 'b-lumen-saryan',
      tier: 'free',
      commandId: cmd(),
    });

    expect(venue.id).toBe('v-lumen');
    expect(venue.branches.find((b) => b.id === 'b-lumen-saryan')?.subscriptionTier).toBe('free');
  });
});
