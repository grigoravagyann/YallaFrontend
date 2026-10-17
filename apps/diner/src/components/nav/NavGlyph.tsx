import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { navIcons, type IconPair } from '../../theme';

export interface NavGlyphProps {
  /** The `app/(tabs)/<name>` route the glyph stands for. */
  readonly routeName: string;
  readonly size: number;
  readonly color: string;
}

const FALLBACK_ICONS: IconPair = { outline: 'ellipse-outline', filled: 'ellipse-outline' };

/**
 * The tab bar's glyphs: the hand-drawn set from the design — a map pin for
 * Places, a calendar with a heart for Bookings, a clipboard for Orders, a QR
 * frame for Scan and a bust for Profile. One stroke weight per drawing,
 * `currentColor` everywhere, so the bar tints them like any icon.
 *
 * A route the drawings do not cover falls back to its Ionicons pair, so a new
 * tab still has a glyph the day it is added. Decorative: the tab's label
 * names the tab, and the drawing carries no label of its own.
 */
export function NavGlyph({ routeName, size, color }: NavGlyphProps) {
  const common = {
    width: size,
    height: size,
    fill: 'none',
    stroke: color,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (routeName) {
    case 'index':
      return (
        <Svg viewBox="0 0 64 64" strokeWidth={4.3} {...common}>
          <Path d="M34 53L27 43C22 38 18 34 18 26C18 17 25 10 34 10C43 10 50 17 50 26C50 32 47 37 43 41" />
          <Circle cx={34} cy={26} r={4} />
        </Svg>
      );
    case 'bookings':
      return (
        <Svg viewBox="10 5 75 75" strokeWidth={5} {...common}>
          <Path d="M32 19Q23 19 23 28V53Q23 62 32 62H46" />
          <Path d="M56 19Q65 19 65 28V44" />
          <Path d="M23 33H65" />
          <Path d="M35 14V24M53 14V24" />
          <Path d="M32 19H32.5M37.5 19H50.5M55.5 19H56" />
          <Path d="M60 65C53 60 48 55 51 50C54 46 58 48 60 51C63 47 68 47 71 51C74 56 67 62 60 65Z" />
        </Svg>
      );
    case 'orders':
      return (
        <Svg viewBox="0 0 64 64" strokeWidth={4.3} {...common}>
          <Path d="M22 13H42Q49 13 49 20V49Q49 56 42 56H22Q15 56 15 49V20Q15 13 22 13Z" />
          <Path d="M26 13V10H38V13" />
          <Path d="M24 27H40M24 35H39M24 43H32" />
        </Svg>
      );
    case 'scan':
      return (
        <Svg viewBox="0 0 24 24" strokeWidth={1.5} {...common}>
          <Path d="M3 8V5a2 2 0 0 1 2-2h3" />
          <Path d="M16 3h3a2 2 0 0 1 2 2v3" />
          <Path d="M21 16v3a2 2 0 0 1-2 2h-3" />
          <Path d="M8 21H5a2 2 0 0 1-2-2v-3" />
          <Rect x={7} y={7} width={4} height={4} rx={0.8} />
          <Rect x={13} y={7} width={4} height={4} rx={0.8} />
          <Rect x={7} y={13} width={4} height={4} rx={0.8} />
          <Path d="M13 13h4v4" />
        </Svg>
      );
    case 'profile':
      return (
        <Svg viewBox="0 0 24 24" strokeWidth={1.6} {...common}>
          <Circle cx={12} cy={8} r={4} />
          <Path d="M4 21a8 8 0 0 1 16 0" />
        </Svg>
      );
    default: {
      const icons = (navIcons as Record<string, IconPair | undefined>)[routeName] ?? FALLBACK_ICONS;
      return <Ionicons name={icons.outline} size={size} color={color} />;
    }
  }
}
