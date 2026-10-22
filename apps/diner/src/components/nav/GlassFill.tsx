import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Platform, StyleSheet, View } from 'react-native';
import { colors } from '../../theme';

/**
 * The glass behind the floating tab bar and its Scan circle. Fills its parent;
 * the parent sets the shape (`borderRadius` + `overflow: 'hidden'`).
 *
 * The best each platform has, in order:
 * - iOS 26+: Apple's Liquid Glass (`expo-glass-effect`), the same material as
 *   the system tab bar: it refracts and lights what scrolls underneath.
 * - older iOS: the system's ultra-thin light material, which blurs and lifts
 *   the colours under it, with no extra wash.
 * - web: a light blur under a thin white wash.
 * - Android: no blur (it needs a `BlurTargetView` round the whole screen), so a
 *   plain see-through white.
 */
export function GlassFill() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <GlassLayer />
    </View>
  );
}

function GlassLayer() {
  if (Platform.OS === 'ios' && LIQUID_GLASS) {
    return <GlassView glassEffectStyle="regular" style={StyleSheet.absoluteFill} />;
  }
  if (Platform.OS === 'ios') {
    return (
      <BlurView
        tint="systemUltraThinMaterialLight"
        intensity={GLASS_BLUR}
        style={StyleSheet.absoluteFill}
      />
    );
  }
  if (Platform.OS === 'web') {
    return (
      <>
        <BlurView tint="light" intensity={GLASS_BLUR} style={StyleSheet.absoluteFill} />
        <View
          testID="nav-glass"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.navGlassWash }]}
        />
      </>
    );
  }
  return (
    <View
      testID="nav-glass"
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.navBar }]}
    />
  );
}

/** Read once: Liquid Glass is a property of the OS, not of the moment. */
const LIQUID_GLASS = Platform.OS === 'ios' && safeLiquidGlassCheck();

function safeLiquidGlassCheck(): boolean {
  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

/** How strongly the content under the bar is blurred where a blur is used (expo-blur's 1–100). */
export const GLASS_BLUR = 20;
