import { type Availability } from '@yalla/api';
import { color, radius, space } from '@yalla/tokens';
import { StyleSheet, View } from 'react-native';
import { glyphCells } from '../lib/freeTablesGlyph';

const COLUMNS = 4;
const SQUARE = 9;
const GAP = 3;
/** React Native sizes border-box, so the frame's edge has to be in its width. */
const BORDER = 1;

export interface FreeTablesGlyphProps {
  readonly availability: Availability;
}

/**
 * The free tables, drawn rather than said.
 *
 * One square per table nobody is sitting at, on a small grid, so a scan down
 * the Explore list reads as a scan of the city's free tables. The squares are
 * near-square with a 2px corner, the same shape the floor plan gives a table,
 * which is what makes the glyph read as *tables* and not as a rating.
 *
 * It is deliberately not a miniature of the room. The browse list carries a
 * free-table count and nothing per table, and a glyph that drew occupied
 * tables it had never been told about would be a picture of a room that does
 * not exist. So: green squares for the free ones, and the grid otherwise
 * stays empty — a shut branch shows a quiet, empty frame.
 */
export function FreeTablesGlyph({ availability }: FreeTablesGlyphProps) {
  const { cells, closed } = glyphCells(availability);

  // Decorative on purpose: the row it sits in already says the count in words,
  // and a labelled glyph made TalkBack announce the availability twice.
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.frame, closed && styles.frameClosed]}
    >
      {cells.map((isFree, i) => (
        <View
          key={i}
          style={[styles.cell, isFree && styles.cellFree, closed && styles.cellClosed]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: COLUMNS * SQUARE + (COLUMNS - 1) * GAP + space.sm * 2 + BORDER * 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
    padding: space.sm,
    borderRadius: radius.soft,
    backgroundColor: color.surface,
    borderWidth: BORDER,
    borderColor: color.borderSoft,
  },
  frameClosed: { backgroundColor: color.paper },
  cell: {
    width: SQUARE,
    height: SQUARE,
    borderRadius: radius.table,
    backgroundColor: color.greenTint,
  },
  cellFree: { backgroundColor: color.success },
  cellClosed: { backgroundColor: color.borderSoft },
});
