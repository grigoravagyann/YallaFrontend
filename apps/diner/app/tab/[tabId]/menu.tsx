import type { MenuItemDetail } from '@yalla/api';
import { isOffline } from '@yalla/api';
import { formatDram } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Button } from '../../../src/components/Button';
import { Card } from '../../../src/components/Card';
import { Chip } from '../../../src/components/Chip';
import { PhotoImage } from '../../../src/components/PhotoImage';
import { Text, TextInput } from '../../../src/components/Text';
import { useDinerTab, useMenuDetail } from '../../../src/data/orderQueries';
import { TrayBar } from '../../../src/order/TrayBar';
import { useTray } from '../../../src/order/TrayProvider';
import { orderingBlock, orderingBlockKey } from '../../../src/tab/ordering';
import {
  colors,
  fontWeight,
  layout,
  radius,
  space,
  tabularNumbers,
  typography,
} from '../../../src/theme';

/** A photo this phone can load: the gateway resolves the server's relative paths. */
function loadablePhoto(url: string): string | null {
  return /^https?:\/\//i.test(url) ? url : null;
}

/**
 * The menu, and the way an order is built.
 *
 * Readable by anyone at the table, including a pending joiner and a guest whose
 * host has hidden the total. **Prices are always visible to everyone.** That
 * distinction is the feature: what a host can hide is the table's total and
 * other people's items, never what your own coffee costs.
 *
 * Tapping an item adds it to a tray. It does not send anything — see
 * `src/order/tray.ts` for why one order beats five tickets. **Add is offered only
 * to someone the server says can order now** (`me.canOrderNow`); anyone else
 * reads the menu with the reason they cannot order said once, above it.
 */
export default function MenuScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const { tabId } = useLocalSearchParams<{ tabId: string }>();

  const { data: tab } = useDinerTab(tabId);
  const {
    data: menu,
    isLoading,
    isError,
    error,
    refetch,
    isPaused,
    isSuccess,
  } = useMenuDetail(tab?.branchId);
  const { dispatch } = useTray();
  // Until the tab has been read nobody is offered Add: the answer is not known.
  const block = tab ? orderingBlock(tab) : null;
  const canAdd = Boolean(tab) && block === null;

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
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>{t('menu.loading')}</Text>
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>
            {isOffline(error) ? t('menu.offlineNoCache') : t('menu.error')}
          </Text>
          <Button label={t('common.retry')} onPress={() => void refetch()} fullWidth={false} />
        </View>
      ) : isSuccess && menu === null ? (
        // The branch has no published menu: the server's 404, said as such.
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>{t('menu.emptyTitle')}</Text>
          <Text style={styles.muted}>{t('menu.emptyBody')}</Text>
        </View>
      ) : (
        <>
          {/* Sticky category strip. Search is below it and half the width: a
              diner who has to type has been failed by the categories. */}
          <View style={styles.strip}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.stripRow}
            >
              {categories.map((category) => {
                const active = category.id === activeCategory && search === '';
                return (
                  <Chip
                    key={category.id}
                    label={category.name}
                    selected={active}
                    accessibilityRole="tab"
                    onPress={() => {
                      setSearch('');
                      setCategoryId(category.id);
                    }}
                  />
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
              placeholderTextColor={colors.textSubtle}
              accessibilityLabel={t('menu.search')}
            />
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {block ? <Text style={styles.blocked}>{t(orderingBlockKey(block))}</Text> : null}
            {items.length === 0 ? (
              <Text style={styles.muted}>{t('menu.noMatches')}</Text>
            ) : (
              items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  locale={locale}
                  expanded={openItemId === item.id}
                  canAdd={canAdd}
                  onToggle={() => setOpenItemId(openItemId === item.id ? null : item.id)}
                  onAdd={() => dispatch({ type: 'add', item, atMs: Date.now() })}
                />
              ))
            )}
          </ScrollView>

          {/*
            The tray bar. It renders three states and only one of them is a
            tray — see `TrayBar`, which exists because this used to be a single
            filled pill reading "Review" and a diner could read that as an order
            that had been placed.
          */}
          {tab ? (
            <View style={styles.barSlot}>
              <TrayBar
                tabId={tab.tabId}
                // The branch's own zone, from the tab. Never the device's: a
                // tourist's phone on Moscow time would put it three hours out.
                timeZoneId={tab.timeZoneId}
                onReview={() => router.push({ pathname: '/tab/[tabId]/tray', params: { tabId } })}
                onSeeBill={() => router.push({ pathname: '/tab/[tabId]', params: { tabId } })}
              />
            </View>
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}

interface ItemCardProps {
  readonly item: MenuItemDetail;
  readonly locale: Parameters<typeof formatDram>[1];
  readonly expanded: boolean;
  /** False for anyone the server says cannot order now. The menu stays readable. */
  readonly canAdd: boolean;
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
function ItemCard({ item, locale, expanded, canAdd, onToggle, onAdd }: ItemCardProps) {
  const { t } = useTranslation('diner');
  const photo = loadablePhoto(item.photo.cardUrl);

  return (
    <Card padded={false} style={!item.isAvailable && styles.cardOut}>
      {/* The card-size variant: what a diner looks at, never the full one. */}
      {photo ? <PhotoImage source={photo} style={styles.photo} /> : null}
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
        canAdd ? (
          <Button label={t('menu.add')} onPress={onAdd} style={styles.add} />
        ) : null
      ) : (
        <View style={styles.outBadge}>
          <Text style={styles.outText}>{t('menu.unavailable')}</Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  body: { padding: space.lg, gap: space.md, paddingBottom: space.xxxl },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },
  muted: { ...typography.bodyLg, color: colors.textMuted, textAlign: 'center' },
  emptyTitle: { ...typography.h3, color: colors.text },
  blocked: {
    padding: space.md,
    borderRadius: radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    ...typography.body,
    color: colors.text,
  },
  photo: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
  },

  strip: {
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  stripRow: { gap: space.sm, paddingHorizontal: space.lg },

  searchRow: { paddingHorizontal: space.lg, paddingTop: space.sm },
  search: {
    minHeight: layout.controlHeight,
    maxWidth: 280,
    paddingHorizontal: space.lg,
    borderRadius: radius.search,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...typography.body,
    color: colors.text,
  },

  cardOut: { opacity: 0.7 },
  cardMain: { padding: space.lg, gap: space.xs },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  itemName: { flex: 1, ...typography.h3, fontWeight: fontWeight.medium, color: colors.text },
  itemPrice: { ...typography.h3, color: colors.text, ...tabularNumbers },
  itemDesc: { ...typography.body, color: colors.textMuted },
  itemMeta: { ...typography.caption, color: colors.textMuted },
  detail: { gap: space.xs, paddingTop: space.sm },
  detailLine: { ...typography.body, color: colors.text },
  detailLabel: { fontWeight: fontWeight.bold },

  add: { marginHorizontal: space.lg, marginBottom: space.lg },
  outBadge: {
    minHeight: layout.touchTarget - 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
  },
  outText: { ...typography.body, fontWeight: fontWeight.medium, color: colors.textMuted },

  /**
   * The bar sits above the safe area with its own padding rather than being
   * edge-to-edge. The old full-bleed bar read as a system affordance — part of
   * the app chrome — which is half of why "Review" on it looked like a
   * confirmation rather than a step.
   */
  barSlot: { padding: space.md, paddingTop: 0 },
});
