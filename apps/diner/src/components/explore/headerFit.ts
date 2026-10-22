// The spacing module alone: the theme's index reaches react-native, and this is pure.
import { layout, space } from '../../theme/spacing';

/** The diner's avatar at the start of the Explore header. */
export const AVATAR = 48;

/** The Map pill's fixed parts beside its word: padding, glyph, gap and edges. */
const PILL_CHROME = 13 + 20 + 7 + space.lg + 2;
/** Everything in the row but the greeting and the pill: its padding, avatar, bell, three gaps. */
const ROW_CHROME = 2 * layout.screenPadding + AVATAR + layout.touchTarget + 3 * space.md;

/**
 * Whether the Map pill should drop its word and keep the glyph: when, with the
 * word, the greeting would be cut short. On a 360 pt phone "Քարտեզ" left
 * "Բարի երեկո," room for "Բարի եր…". Measured against the pill's full width,
 * not the room left once it is compact, so the choice never flips back and
 * forth. The button keeps its full spoken name either way.
 */
export function mapPillCompact(rowWidth: number, greetingWidth: number, labelWidth: number) {
  if (rowWidth <= 0 || greetingWidth <= 0) return false;
  return greetingWidth > rowWidth - ROW_CHROME - PILL_CHROME - labelWidth;
}
