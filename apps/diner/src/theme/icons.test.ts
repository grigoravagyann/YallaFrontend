import { describe, expect, it } from 'vitest';
import {
  actionIcon,
  amenityIcon,
  filledIconAllowlist,
  navIcons,
  placeTypeIcon,
  ratingIcon,
} from './icons';

/**
 * The glyph vocabulary is outline throughout.
 *
 * A filled glyph beside outline ones reads as selected, so a stray filled icon
 * is not a style slip but a false state. The only fills allowed are the ones
 * where the fill is the information: saved, favourited, and earned stars.
 */
describe('icon vocabulary', () => {
  const vocabulary: readonly (readonly [string, string])[] = [
    ...Object.entries(navIcons).flatMap(([route, pair]) => [
      [`navIcons.${route}.outline`, pair.outline] as const,
      [`navIcons.${route}.filled`, pair.filled] as const,
    ]),
    ...Object.entries(placeTypeIcon).map(([key, name]) => [`placeTypeIcon.${key}`, name] as const),
    ...Object.entries(amenityIcon).map(([key, name]) => [`amenityIcon.${key}`, name] as const),
    ...Object.entries(actionIcon).map(([key, name]) => [`actionIcon.${key}`, name] as const),
  ];

  it.each(vocabulary)('%s is an outline glyph or an allowed fill', (_key, name) => {
    const allowed = name.endsWith('-outline') || (filledIconAllowlist as string[]).includes(name);
    expect(allowed).toBe(true);
  });

  it('allows only the saved and favourited fills', () => {
    expect([...filledIconAllowlist].sort()).toEqual(['bookmark', 'heart']);
  });

  it('rating stars are the one filled-and-outline pair', () => {
    expect(ratingIcon).toEqual({ filled: 'star', empty: 'star-outline' });
  });

  it('place types and Wi-Fi use their outline glyphs', () => {
    expect(placeTypeIcon).toEqual({ restaurant: 'restaurant-outline', cafe: 'cafe-outline' });
    expect(amenityIcon.wifi).toBe('wifi-outline');
    expect(actionIcon.star).toBe('star-outline');
  });
});
