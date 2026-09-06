import type { AdminMenuItem } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { matchPhotos, normalise, similarity } from './photoMatching';

/**
 * Matching a drop of thirty photos against a menu.
 *
 * The rule the whole module is arranged around: **a wrong match is far worse
 * than no match.** A photo attached to the wrong dish is found by a diner, and
 * nobody traces it back to an import six weeks earlier. So anything ambiguous
 * goes to the tray untouched, and the tray is a normal outcome rather than a
 * failure — placing twelve photos by hand beside a list is still an order of
 * magnitude faster than opening twelve forms.
 */

function item(id: string, name: string): AdminMenuItem {
  return {
    id,
    categoryId: 'cat-1',
    name,
    description: '',
    priceDram: 1000,
    ingredients: '',
    allergens: '',
    portionSize: '',
    spiceLevel: 'notSpicy',
    prepMinutes: 5,
    photo: {
      photoId: '',
      thumbnailUrl: '',
      cardUrl: '',
      fullUrl: '',
      width: null,
      height: null,
    },
    isAvailable: true,
    displayOrder: 0,
  };
}

const MENU = [
  item('i-khach', 'Khachapuri Adjaruli'),
  item('i-lav', 'Lavash'),
  item('i-capp', 'Cappuccino'),
  item('i-gata', 'Gata'),
  item('i-arm', 'Խաչապուրի'),
];

describe('normalising a filename', () => {
  it('strips the extension, the camera prefix and a counter', () => {
    // The timestamp survives, and is meant to: only a duplicate counter is
    // stripped. A dish called "Beer 500" would otherwise lose its 500 and its
    // photo would land in the tray.
    expect(normalise('IMG_20260904_141233.jpg')).toBe('20260904141233');
    expect(normalise('Beer 500.jpg')).toBe('beer500');
    expect(normalise('Cappuccino (2).JPG')).toBe('cappuccino');
    expect(normalise('PXL_lavash.png')).toBe('lavash');
    expect(normalise('khachapuri-adjaruli.webp')).toBe('khachapuriadjaruli');
  });

  it('keeps Armenian and Russian letters apart from Latin ones', () => {
    // Two different dishes. Collapsing scripts would match a photo of one to
    // the other on a menu that has both, which several will.
    expect(normalise('Խաչապուրի.jpg')).toBe('խաչապուրի');
    expect(normalise('Խաչապուրի.jpg')).not.toBe(normalise('khachapuri.jpg'));
  });
});

describe('matching a drop', () => {
  it('takes an exact filename', () => {
    const { matches, unmatched } = matchPhotos(['Cappuccino.jpg'], MENU);

    expect(unmatched).toEqual([]);
    expect(matches).toEqual([
      { fileName: 'Cappuccino.jpg', itemId: 'i-capp', itemName: 'Cappuccino', confidence: 'exact' },
    ]);
  });

  it('takes a case- and punctuation-insensitive one', () => {
    const { matches } = matchPhotos(['khachapuri-adjaruli.JPEG', 'LAVASH (1).png'], MENU);

    expect(matches.map((match) => match.itemId)).toEqual(['i-khach', 'i-lav']);
    // Not `exact`: worth a glance in the confirmation list, which is why the
    // confidence is reported rather than collapsed into a boolean.
    expect(matches.every((match) => match.confidence === 'normalised')).toBe(true);
  });

  it('surfaces a near match for confirmation rather than dropping it', () => {
    // One transposed pair. Refusing this sends a photo to the tray that
    // obviously belongs somewhere; attaching it silently is the thing this
    // module will not do. So: proposed, and shown.
    const { matches } = matchPhotos(['capuccino.jpg'], MENU);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.itemId).toBe('i-capp');
    expect(matches[0]?.confidence).toBe('near');
  });

  it('leaves a camera filename in the tray', () => {
    // `IMG_20260904_141233.jpg` is the common case on a real phone, and there
    // is nothing in it to match. The tray is where the afternoon's work is.
    const { matches, unmatched } = matchPhotos(
      ['IMG_20260904_141233.jpg', 'IMG_20260904_141301.jpg'],
      MENU,
    );

    expect(matches).toEqual([]);
    expect(unmatched).toEqual(['IMG_20260904_141233.jpg', 'IMG_20260904_141301.jpg']);
  });

  it('leaves an ambiguous filename in the tray rather than picking one', () => {
    const menu = [item('i-a', 'Coffee'), item('i-b', 'Coffee')];
    const { matches, unmatched } = matchPhotos(['coffee.jpg'], menu);

    // Two dishes want it equally. Picking the first is right about half the
    // time, which is not a rate anybody would accept if they were told.
    expect(matches).toEqual([]);
    expect(unmatched).toEqual(['coffee.jpg']);
  });

  it('does not attach two photos to one dish in a single drop', () => {
    const { matches, unmatched } = matchPhotos(['Cappuccino.jpg', 'cappuccino (2).jpg'], MENU);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.fileName).toBe('Cappuccino.jpg');
    // The second is a decision — is it a better photo, or a different dish? —
    // so it goes to the tray beside the list.
    expect(unmatched).toEqual(['cappuccino (2).jpg']);
  });

  it('does not match a short word inside a long name', () => {
    const menu = [item('i-tea', 'Tea'), item('i-cake', 'Tea cake with honey')];
    const { unmatched } = matchPhotos(['teacakewithhoney.jpg'], menu);

    // `tea` is inside `teacakewithhoney`, and treating containment as a strong
    // match regardless of length would hand the cake's photo to the tea.
    expect(unmatched).toEqual([]);
    expect(matchPhotos(['teacakewithhoney.jpg'], menu).matches[0]?.itemId).toBe('i-cake');
  });

  it('orders proposals strongest first', () => {
    const { matches } = matchPhotos(['capuccino.jpg', 'Gata.jpg', 'lavash.png'], MENU);
    expect(matches.map((match) => match.confidence)).toEqual(['exact', 'normalised', 'near']);
  });

  it('scores containment by how much of the longer name it covers', () => {
    expect(similarity('cappuccino', 'cappuccino')).toBe(1);
    expect(similarity('tea', 'teacakewithhoney')).toBeLessThan(0.5);
    expect(similarity('khachapuriadjaruli', 'khachapuriadjarul')).toBeGreaterThan(0.9);
  });
});
