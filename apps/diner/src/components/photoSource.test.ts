import { describe, expect, it } from 'vitest';
import { hasPhotoSource } from './photoSource';

/**
 * `PhotoImage` draws its fallback from the first frame when this says no.
 * A blank URL used to reach `Image`, which on the web build never errors, so a
 * place with no cover rendered an empty grey box with no glyph.
 */
describe('hasPhotoSource', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an empty string', ''],
    ['whitespace', '   '],
    ['an object with an empty uri', { uri: '' }],
    ['an object with no uri', {}],
    ['an empty array', []],
    ['an array of blank uris', [{ uri: '' }, { uri: ' ' }]],
  ])('treats %s as missing', (_label, source) => {
    expect(hasPhotoSource(source as Parameters<typeof hasPhotoSource>[0])).toBe(false);
  });

  it.each([
    ['a URL', 'https://example.test/photo.jpg'],
    ['an object with a uri', { uri: 'https://example.test/photo.jpg' }],
    ['a bundled asset', 42],
    ['an array with one usable uri', [{ uri: '' }, { uri: 'https://example.test/a.jpg' }]],
  ])('accepts %s', (_label, source) => {
    expect(hasPhotoSource(source as Parameters<typeof hasPhotoSource>[0])).toBe(true);
  });
});
