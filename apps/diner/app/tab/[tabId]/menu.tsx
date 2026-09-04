import { formatDram, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space } from '@yalla/tokens';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBranchMenu, useTab } from '../../../src/data/queries';

/**
 * The menu, with prices, readable by anyone at the table.
 *
 * Reachable from the tab and from the pending screen, unchanged in both. A
 * pending joiner reading prices is the point: they can work out what their own
 * order would cost while the host finds their phone. Nothing here depends on
 * being approved, and nothing here shows anyone else's items.
 *
 * Ordering arrives next; these rows are not tappable yet, and say so once
 * rather than looking broken four times.
 */
export default function MenuScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const { tabId } = useLocalSearchParams<{ tabId: string }>();

  const { data: tab } = useTab(tabId);
  const { data: menu, isLoading, isError } = useBranchMenu(tab?.branchId);

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: true, title: '' }} />

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>{t('menu.title')}</Text>
        {tab ? (
          <Text style={styles.where}>
            {t('tab.where', { venue: tab.venueName, branch: tab.branchName })}
          </Text>
        ) : null}
        <Text style={styles.note}>{t('menu.pricesOnly')}</Text>

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={color.accent} />
            <Text style={styles.muted}>{t('menu.loading')}</Text>
          </View>
        ) : isError || !menu ? (
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>{t('menu.emptyTitle')}</Text>
            <Text style={styles.muted}>{t('menu.emptyBody')}</Text>
          </View>
        ) : (
          <>
            {menu.sections.map((section) => (
              <View key={section.id} style={styles.section}>
                <Text style={styles.sectionName}>{section.name}</Text>
                {section.items.map((item) => (
                  <View key={item.id} style={styles.item}>
                    <View style={styles.itemText}>
                      <Text style={[styles.itemName, !item.isAvailable && styles.itemGone]}>
                        {item.name}
                      </Text>
                      {item.description ? (
                        <Text style={styles.itemDescription}>{item.description}</Text>
                      ) : null}
                      {!item.isAvailable ? (
                        <Text style={styles.unavailable}>{t('menu.unavailable')}</Text>
                      ) : null}
                    </View>
                    {/* Straight from the server, never summed here. The client
                        displays money and does not do arithmetic on it. */}
                    <Text style={[styles.price, !item.isAvailable && styles.itemGone]}>
                      {formatDram(item.priceDram, locale)}
                    </Text>
                  </View>
                ))}
              </View>
            ))}

            {/* The branch's timezone, explicitly — never the device's. Someone
                looking at this from another country still sees the venue's day. */}
            <Text style={styles.updated}>
              {t('menu.updated', {
                time: formatTime(menu.updatedAtUtc, tab?.timeZoneId ?? 'Asia/Yerevan', locale),
              })}
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.background },
  body: { padding: space.lg, paddingBottom: space.xxxl, gap: space.xs },
  title: {
    fontSize: fontSize.xxl,
    lineHeight: lineHeight.xxl,
    fontWeight: fontWeight.bold,
    color: color.textPrimary,
  },
  where: { fontSize: fontSize.sm, color: color.textSecondary },
  note: { marginBottom: space.md, fontSize: fontSize.sm, color: color.textSecondary },
  section: {
    marginTop: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    gap: space.sm,
  },
  sectionName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: color.textPrimary,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.lg,
    paddingVertical: space.xs,
  },
  itemText: { flex: 1, gap: space.xxs },
  itemName: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    color: color.textPrimary,
  },
  itemDescription: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, color: color.textSecondary },
  itemGone: { color: color.textSecondary, textDecorationLine: 'line-through' },
  unavailable: { fontSize: fontSize.xs, color: color.warning },
  price: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: color.textPrimary },
  updated: { marginTop: space.lg, fontSize: fontSize.xs, color: color.textSecondary },
  centered: { alignItems: 'center', gap: space.sm, paddingTop: space.xxl },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: color.textPrimary },
  muted: { fontSize: fontSize.sm, color: color.textSecondary, textAlign: 'center' },
});
