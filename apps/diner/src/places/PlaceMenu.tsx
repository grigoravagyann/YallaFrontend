import { isOfflinePaused } from '@yalla/api/react';
import { formatDram } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Button } from '../components/Button';
import { Skeleton } from '../components/Skeleton';
import { Text } from '../components/Text';
import { colors, fontWeight, radius, space, tabularNumbers, typography } from '../theme';
import { useMenuDetail } from './hooks';

export interface PlaceMenuProps {
  readonly placeId: string;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * The Menu tab of a place: its own read, with its own states.
 *
 * Loading shows the shape of a menu; a failed read says so and offers a retry
 * that reads the menu again and nothing else; a place that has published no
 * menu says that, which is a different thing from a menu that did not load.
 */
export function PlaceMenu({ placeId, style }: PlaceMenuProps) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const menuQuery = useMenuDetail(placeId);
  const { data, isError, refetch } = menuQuery;
  const offline = isOfflinePaused(menuQuery) && !data;

  if (isError || offline) {
    return (
      <View style={[styles.state, style]}>
        <Text style={styles.stateText} accessibilityRole="alert">
          {offline ? t('net.offline') : t('place.menu.error')}
        </Text>
        <Button
          label={t('net.retry')}
          variant="outline"
          fullWidth={false}
          onPress={() => void refetch()}
        />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.menu, style]} accessibilityLabel={t('net.loading')}>
        {[0, 1, 2].map((row) => (
          <View key={row} style={styles.skeletonRow}>
            <Skeleton width="55%" height={16} />
            <Skeleton width={56} height={16} />
          </View>
        ))}
      </View>
    );
  }

  if (data.length === 0) {
    return (
      <View style={[styles.state, style]}>
        <Text style={styles.stateText}>{t('place.menu.empty')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.menu, style]}>
      {data.map((section) => (
        <View key={section.section} style={styles.menuSection}>
          <Text display accessibilityRole="header" style={styles.menuSectionTitle}>
            {section.section}
          </Text>
          {section.items.map((item) => (
            <View key={item.name} style={styles.menuItem}>
              <View style={styles.menuItemBody}>
                <Text style={styles.menuItemName}>{item.name}</Text>
                {item.description ? (
                  <Text style={styles.menuItemDescription}>{item.description}</Text>
                ) : null}
              </View>
              <Text style={styles.menuItemPrice}>{formatDram(item.price, locale)}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  state: { gap: space.md, alignItems: 'flex-start' },
  stateText: { ...typography.body, color: colors.textMuted },
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
  },
  menu: { gap: space.md + 2 },
  menuSection: { gap: space.sm },
  // The design's serif section name over its dishes.
  menuSectionTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  // Each dish its own glass card.
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
    borderRadius: radius.tile,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuItemBody: { flex: 1, minWidth: 0, gap: 2 },
  menuItemName: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  menuItemDescription: { ...typography.caption, color: colors.textMuted },
  menuItemPrice: {
    fontSize: 13,
    lineHeight: 18,
    ...tabularNumbers,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
});
