import { Ionicons } from '@expo/vector-icons';
import type { MenuItemDetail } from '@yalla/api';
import { isOffline } from '@yalla/api';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../../src/components/Button';
import { Chip } from '../../../src/components/Chip';
import { IconButton } from '../../../src/components/IconButton';
import { MenuItemRow } from '../../../src/components/menu/MenuItemRow';
import { Screen } from '../../../src/components/Screen';
import { Text, TextInput } from '../../../src/components/Text';
import { useDinerTab, useMenuDetail } from '../../../src/data/orderQueries';
import { TRAY_BAR_CLEARANCE, TrayBar } from '../../../src/order/TrayBar';
import { useTray } from '../../../src/order/TrayProvider';
import { trayLocked } from '../../../src/order/tray';
import { returnToTab } from '../../../src/tab/navigation';
import { orderingBlock, orderingBlockKey } from '../../../src/tab/ordering';
import {
  actionIcon,
  colors,
  iconSize,
  layout,
  radius,
  space,
  typography,
} from '../../../src/theme';

/**
 * The menu, and the way an order is built.
 *
 * Readable by anyone at the table, including a pending joiner and a guest whose
 * host has hidden the total. **Prices are always visible to everyone.** That
 * distinction is the feature: what a host can hide is the table's total and
 * other people's items, never what your own coffee costs.
 *
 * Tapping + adds a dish to a tray, and the + becomes a stepper on that row. It
 * does not send anything — see `src/order/tray.ts` for why one order beats five
 * tickets. **Add is offered only to someone the server says can order now**
 * (`me.canOrderNow`); anyone else reads the menu with the reason they cannot
 * order said once, above it.
 */
export default function MenuScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const { tabId } = useLocalSearchParams<{ tabId: string }>();
  const insets = useSafeAreaInsets();

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
  const { state: tray, dispatch } = useTray();
  // Until the tab has been read nobody is offered Add: the answer is not known.
  const block = tab ? orderingBlock(tab) : null;
  const canAdd = Boolean(tab) && block === null;
  // After a send whose outcome is unknown the tray is frozen until it is checked.
  const frozen = trayLocked(tray);

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

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else if (tabId) returnToTab(router, tabId);
  };

  /** One fewer: off the plain line first, so a line with a note is the last to go. */
  const removeOne = (item: MenuItemDetail) => {
    const lines = tray.lines.filter((line) => line.item.id === item.id);
    const target =
      lines.find((line) => line.note === '' && !line.isShared) ?? lines[lines.length - 1];
    if (target) dispatch({ type: 'decrement', key: target.key });
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <IconButton
          icon={actionIcon.back}
          onPress={goBack}
          accessibilityLabel={t('floorPlan.back')}
        />
        <View style={styles.headerText}>
          <Text display style={styles.title} accessibilityRole="header">
            {t('menu.title')}
          </Text>
          {tab ? (
            <Text numberOfLines={1} style={styles.where}>
              {`${tab.venueName} · ${t('tab.title', { label: tab.tableLabel })}`}
            </Text>
          ) : null}
        </View>
      </View>

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
          {/* Sticky category strip. Search is under it: a diner who has to
              type has been failed by the categories. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.strip}
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

          <View style={styles.searchRow}>
            <View style={styles.search}>
              <Ionicons name={actionIcon.search} size={iconSize.sm} color={colors.textSubtle} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder={t('menu.search')}
                accessibilityLabel={t('menu.search')}
              />
            </View>
          </View>

          <ScrollView
            contentContainerStyle={[
              styles.body,
              { paddingBottom: TRAY_BAR_CLEARANCE + insets.bottom },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {block ? <Text style={styles.blocked}>{t(orderingBlockKey(block))}</Text> : null}
            {items.length === 0 ? (
              <Text style={styles.muted}>{t('menu.noMatches')}</Text>
            ) : (
              items.map((item) => (
                <MenuItemRow
                  key={item.id}
                  item={item}
                  quantity={tray.lines
                    .filter((line) => line.item.id === item.id)
                    .reduce((sum, line) => sum + line.quantity, 0)}
                  locale={locale}
                  expanded={openItemId === item.id}
                  canAdd={canAdd}
                  frozen={frozen}
                  onToggle={() => setOpenItemId(openItemId === item.id ? null : item.id)}
                  // A second tap on the same dish bumps its plain line.
                  onAdd={() => dispatch({ type: 'add', item, atMs: Date.now() })}
                  onRemove={() => removeOne(item)}
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
            <View style={styles.barSlot} pointerEvents="box-none">
              <TrayBar
                tabId={tab.tabId}
                // The branch's own zone, from the tab. Never the device's: a
                // tourist's phone on Moscow time would put it three hours out.
                timeZoneId={tab.timeZoneId}
                canOrder={canAdd}
                onReview={() => router.push({ pathname: '/tab/[tabId]/tray', params: { tabId } })}
                onSeeBill={() => returnToTab(router, tabId)}
              />
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 20, lineHeight: 26, color: colors.text },
  where: { ...typography.caption, color: colors.textMuted },

  body: { paddingHorizontal: layout.screenPadding, paddingTop: space.xs, gap: space.sm },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },
  muted: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  emptyTitle: { ...typography.h3, color: colors.text },
  blocked: {
    padding: space.md,
    borderRadius: radius.tile,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.body,
    color: colors.text,
  },

  strip: { flexGrow: 0, flexShrink: 0 },
  stripRow: { gap: space.sm, paddingHorizontal: layout.screenPadding, paddingVertical: space.xs },

  searchRow: { paddingHorizontal: layout.screenPadding, paddingVertical: space.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: layout.touchTarget,
    paddingHorizontal: space.lg,
    borderRadius: radius.search,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    minHeight: layout.touchTarget,
    ...typography.body,
    color: colors.text,
  },

  /** Over the bottom of the list: the bar draws its own fade into the ground. */
  barSlot: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
