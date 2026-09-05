import {
  displayWeight,
  fontWeight,
  nativeDisplayFontFace,
  nativeFontFace,
  type DisplayWeightValue,
  type FontWeightValue,
} from '@yalla/tokens';
import type { Ref } from 'react';
import {
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from 'react-native';

/**
 * Resolve a style's `fontWeight` to the face that weight actually ships as.
 *
 * React Native selects a custom font by *name*, not by family plus weight:
 * `fontFamily: 'Yalla Sans', fontWeight: '500'` gets a synthesised approximation
 * on Android and the regular face on iOS. So the weight is read off the style
 * and swapped for the exact face — `YallaSans-Medium` — and the `fontWeight`
 * itself is dropped so the platform does not try to embolden it a second time.
 *
 * The sans ships 400, 500 and 700; the serif ships 600 and 700. Anything else
 * is rounded to the nearest face rather than left to synthesis.
 */
function withFace(style: StyleProp<TextStyle>, display: boolean): TextStyle {
  const flat = StyleSheet.flatten(style) ?? {};
  const { fontWeight: weight, fontFamily: _ignored, ...rest } = flat;
  return {
    ...rest,
    fontFamily: display
      ? nativeDisplayFontFace[nearestDisplayWeight(weight)]
      : nativeFontFace[nearestWeight(weight)],
  };
}

function nearestWeight(weight: TextStyle['fontWeight']): FontWeightValue {
  const numeric = Number(weight ?? fontWeight.regular);
  if (weight === 'bold' || numeric >= 600) return fontWeight.bold;
  if (numeric >= 500) return fontWeight.medium;
  return fontWeight.regular;
}

function nearestDisplayWeight(weight: TextStyle['fontWeight']): DisplayWeightValue {
  const numeric = Number(weight ?? displayWeight.semibold);
  return weight === 'bold' || numeric >= 700 ? displayWeight.bold : displayWeight.semibold;
}

/**
 * The app's `Text`. Same props as React Native's; sets the face.
 *
 * Every screen imports this rather than `react-native`'s, which is what makes
 * "two families, three scripts" true in the diner app rather than aspirational —
 * there is no global default font in React Native, so it has to happen here.
 *
 * `display` switches to Yalla Serif for the two display steps of the type
 * scale — screen titles, the big number on a card. Body text never sets it.
 *
 * The type of the same name is the underlying native handle, so `useRef<Text>`
 * and `useRef<TextInput>` keep meaning what they always did.
 */
export type Text = RNText;
export function Text({
  style,
  display = false,
  ref,
  ...props
}: TextProps & { ref?: Ref<RNText>; display?: boolean }) {
  return <RNText ref={ref} {...props} style={withFace(style, display)} />;
}

export type TextInput = RNTextInput;
export function TextInput({ style, ref, ...props }: TextInputProps & { ref?: Ref<RNTextInput> }) {
  return <RNTextInput ref={ref} {...props} style={withFace(style, false)} />;
}
