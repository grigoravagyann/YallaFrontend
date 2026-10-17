import { describe, expect, it } from 'vitest';
import { categoryPhotos } from './categories';

describe('categoryPhotos', () => {
  it('takes each kind’s photo from the first place of that kind that has one', () => {
    expect(
      categoryPhotos([
        { type: 'cafe', photos: [] },
        { type: 'cafe', photos: ['cafe.jpg', 'cafe-2.jpg'] },
        { type: 'bar', photos: ['bar.jpg'] },
        { type: 'restaurant', photos: ['restaurant.jpg'] },
        { type: 'bar', photos: ['other-bar.jpg'] },
      ]),
    ).toEqual({ cafe: 'cafe.jpg', restaurant: 'restaurant.jpg', bar: 'bar.jpg' });
  });

  it('leaves a kind with no photographed place without a photo', () => {
    expect(categoryPhotos([{ type: 'cafe', photos: ['cafe.jpg'] }])).toEqual({
      cafe: 'cafe.jpg',
      restaurant: undefined,
      bar: undefined,
    });
  });
});
