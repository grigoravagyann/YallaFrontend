/**
 * Exactly one elevation exists.
 *
 * Structure in this system comes from hairlines, not from shadows. Cards,
 * panels, headers and table rows are separated by a 1px border and nothing
 * else — a soft grey shadow under every card is the default look of a component
 * library, and it makes a flat, precise system read as generic.
 *
 * The one exception earns it: the bottom sheet genuinely floats over the floor
 * plan, and a diner has to be able to tell that the room continues underneath.
 * The shadow points upward because the sheet rises from the bottom edge.
 *
 * If a second elevation is ever proposed, the question to ask is whether the
 * thing actually floats over content the user still needs to see. If it does
 * not, it wants a border.
 */
export const elevation = {
  sheet: {
    /** CSS `box-shadow`. */
    web: '0 -2px 16px rgba(18, 33, 26, 0.10)',
    /**
     * The same shadow for React Native. iOS reads `shadow*`; Android reads
     * `elevation` and cannot express a direction, so it approximates.
     */
    native: {
      shadowColor: '#12211A',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 16,
      elevation: 8,
    },
  },
} as const;

export type ElevationToken = keyof typeof elevation;
