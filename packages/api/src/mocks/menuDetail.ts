import type { Menu } from '../contracts/menu';
import type {
  BranchMenu,
  MenuCategoryView,
  MenuItemDetail,
  SpiceLevel,
} from '../contracts/unshipped';
import { mockMenuFor } from './menu';

/**
 * The menu with the fields a diner reads before ordering.
 *
 * Built on top of `mockMenuFor` rather than beside it, so the price-only shape
 * the pending screen has always used and the detailed shape stay the same menu.
 * Two lists would drift, and the venue would find out when a guest ordered
 * something the other screen said was unavailable.
 *
 * The descriptive fields are the point of this task: ingredients, allergens,
 * portion size, spice level and prep time are required on the backend entity so
 * that a diner stops having to ask a waiter what is in something.
 */

interface Detail {
  readonly ingredients: string;
  readonly allergens: string;
  readonly portionSize: string;
  readonly spiceLevel: SpiceLevel;
  readonly prepMinutes: number;
}

const DEFAULT: Detail = {
  ingredients: '',
  allergens: '',
  portionSize: '',
  spiceLevel: 'notSpicy',
  prepMinutes: 5,
};

/**
 * Written the way an Armenian venue would write them: free text, comma
 * separated, in the venue's own words. Not a taxonomy — inventing an allergen
 * vocabulary here would be guessing at something the backend stores as a string.
 */
const DETAILS: Readonly<Record<string, Detail>> = {
  espresso: { ...DEFAULT, ingredients: 'Arabica coffee', portionSize: '30 ml', prepMinutes: 2 },
  americano: {
    ...DEFAULT,
    ingredients: 'Arabica coffee, water',
    portionSize: '180 ml',
    prepMinutes: 3,
  },
  cappuccino: {
    ...DEFAULT,
    ingredients: 'Arabica coffee, milk',
    allergens: 'Milk',
    portionSize: '180 ml',
    prepMinutes: 4,
  },
  'flat-white': {
    ...DEFAULT,
    ingredients: 'Arabica coffee, milk',
    allergens: 'Milk',
    portionSize: '160 ml',
    prepMinutes: 4,
  },
  'armenian-coffee': {
    ...DEFAULT,
    ingredients: 'Finely ground coffee, sugar',
    portionSize: '60 ml',
    prepMinutes: 6,
  },
  'cold-brew': { ...DEFAULT, ingredients: 'Arabica coffee', portionSize: '300 ml', prepMinutes: 2 },
  gata: {
    ...DEFAULT,
    ingredients: 'Flour, butter, sugar, egg',
    allergens: 'Gluten, milk, egg',
    portionSize: '120 g',
    prepMinutes: 2,
  },
  croissant: {
    ...DEFAULT,
    ingredients: 'Flour, butter, yeast',
    allergens: 'Gluten, milk',
    portionSize: '90 g',
    prepMinutes: 2,
  },
  napoleon: {
    ...DEFAULT,
    ingredients: 'Puff pastry, custard, cream',
    allergens: 'Gluten, milk, egg',
    portionSize: '140 g',
    prepMinutes: 2,
  },
  cheesecake: {
    ...DEFAULT,
    ingredients: 'Cream cheese, biscuit base, egg',
    allergens: 'Gluten, milk, egg',
    portionSize: '150 g',
    prepMinutes: 2,
  },
  'matnakash-eggs': {
    ...DEFAULT,
    ingredients: 'Matnakash bread, eggs, butter, herbs',
    allergens: 'Gluten, egg, milk',
    portionSize: '2 eggs',
    prepMinutes: 12,
  },
  granola: {
    ...DEFAULT,
    ingredients: 'Oats, honey, walnuts, yoghurt',
    allergens: 'Gluten, nuts, milk',
    portionSize: '250 g',
    prepMinutes: 5,
  },
  'avocado-toast': {
    ...DEFAULT,
    ingredients: 'Sourdough, avocado, chilli flakes, lemon',
    allergens: 'Gluten',
    portionSize: '2 slices',
    spiceLevel: 'mild',
    prepMinutes: 10,
  },
  khorovats: {
    ...DEFAULT,
    ingredients: 'Pork neck, onion, lavash, herbs',
    allergens: 'Gluten',
    portionSize: '350 g',
    prepMinutes: 25,
  },
  dolma: {
    ...DEFAULT,
    ingredients: 'Grape leaves, beef, rice, herbs, matsun',
    allergens: 'Milk',
    portionSize: '10 pieces',
    prepMinutes: 20,
  },
  ghapama: {
    ...DEFAULT,
    ingredients: 'Pumpkin, rice, dried apricot, raisin, walnut, honey',
    allergens: 'Nuts',
    portionSize: '400 g',
    prepMinutes: 30,
  },
  trout: {
    ...DEFAULT,
    ingredients: 'Sevan trout, lemon, herbs, butter',
    allergens: 'Fish, milk',
    portionSize: '300 g',
    prepMinutes: 22,
  },
  'salad-summer': {
    ...DEFAULT,
    ingredients: 'Tomato, cucumber, red onion, herbs, sunflower oil',
    portionSize: '250 g',
    prepMinutes: 7,
  },
  'water-still': { ...DEFAULT, ingredients: 'Still water', portionSize: '500 ml', prepMinutes: 1 },
  jermuk: {
    ...DEFAULT,
    ingredients: 'Sparkling mineral water',
    portionSize: '500 ml',
    prepMinutes: 1,
  },
  lemonade: {
    ...DEFAULT,
    ingredients: 'Tarragon, lemon, sugar, sparkling water',
    portionSize: '400 ml',
    prepMinutes: 3,
  },
  compote: {
    ...DEFAULT,
    ingredients: 'Dried apricot, sugar, water',
    portionSize: '300 ml',
    prepMinutes: 2,
  },
};

function detailed(
  item: Menu['sections'][number]['items'][number],
  categoryId: string,
  index: number,
): MenuItemDetail {
  const detail = DETAILS[item.id] ?? DEFAULT;
  return {
    id: item.id,
    categoryId,
    name: item.name,
    description: item.description ?? '',
    priceDram: item.priceDram,
    // No photo in the mock. `null` rather than a placeholder URL, so the card
    // renders its no-photo layout — which is what most venues will have on day
    // one, and the layout that has to look deliberate rather than broken.
    photoUrl: null,
    ingredients: detail.ingredients,
    allergens: detail.allergens,
    portionSize: detail.portionSize,
    spiceLevel: detail.spiceLevel,
    prepMinutes: detail.prepMinutes,
    isAvailable: item.isAvailable,
    displayOrder: index,
  };
}

export function mockBranchMenu(branchId: string, venueType: 'cafe' | 'restaurant'): BranchMenu {
  const menu = mockMenuFor(branchId, venueType);
  const categories: MenuCategoryView[] = menu.sections.map((section, sectionIndex) => ({
    id: section.id,
    name: section.name,
    displayOrder: sectionIndex,
    items: section.items.map((item, index) => detailed(item, section.id, index)),
  }));

  return { branchId, updatedAtUtc: menu.updatedAtUtc, categories };
}

/** One item, for snapshotting a name and price onto an order line. */
export function mockMenuItem(
  branchId: string,
  venueType: 'cafe' | 'restaurant',
  itemId: string,
): MenuItemDetail | undefined {
  return mockBranchMenu(branchId, venueType)
    .categories.flatMap((category) => category.items)
    .find((item) => item.id === itemId);
}
