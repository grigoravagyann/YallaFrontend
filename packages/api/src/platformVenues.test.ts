import { beforeEach, describe, expect, it } from 'vitest';
import type { ConsoleGateway } from './consoleGateway';
import type { ConsoleVenue } from './contracts/console';
import { BranchNotReadyError } from './contracts/errors';
import { ConcurrencyConflictError, NetworkError } from './errors';
import { createConsoleMockGateway } from './mocks/consoleMock';
import {
  applyVenueTier,
  checkVenueTier,
  listAllConsoleVenues,
  venueTierSummary,
} from './platformVenues';

/**
 * The venues list's tier column and its one button (HANDOFF section 6, the
 * user's decision of 2026-10-18): the tier lives on each **branch**, the list
 * shows a summary ("Paid", "Free", "Mixed · 1/2"), and its button switches
 * every branch of the venue, one `PATCH /api/platform/branches/{id}` each.
 */

let n = 0;
const cmd = () => `cmd_${(n += 1)}`;

async function venueId(gateway: ConsoleGateway, name: string): Promise<string> {
  const venues = await listAllConsoleVenues(gateway);
  const venue = venues.find((candidate) => candidate.name === name);
  if (!venue) throw new Error(`no venue named ${name}`);
  return venue.id;
}

const row = (paid: number, total: number, tiers?: ConsoleVenue['branchTiers']) => ({
  branchCount: total,
  paidBranchCount: paid,
  ...(tiers ? { branchTiers: tiers } : {}),
});

describe('the tier summary', () => {
  it('is Paid when every branch is, Free when none is, Mixed in between', () => {
    expect(venueTierSummary(row(2, 2))).toEqual({ kind: 'paid', paid: 2, total: 2 });
    expect(venueTierSummary(row(0, 3))).toEqual({ kind: 'free', paid: 0, total: 3 });
    expect(venueTierSummary(row(1, 2))).toEqual({ kind: 'mixed', paid: 1, total: 2 });
  });

  it('is nothing to switch for a venue with no branch', () => {
    expect(venueTierSummary(row(0, 0)).kind).toBe('none');
  });

  it("prefers the branches' own tiers when the source lists them", () => {
    const tiers = [
      { id: 'a', name: 'A', subscriptionTier: 'paid' as const },
      { id: 'b', name: 'B', subscriptionTier: 'paid' as const },
    ];
    // A stale count beside a fresher branch list: the list wins.
    expect(venueTierSummary(row(1, 2, tiers))).toEqual({ kind: 'paid', paid: 2, total: 2 });
  });
});

describe('listing every venue', () => {
  it('pages through to the total, deleted venues included', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const asked: number[] = [];
    const counting: ConsoleGateway = {
      ...gateway,
      listVenues: (query) => {
        asked.push(query.page ?? 1);
        return gateway.listVenues({ ...query, pageSize: 4 });
      },
    };
    const all = await listAllConsoleVenues(counting);
    const total = (await gateway.listVenues({ includeDeleted: true, pageSize: 200 })).total;
    expect(all).toHaveLength(total);
    expect(asked.length).toBeGreaterThan(1);
    expect(all.some((venue) => venue.status === 'deleted')).toBe(true);
  });
});

describe('checking a tier change before it is made', () => {
  let gateway: ConsoleGateway;
  beforeEach(() => {
    n = 0;
    gateway = createConsoleMockGateway({ latencyMs: 0 });
  });

  it('names the branch whose menu stops Mountain View going Paid', async () => {
    const check = await checkVenueTier(gateway, {
      venueId: await venueId(gateway, 'Mountain View'),
      tier: 'paid',
    });
    expect(check.toChange).toHaveLength(2);
    expect(check.blockers).toHaveLength(1);
    expect(check.blockers[0]?.incompleteMenuItemCount).toBe(4);
    expect(check.blockers[0]?.branch.name).toBeTruthy();
  });

  it('finds nothing in the way of Sunset Lounge', async () => {
    const check = await checkVenueTier(gateway, {
      venueId: await venueId(gateway, 'Sunset Lounge'),
      tier: 'paid',
    });
    expect(check.toChange).toHaveLength(1);
    expect(check.blockers).toEqual([]);
  });

  it('only changes the branches not already on the tier', async () => {
    const check = await checkVenueTier(gateway, {
      venueId: await venueId(gateway, 'Yalla Demo Cafe'),
      tier: 'paid',
    });
    expect(check.toChange.map((branch) => branch.subscriptionTier)).toEqual(['free']);
  });

  it('leaves the decision to the server when readiness cannot be read', async () => {
    const blind: ConsoleGateway = {
      ...gateway,
      getBranchReadiness: () => Promise.reject(new NetworkError({ url: 'x' })),
    };
    const check = await checkVenueTier(blind, {
      venueId: await venueId(gateway, 'Mountain View'),
      tier: 'paid',
    });
    expect(check.blockers).toEqual([]);
  });
});

describe('switching every branch of a venue', () => {
  let gateway: ConsoleGateway;
  beforeEach(() => {
    n = 0;
    gateway = createConsoleMockGateway({ latencyMs: 0 });
  });

  it('moves Sunset Lounge to Paid', async () => {
    const id = await venueId(gateway, 'Sunset Lounge');
    const result = await applyVenueTier(gateway, { venueId: id, tier: 'paid', commandId: cmd() });
    expect(result.refused).toEqual([]);
    expect(result.changed).toHaveLength(1);
    expect(result.venue.branches.every((branch) => branch.subscriptionTier === 'paid')).toBe(true);
  });

  it('moves the free half of a mixed venue and leaves the paid half alone', async () => {
    const id = await venueId(gateway, 'Yalla Demo Cafe');
    const result = await applyVenueTier(gateway, { venueId: id, tier: 'paid', commandId: cmd() });
    expect(result.changed).toHaveLength(1);
    expect(result.venue.branches.every((branch) => branch.subscriptionTier === 'paid')).toBe(true);
  });

  it('changes nothing at Mountain View: the unready branch refuses before any is switched', async () => {
    const id = await venueId(gateway, 'Mountain View');
    const result = await applyVenueTier(gateway, { venueId: id, tier: 'paid', commandId: cmd() });
    expect(result.changed).toEqual([]);
    expect(result.refused).toHaveLength(1);
    expect(result.refused[0]?.error).toBeInstanceOf(BranchNotReadyError);
    const after = await gateway.getVenue(id);
    expect(after?.branches.every((branch) => branch.subscriptionTier === 'free')).toBe(true);
  });

  it("reports the server's refusal, naming the branch, when the check could not see it", async () => {
    const id = await venueId(gateway, 'Cascade Cafe');
    const result = await applyVenueTier(gateway, { venueId: id, tier: 'free', commandId: cmd() });
    expect(result.changed).toEqual([]);
    expect(result.refused[0]?.error).toBeInstanceOf(ConcurrencyConflictError);
    expect(result.refused[0]?.branch.name).toBeTruthy();
  });

  it('says honestly what changed when a later branch fails', async () => {
    const id = await venueId(gateway, 'Mountain View');
    // Readiness cannot be read, so the switch starts, and the server refuses
    // the second branch after the first has moved.
    let calls = 0;
    const racing: ConsoleGateway = {
      ...gateway,
      getBranchReadiness: () => Promise.reject(new NetworkError({ url: 'x' })),
      setBranchTier: (input) => {
        calls += 1;
        return gateway.setBranchTier(input);
      },
    };
    const result = await applyVenueTier(racing, { venueId: id, tier: 'paid', commandId: cmd() });
    // The ready branch is first in the fixture, so it moves; the second refuses.
    expect(calls).toBe(2);
    expect(result.changed).toHaveLength(1);
    expect(result.refused).toHaveLength(1);
    expect(result.refused[0]?.error).toBeInstanceOf(BranchNotReadyError);
    // Whatever moved before the refusal is reported as moved, and is.
    const after = await gateway.getVenue(id);
    for (const branch of result.changed) {
      expect(after?.branches.find((b) => b.id === branch.id)?.subscriptionTier).toBe('paid');
    }
  });

  it('sends one command id per branch, derived from the one it was given', async () => {
    const id = await venueId(gateway, 'Yalla Demo Cafe');
    const sentIds: string[] = [];
    const watching: ConsoleGateway = {
      ...gateway,
      setBranchTier: (input) => {
        sentIds.push(input.commandId);
        return gateway.setBranchTier(input);
      },
    };
    await applyVenueTier(watching, { venueId: id, tier: 'paid', commandId: 'c-1' });
    expect(sentIds.length).toBeGreaterThan(0);
    for (const sent of sentIds) expect(sent.startsWith('c-1')).toBe(true);
  });
});

describe('switching one branch, from the venue page', () => {
  let gateway: ConsoleGateway;
  beforeEach(() => {
    n = 0;
    gateway = createConsoleMockGateway({ latencyMs: 0 });
  });

  it("checks and moves only the branch it was given: Mountain View's ready one goes Paid", async () => {
    const id = await venueId(gateway, 'Mountain View');
    const venue = await gateway.getVenue(id);
    const ready = venue!.branches.find((branch) => branch.slug === 'kanaker')!;

    const check = await checkVenueTier(gateway, {
      venueId: id,
      tier: 'paid',
      branchIds: [ready.id],
    });
    expect(check.toChange.map((branch) => branch.id)).toEqual([ready.id]);
    expect(check.blockers).toEqual([]);

    const result = await applyVenueTier(gateway, {
      venueId: id,
      tier: 'paid',
      commandId: cmd(),
      branchIds: [ready.id],
    });
    expect(result.changed.map((branch) => branch.id)).toEqual([ready.id]);
    const after = await gateway.getVenue(id);
    expect(after?.branches.find((branch) => branch.id === ready.id)?.subscriptionTier).toBe('paid');
    expect(after?.branches.find((branch) => branch.id !== ready.id)?.subscriptionTier).toBe('free');
  });

  it('still refuses the unready branch on its own', async () => {
    const id = await venueId(gateway, 'Mountain View');
    const venue = await gateway.getVenue(id);
    const unready = venue!.branches.find((branch) => branch.slug === 'nor-nork')!;
    const check = await checkVenueTier(gateway, {
      venueId: id,
      tier: 'paid',
      branchIds: [unready.id],
    });
    expect(check.blockers.map((blocker) => blocker.incompleteMenuItemCount)).toEqual([4]);
  });
});
