import { beforeEach, describe, expect, it } from 'vitest';
import type { ConsoleGateway } from '../consoleGateway';
import { BASIC_FEATURES, FULL_FEATURES } from '../contracts/branchFeatures';
import { BranchNotReadyError } from '../contracts/errors';
import { ConcurrencyConflictError, ValidationError } from '../errors';
import { createConsoleMockGateway } from './consoleMock';
import { createMockRegistry, type MockRegistry } from './mockRegistry';
import { mockBranchFeatures } from './branchFeaturesMock';

let n = 0;
const cmd = () => `cmd_${(n += 1)}`;

/**
 * The mock honours the server's feature rules, so the platform screen can be
 * driven into every refusal without a backend. Lumen Coffee's fixture has one
 * branch of each kind on purpose: Northern Avenue is on Full with tabs open,
 * Cascade is on Basic with a seeded incomplete dish, Saryan Street is on Full
 * and quiet.
 */
describe('branch features in the mock', () => {
  let gateway: ConsoleGateway;
  let registry: MockRegistry;

  beforeEach(() => {
    n = 0;
    registry = createMockRegistry(() => null);
    gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin', registry });
  });

  it('seeds Full and Basic, and reports each branch on the list row', async () => {
    const venue = await gateway.getVenue('v-lumen');
    const byId = new Map(venue?.branches.map((branch) => [branch.id, branch.features]));
    expect(byId.get('b-lumen-north')).toEqual(FULL_FEATURES);
    expect(byId.get('b-lumen-cascade')).toEqual(BASIC_FEATURES);
    expect(venue?.branchFeatures?.map((branch) => branch.features)).toEqual(
      venue?.branches.map((branch) => branch.features),
    );
  });

  it('refuses table service while a dish is unfinished, and says how many', async () => {
    const caught = await gateway
      .setBranchFeatures({ branchId: 'b-lumen-cascade', features: FULL_FEATURES, commandId: cmd() })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(BranchNotReadyError);
    expect((caught as BranchNotReadyError).incompleteMenuItemCount).toBeGreaterThan(0);
    const venue = await gateway.getVenue('v-lumen');
    expect(venue?.branches.find((b) => b.id === 'b-lumen-cascade')?.features).toEqual(
      BASIC_FEATURES,
    );
  });

  it('refuses table service off while a tab is open', async () => {
    const caught = await gateway
      .setBranchFeatures({ branchId: 'b-lumen-north', features: BASIC_FEATURES, commandId: cmd() })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ConcurrencyConflictError);
    expect(caught).not.toBeInstanceOf(BranchNotReadyError);
  });

  it('refuses pre-orders without a booking channel as a 422 on features', async () => {
    const caught = await gateway
      .setBranchFeatures({
        branchId: 'b-lumen-saryan',
        features: ['preOrders', 'tableService'],
        commandId: cmd(),
      })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as ValidationError).problem?.context?.['field']).toBe('features');
  });

  it('switches a quiet branch, writes the feed line and tells the other mocks', async () => {
    const venue = await gateway.setBranchFeatures({
      branchId: 'b-lumen-saryan',
      features: ['appBookings', 'takeaway', 'tableService'],
      commandId: cmd(),
    });

    expect(venue.branches.find((b) => b.id === 'b-lumen-saryan')?.features).toEqual([
      'appBookings',
      'takeaway',
      'tableService',
    ]);
    expect(mockBranchFeatures(registry, 'b-lumen-saryan')).toEqual([
      'appBookings',
      'takeaway',
      'tableService',
    ]);
    const feed = await gateway.listPlatformActivity({ limit: 5 });
    const line = feed.find((entry) => entry.action === 'branch.features-change');
    expect(line?.target.id).toBe('b-lumen-saryan');
    expect(line?.featuresChange?.removed).toContain('reviews');
    expect(line?.featuresChange?.viaVenue).toBe(false);
  });

  it('applies one set to every branch all or nothing: one refusal moves none', async () => {
    const caught = await gateway
      .applyVenueFeatures({ venueId: 'v-lumen', features: FULL_FEATURES, commandId: cmd() })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(BranchNotReadyError);
    expect((caught as BranchNotReadyError).branchId).toBe('b-lumen-cascade');
    const venue = await gateway.getVenue('v-lumen');
    expect(venue?.branches.find((b) => b.id === 'b-lumen-cascade')?.features).toEqual(
      BASIC_FEATURES,
    );
  });

  it('applies a set every branch takes, with a venue line and one per branch changed', async () => {
    const venue = await gateway.applyVenueFeatures({
      venueId: 'v-sunset',
      features: FULL_FEATURES,
      commandId: cmd(),
    });

    expect(venue.branches.every((branch) => branch.features.includes('tableService'))).toBe(true);
    const feed = await gateway.listPlatformActivity({ limit: 10 });
    const applied = feed.find((entry) => entry.action === 'venue.features-apply');
    expect(applied?.featuresApply).toEqual({
      features: FULL_FEATURES,
      branchCount: venue.branches.length,
      changedCount: venue.branches.length,
    });
    expect(feed.find((entry) => entry.action === 'branch.features-change')?.featuresChange).toEqual(
      { added: ['tableService'], removed: [], viaVenue: true },
    );
  });
});
