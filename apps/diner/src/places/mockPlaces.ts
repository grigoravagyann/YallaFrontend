import type { OpeningHours, Place, TablePhotoMarker, Weekday } from './model';

/**
 * Six places in central Yerevan, photographed and tabled.
 *
 * Ids: every place is one of `@yalla/api`'s mock branches (`mocks/venues.ts`),
 * because Book, `/reserve/confirm` and the floor plan at `app/branch/[branchId]`
 * all resolve through the gateway by branch id — a place the gateway has never
 * heard of is a place that cannot be booked. Four carry the venue's own name;
 * The Green Table and Tavern Yerevan borrow the two spare branches (Lumen's
 * Cascade room and Tumanyan Street), so a booking made there comes back from
 * the gateway under the borrowed venue's name. That is a mock-only seam.
 *
 * Markers: each marker is one table on that branch's floor, with the floor's
 * own state and seats — `free` / `reservedSoon` + `held` → reserved /
 * `occupied` + `outOfService` → occupied, `capacityMax` = seats — so a table
 * drawn free on the photo is a table the gateway will actually book right now.
 * `mockPlaces.test.ts` checks every marker against the gateway's floor.
 *
 * `openState` is not stored: it depends on the clock, so the repository
 * computes it at read time from `hours`.
 */

/** Everything but `openState`, which is derived when read. */
export type PlaceSeed = Omit<Place, 'openState'>;

const YEREVAN = 'Asia/Yerevan';
const ALL_WEEK: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

/** Unsplash, sized for a phone hero. */
function photo(id: string): string {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;
}

function everyDay(open: string, close: string): readonly OpeningHours[] {
  return ALL_WEEK.map((day) => ({ day, open, close }));
}

function marker(
  placeId: string,
  table: string,
  label: string,
  status: TablePhotoMarker['status'],
  capacity: readonly [number, number],
  at: readonly [number, number],
): TablePhotoMarker {
  return {
    tableId: `${placeId}-${table}`,
    label,
    status,
    capacityMin: capacity[0],
    capacityMax: capacity[1],
    x: at[0],
    y: at[1],
  };
}

export const mockPlaces: readonly PlaceSeed[] = [
  {
    // `@yalla/api` mock: Lumen Coffee, Cascade — borrowed, see the note above.
    id: 'b-lumen-cascade',
    venueId: 'v-lumen',
    name: 'The Green Table',
    type: 'cafe',
    cuisine: 'Armenian & Mediterranean',
    distanceKm: 0.3,
    rating: 4.8,
    ratingCount: 124,
    badges: ['popular'],
    photos: [
      photo('photo-1554118811-1e0d58224f24'),
      photo('photo-1521017432531-fbd92d768814'),
      photo('photo-1559925393-8be0ec4767c8'),
      photo('photo-1546069901-ba9599a7e63c'),
      photo('photo-1482049016688-2d3e1b311543'),
    ],
    coords: { latitude: 40.1843, longitude: 44.5129 },
    address: '12 Abovyan Street, Yerevan',
    phone: '+374 10 521 234',
    website: 'https://thegreentable.am',
    timeZoneId: YEREVAN,
    hours: everyDay('09:00', '23:00'),
    amenities: ['outdoorSeating', 'wifi', 'vegan', 'cardPayment'],
    about:
      'A bright all-day café a minute from Republic Square. Breakfast runs until noon, the lunch menu leans on the Ararat valley — tomatoes, herbs, lavash baked in the back — and the terrace under the plane trees fills up as soon as the sun is out.',
    menu: [
      {
        section: 'Breakfast',
        items: [
          {
            name: 'Armenian breakfast',
            price: 3200,
            description: 'Eggs, basturma, cheese, herbs, lavash',
          },
          { name: 'Shakshuka', price: 2800, description: 'With feta and sourdough' },
          { name: 'Honey & walnut pancakes', price: 2400 },
        ],
      },
      {
        section: 'Lunch',
        items: [
          {
            name: 'Grilled vegetable plate',
            price: 3600,
            description: 'Aubergine, pepper, halloumi',
          },
          { name: 'Lamb kebab wrap', price: 3900 },
          { name: 'Tabbouleh bowl', price: 2900, description: 'Vegan' },
        ],
      },
      {
        section: 'Drinks',
        items: [
          { name: 'Flat white', price: 1200 },
          { name: 'Fresh pomegranate juice', price: 1800 },
          { name: 'Tarragon lemonade', price: 1100 },
        ],
      },
    ],
    reviews: [
      {
        author: 'Anahit S.',
        rating: 5,
        text: 'The terrace is the best spot in the centre for a slow breakfast. Lavash comes out warm.',
        date: '2026-09-06',
      },
      {
        author: 'Marco T.',
        rating: 5,
        text: 'Great coffee and a proper vegan menu, which is rarer here than you would think.',
        date: '2026-08-28',
      },
      {
        author: 'Narek H.',
        rating: 4,
        text: 'Lovely room, friendly staff. Gets loud around noon on weekends.',
        date: '2026-08-19',
      },
    ],
    tables: [
      marker('b-lumen-cascade', 't1', '1', 'free', [2, 4], [0.16, 0.62]),
      marker('b-lumen-cascade', 't2', '2', 'free', [1, 2], [0.3, 0.55]),
      marker('b-lumen-cascade', 't3', '3', 'free', [1, 2], [0.46, 0.6]),
      marker('b-lumen-cascade', 't4', '4', 'free', [1, 2], [0.62, 0.52]),
      marker('b-lumen-cascade', 't5', '5', 'free', [1, 2], [0.78, 0.63]),
      marker('b-lumen-cascade', 't6', '6', 'occupied', [2, 4], [0.24, 0.8]),
      marker('b-lumen-cascade', 't7', '7', 'reserved', [1, 2], [0.5, 0.82]),
      marker('b-lumen-cascade', 't8', '8', 'occupied', [6, 8], [0.74, 0.84]),
    ],
  },

  {
    // `@yalla/api` mock: Lumen Coffee, Northern Avenue.
    id: 'b-lumen-north',
    venueId: 'v-lumen',
    name: 'Lumen Coffee',
    type: 'cafe',
    cuisine: 'Specialty coffee & bakery',
    distanceKm: 0.4,
    rating: 4.7,
    ratingCount: 312,
    badges: ['popular'],
    photos: [
      photo('photo-1453614512568-c4024d13c247'),
      photo('photo-1501339847302-ac426a4a7cbb'),
      photo('photo-1511920170033-f8396924c348'),
      photo('photo-1541167760496-1628856ab772'),
    ],
    coords: { latitude: 40.1838, longitude: 44.5142 },
    address: '5 Northern Avenue, Yerevan',
    phone: '+374 11 440 012',
    website: 'https://lumen.coffee',
    timeZoneId: YEREVAN,
    hours: everyDay('09:00', '01:00'),
    amenities: ['wifi', 'cardPayment'],
    about:
      'Roasters first, café second. Three single origins on filter every week, espresso from the house blend, and croissants from the bakery downstairs. Counter seats face the street; the back room is quiet enough to work in.',
    menu: [
      {
        section: 'Coffee',
        items: [
          { name: 'Espresso', price: 900 },
          { name: 'Cappuccino', price: 1300 },
          { name: 'V60 filter', price: 1600, description: 'Ask which origin is on' },
        ],
      },
      {
        section: 'Bakery',
        items: [
          { name: 'Butter croissant', price: 900 },
          { name: 'Cardamom bun', price: 1100 },
          { name: 'Gata', price: 800, description: 'Sweet Armenian pastry' },
        ],
      },
      {
        section: 'Cold',
        items: [
          { name: 'Cold brew', price: 1500 },
          { name: 'Iced latte', price: 1500 },
          { name: 'Tonic espresso', price: 1700 },
        ],
      },
    ],
    reviews: [
      {
        author: 'Lilit A.',
        rating: 5,
        text: 'The only place in town I trust with a filter coffee. Staff know their beans.',
        date: '2026-09-09',
      },
      {
        author: 'Daniel K.',
        rating: 4,
        text: 'Excellent espresso, good Wi-Fi. Cramped at the counter when it gets busy.',
        date: '2026-09-01',
      },
      {
        author: 'Sona G.',
        rating: 5,
        text: 'Cardamom bun and a cappuccino. That is the order.',
        date: '2026-08-22',
      },
    ],
    tables: [
      marker('b-lumen-north', 't1', '1', 'free', [2, 4], [0.14, 0.58]),
      marker('b-lumen-north', 't2', '2', 'free', [1, 2], [0.27, 0.6]),
      marker('b-lumen-north', 't6', '6', 'free', [2, 4], [0.45, 0.54]),
      marker('b-lumen-north', 't8', '8', 'free', [6, 8], [0.64, 0.56]),
      marker('b-lumen-north', 't9', '9', 'occupied', [1, 2], [0.82, 0.6]),
      marker('b-lumen-north', 't10', '10', 'reserved', [1, 2], [0.36, 0.8]),
      marker('b-lumen-north', 't11', '11', 'occupied', [2, 4], [0.6, 0.82]),
      marker('b-lumen-north', 't12', '12', 'reserved', [4, 6], [0.8, 0.84]),
    ],
  },

  {
    // `@yalla/api` mock: Dolmama, Pushkin Street.
    id: 'b-dolmama-pushkin',
    venueId: 'v-dolmama',
    name: 'Dolmama',
    type: 'restaurant',
    cuisine: 'Traditional Armenian',
    distanceKm: 0.9,
    rating: 4.9,
    ratingCount: 876,
    badges: ['popular'],
    photos: [
      photo('photo-1517248135467-4c7edcad34c4'),
      photo('photo-1414235077428-338989a2e8c0'),
      photo('photo-1552566626-52f8b828add9'),
      photo('photo-1600891964599-f61ba0e24092'),
      photo('photo-1504674900247-0877df9cc836'),
      photo('photo-1559339352-11d035aa65de'),
    ],
    coords: { latitude: 40.1851, longitude: 44.5118 },
    address: '10 Pushkin Street, Yerevan',
    phone: '+374 10 561 354',
    website: 'https://dolmama.am',
    timeZoneId: YEREVAN,
    hours: everyDay('12:00', '23:00'),
    amenities: ['outdoorSeating', 'parking', 'cardPayment'],
    about:
      'Home cooking from a nineteenth-century house off Pushkin Street, served the way a grandmother would if she had a brigade. Dolma in grape leaves, slow-cooked khashlama, and a courtyard that stays cool through August. Reservations recommended after seven.',
    menu: [
      {
        section: 'Starters',
        items: [
          { name: 'Dolma in grape leaves', price: 4200, description: 'Beef and rice, with matsun' },
          { name: 'Eech', price: 2600, description: 'Bulgur and tomato salad' },
          { name: 'Basturma plate', price: 4800 },
        ],
      },
      {
        section: 'Mains',
        items: [
          { name: 'Lamb khashlama', price: 7900, description: 'Slow-cooked with vegetables' },
          { name: 'Ishkhan trout', price: 8600, description: 'Sevan trout, grilled' },
          { name: 'Ghapama', price: 6400, description: 'Stuffed pumpkin, for two' },
        ],
      },
      {
        section: 'Desserts',
        items: [
          { name: 'Gata', price: 1800 },
          { name: 'Walnut pakhlava', price: 2200 },
          { name: 'Dried fruit & sujukh', price: 2600 },
        ],
      },
    ],
    reviews: [
      {
        author: 'Hasmik P.',
        rating: 5,
        text: 'Brought visiting friends and they still talk about the dolma. The courtyard at dusk is magic.',
        date: '2026-09-07',
      },
      {
        author: 'James W.',
        rating: 5,
        text: 'The best meal of our trip. Book ahead — we were turned away the first night.',
        date: '2026-08-30',
      },
      {
        author: 'Armen M.',
        rating: 4,
        text: 'Faithful, generous cooking. Prices are at the top end for Yerevan, but fair for what you get.',
        date: '2026-08-15',
      },
    ],
    tables: [
      marker('b-dolmama-pushkin', 't1', '1', 'free', [2, 4], [0.15, 0.6]),
      marker('b-dolmama-pushkin', 't2', '2', 'free', [1, 2], [0.32, 0.56]),
      marker('b-dolmama-pushkin', 't3', '3', 'free', [1, 2], [0.5, 0.52]),
      marker('b-dolmama-pushkin', 't4', '4', 'occupied', [1, 2], [0.68, 0.57]),
      marker('b-dolmama-pushkin', 't5', '5', 'reserved', [1, 2], [0.85, 0.62]),
      marker('b-dolmama-pushkin', 't6', '6', 'occupied', [2, 4], [0.22, 0.8]),
      marker('b-dolmama-pushkin', 't7', '7', 'reserved', [1, 2], [0.47, 0.84]),
      marker('b-dolmama-pushkin', 't8', '8', 'occupied', [6, 8], [0.7, 0.82]),
      marker('b-dolmama-pushkin', 't11', '11', 'reserved', [2, 4], [0.88, 0.86]),
    ],
  },

  {
    // `@yalla/api` mock: Tumanyan Street — borrowed, see the note above. The
    // floor is full right now, which is what a popular tavern looks like at
    // dinner; Book a Table still finds a table for a later slot.
    id: 'b-tumanyan-main',
    venueId: 'v-tumanyan',
    name: 'Tavern Yerevan',
    type: 'restaurant',
    cuisine: 'Armenian grill & tavern',
    distanceKm: 1.4,
    rating: 4.6,
    ratingCount: 1540,
    badges: ['popular'],
    photos: [
      photo('photo-1466978913421-dad2ebd01d17'),
      photo('photo-1537047902294-62a40c20a6ae'),
      photo('photo-1578474846511-04ba529f0b88'),
      photo('photo-1555396273-367ea4eb4db5'),
      photo('photo-1540189549336-e6e99c3679fe'),
    ],
    coords: { latitude: 40.1803, longitude: 44.5198 },
    address: '5 Paronyan Street, Yerevan',
    phone: '+374 10 500 505',
    website: 'https://tavernyerevan.am',
    timeZoneId: YEREVAN,
    hours: everyDay('09:00', '01:00'),
    amenities: ['outdoorSeating', 'parking', 'cardPayment'],
    about:
      'A big, loud, cheerful tavern by the Hrazdan gorge with a live band most evenings and a grill that never goes cold. Khorovats by the skewer, tonir lavash from the oven at the door, and cold Kilikia on tap. Come hungry and bring people.',
    menu: [
      {
        section: 'From the grill',
        items: [
          {
            name: 'Pork khorovats',
            price: 5200,
            description: 'Per skewer, with grilled vegetables',
          },
          { name: 'Lamb chops', price: 7400 },
          { name: 'Lyulya kebab', price: 4600 },
        ],
      },
      {
        section: 'To share',
        items: [
          { name: 'Tonir lavash & cheeses', price: 3800 },
          { name: 'Spas', price: 1900, description: 'Yoghurt and wheat soup' },
          { name: 'Summer salad', price: 2400 },
        ],
      },
      {
        section: 'Drinks',
        items: [
          { name: 'Kilikia draught 0.5 l', price: 1500 },
          { name: 'Areni red, glass', price: 2200 },
          { name: 'Tan', price: 700 },
        ],
      },
    ],
    reviews: [
      {
        author: 'Gor V.',
        rating: 5,
        text: 'The khorovats is the reason you come. The band is the reason you stay.',
        date: '2026-09-05',
      },
      {
        author: 'Elena R.',
        rating: 4,
        text: 'Huge portions, fair prices, very busy on Saturday. Ask for the terrace.',
        date: '2026-08-24',
      },
      {
        author: 'Tigran K.',
        rating: 4,
        text: 'Solid tavern food. Service slowed down once the music started.',
        date: '2026-08-10',
      },
    ],
    tables: [
      marker('b-tumanyan-main', 't1', '1', 'occupied', [2, 4], [0.14, 0.58]),
      marker('b-tumanyan-main', 't2', '2', 'reserved', [1, 2], [0.33, 0.54]),
      marker('b-tumanyan-main', 't3', '3', 'occupied', [1, 2], [0.52, 0.5]),
      marker('b-tumanyan-main', 't4', '4', 'reserved', [1, 2], [0.7, 0.55]),
      marker('b-tumanyan-main', 't5', '5', 'occupied', [1, 2], [0.86, 0.6]),
      marker('b-tumanyan-main', 't8', '8', 'reserved', [6, 8], [0.25, 0.8]),
      marker('b-tumanyan-main', 't11', '11', 'occupied', [2, 4], [0.5, 0.84]),
      marker('b-tumanyan-main', 't12', '12', 'occupied', [4, 6], [0.76, 0.82]),
    ],
  },

  {
    // `@yalla/api` mock: Ararat Terrace, Opera. Tables reuse the shared
    // restaurant fixture's window row (`rw1`…), as `borrowedFloor` re-prefixes it.
    id: 'b-ararat-opera',
    venueId: 'v-ararat',
    name: 'Ararat Terrace',
    type: 'restaurant',
    cuisine: 'Modern Armenian',
    distanceKm: 1.1,
    rating: 4.5,
    ratingCount: 208,
    badges: ['new'],
    photos: [
      photo('photo-1592861956120-e524fc739696'),
      photo('photo-1590846406792-0adc7f938f1d'),
      photo('photo-1528605248644-14dd04022da1'),
      photo('photo-1565299624946-b28f40a0ae38'),
    ],
    coords: { latitude: 40.1859, longitude: 44.5148 },
    address: '54 Tumanyan Street, Yerevan',
    phone: '+374 60 700 700',
    website: 'https://araratterrace.am',
    timeZoneId: YEREVAN,
    hours: everyDay('09:00', '01:00'),
    amenities: ['outdoorSeating', 'wifi', 'cardPayment', 'vegan'],
    about:
      'A rooftop over the Opera with the mountain on the skyline on a clear day. The kitchen takes old Armenian dishes apart and puts them back together smaller: a tasting menu at dinner, a shorter à la carte at lunch, and a long list of Armenian wines by the glass.',
    menu: [
      {
        section: 'Small plates',
        items: [
          { name: 'Beetroot & matsun', price: 3400 },
          { name: 'Crispy lavash, trout roe', price: 4800 },
          { name: 'Roast aubergine, walnut', price: 3200, description: 'Vegan' },
        ],
      },
      {
        section: 'Large plates',
        items: [
          { name: 'Duck, dried apricot, bulgur', price: 9800 },
          { name: 'Sevan trout, sorrel', price: 9200 },
          { name: 'Mushroom ghapama', price: 7400, description: 'Vegan' },
        ],
      },
      {
        section: 'Wine',
        items: [
          { name: 'Voskehat, glass', price: 2800 },
          { name: 'Areni Noir reserve, glass', price: 3600 },
          { name: 'Tasting flight of three', price: 6500 },
        ],
      },
    ],
    reviews: [
      {
        author: 'Mariam D.',
        rating: 5,
        text: 'The view alone is worth it, and then the food turns out to be serious too.',
        date: '2026-09-08',
      },
      {
        author: 'Oliver B.',
        rating: 4,
        text: 'Inventive cooking, polished service. Still finding its feet on a busy Friday.',
        date: '2026-08-31',
      },
      {
        author: 'Ani T.',
        rating: 4,
        text: 'Book a table by the rail for sunset. The wine flight is a lovely way in.',
        date: '2026-08-26',
      },
    ],
    tables: [
      marker('b-ararat-opera', 'rw1', '1', 'free', [1, 2], [0.12, 0.6]),
      marker('b-ararat-opera', 'rw2', '2', 'free', [1, 2], [0.28, 0.58]),
      marker('b-ararat-opera', 'rw3', '3', 'occupied', [1, 2], [0.44, 0.55]),
      marker('b-ararat-opera', 'rw4', '4', 'free', [1, 2], [0.6, 0.57]),
      marker('b-ararat-opera', 'rw7', '7', 'reserved', [1, 2], [0.76, 0.6]),
      marker('b-ararat-opera', 'rt3', '21', 'occupied', [2, 4], [0.36, 0.82]),
      marker('b-ararat-opera', 'rt4', '22', 'free', [4, 6], [0.62, 0.84]),
      marker('b-ararat-opera', 'rt5', '23', 'reserved', [2, 4], [0.86, 0.86]),
    ],
  },

  {
    // `@yalla/api` mock: Green Bean, Mashtots Avenue.
    id: 'b-greenbean-main',
    venueId: 'v-greenbean',
    name: 'Green Bean',
    type: 'cafe',
    cuisine: 'Café & brunch',
    distanceKm: 1.7,
    rating: 4.4,
    ratingCount: 97,
    badges: ['new'],
    photos: [
      photo('photo-1445116572660-236099ec97a0'),
      photo('photo-1493857671505-72967e2e2760'),
      photo('photo-1567620905732-2d1ec7ab7445'),
    ],
    coords: { latitude: 40.1839, longitude: 44.5061 },
    address: '33 Mashtots Avenue, Yerevan',
    phone: '+374 99 333 033',
    timeZoneId: YEREVAN,
    hours: everyDay('08:00', '22:00'),
    amenities: ['wifi', 'vegan', 'cardPayment'],
    about:
      'A plant-filled neighbourhood café on Mashtots with big windows, a long brunch menu and a shelf of board games. Oat milk is the default, there is always a soup of the day, and laptops are welcome until the evening.',
    menu: [
      {
        section: 'Brunch',
        items: [
          { name: 'Avocado toast', price: 2600, description: 'Poached egg optional' },
          { name: 'Granola & matsun', price: 2100 },
          { name: 'Spinach omelette', price: 2400 },
        ],
      },
      {
        section: 'Bowls',
        items: [
          { name: 'Soup of the day', price: 1800 },
          { name: 'Lentil & roast veg bowl', price: 2900, description: 'Vegan' },
          { name: 'Chicken Caesar', price: 3300 },
        ],
      },
      {
        section: 'Drinks',
        items: [
          { name: 'Oat latte', price: 1400 },
          { name: 'Matcha', price: 1600 },
          { name: 'Mint lemonade', price: 1100 },
        ],
      },
    ],
    reviews: [
      {
        author: 'Karen A.',
        rating: 5,
        text: 'My regular work spot. Good Wi-Fi, good light, nobody hurries you.',
        date: '2026-09-04',
      },
      {
        author: 'Zara M.',
        rating: 4,
        text: 'Lovely brunch. A little slow on Sunday, but the staff are sweet about it.',
        date: '2026-08-27',
      },
      {
        author: 'Levon S.',
        rating: 4,
        text: 'Genuinely good vegan options and the lentil bowl is filling.',
        date: '2026-08-12',
      },
    ],
    tables: [
      marker('b-greenbean-main', 't1', '1', 'free', [2, 4], [0.15, 0.6]),
      marker('b-greenbean-main', 't2', '2', 'free', [1, 2], [0.35, 0.56]),
      marker('b-greenbean-main', 't3', '3', 'free', [1, 2], [0.55, 0.53]),
      marker('b-greenbean-main', 't6', '6', 'free', [2, 4], [0.76, 0.58]),
      marker('b-greenbean-main', 't16', '16', 'occupied', [2, 4], [0.3, 0.82]),
      marker('b-greenbean-main', 't17', '17', 'reserved', [1, 2], [0.66, 0.84]),
    ],
  },
];

export function findMockPlace(placeId: string): PlaceSeed | null {
  return mockPlaces.find((place) => place.id === placeId) ?? null;
}
