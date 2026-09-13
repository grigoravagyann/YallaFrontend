import { YEREVAN, formatDram, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Badge } from '../../src/components/Badge';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { ConfirmSheet } from '../../src/components/ConfirmSheet';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { IconButton } from '../../src/components/IconButton';
import { useOrderWhen, useOrderWhere } from '../../src/components/orders/OrderCard';
import { PhotoImage } from '../../src/components/PhotoImage';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
import { Skeleton } from '../../src/components/Skeleton';
import { Text } from '../../src/components/Text';
import { useNow } from '../../src/hooks/useNow';
import { useCancelOrder, useOrder } from '../../src/orders/hooks';
import { canCancelOrder, type Order, type OrderStatus } from '../../src/orders/model';
import { usePlace } from '../../src/places/hooks';
import {
  actionIcon,
  colors,
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  tabularNumbers,
  typography,
} from '../../src/theme';

const THUMB = 64;
const DOT = 12;

const STATUS_COLOR: Readonly<Record<OrderStatus, string>> = {
  confirmed: colors.success,
  preparing: colors.warning,
  inProgress: colors.warning,
  ready: colors.success,
  completed: colors.neutralBadge,
  cancelled: colors.error,
};

/**
 * One order: where it was placed, what is on it, what it cost, and the path
 * its status has taken. Cancel is offered only while the kitchen has not
 * started — what the repository accepts — and asks first.
 */
export default function OrderDetailScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const orderQuery = useOrder(orderId);
  const { data: order, isLoading, isError, refetch } = orderQuery;
  const cancel = useCancelOrder();
  const [confirming, setConfirming] = useState(false);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/orders');
  };

  const header = (
    <View style={styles.header}>
      <IconButton
        icon={actionIcon.back}
        onPress={goBack}
        accessibilityLabel={t('floorPlan.back')}
        variant="ghost"
      />
      <Text numberOfLines={1} style={styles.headerTitle} accessibilityRole="header">
        {t('orders.detail.title')}
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  if (!order) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        {header}
        {isLoading ? (
          <DetailSkeleton />
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : (
          <EmptyState
            icon={actionIcon.error}
            title={t('orders.notFound.title')}
            body={t('orders.notFound.body')}
            action={{ label: t('orders.title'), onPress: () => router.replace('/(tabs)/orders') }}
          />
        )}
      </Screen>
    );
  }

  const doCancel = () => {
    cancel.mutate(order.id, { onSuccess: () => setConfirming(false) });
  };

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      {header}
      <ScrollView contentContainerStyle={styles.body}>
        <PlaceSummary order={order} />

        <Card>
          <SectionHeader label={t('orders.detail.items')} />
          <View style={styles.items}>
            {order.items.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('orders.detail.total')}</Text>
            <Total amount={order.totalDram} />
          </View>
        </Card>

        <Card>
          <SectionHeader label={t('orders.detail.timeline')} />
          <Timeline order={order} />
        </Card>

        {canCancelOrder(order) ? (
          <Button
            label={t('orders.cancel')}
            variant="outline"
            onPress={() => {
              cancel.reset();
              setConfirming(true);
            }}
          />
        ) : null}
      </ScrollView>

      <ConfirmSheet
        visible={confirming}
        title={t('orders.cancelTitle')}
        body={t('orders.cancelBody')}
        confirmLabel={t('bookings.detail.cancelConfirm')}
        cancelLabel={t('bookings.detail.cancelKeep')}
        busyLabel={t('bookings.detail.cancelling')}
        busy={cancel.isPending}
        error={cancel.isError ? t('orders.cancelFailed') : null}
        destructive
        onConfirm={doCancel}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  );
}

/**
 * The place the order was made at, as the summary card at the top: thumb,
 * name, table and party (or Takeaway), when, and the status pill.
 */
function PlaceSummary({ order }: { readonly order: Order }) {
  const now = useNow();
  const where = useOrderWhere(order);
  const when = useOrderWhen(order, now);
  return (
    <Card>
      <View style={styles.summary}>
        <PhotoImage
          source={order.placePhoto}
          style={styles.thumb}
          accessibilityLabel={order.placeName}
        />
        <View style={styles.summaryBody}>
          <Text display numberOfLines={2} style={styles.placeName}>
            {order.placeName}
          </Text>
          <Text numberOfLines={1} style={styles.detail}>
            {where}
          </Text>
          <Text numberOfLines={1} style={styles.detail}>
            {when}
          </Text>
        </View>
      </View>
      <View style={styles.summaryFooter}>
        <Badge variant={order.status} tone="soft" />
        <Text style={styles.orderId}>#{order.id}</Text>
      </View>
    </Card>
  );
}

function ItemRow({ item }: { readonly item: Order['items'][number] }) {
  const { locale } = useLocale();
  return (
    <View style={styles.item}>
      <Text style={styles.quantity}>{item.quantity}×</Text>
      <View style={styles.itemBody}>
        <Text style={styles.itemName}>{item.name}</Text>
        {item.note ? <Text style={styles.itemNote}>{item.note}</Text> : null}
      </View>
      <Text style={styles.price}>{formatDram(item.quantity * item.unitPriceDram, locale)}</Text>
    </View>
  );
}

function Total({ amount }: { readonly amount: number }) {
  const { locale } = useLocale();
  return <Text style={styles.totalValue}>{formatDram(amount, locale)}</Text>;
}

/**
 * Every status the order has passed through, oldest first, the current one
 * last and drawn in its own colour; the earlier ones brown, joined by a line.
 */
function Timeline({ order }: { readonly order: Order }) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const { data: place } = usePlace(order.placeId);
  const zone = place?.timeZoneId ?? YEREVAN;
  const last = order.timeline.length - 1;
  return (
    <View style={styles.timeline}>
      {order.timeline.map((entry, index) => {
        const current = index === last;
        return (
          <View key={`${entry.status}-${entry.at}`} style={styles.step}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.dot,
                  current ? { backgroundColor: STATUS_COLOR[entry.status] } : styles.dotPast,
                ]}
              >
                {current ? null : (
                  <Ionicons name="checkmark" size={iconSize.sm - 6} color={colors.onPrimary} />
                )}
              </View>
              {current ? null : <View style={styles.line} />}
            </View>
            <View style={styles.stepBody}>
              <Text style={[styles.stepLabel, current && styles.stepLabelCurrent]}>
                {t(`orders.status.${entry.status}`)}
              </Text>
              <Text style={styles.stepTime}>{formatTime(entry.at, zone, locale)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function DetailSkeleton() {
  return (
    <View style={styles.body}>
      <Card>
        <View style={styles.summary}>
          <Skeleton width={THUMB} height={THUMB} borderRadius={radius.chip} />
          <View style={[styles.summaryBody, styles.skeletonGap]}>
            <Skeleton width="70%" height={22} />
            <Skeleton width="45%" height={14} />
            <Skeleton width="35%" height={14} />
          </View>
        </View>
      </Card>
      <Card>
        <View style={styles.skeletonGap}>
          <Skeleton width="30%" height={18} />
          <Skeleton height={16} />
          <Skeleton height={16} />
          <Skeleton height={16} />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: { width: layout.touchTarget },
  body: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.xxl,
    gap: layout.cardGap,
  },
  summary: { flexDirection: 'row', gap: space.md },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.chip },
  summaryBody: { flex: 1, gap: 2 },
  placeName: { ...typography.heading, color: colors.text },
  detail: { ...typography.body, color: colors.textMuted },
  summaryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.md,
  },
  orderId: { ...typography.caption, ...tabularNumbers, color: colors.textSubtle },
  items: { marginTop: space.md, gap: space.md },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  quantity: {
    ...typography.body,
    ...tabularNumbers,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    minWidth: 28,
  },
  itemBody: { flex: 1, gap: 2 },
  itemName: { ...typography.body, color: colors.text },
  itemNote: { ...typography.caption, color: colors.textMuted },
  price: { ...typography.body, ...tabularNumbers, color: colors.text },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  totalLabel: { ...typography.bodyLg, fontWeight: fontWeight.bold, color: colors.text },
  totalValue: {
    ...typography.h3,
    ...tabularNumbers,
    color: colors.text,
  },
  timeline: { marginTop: space.md },
  step: { flexDirection: 'row', gap: space.md },
  rail: { width: DOT + 8, alignItems: 'center' },
  dot: {
    width: DOT + 8,
    height: DOT + 8,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotPast: { backgroundColor: colors.primary },
  line: { flex: 1, width: 2, minHeight: space.lg, backgroundColor: colors.border },
  stepBody: { flex: 1, paddingBottom: space.lg, paddingTop: 1 },
  stepLabel: { ...typography.body, fontWeight: fontWeight.medium, color: colors.textMuted },
  stepLabelCurrent: { color: colors.text, fontWeight: fontWeight.bold },
  stepTime: { ...typography.caption, ...tabularNumbers, color: colors.textSubtle },
  skeletonGap: { gap: space.sm },
});
