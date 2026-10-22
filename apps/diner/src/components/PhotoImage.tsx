import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Image,
  StyleSheet,
  View,
  type ImageResizeMode,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { actionIcon, colors, iconSize } from '../theme';
import { hasPhotoSource, type PhotoSource } from './photoSource';

export interface PhotoImageProps {
  /**
   * A remote URL, any React Native image source, or nothing. Missing or blank
   * draws the fallback from the first frame.
   */
  readonly source?: PhotoSource;
  /** Size and corners live here; the image fills the box and is clipped to it. */
  readonly style?: StyleProp<ViewStyle>;
  /**
   * A dark gradient over the lower part of the photo so white text stays
   * legible. `true` covers the bottom 60%; a number sets that fraction.
   */
  readonly gradient?: boolean | number;
  readonly resizeMode?: ImageResizeMode;
  readonly accessibilityLabel?: string;
  /**
   * The photo arrived, with its size when the platform says it (`null` when
   * it does not), or never will (`null` after an error).
   */
  readonly onLoad?: (size: { width: number; height: number } | null) => void;
  /**
   * The photo never will arrive. Unlike `onLoad(null)`, which is also what a
   * load that cannot report a size says, this is only ever a failure.
   */
  readonly onError?: () => void;
  /** Overlays — badges, buttons, captions — laid on top of the photo. */
  readonly children?: ReactNode;
}

/**
 * A photo that is never blank: a muted fill while it loads, the same fill with
 * a glyph if it never arrives or there was never one to load, and optionally a
 * scrim so the card's text reads on any image.
 */
export function PhotoImage({
  source,
  style,
  gradient = false,
  resizeMode = 'cover',
  accessibilityLabel,
  onLoad,
  onError,
  children,
}: PhotoImageProps) {
  // The source that failed rather than a flag, so a recycled card showing a
  // different place's photo gets its own attempt.
  const [failedSource, setFailedSource] = useState<PhotoSource>(undefined);
  const scrim = gradient === true ? 0.6 : gradient === false ? 0 : gradient;
  const usable = hasPhotoSource(source) && failedSource !== source;
  /*
   * One load handler for the image's lifetime. React Native Web reloads an
   * image whenever its `onLoad` changes, so a new arrow each render meant a
   * load per render, and a parent that re-rendered on load never stopped
   * (QA 20261016T2 B1: "Maximum update depth exceeded" in the room pager).
   */
  const onLoadRef = useRef(onLoad);
  useEffect(() => {
    onLoadRef.current = onLoad;
  }, [onLoad]);
  const handleLoad = useCallback((event: unknown) => onLoadRef.current?.(loadedSize(event)), []);

  return (
    <View style={[styles.frame, style]}>
      {!usable || source === null || source === undefined ? (
        <View
          style={styles.fallback}
          accessible={accessibilityLabel !== undefined}
          {...(accessibilityLabel ? { accessibilityLabel } : {})}
        >
          <Ionicons name={actionIcon.imageFallback} size={iconSize.xl} color={colors.textSubtle} />
        </View>
      ) : (
        <Image
          source={typeof source === 'string' ? { uri: source } : source}
          resizeMode={resizeMode}
          accessible={accessibilityLabel !== undefined}
          {...(accessibilityLabel ? { accessibilityLabel } : {})}
          onError={() => {
            setFailedSource(source);
            onLoad?.(null);
            onError?.();
          }}
          {...(onLoad ? { onLoad: handleLoad } : {})}
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

/**
 * The size a load event carries: `nativeEvent.source` on a phone, the loaded
 * `<img>` (React Native Web passes the DOM event) on the web.
 */
function loadedSize(event: unknown): { width: number; height: number } | null {
  const native = (event as { nativeEvent?: unknown } | null)?.nativeEvent as
    | {
        source?: { width?: number; height?: number };
        target?: { naturalWidth?: number; naturalHeight?: number };
      }
    | undefined;
  const width = native?.source?.width ?? native?.target?.naturalWidth ?? 0;
  const height = native?.source?.height ?? native?.target?.naturalHeight ?? 0;
  return width > 0 && height > 0 ? { width, height } : null;
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: colors.skeleton },
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
