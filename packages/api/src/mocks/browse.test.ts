import { describe, expect, it } from 'vitest';
import { createMockGateway } from './mockGateway';

/**
 * The mock's browse list, answering what `/api/public/venues` answers.
 *
 * It used to hand out fixed instants from 2026-09-04, so on any other day every
 * venue read "Closed"; it listed a suspended branch the server never publishes;
 * and it keyed venues by an internal id where the server keys them by slug.
 */

// 2026-09-16 is a Wednesday. Yerevan is UTC+4 all year.
const WEDNESDAY_2PM_YEREVAN = new Date('2026-09-16T10:00:00Z');
const THURSDAY_3AM_YEREVAN = new Date('2026-09-16T23:30:00Z');

describe('the mock browse list', () => {
  it('derives open-now from the week of opening hours, at the injected clock', async () => {
    const open = await createMockGateway({ now: () => WEDNESDAY_2PM_YEREVAN }).getVenue(
      'lumen-coffee',
    );
    const shut = await createMockGateway({ now: () => THURSDAY_3AM_YEREVAN }).getVenue(
      'lumen-coffee',
    );

    const northOpen = open?.branches.find((b) => b.slug === 'northern-avenue');
    const northShut = shut?.branches.find((b) => b.slug === 'northern-avenue');

    expect(northOpen?.openState.isOpen).toBe(true);
    // Open until 01:00, so the close is known and in the branch's own day.
    expect(northOpen?.openState.closesAtUtc).toBe('2026-09-16T21:00:00.000Z');
    expect(northShut?.openState.isOpen).toBe(false);
    expect(northShut?.openState.opensAtUtc).toBe('2026-09-17T05:00:00.000Z');
  });

  it('is not pinned to the day the fixtures were written', async () => {
    const venues = await createMockGateway({ now: () => WEDNESDAY_2PM_YEREVAN }).listVenues();
    expect(venues.some((venue) => venue.branches.some((b) => b.openState.isOpen))).toBe(true);
  });

  it('leaves out a suspended branch, as the public list does', async () => {
    const dolmama = await createMockGateway({ now: () => WEDNESDAY_2PM_YEREVAN }).getVenue(
      'dolmama',
    );
    expect(dolmama?.branches.map((b) => b.slug)).toEqual(['pushkin-street']);
  });

  it('keys venues by slug and carries each branch zone', async () => {
    const venues = await createMockGateway({ now: () => WEDNESDAY_2PM_YEREVAN }).listVenues();
    expect(venues.map((v) => v.id)).toContain('lumen-coffee');
    for (const venue of venues) {
      for (const branch of venue.branches) {
        expect(branch.venueId).toBe(venue.id);
        expect(branch.timeZoneId).toBe('Asia/Yerevan');
      }
    }
  });

  it('still has a branch with nothing free, now that the suspended one is gone', async () => {
    const venues = await createMockGateway({ now: () => WEDNESDAY_2PM_YEREVAN }).listVenues();
    const tumanyan = venues.find((v) => v.id === 'tumanyan-shawarma');
    expect(tumanyan?.branches[0]?.freeTables).toBe(0);
  });
});
