import { describe, expect, it } from 'vitest';
import { nearestFirst, repeatedVenues } from './exploreList';

describe('nearestFirst', () => {
  it('puts the nearest first and an unknown distance last, keeping ties in order', () => {
    const places = [
      { id: 'a', distanceKm: null },
      { id: 'b', distanceKm: 1.4 },
      { id: 'c', distanceKm: 0.3 },
      { id: 'd', distanceKm: 1.4 },
    ];
    expect(nearestFirst(places).map((place) => place.id)).toEqual(['c', 'b', 'd', 'a']);
    // The input is left as it was.
    expect(places.map((place) => place.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('repeatedVenues', () => {
  it('names only the venues listed more than once', () => {
    const venues = repeatedVenues([
      { venueName: 'Lumen Coffee' },
      { venueName: 'Dolmama' },
      { venueName: 'Lumen Coffee ' },
    ]);
    expect([...venues]).toEqual(['Lumen Coffee']);
  });
});
