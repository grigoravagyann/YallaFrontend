import { useTranslation } from '@yalla/i18n';
import { useEffect, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, fontWeight, layout, space, typography } from '../../theme';
import { Text } from '../Text';

export type PlaceTab = 'about' | 'menu' | 'reviews';

export const placeTabs: readonly PlaceTab[] = ['about', 'menu', 'reviews'];

export interface PlaceTabsProps {
  readonly value: PlaceTab;
  readonly onChange: (tab: PlaceTab) => void;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * About / Menu / Reviews: three equal segments over a hairline, with a brown
 * underline that slides under the active one.
 */
export function PlaceTabs({ value, onChange, style }: PlaceTabsProps) {
  const { t } = useTranslation('diner');
  const [width, setWidth] = useState(0);
  const [position] = useState(() => new Animated.Value(placeTabs.indexOf(value)));

  useEffect(() => {
    Animated.spring(position, {
      toValue: placeTabs.indexOf(value),
      bounciness: 2,
      speed: 18,
      useNativeDriver: true,
    }).start();
  }, [position, value]);

  const segment = width / placeTabs.length;

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.row, style]}
    >
      {placeTabs.map((tab) => {
        const selected = tab === value;
        return (
          <Pressable
            key={tab}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(tab)}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
          >
            <Text numberOfLines={1} style={[styles.label, selected && styles.labelActive]}>
              {t(`place.tab.${tab}`)}
            </Text>
          </Pressable>
        );
      })}
      <View pointerEvents="none" style={styles.track} />
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.underline,
            { width: segment, transform: [{ translateX: Animated.multiply(position, segment) }] },
          ]}
        />
      ) : null}
    </View>
  );
}

const UNDERLINE = 2;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', position: 'relative' },
  tab: {
    flex: 1,
    minHeight: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.sm,
  },
  pressed: { backgroundColor: colors.primarySoft },
  label: { ...typography.bodyLg, fontWeight: fontWeight.medium, color: colors.textMuted },
  labelActive: { fontWeight: fontWeight.bold, color: colors.primary },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: colors.border,
  },
  underline: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: UNDERLINE,
    borderRadius: UNDERLINE,
    backgroundColor: colors.primary,
  },
});
