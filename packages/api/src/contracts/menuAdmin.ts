import type { SpiceLevel } from './ordering';

/**
 * The menu as the **editor** sees it.
 *
 * Not `Menu`, which is what a diner's phone renders and what order entry taps
 * against. That one carries a name, a price and an availability flag, because
 * that is all a hungry person needs. This one carries everything an owner has
 * to fill in, plus the two things only an editor cares about: display order,
 * and whether the item is finished.
 *
 * ## Why "finished" is a client-side idea
 *
 * The server refuses an item that is missing a required field, so nothing
 * incomplete can exist on the wire. But an owner entering eighty dishes in an
 * afternoon needs a to-do list, and the only place that list can live is a
 * draft the server has not seen. {@link menuItemGaps} is therefore computed
 * from **the same fields the server requires**, in one place, so the count in
 * the category list and the reason the form refuses to submit cannot disagree.
 */

/** Three variant URLs and the id behind them. `Yalla.Application.Media.PhotoView`. */
export interface Photo {
  readonly photoId: string;
  /** Small square, for lists. */
  readonly thumbnailUrl: string;
  /** Menu card size — what a diner actually looks at, and what the preview shows. */
  readonly cardUrl: string;
  readonly fullUrl: string;
  /** Pixels on the full variant. Null for a photo migrated from before variants. */
  readonly width: number | null;
  readonly height: number | null;
}

export interface AdminMenuItem {
  readonly id: string;
  readonly categoryId: string;
  readonly name: string;
  readonly description: string;
  /** Whole dram. The client displays and sends this and never does arithmetic on it. */
  readonly priceDram: number;
  readonly ingredients: string;
  readonly allergens: string;
  readonly portionSize: string;
  readonly spiceLevel: SpiceLevel;
  readonly prepMinutes: number;
  readonly photo: Photo;
  readonly isAvailable: boolean;
  readonly displayOrder: number;
}

export interface AdminMenuCategory {
  readonly id: string;
  readonly name: string;
  readonly displayOrder: number;
  readonly items: readonly AdminMenuItem[];
}

/**
 * A new item.
 *
 * Every descriptive field is required, and the client does not soften that: the
 * server refuses without them, and a form that let somebody submit anyway would
 * turn a rule into a failed request they have to interpret. What the client
 * does instead is make them fast — presets, chips, and duplicate.
 */
export interface CreateMenuItemInput {
  readonly categoryId: string;
  readonly name: string;
  readonly description: string;
  readonly priceDram: number;
  readonly ingredients: string;
  readonly allergens: string;
  readonly portionSize: string;
  readonly spiceLevel: SpiceLevel;
  readonly prepMinutes: number;
  /** An uploaded photo. There is no way to create an item without one. */
  readonly photoId: string;
  readonly displayOrder: number;
}

/** A patch. Only what is supplied changes, and a supplied field must be non-blank. */
export interface UpdateMenuItemInput {
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  readonly priceDram?: number | undefined;
  readonly ingredients?: string | undefined;
  readonly allergens?: string | undefined;
  readonly portionSize?: string | undefined;
  readonly spiceLevel?: SpiceLevel | undefined;
  readonly prepMinutes?: number | undefined;
  readonly photoId?: string | undefined;
  readonly displayOrder?: number | undefined;
}

/** What deleting an item did: removed, or deactivated because order lines point at it. */
export interface MenuItemDeletion {
  readonly itemId: string;
  readonly deleted: boolean;
  readonly deactivated: boolean;
  /** The server's own sentence, shown as-is when the item was only deactivated. */
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

/**
 * The fields an item is not allowed to be missing.
 *
 * **This list is the server's, not a design choice.** `CreateMenuItemCommand`
 * marks each of these non-nullable and `MenuService` rejects a blank one, so a
 * client counting anything else would produce a to-do list that does not match
 * what the venue is actually blocked on. `isAvailable` and `displayOrder` are
 * absent because neither can be missing.
 */
export type MenuItemField =
  | 'name'
  | 'description'
  | 'priceDram'
  | 'ingredients'
  | 'allergens'
  | 'portionSize'
  | 'prepMinutes'
  | 'photoId';

export const REQUIRED_MENU_ITEM_FIELDS: readonly MenuItemField[] = [
  'name',
  'description',
  'priceDram',
  'ingredients',
  'allergens',
  'portionSize',
  'prepMinutes',
  'photoId',
];

/** A draft, as the form holds it: everything a string except the numbers. */
export interface MenuItemDraft {
  readonly name: string;
  readonly description: string;
  readonly priceDram: number | null;
  readonly ingredients: readonly string[];
  readonly allergens: readonly string[];
  /** Free text, for an allergen the preset list does not name. */
  readonly allergensOther: string;
  readonly portionSize: string;
  readonly spiceLevel: SpiceLevel;
  readonly prepMinutes: number | null;
  readonly photoId: string | null;
}

/**
 * Every field this draft is still missing — **all of them at once**.
 *
 * Not the first one. A form that reveals one missing field per submit makes an
 * owner press the button five times to learn five things, and the fifth time
 * they stop and the menu stays unfinished. The order matches the form, so the
 * list reads top to bottom.
 */
export function menuItemGaps(draft: MenuItemDraft): readonly MenuItemField[] {
  const gaps: MenuItemField[] = [];

  if (draft.name.trim().length === 0) gaps.push('name');
  if (draft.description.trim().length === 0) gaps.push('description');
  // Zero is a gap, not a price. A free item is a comp, and the venue's own
  // numbers stop meaning anything if it is entered as a dish that costs nothing.
  if (draft.priceDram === null || draft.priceDram <= 0) gaps.push('priceDram');
  if (allergenText(draft).trim().length === 0) gaps.push('allergens');
  if (draft.ingredients.length === 0) gaps.push('ingredients');
  if (draft.portionSize.trim().length === 0) gaps.push('portionSize');
  if (draft.prepMinutes === null || draft.prepMinutes <= 0) gaps.push('prepMinutes');
  if (!draft.photoId) gaps.push('photoId');

  return gaps;
}

/**
 * The same question asked of a stored item.
 *
 * Shares nothing with the draft version by accident: both walk
 * {@link REQUIRED_MENU_ITEM_FIELDS} and both are exercised by the same test, so
 * the count on the category list and the form's refusal cannot drift apart.
 */
export function storedItemGaps(item: AdminMenuItem): readonly MenuItemField[] {
  return menuItemGaps(itemToDraft(item));
}

export function isComplete(item: AdminMenuItem): boolean {
  return storedItemGaps(item).length === 0;
}

export function incompleteCount(category: AdminMenuCategory): number {
  return category.items.filter((item) => !isComplete(item)).length;
}

// ---------------------------------------------------------------------------
// Allergens
// ---------------------------------------------------------------------------

/**
 * The fixed list, plus free text for anything else.
 *
 * Free text alone produces fourteen spellings of "dairy" — in three
 * alphabets — and a filter nobody can build on top of. The server stores one
 * string either way, so the presets are joined with a comma and the "other"
 * field is appended: the wire format does not change and the data stops being
 * a mess.
 */
export const ALLERGEN_PRESETS = [
  'gluten',
  'dairy',
  'egg',
  'nuts',
  'peanuts',
  'sesame',
  'fish',
  'shellfish',
  'soy',
] as const;

export type AllergenPreset = (typeof ALLERGEN_PRESETS)[number];

/** The stored string for a draft's chips: presets first, then the free text. */
export function allergenText(draft: Pick<MenuItemDraft, 'allergens' | 'allergensOther'>): string {
  return [...draft.allergens, ...splitList(draft.allergensOther)].join(', ');
}

/**
 * A stored string back into chips.
 *
 * Anything that matches a preset becomes one, case-insensitively and ignoring
 * surrounding space; everything else lands in the free-text field rather than
 * being dropped. Round-tripping an item somebody typed by hand before the
 * presets existed must not silently lose what they wrote.
 */
export function parseAllergens(stored: string): {
  presets: readonly AllergenPreset[];
  other: string;
} {
  const presets: AllergenPreset[] = [];
  const other: string[] = [];

  for (const part of splitList(stored)) {
    const match = ALLERGEN_PRESETS.find(
      (preset) => preset.toLowerCase() === part.trim().toLowerCase(),
    );
    if (match && !presets.includes(match)) presets.push(match);
    else if (!match) other.push(part);
  }

  return { presets, other: other.join(', ') };
}

/** Comma-separated free text into trimmed, non-empty parts. Used for both lists. */
export function splitList(value: string): readonly string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

export const EMPTY_DRAFT: MenuItemDraft = {
  name: '',
  description: '',
  priceDram: null,
  ingredients: [],
  allergens: [],
  allergensOther: '',
  portionSize: '',
  spiceLevel: 'notSpicy',
  prepMinutes: null,
  photoId: null,
};

export function itemToDraft(item: AdminMenuItem): MenuItemDraft {
  const allergens = parseAllergens(item.allergens);
  return {
    name: item.name,
    description: item.description,
    priceDram: item.priceDram,
    ingredients: splitList(item.ingredients),
    allergens: allergens.presets,
    allergensOther: allergens.other,
    portionSize: item.portionSize,
    spiceLevel: item.spiceLevel,
    prepMinutes: item.prepMinutes,
    photoId: item.photo.photoId,
  };
}

/**
 * A copy of an item, ready to be saved as a new one.
 *
 * Three sizes of the same coffee differ by a name and a price and nothing else,
 * so duplicating is a first-class action rather than a chore. Two rules:
 *
 * - **The identity does not come along.** No id, and the name is marked so a
 *   list of six identical rows cannot happen by accident.
 * - **The photo reference is cleared.** Sharing one would look like a saving
 *   and is not: attaching the same `photoId` to two items means deleting either
 *   one breaks the other's card, and the server's own dedupe already makes
 *   re-uploading the same bytes free — it returns the first photo and writes
 *   nothing.
 */
export function duplicateDraft(item: AdminMenuItem): MenuItemDraft {
  return { ...itemToDraft(item), photoId: null };
}

// ---------------------------------------------------------------------------
// Reordering
// ---------------------------------------------------------------------------

/** An id and the display order the API should be told about. */
export interface DisplayOrderChange {
  readonly id: string;
  readonly displayOrder: number;
}

/**
 * The moves a drag produces, and **only** the moves.
 *
 * Dense zero-based orders over the whole list, then the entries that actually
 * changed. Sending every row after a drag is one PATCH per dish, which on an
 * eighty-item menu is eighty requests for a two-row move — and every one of
 * them a chance to half-apply.
 */
export function reorder(
  ids: readonly string[],
  from: number,
  to: number,
): readonly DisplayOrderChange[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return [];

  const next = [...ids];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return [];
  next.splice(to, 0, moved);

  const changes: DisplayOrderChange[] = [];
  for (const [index, id] of next.entries()) {
    if (ids[index] !== id) changes.push({ id, displayOrder: index });
  }
  return changes;
}
