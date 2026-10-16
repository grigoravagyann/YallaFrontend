import type { Menu, MenuItem, MenuSection } from '../contracts/menu';

/**
 * Mock menus, one per branch shape.
 *
 * Prices are integer dram and roughly what a Yerevan cafe charges, because a
 * menu full of round hundreds hides exactly the grouping and currency-placement
 * bugs `@yalla/format` exists to prevent.
 */

function item(id: string, name: string, priceDram: number, description?: string): MenuItem {
  return {
    id,
    name,
    description: description ?? null,
    priceDram,
    isAvailable: true,
  };
}

const COFFEE: MenuSection = {
  id: 'coffee',
  name: 'Coffee',
  items: [
    // Every dish is written up the way a venue has to write it up before the
    // server will show it to a diner — except `compote`, which is left
    // unfinished on purpose (see `menuDetail.ts`).
    item('espresso', 'Espresso', 700, 'A double shot'),
    item('americano', 'Americano', 900, 'Espresso lengthened with hot water'),
    item('cappuccino', 'Cappuccino', 1200, 'Espresso, steamed milk, thick foam'),
    item('flat-white', 'Flat white', 1400, 'Double espresso under velvety milk'),
    item('armenian-coffee', 'Armenian coffee', 800, 'Ground fine, brewed in sand'),
    // One thing the kitchen has run out of, so the unavailable state is real.
    {
      ...item('cold-brew', 'Cold brew', 1500, 'Steeped overnight, served over ice'),
      isAvailable: false,
    },
  ],
};

const PASTRY: MenuSection = {
  id: 'pastry',
  name: 'Pastry',
  items: [
    item('gata', 'Gata', 850, 'Sweet layered pastry'),
    item('croissant', 'Butter croissant', 1100, 'Baked this morning'),
    item('napoleon', 'Napoleon slice', 1650, 'Puff pastry layered with custard'),
    item('cheesecake', 'Cheesecake', 2200, 'Baked, on a biscuit base'),
  ],
};

const BREAKFAST: MenuSection = {
  id: 'breakfast',
  name: 'Breakfast',
  items: [
    item('matnakash-eggs', 'Eggs on matnakash', 2800, 'Two fried eggs on warm bread'),
    item('granola', 'Granola and yoghurt', 2400, 'House granola with honey and walnuts'),
    item('avocado-toast', 'Avocado toast', 3200, 'On sourdough, with chilli flakes'),
  ],
};

const MAINS: MenuSection = {
  id: 'mains',
  name: 'Mains',
  items: [
    item('khorovats', 'Pork khorovats', 6500, 'Served with lavash and onions'),
    item('dolma', 'Dolma', 4800, 'Vine leaves stuffed with beef and rice'),
    item('ghapama', 'Ghapama', 5610, 'Pumpkin, rice, dried fruit'),
    item('trout', 'Sevan trout', 7200, 'Grilled whole, with herbs'),
    item('salad-summer', 'Summer salad', 2900, 'Tomato, cucumber, herbs, sunflower oil'),
  ],
};

const DRINKS: MenuSection = {
  id: 'drinks',
  name: 'Cold drinks',
  items: [
    item('water-still', 'Still water', 400, '500 ml bottle'),
    item('jermuk', 'Jermuk', 600, 'Sparkling mineral water'),
    item('lemonade', 'Tarragon lemonade', 1300, 'Made here, lightly sweet'),
    item('compote', 'Apricot compote', 1000, 'Stewed apricots, served cold'),
  ],
};

const CAFE_MENU: readonly MenuSection[] = [COFFEE, PASTRY, BREAKFAST, DRINKS];
const RESTAURANT_MENU: readonly MenuSection[] = [MAINS, COFFEE, DRINKS];

const UPDATED = '2026-09-04T06:00:00Z';

export function mockMenuFor(branchId: string, venueType: 'cafe' | 'restaurant'): Menu {
  return {
    branchId,
    updatedAtUtc: UPDATED,
    sections: venueType === 'cafe' ? CAFE_MENU : RESTAURANT_MENU,
  };
}
