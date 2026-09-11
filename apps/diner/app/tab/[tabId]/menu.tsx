import type { MenuItemDetail } from '@yalla/api';
import { isEndpointNotWired, isOffline } from '@yalla/api';
import { formatDram } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Text } from '../../../src/components/Text';
import { useMenuDetail } from '../../../src/data/orderQueries';
import { useTab } from '../../../src/data/queries';
import { useTray } from '../../../src/order/TrayProvider';

import { TrayBar } from '../../../src/order/TrayBar';
import { useBranchTimeZone } from '../../../src/data/orderQueries';

/**
 * The menu, and the way an order is built.
 *
 * Readable by anyone at the table, including a pending joiner and a guest whose
 * host has hidden the total. **Prices are always visible to everyone.** That
 * distinction is the feature: what a host can hide is the table's total and
 * other people's items, never what your own coffee costs.
 *
 * Tapping an item adds it to a tray. It does not send anything — see
 * `src/order/tray.ts` for why one order beats five tickets.
 */
export default function MenuScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const { tabId } = useLocalSearchParams<{ tabId: string }>();

  const { data: tab } = useTab(tabId);
  const { data: menu, isLoading, isError, error, refetch, isPaused } = useMenuDetail(tab?.branchId);
  const { dispatch } = useTray();

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  // Memoised so the filtered list below is not rebuilt on every keystroke
  // just because `?? []` produced a new array.
  const categories = useMemo(() => menu?.categories ?? [], [menu]);
  const activeCategory = categoryId ?? categories[0]?.id ?? null;

  const items = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase(locale);
    if (needle.length > 0) {
      // Across names *and* ingredients. A tourist searching "chicken" or
      // "dairy" is the case this exists for, and neither is reliably in a dish
      // name in Yerevan.
      return categories
        .flatMap((category) => category.items)
        .filter(
          (item) =>
            item.name.toLocaleLowerCase(locale).includes(needle) ||
            item.ingredients.toLocaleLowerCase(locale).includes(needle) ||
            item.allergens.toLocaleLowerCase(locale).includes(needle),
        );
    }
    return categories.find((category) => category.id === activeCategory)?.items ?? [];
  }, [categories, activeCategory, search, locale]);

  // The branch's own zone, for the kitchen estimate on the sent bar. Never the
  // device's: a tourist's phone on Moscow time would put it three hours out.
  const { data: branchZone } = useBranchTimeZone(tab?.branchId);

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: true, title: '' }} />

      {/* A query the phone cannot send is *paused*, not failed, so without this
          a cold offline open would spin for ever. With a cached menu there is
          data to render and none of this fires — which is the whole point of
          caching the menu hard: it is the thing somebody stares at while the
          signal is gone. */}
      {isPaused && !menu ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('menu.offlineNoCache')}</Text>
        </View>
      ) : isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={color.primaryInk} />
          <Text style={styles.muted}>{t('menu.loading')}</Text>
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>
            {isEndpointNotWired(error)
              ? t('menu.notWired')
              : isOffline(error)
                ? t('menu.offlineNoCache')
                : t('menu.error')}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => void refetch()} style={styles.retry}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Sticky category strip. Search is below it and half the width: a
              diner who has to type has been failed by the categories. */}
          <View style={styles.strip}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {categories.map((category) => {
                const active = category.id === activeCategory && search === '';
                return (
                  <Pressable
                    key={category.id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      setSearch('');
                      setCategoryId(category.id);
                    }}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {category.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.searchRow}>
            <TextInput
              style={styles.search}
              value={search}
              onChangeText={setSearch}
              placeholder={t('menu.search')}
              placeholderTextColor={color.subtleForeground}
              accessibilityLabel={t('menu.search')}
            />
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {items.length === 0 ? (
              <Text style={styles.muted}>{t('menu.noMatches')}</Text>
            ) : (
              items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  locale={locale}
                  expanded={openItemId === item.id}
                  onToggle={() => setOpenItemId(openItemId === item.id ? null : item.id)}
                  onAdd={() => dispatch({ type: 'add', item, atMs: Date.now() })}
                />
              ))
            )}
          </ScrollView>

          {/*
            The tray bar. It renders three states and only one of them is a
            tray — see `TrayBar`, which exists because this used to be a single
            green pill reading "Review" and a diner could read that as an order
            that had been placed.
          */}
          <View style={styles.barSlot}>
            <TrayBar
              tabId={tabId}
              timeZoneId={branchZone ?? 'Asia/Yerevan'}
              onReview={() => router.push({ pathname: '/tab/[tabId]/tray', params: { tabId } })}
              onSeeBill={() => router.push({ pathname: '/tab/[tabId]', params: { tabId } })}
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

interface ItemCardProps {
  readonly item: MenuItemDetail;
  readonly locale: Parameters<typeof formatDram>[1];
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly onAdd: () => void;
}

/**
 * One dish.
 *
 * The descriptive fields are on the card, not behind a modal: the backend made
 * ingredients, allergens, portion size and spice level required precisely so a
 * diner stops needing to ask a waiter, and putting them behind a second tap
 * wastes that. The card shows a summary line always and the full detail on tap,
 * which keeps a forty-item menu scannable without hiding anything.
 */
function ItemCard({ item, locale, expanded, onToggle, onAdd }: ItemCardProps) {
  const { t } = useTranslation('diner');

  return (
    <View style={[styles.card, !item.isAvailable && styles.cardOut]}>
      <Pressable accessibilityRole="button" onPress={onToggle} style={styles.cardMain}>
        <View style={styles.cardHead}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemPrice}>{formatDram(item.priceDram, locale)}</Text>
        </View>

        {item.description ? <Text style={styles.itemDesc}>{item.description}</Text> : null}

        <Text style={styles.itemMeta}>
          {[
            item.portionSize,
            t('menu.prep', { count: item.prepMinutes }),
            item.spiceLevel === 'notSpicy' ? null : t(`menu.spice.${item.spiceLevel}`),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>

        {expanded ? (
          <View style={styles.detail}>
            {item.ingredients ? (
              <Text style={styles.detailLine}>
                <Text style={styles.detailLabel}>{t('menu.ingredients')}: </Text>
                {item.ingredients}
              </Text>
            ) : null}
            {item.allergens ? (
              <Text style={styles.detailLine}>
                <Text style={styles.detailLabel}>{t('menu.allergens')}: </Text>
                {item.allergens}
              </Text>
            ) : (
              <Text style={styles.detailLine}>{t('menu.noAllergens')}</Text>
            )}
          </View>
        ) : null}
      </Pressable>

      {/* Shown and marked, never hidden. A dish that silently vanishes reads as
          a broken menu and the diner asks a waiter — the exact question this
          screen exists to remove. */}
      {item.isAvailable ? (
        <Pressable accessibilityRole="button" onPress={onAdd} style={styles.add}>
          <Text style={styles.addText}>{t('menu.add')}</Text>
        </Pressable>
      ) : (
        <View style={styles.outBadge}>
          <Text style={styles.outText}>{t('menu.unavailable')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.paper },
  body: { padding: space.lg, gap: space.md, paddingBottom: space.xxxl },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },
  muted: {
    color: color.mutedForeground,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    textAlign: 'center',
  },
  retry: {
    minHeight: touchTarget.regular,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    backgroundColor: color.primary,
  },
  retryText: { color: color.primaryForeground, fontWeight: fontWeight.bold },

  strip: {
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: color.borderSoft,
    backgroundColor: color.surface,
  },
  chip: {
    minHeight: touchTarget.regular,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    marginRight: space.sm,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: color.borderStrong,
  },
  chipActive: { backgroundColor: color.primary, borderColor: color.primary },
  chipText: { color: color.foreground, fontWeight: fontWeight.medium },
  chipTextActive: { color: color.primaryForeground },

  searchRow: { paddingHorizontal: space.lg, paddingTop: space.sm },
  search: {
    minHeight: touchTarget.regular,
    maxWidth: 280,
    paddingHorizontal: space.md,
    borderRadius: radius.soft,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    color: color.foreground,
  },

  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.borderSoft,
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
  cardOut: { opacity: 0.7 },
  cardMain: { padding: space.lg, gap: space.xs },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  itemName: {
    flex: 1,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: fontWeight.medium,
  },
  itemPrice: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  itemDesc: { color: color.mutedForeground, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  itemMeta: { color: color.subtleForeground, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
  detail: { gap: space.xs, paddingTop: space.sm },
  detailLine: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, color: color.foreground },
  detailLabel: { fontWeight: fontWeight.bold },

  add: {
    minHeight: touchTarget.regular,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.primary,
  },
  addText: { color: color.primaryForeground, fontWeight: fontWeight.bold },
  outBadge: {
    minHeight: touchTarget.small,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.greenTint,
  },
  outText: { color: color.mutedForeground, fontWeight: fontWeight.medium, fontSize: fontSize.sm },

  /**
   * The bar sits above the safe area with its own padding rather than being
   * edge-to-edge. The old full-bleed green bar read as a system affordance —
   * part of the app chrome — which is half of why "Review" on it looked like a
   * confirmation rather than a step.
   */
  barSlot: { padding: space.md, paddingTop: 0 },
});
