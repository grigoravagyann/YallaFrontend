import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View } from 'react-native';
import { colors } from '../../theme';

/**
 * The frosted glass behind the floating tab bar and its Scan circle: the
 * content scrolling underneath is blurred, then washed with a thin white so
 * the labels stay readable. Fills its parent; the parent sets the shape
 * (`borderRadius` + `overflow: 'hidden'`).
 *
 * iOS and the web blur natively. Android's blur needs a `BlurTargetView`
 * around the whole screen, so there the wash is simply thicker and nothing is
 * blurred — the bar still reads as see-through glass.
 */
export function GlassFill() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Platform.OS === 'android' ? null : (
        <BlurView tint="light" intensity={GLASS_BLUR} style={StyleSheet.absoluteFill} />
      )}
      <View
        testID="nav-glass"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: Platform.OS === 'android' ? colors.navBar : colors.navGlassWash },
        ]}
      />
    </View>
  );
}

/** How strongly the content under the bar is blurred (expo-blur's 1–100). */
export const GLASS_BLUR = 40;
