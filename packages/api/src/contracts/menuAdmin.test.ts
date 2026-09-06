import { describe, expect, it } from 'vitest';
import {
  ALLERGEN_PRESETS,
  EMPTY_DRAFT,
  REQUIRED_MENU_ITEM_FIELDS,
  allergenText,
  duplicateDraft,
  incompleteCount,
  isComplete,
  itemToDraft,
  menuItemGaps,
  parseAllergens,
  reorder,
  storedItemGaps,
  type AdminMenuCategory,
  type AdminMenuItem,
  type MenuItemDraft,
} from './menuAdmin';

/**
 * The menu editor's pure layer.
 *
 * Three of these guard the same thing from different sides: an owner entering
 * eighty dishes must be told everything that is missing, once, in a list they
 * can work down. A form that reveals one gap per submit is a menu that never
 * gets finished, and an unfinished menu means ordering does not exist for that
 * venue.
 */

function item(over: Partial<AdminMenuItem> = {}): AdminMenuItem {
  return {
    id: 'item-1',
    categoryId: 'cat-1',
    name: 'Խաչապուրի',
    description: 'Adjaruli, with an egg',
    priceDram: 2800,
    ingredients: 'flour, sulguni, egg, butter',
    allergens: 'gluten, dairy, egg',
    portionSize: '1 boat',
    spiceLevel: 'notSpicy',
    prepMinutes: 18,
    photo: {
      photoId: 'photo-1',
      thumbnailUrl: '/api/photos/photo-1/thumbnail',
      cardUrl: '/api/photos/photo-1/card',
      fullUrl: '/api/photos/photo-1/full',
      width: 1600,
      height: 1200,
    },
    isAvailable: true,
    displayOrder: 0,
    ...over,
  };
}

function draft(over: Partial<MenuItemDraft> = {}): MenuItemDraft {
  return { ...itemToDraft(item()), ...over };
}

// ---------------------------------------------------------------------------
// Test 3: every missing field at once
// ---------------------------------------------------------------------------

describe('an item that cannot be saved yet', () => {
  it('names every missing field at once, not the first one', () => {
    const gaps = menuItemGaps({
      ...EMPTY_DRAFT,
      name: 'Coffee',
    });

    // Seven of the eight: the name is there. All of them, in one answer — a
    // form that surfaced these one submit at a time makes somebody press the
    // button seven times to learn seven things, and they stop at three.
    expect(gaps).toEqual([
      'description',
      'priceDram',
      'allergens',
      'ingredients',
      'portionSize',
      'prepMinutes',
      'photoId',
    ]);
  });

  it('is complete only when nothing is missing', () => {
    expect(menuItemGaps(draft())).toEqual([]);
  });

  it('treats a blank-but-present field as missing', () => {
    // Whitespace is what a paste produces, and the server refuses it too.
    expect(menuItemGaps(draft({ name: '   ' }))).toContain('name');
    expect(menuItemGaps(draft({ portionSize: '\t' }))).toContain('portionSize');
  });

  it('treats a zero price and a zero prep time as missing, not as values', () => {
    // A free dish is a comp, and a venue's own numbers stop meaning anything if
    // one is entered as an item that costs nothing.
    expect(menuItemGaps(draft({ priceDram: 0 }))).toContain('priceDram');
    expect(menuItemGaps(draft({ prepMinutes: 0 }))).toContain('prepMinutes');
  });

  it('accepts an allergen the preset list does not name', () => {
    // "None" is a real answer and so is "celery". The chips cover the common
    // cases; the free-text field is what stops the list being a straitjacket.
    const withOther = draft({ allergens: [], allergensOther: 'celery' });
    expect(menuItemGaps(withOther)).not.toContain('allergens');
    expect(allergenText(withOther)).toBe('celery');
  });

  it('covers exactly the fields the server requires', () => {
    // The two lists are the same list. A client to-do that counted something
    // else would tell a venue it is ready when the API will refuse.
    const everyGap = menuItemGaps(EMPTY_DRAFT);
    expect([...everyGap].sort()).toEqual([...REQUIRED_MENU_ITEM_FIELDS].sort());
  });
});

// ---------------------------------------------------------------------------
// Test 4: duplicating
// ---------------------------------------------------------------------------

describe('duplicating an item', () => {
  it('copies every field except the identity, and clears the photo', () => {
    const original = item({ name: 'Cappuccino', priceDram: 1200, spiceLevel: 'mild' });
    const copy = duplicateDraft(original);

    // Everything an owner would otherwise retype for the second of three sizes.
    expect(copy.name).toBe('Cappuccino');
    expect(copy.priceDram).toBe(1200);
    expect(copy.description).toBe(original.description);
    expect(copy.ingredients).toEqual(['flour', 'sulguni', 'egg', 'butter']);
    expect(copy.portionSize).toBe(original.portionSize);
    expect(copy.spiceLevel).toBe('mild');
    expect(copy.prepMinutes).toBe(original.prepMinutes);
    expect(allergenText(copy)).toBe(original.allergens);

    // The identity does not come along: a draft has no id by construction.
    expect(copy).not.toHaveProperty('id');

    // And the photo reference is cleared rather than shared. Sharing one looks
    // like a saving and is not — deleting either item would break the other's
    // card — and the server's own dedupe makes re-uploading the same bytes
    // free anyway.
    expect(copy.photoId).toBeNull();
    expect(menuItemGaps(copy)).toEqual(['photoId']);
  });
});

// ---------------------------------------------------------------------------
// Test 6: completeness counting
// ---------------------------------------------------------------------------

describe('the completeness count', () => {
  it('matches the server definition of required', () => {
    const complete = item({ id: 'a' });
    const noPhoto = item({
      id: 'b',
      photo: { ...item().photo, photoId: '' },
    });
    const noAllergens = item({ id: 'c', allergens: '' });
    const noIngredients = item({ id: 'd', ingredients: '   ' });

    expect(isComplete(complete)).toBe(true);
    expect(storedItemGaps(noPhoto)).toEqual(['photoId']);
    expect(storedItemGaps(noAllergens)).toEqual(['allergens']);
    expect(storedItemGaps(noIngredients)).toEqual(['ingredients']);

    const category: AdminMenuCategory = {
      id: 'cat-1',
      name: 'Hot',
      displayOrder: 0,
      items: [complete, noPhoto, noAllergens, noIngredients],
    };

    // Three of four. This is the number on the category row and the number the
    // onboarding checklist reads; there is one function behind both.
    expect(incompleteCount(category)).toBe(3);
  });

  it('counts an unavailable but finished item as complete', () => {
    // "We're out of khachapuri tonight" is not an unfinished menu. Conflating
    // the two would show a venue as not ready every time something sold out.
    expect(isComplete(item({ isAvailable: false }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 8: reordering
// ---------------------------------------------------------------------------

describe('reordering', () => {
  it('produces dense zero-based display orders', () => {
    const changes = reorder(['a', 'b', 'c', 'd'], 3, 0);

    // d moves to the front; everything shifts down one. The API is told about
    // each row's new index, and the indices are dense from zero, which is what
    // the sort on the way back in reads.
    expect(changes).toEqual([
      { id: 'd', displayOrder: 0 },
      { id: 'a', displayOrder: 1 },
      { id: 'b', displayOrder: 2 },
      { id: 'c', displayOrder: 3 },
    ]);
  });

  it('sends only the rows that actually moved', () => {
    const changes = reorder(['a', 'b', 'c', 'd', 'e'], 1, 2);

    // Swapping two adjacent rows is two PATCHes, not five. On an eighty-item
    // menu the difference is two requests against eighty, and every one of
    // those eighty is a chance to half-apply.
    expect(changes).toEqual([
      { id: 'c', displayOrder: 1 },
      { id: 'b', displayOrder: 2 },
    ]);
  });

  it('sends nothing when a drag ends where it started', () => {
    expect(reorder(['a', 'b', 'c'], 1, 1)).toEqual([]);
    expect(reorder(['a', 'b', 'c'], -1, 0)).toEqual([]);
    expect(reorder(['a', 'b', 'c'], 0, 9)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Allergens
// ---------------------------------------------------------------------------

describe('allergen chips', () => {
  it('round-trips a stored string without losing what somebody typed', () => {
    const parsed = parseAllergens('Gluten, dairy , celery, SESAME');

    expect(parsed.presets).toEqual(['gluten', 'dairy', 'sesame']);
    // Not dropped. An item entered before the presets existed must survive
    // being opened and saved.
    expect(parsed.other).toBe('celery');

    expect(allergenText({ allergens: parsed.presets, allergensOther: parsed.other })).toBe(
      'gluten, dairy, sesame, celery',
    );
  });

  it('offers the nine the product ships', () => {
    expect(ALLERGEN_PRESETS).toEqual([
      'gluten',
      'dairy',
      'egg',
      'nuts',
      'peanuts',
      'sesame',
      'fish',
      'shellfish',
      'soy',
    ]);
  });
});
