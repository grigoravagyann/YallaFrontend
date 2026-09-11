import { describe, expect, it } from 'vitest';
import type { components } from '../generated/schema';
import { publicVenueFromCards } from './publicMapping';

type Card = components['schemas']['Yalla.Application.Public.PublicVenueCard'];

const CARD: Card = {
  venueSlug: 'lumen-coffee',
  name: 'Lumen Coffee',
  type: 1,
  branches: [
    {
      branchId: '0b5f3c1e-0000-4000-8000-000000000001',
      branchSlug: 'northern-avenue',
      name: 'Northern Avenue',
      address: 'Northern Avenue 5, Yerevan',
      freeTableCount: 4,
      isOpenNow: true,
      timeZoneId: 'Asia/Yerevan',
    },
  ],
};

describe('the web venue chooser', () => {
  it("carries each branch's zone from the card instead of leaving it blank", () => {
    const venue = publicVenueFromCards([CARD], 'lumen-coffee');
    expect(venue?.branches[0]?.timeZoneId).toBe('Asia/Yerevan');
  });
});
