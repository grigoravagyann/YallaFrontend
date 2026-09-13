import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

/** Any glyph Ionicons ships. Typed, so a misspelt name fails `tsc`, not the user. */
export type IoniconName = ComponentProps<typeof Ionicons>['name'];

export const iconSize = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 28,
  /** Tab bar glyphs. */
  nav: 24,
  /** The QR glyph inside the Scan FAB. */
  fab: 26,
} as const;

export type IconSizeToken = keyof typeof iconSize;

/** The Scan FAB: a circle this wide, its top rising above the tab bar pill. */
export const fabSize = 60;

export interface IconPair {
  readonly outline: IoniconName;
  readonly filled: IoniconName;
}

/**
 * Tab bar glyphs keyed by expo-router route name (`app/(tabs)/<name>.tsx`).
 * One outline style throughout; the active tab changes colour, not glyph.
 */
export const navIcons = {
  index: { outline: 'compass-outline', filled: 'compass-outline' },
  bookings: { outline: 'calendar-outline', filled: 'calendar-outline' },
  scan: { outline: 'qr-code-outline', filled: 'qr-code-outline' },
  orders: { outline: 'bag-handle-outline', filled: 'bag-handle-outline' },
  profile: { outline: 'person-outline', filled: 'person-outline' },
} as const satisfies Record<string, IconPair>;

export type NavRouteName = keyof typeof navIcons;

/** Map marker glyphs — two visually distinct kinds, never the same pin. */
export const placeTypeIcon = {
  restaurant: 'restaurant',
  cafe: 'cafe',
} as const satisfies Record<string, IoniconName>;

/** The rest of the glyph vocabulary, named once so screens agree. */
export const actionIcon = {
  call: 'call-outline',
  directions: 'navigate-outline',
  website: 'globe-outline',
  save: 'bookmark-outline',
  saved: 'bookmark',
  favorite: 'heart-outline',
  favorited: 'heart',
  share: 'share-outline',
  map: 'map-outline',
  list: 'list-outline',
  search: 'search-outline',
  location: 'location-outline',
  star: 'star-outline',
  chevron: 'chevron-forward-outline',
  back: 'arrow-back-outline',
  settings: 'settings-outline',
  expand: 'expand-outline',
  zoomIn: 'add',
  zoomOut: 'remove',
  locate: 'locate-outline',
  close: 'close-outline',
  calendar: 'calendar-outline',
  time: 'time-outline',
  people: 'people-outline',
  note: 'create-outline',
  table: 'grid-outline',
  offline: 'cloud-offline-outline',
  error: 'alert-circle-outline',
  imageFallback: 'image-outline',
  /** The glyph standing in for the brand on the welcome screen. */
  brandMark: 'restaurant-outline',
} as const satisfies Record<string, IoniconName>;
