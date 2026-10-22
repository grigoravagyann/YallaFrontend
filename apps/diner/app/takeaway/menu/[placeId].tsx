import { isOffline, isTakeawayable } from '@yalla/api';
import { formatDram } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../../src/components/Button';
import { Chip } from '../../../src/components/Chip';
import { IconButton } from '../../../src/components/IconButton';
import { MenuItemRow } from '../../../src/components/menu/MenuItemRow';
import { BookCta, CtaFooter } from '../../../src/components/place/BookCta';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { useMenuDetail } from '../../../src/data/orderQueries';
import { usePlace } from '../../../src/places/hooks';
import { formatClock } from '../../../src/places/model';
import {
  cartCount,
  cartFor,
  cartTotal,
  quantityOf,
  useTakeawayCart,
} from '../../../src/takeaway/cart';
import { useTakeawayAvailability } from '../../../src/takeaway/queries';
import { actionIcon, colors, layout, radius, space, typography } from '../../../src/theme';

/** The "All" chip's key: every category at once. */
const ALL = '__all__';

/**
 * The takeaway menu (2026-10-22): the place's menu in takeaway mode.
 *
 * The same dish rows as the table's menu, adding to the takeaway cart —
 * never to a table's tray. A dish the venue keeps for the hall is shown,
 * greyed, with "Only in the hall · not for takeaway", and offers no +; a
 * sold-out one says so. The bar at the bottom carries the count and the total
 * on to the checkout.
 */
export default function TakeawayMenuScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { placeId } = useLocalSearchParams<{ placeId: string }>();

  const { data: place } = usePlace(placeId);
  const {
    data: menu,
    isLoading,
    isError,
    error,
    refetch,
    isPaused,
    isSuccess,
  } = useMenuDetail(placeId);
  const { data: availability } = useTakeawayAvailability(placeId);

  const stored = useTakeawayCart((state) => state.cart);
  const add = useTakeawayCart((state) => state.add);
  const remove = useTakeawayCart((state) => state.remove);
  const cart = cartFor(stored, placeId);
  const count = cartCount(cart);
  const total = cartTotal(cart);

  const [categoryId, setCategoryId] = useState<string>(ALL);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const categories = useMemo(() => menu?.categories ?? [], [menu]);
  const items = useMemo(
    () =>
      categoryId === ALL
        ? categories.flatMap((category) => category.items)
        : (categories.find((category) => category.id === categoryId)?.items ?? []),
    [categories, categoryId],
  );

  // Signed in, the availability says whether orders are taken now; closed,
  // the menu stays readable and the bar does not go on.
  const closed = availability ? !availability.open || !availability.enabled : false;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else if (placeId) router.replace({ pathname: '/place/[placeId]', params: { placeId } });
  };

  const goOn = () => {
    if (!placeId || count === 0 || closed) return;
    router.push({ pathname: '/takeaway/checkout/[placeId]', params: { placeId } });
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <IconButton
          icon={actionIcon.back}
          onPress={goBack}
          accessibilityLabel={t('floorPlan.back')}
          variant="surface"
        />
        <View style={styles.headerText}>
          <Text display style={styles.title} accessibilityRole="header">
            {t('takeaway.menu.title')}
          </Text>
          {place ? (
            <Text numberOfLines={1} style={styles.where}>
              {t('takeaway.menu.subtitle', { place: place.name })}
            </Text>
          ) : null}
        </View>
      </View>

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
      ) : isSuccess && !menu ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>{t('menu.emptyTitle')}</Text>
          <Text style={styles.muted}>{t('menu.emptyBody')}</Text>
        </View>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.strip}
            contentContainerStyle={styles.stripRow}
          >
            {[{ id: ALL, name: t('takeaway.menu.all') }, ...categories].map((category) => (
              <Chip
                key={category.id}
                label={category.name}
                selected={category.id === categoryId}
                accessibilityRole="tab"
                onPress={() => setCategoryId(category.id)}
              />
            ))}
          </ScrollView>

          <ScrollView
            contentContainerStyle={[
              styles.body,
              { paddingBottom: FOOTER_CLEARANCE + insets.bottom },
            ]}
          >
            {closed ? (
              <Text style={styles.notice} accessibilityRole="alert">
                {availability?.opensAt
                  ? t('takeaway.menu.closedFrom', {
                      time: formatClock(availability.opensAt, locale),
                    })
                  : t('takeaway.menu.closed')}
              </Text>
            ) : null}
            {items.length === 0 ? (
              <Text style={styles.muted}>{t('menu.noMatches')}</Text>
            ) : (
              items.map((item) => (
                <MenuItemRow
                  key={item.id}
                  item={item}
                  quantity={quantityOf(cart, item.id)}
                  locale={locale}
                  expanded={openItemId === item.id}
                  canAdd={!closed}
                  frozen={false}
                  notOffered={
                    item.isAvailable && !isTakeawayable(item)
                      ? t('takeaway.menu.hallOnly')
                      : undefined
                  }
                  onToggle={() => setOpenItemId(openItemId === item.id ? null : item.id)}
                  onAdd={() => placeId && add(placeId, item)}
                  onRemove={() => remove(item.id)}
                />
              ))
            )}
          </ScrollView>

          <View style={styles.footerSlot} pointerEvents="box-none">
            <CtaFooter bottomInset={insets.bottom}>
              <BookCta
                label={count > 0 ? t('takeaway.menu.continue') : t('takeaway.menu.choose')}
                {...(count > 0
                  ? {
                      caption: t('takeaway.menu.summary', {
                        count,
                        total: formatDram(total, locale),
                      }),
                    }
                  : {})}
                disabled={count === 0 || closed}
                onPress={goOn}
              />
            </CtaFooter>
          </View>
        </>
      )}
    </Screen>
  );
}

/** Room under the list for the footer's pill and its fade. */
const FOOTER_CLEARANCE = 120;

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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },
  muted: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  emptyTitle: { ...typography.h3, color: colors.text },
  notice: {
    padding: space.md,
    borderRadius: radius.tile,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.logoInk,
    ...typography.body,
    color: colors.text,
  },
  strip: { flexGrow: 0, flexShrink: 0 },
  stripRow: { gap: space.sm, paddingHorizontal: layout.screenPadding, paddingVertical: space.xs },
  body: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm, gap: space.sm },
  footerSlot: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
