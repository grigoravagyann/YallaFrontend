import { describe, expect, it } from 'vitest';
import type { VenueSummary } from '@yalla/api';
import { branchZoneSource, venueScreenState } from './browse';

const VENUE: VenueSummary = { id: 'lumen-coffee', name: 'Lumen', type: 'cafe', branches: [] };

describe('the venue screen', () => {
  it('says a venue that resolved to nothing is not found, not that it has no branches', () => {
    expect(
      venueScreenState({ offline: false, isLoading: false, isError: false, venue: null }),
    ).toBe('notFound');
  });

  it('renders a real venue with no branches as ready, where the list says so itself', () => {
    expect(
      venueScreenState({ offline: false, isLoading: false, isError: false, venue: VENUE }),
    ).toBe('ready');
  });

  it('puts offline ahead of everything, since a paused read is not a failed one', () => {
    expect(venueScreenState({ offline: true, isLoading: true, isError: false, venue: null })).toBe(
      'offline',
    );
  });
});

describe("the branch screen's zone", () => {
  it('never guesses a zone for a deep link with no venue', () => {
    expect(
      branchZoneSource({
        venueId: undefined,
        venueStatus: 'pending',
        zoneFromVenue: null,
        zoneFromBranch: undefined,
      }),
    ).toEqual({ zone: null, lookup: true });
  });

  it("takes the card's zone when the venue lists the branch, and asks nobody else", () => {
    expect(
      branchZoneSource({
        venueId: 'lumen-coffee',
        venueStatus: 'success',
        zoneFromVenue: 'Europe/Moscow',
        zoneFromBranch: undefined,
      }),
    ).toEqual({ zone: 'Europe/Moscow', lookup: false });
  });

  it('asks the branch when the venue no longer lists it', () => {
    expect(
      branchZoneSource({
        venueId: 'lumen-coffee',
        venueStatus: 'success',
        zoneFromVenue: null,
        zoneFromBranch: 'Asia/Tbilisi',
      }),
    ).toEqual({ zone: 'Asia/Tbilisi', lookup: true });
  });

  it('waits for the venue before asking anybody else', () => {
    expect(
      branchZoneSource({
        venueId: 'lumen-coffee',
        venueStatus: 'pending',
        zoneFromVenue: null,
        zoneFromBranch: undefined,
      }),
    ).toEqual({ zone: null, lookup: false });
  });
});
