import { useTranslation } from '@yalla/i18n';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { TablePhotoMarker } from '../../places/model';
import { colors, fontWeight, layout, radius, space, typography } from '../../theme';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { PhotoImage } from '../PhotoImage';
import { Text } from '../Text';
import { useCapacityLabel } from './TableMarker';

/** Room the bar takes over the photo's bottom edge; controls above it clear this. */
export const TABLE_INFO_BAR_CLEARANCE = 84;

const SLIDE = 120;
const SHOW_MS = 220;
const HIDE_MS = 160;

export interface TableInfoBarProps {
  /** The selected table, or null to slide the bar away. */
  readonly table: TablePhotoMarker | null;
  /** The photo the table sits in, shown as a thumb. */
  readonly photo: string;
  readonly onBook: (table: TablePhotoMarker) => void;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * The dark strip that slides over the photo when a table is tapped: thumb,
 * "Table 5", "● Free", "2–4 people", and Book — only when the table is free.
 * Reserved and occupied say so and offer nothing to press.
 */
export function TableInfoBar({ table, photo, onBook, style }: TableInfoBarProps) {
  const { t } = useTranslation('diner');
  const capacity = useCapacityLabel();
  const [progress] = useState(() => new Animated.Value(table ? 1 : 0));
  // The last table shown, so the bar keeps its words while it slides away.
  const [rendered, setRendered] = useState<TablePhotoMarker | null>(table);
  // Adjusted during render rather than in the effect, so the new table's words
  // are on screen in the same frame the bar starts sliding in.
  if (table && table !== rendered) setRendered(table);

  useEffect(() => {
    if (table) {
      Animated.timing(progress, {
        toValue: 1,
        duration: SHOW_MS,
        useNativeDriver: true,
      }).start();
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 0,
      duration: HIDE_MS,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setRendered(null);
    });
    return () => animation.stop();
  }, [progress, table]);

  const shown = table ?? rendered;
  if (!shown) return null;

  const free = shown.status === 'free';
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [SLIDE, 0] });

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      pointerEvents={table ? 'auto' : 'none'}
      style={[styles.bar, { opacity: progress, transform: [{ translateY }] }, style]}
    >
      <View style={styles.row}>
        <PhotoImage source={photo} style={styles.thumb} />
        <View style={styles.body}>
          <Text numberOfLines={1} style={styles.name}>
            {t('tables.table', { label: shown.label })}
          </Text>
          <View style={styles.meta}>
            <Badge variant={shown.status} dot size="sm" />
            <Text numberOfLines={1} style={styles.capacity}>
              {capacity(shown)}
            </Text>
          </View>
        </View>
        {free ? (
          <Button
            label={t('tables.book')}
            onPress={() => onBook(shown)}
            fullWidth={false}
            style={styles.book}
          />
        ) : null}
      </View>
      {free ? null : <Text style={styles.notBookable}>{t('tables.notBookable')}</Text>}
    </Animated.View>
  );
}

const THUMB = 44;

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: space.md,
    gap: space.sm,
    backgroundColor: colors.surfaceDark,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.small },
  body: { flex: 1, gap: space.xs },
  name: { ...typography.bodyLg, fontWeight: fontWeight.bold, color: colors.onImage },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  capacity: { ...typography.caption, color: colors.onImage, opacity: 0.8, flexShrink: 1 },
  // Compact, but never under the platform minimum: this is the one press that matters here.
  book: { paddingHorizontal: space.lg, minHeight: layout.touchTarget },
  notBookable: { ...typography.caption, color: colors.onImage, opacity: 0.8 },
});
