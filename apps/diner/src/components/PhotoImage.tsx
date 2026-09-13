import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import {
  Image,
  StyleSheet,
  View,
  type ImageResizeMode,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { actionIcon, colors, iconSize } from '../theme';

export interface PhotoImageProps {
  /** A remote URL, or any React Native image source. */
  readonly source: string | ImageSourcePropType;
  /** Size and corners live here; the image fills the box and is clipped to it. */
  readonly style?: StyleProp<ViewStyle>;
  /**
   * A dark gradient over the lower part of the photo so white text stays
   * legible. `true` covers the bottom 60%; a number sets that fraction.
   */
  readonly gradient?: boolean | number;
  readonly resizeMode?: ImageResizeMode;
  readonly accessibilityLabel?: string;
  /** Overlays — badges, buttons, captions — laid on top of the photo. */
  readonly children?: ReactNode;
}

/**
 * A photo that is never blank: cream while it loads, cream with a glyph if it
 * never arrives, and optionally a scrim so the card's text reads on any image.
 */
export function PhotoImage({
  source,
  style,
  gradient = false,
  resizeMode = 'cover',
  accessibilityLabel,
  children,
}: PhotoImageProps) {
  const [failed, setFailed] = useState(false);
  const resolved: ImageSourcePropType = typeof source === 'string' ? { uri: source } : source;
  const scrim = gradient === true ? 0.6 : gradient === false ? 0 : gradient;

  return (
    <View style={[styles.frame, style]}>
      {failed ? (
        <View style={styles.fallback}>
          <Ionicons name={actionIcon.imageFallback} size={iconSize.xl} color={colors.textSubtle} />
        </View>
      ) : (
        <Image
          source={resolved}
          resizeMode={resizeMode}
          accessible={accessibilityLabel !== undefined}
          {...(accessibilityLabel ? { accessibilityLabel } : {})}
          onError={() => setFailed(true)}
          style={StyleSheet.absoluteFill}
        />
      )}
      {scrim > 0 ? (
        <LinearGradient
          pointerEvents="none"
          colors={[colors.overlayClear, colors.overlayDark]}
          style={[styles.gradient, { height: `${Math.round(scrim * 100)}%` }]}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  fallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradient: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
