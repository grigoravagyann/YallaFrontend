import { beforeEach, describe, expect, it } from 'vitest';
import type { ConsoleGateway } from '../consoleGateway';
import type { ConsoleVenue } from '../contracts/console';
import { BranchNotReadyError, VenueDeletionBlockedError } from '../contracts/errors';
import { ConcurrencyConflictError } from '../errors';
import { createConsoleMockGateway } from './consoleMock';

let n = 0;
const cmd = () => `cmd_${(n += 1)}`;

/**
 * The platform venues list's demo world (docs/design/console/HANDOFF.md, the
 * Venues artboard): the nine venues the artboard draws, each in the state the
 * artboard shows, so every branch of the redesigned list can be walked in mock
 * mode. Mountain View is the Paid refusal and Sunset Lounge the allowed path
 * (HANDOFF section 3); Cascade Cafe is the delete the open tabs block.
 */

const DEMO = [
  'Cascade Cafe',
  'City Bites',
  'Garden Bistro',
  'Luna Cafe',
  'Mountain View',
  'Old Town Pub',
  'Riverside Restaurant',
  'Sunset Lounge',
  'Yalla Demo Cafe',
];

async function everyVenue(gateway: ConsoleGateway): Promise<readonly ConsoleVenue[]> {
  return (await gateway.listVenues({ pageSize: 200, includeDeleted: true })).items;
}

async function venueNamed(gateway: ConsoleGateway, name: string): Promise<ConsoleVenue> {
  const venue = (await everyVenue(gateway)).find((candidate) => candidate.name === name);
  if (!venue) throw new Error(`no venue named ${name}`);
  return venue;
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('the console mock — the venues list demo world', () => {
  let gateway: ConsoleGateway;

  beforeEach(() => {
    n = 0;
    gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
  });

  it('lists the artboard venues, with Old Town Pub deleted and hidden by default', async () => {
    const names = (await everyVenue(gateway)).map((venue) => venue.name);
    for (const name of DEMO) expect(names).toContain(name);

    const pub = await venueNamed(gateway, 'Old Town Pub');
    expect(pub.status).toBe('deleted');
    const live = (await gateway.listVenues({ pageSize: 200 })).items.map((venue) => venue.name);
    expect(live).not.toContain('Old Town Pub');
    expect((await venueNamed(gateway, 'Garden Bistro')).status).toBe('suspended');
  });

  it('carries the tier per branch: how many are paid, and each branch with its own', async () => {
    const cascade = await venueNamed(gateway, 'Cascade Cafe');
    expect(cascade.paidBranchCount).toBe(cascade.branchCount);

    const sunset = await venueNamed(gateway, 'Sunset Lounge');
    expect(sunset.paidBranchCount).toBe(0);

    // The mixed one: "Mixed · 1/2" in the list.
    const demo = await venueNamed(gateway, 'Yalla Demo Cafe');
    expect(demo.branchCount).toBe(2);
    expect(demo.paidBranchCount).toBe(1);
    expect(demo.branchTiers?.map((branch) => branch.subscriptionTier).sort()).toEqual([
      'free',
      'paid',
    ]);
  });

  it("carries the list's newer columns: rating, open tabs, cuisine, district and cover", async () => {
    const cascade = await venueNamed(gateway, 'Cascade Cafe');
    expect(cascade.rating).toBe(4.7);
    expect(cascade.reviewCount).toBe(1200);
    expect(cascade.openTabCount).toBe(15);
    expect(cascade.cuisine).toBeTruthy();
    expect(cascade.district).toBeTruthy();
    expect(cascade.coverThumbnailUrl).toMatch(/^data:image\/svg\+xml/u);

    // No reviews and no cover yet: reported as none, not left unreported.
    const sunset = await venueNamed(gateway, 'Sunset Lounge');
    expect(sunset.rating).toBeNull();
    expect(sunset.reviewCount).toBe(0);
    expect(sunset.coverThumbnailUrl).toBeNull();
  });

  it('says why a venue is not ready, amber-worthy reasons only', async () => {
    expect((await venueNamed(gateway, 'Cascade Cafe')).readinessIssue).toBeNull();
    expect((await venueNamed(gateway, 'Sunset Lounge')).readinessIssue).toMatchObject({
      kind: 'noPhoto',
    });
    expect((await venueNamed(gateway, 'Garden Bistro')).readinessIssue).toMatchObject({
      kind: 'noHours',
    });
    expect((await venueNamed(gateway, 'Riverside Restaurant')).readinessIssue).toEqual({
      kind: 'incompleteDishes',
      count: 3,
      branchName: null,
    });
    // Two branches: the issue names the one that has it.
    const mountain = await venueNamed(gateway, 'Mountain View');
    expect(mountain.branchCount).toBe(2);
    expect(mountain.readinessIssue).toMatchObject({ kind: 'incompleteDishes', count: 4 });
    expect(mountain.readinessIssue?.branchName).toBeTruthy();
  });

  it('refuses Mountain View going Paid, at the branch whose menu is unfinished', async () => {
    const mountain = await venueNamed(gateway, 'Mountain View');
    const detail = await gateway.getVenue(mountain.id);
    const unready = detail?.branches.find(
      (branch) => branch.name === mountain.readinessIssue?.branchName,
    );
    expect(unready).toBeTruthy();

    const refusal = await caught(
      gateway.setBranchTier({ branchId: unready!.id, tier: 'paid', commandId: cmd() }),
    );
    expect(refusal).toBeInstanceOf(BranchNotReadyError);
    expect((refusal as BranchNotReadyError).incompleteMenuItemCount).toBe(4);

    const readiness = await gateway.getBranchReadiness(unready!.id);
    expect(readiness.incompleteMenuItemCount).toBe(4);
  });

  it('lets Sunset Lounge go Paid', async () => {
    const sunset = await venueNamed(gateway, 'Sunset Lounge');
    const detail = await gateway.getVenue(sunset.id);
    const branch = detail!.branches[0]!;
    expect((await gateway.getBranchReadiness(branch.id)).incompleteMenuItemCount).toBe(0);

    const after = await gateway.setBranchTier({
      branchId: branch.id,
      tier: 'paid',
      commandId: cmd(),
    });
    expect(after.branches[0]?.subscriptionTier).toBe('paid');
    expect((await venueNamed(gateway, 'Sunset Lounge')).paidBranchCount).toBe(1);
  });

  it('refuses Cascade Cafe going Free while its tabs are open', async () => {
    const cascade = await venueNamed(gateway, 'Cascade Cafe');
    const detail = await gateway.getVenue(cascade.id);
    const refusal = await caught(
      gateway.setBranchTier({ branchId: detail!.branches[0]!.id, tier: 'free', commandId: cmd() }),
    );
    expect(refusal).toBeInstanceOf(ConcurrencyConflictError);
  });

  it('blocks deleting Cascade Cafe with its 15 open tabs', async () => {
    const cascade = await venueNamed(gateway, 'Cascade Cafe');
    const refusal = await caught(gateway.deleteVenue({ venueId: cascade.id, commandId: cmd() }));
    expect(refusal).toBeInstanceOf(VenueDeletionBlockedError);
    expect((refusal as VenueDeletionBlockedError).openTables).toHaveLength(15);
  });
});

describe('the console mock — undoing a delete', () => {
  let gateway: ConsoleGateway;

  beforeEach(() => {
    n = 0;
    gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
  });

  it('restores a deleted venue to active, and back into the default list', async () => {
    const sunset = await venueNamed(gateway, 'Sunset Lounge');
    await gateway.deleteVenue({ venueId: sunset.id, commandId: cmd() });
    expect((await gateway.listVenues({ pageSize: 200 })).items.map((v) => v.id)).not.toContain(
      sunset.id,
    );

    const restored = await gateway.restoreVenue({ venueId: sunset.id, commandId: cmd() });
    expect(restored.status).toBe('active');
    expect((await gateway.listVenues({ pageSize: 200 })).items.map((v) => v.id)).toContain(
      sunset.id,
    );
  });

  it('restores Old Town Pub, deleted in the fixture', async () => {
    const pub = await venueNamed(gateway, 'Old Town Pub');
    expect((await gateway.restoreVenue({ venueId: pub.id, commandId: cmd() })).status).toBe(
      'active',
    );
  });

  it('answers a venue that is not deleted as it is, as the server does', async () => {
    const luna = await venueNamed(gateway, 'Luna Cafe');
    const answer = await gateway.restoreVenue({ venueId: luna.id, commandId: cmd() });
    expect(answer.status).toBe(luna.status);
  });

  it('is a platform-admin command', async () => {
    const owner = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const refusal = await caught(owner.restoreVenue({ venueId: 'v-lumen', commandId: cmd() }));
    expect(refusal).toBeTruthy();
  });
});
