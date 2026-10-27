import { describe, expect, it } from 'vitest';
import type { ConsoleGateway } from './consoleGateway';
import {
  BASIC_FEATURES,
  FULL_FEATURES,
  featurePreset,
  preOrdersWithoutBookings,
  sameFeatures,
  sortFeatures,
  type BranchFeature,
} from './contracts/branchFeatures';
import { createConsoleMockGateway } from './mocks/consoleMock';
import { listAllConsoleVenues, venueFeatures } from './platformVenues';

/**
 * The venues list's feature column (2026-10-27, in place of the Free/Paid
 * tier): what the platform allows is per **branch**, and the list says it in
 * a word — Full, Basic, one other set, or branches on different sets.
 */

const branch = (features: readonly BranchFeature[]) => ({ id: 'b', name: 'b', features });

describe('the feature presets', () => {
  it('names Full and Basic, and anything else custom', () => {
    expect(FULL_FEATURES).toHaveLength(10);
    expect(BASIC_FEATURES).not.toContain('tableService');
    expect(BASIC_FEATURES).toHaveLength(9);
    expect(featurePreset([...FULL_FEATURES].reverse())).toBe('full');
    expect(featurePreset(BASIC_FEATURES)).toBe('basic');
    expect(featurePreset(['appBookings'])).toBe('custom');
    expect(featurePreset([])).toBe('custom');
  });

  it('keeps the server order whatever order the set came in', () => {
    expect(sortFeatures(['reports', 'appBookings', 'reports'])).toEqual(['appBookings', 'reports']);
    expect(sameFeatures(['reviews', 'takeaway'], ['takeaway', 'reviews'])).toBe(true);
    expect(sameFeatures(['reviews'], ['reviews', 'takeaway'])).toBe(false);
  });

  it('knows pre-orders need app or web bookings', () => {
    expect(preOrdersWithoutBookings(['preOrders', 'takeaway'])).toBe(true);
    expect(preOrdersWithoutBookings(['preOrders', 'webBookings'])).toBe(false);
    expect(preOrdersWithoutBookings(['appBookings'])).toBe(false);
  });
});

describe('the venue feature summary', () => {
  it('is the preset every branch shares', () => {
    expect(
      venueFeatures({ branchFeatures: [branch(FULL_FEATURES), branch(FULL_FEATURES)] }),
    ).toEqual({ kind: 'full', features: FULL_FEATURES, branchCount: 2 });
    expect(venueFeatures({ branchFeatures: [branch(BASIC_FEATURES)] }).kind).toBe('basic');
  });

  it('is custom when every branch shares another set, and mixed when they differ', () => {
    expect(venueFeatures({ branchFeatures: [branch(['reviews', 'appBookings'])] })).toEqual({
      kind: 'custom',
      features: ['appBookings', 'reviews'],
      branchCount: 1,
    });
    expect(
      venueFeatures({ branchFeatures: [branch(FULL_FEATURES), branch(BASIC_FEATURES)] }),
    ).toEqual({ kind: 'mixed', features: null, branchCount: 2 });
  });

  it('is nothing for a venue with no branch, or a row that does not say', () => {
    expect(venueFeatures({ branchFeatures: [] }).kind).toBe('none');
    expect(venueFeatures({}).kind).toBe('none');
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
