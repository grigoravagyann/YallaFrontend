import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

/**
 * The style keys that place a control in its parent, as opposed to the ones
 * that draw it. A pressable that squeezes on press wraps itself in an
 * `Animated.View`; placement goes on that wrapper (so the squeeze moves the
 * whole control) and everything else stays on the pressable, where a
 * caller's padding, height, fill or border still reaches the thing it styles.
 */
const OUTER_KEYS = new Set<keyof ViewStyle>([
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginHorizontal',
  'marginVertical',
  'marginStart',
  'marginEnd',
  'alignSelf',
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'position',
  'top',
  'bottom',
  'left',
  'right',
  'start',
  'end',
  'zIndex',
  'width',
  'minWidth',
  'maxWidth',
]);

/** Split a caller's style into what places the control and what draws it. */
export function splitStyle(style: StyleProp<ViewStyle>): {
  readonly outer: ViewStyle;
  readonly inner: ViewStyle;
} {
  const flat = StyleSheet.flatten(style) ?? {};
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (OUTER_KEYS.has(key as keyof ViewStyle)) outer[key] = value;
    else inner[key] = value;
  }
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}
