import { UnauthorizedError } from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { OrderCard, OrderCardSkeleton } from '../../src/components/orders/OrderCard';
import { Screen, useNavClearance } from '../../src/components/Screen';
import { SegmentedControl } from '../../src/components/SegmentedControl';
import { Text } from '../../src/components/Text';
import { useNow } from '../../src/hooks/useNow';
import { useOrders } from '../../src/orders/hooks';
import { splitOrders, type Order } from '../../src/orders/model';
import { useSession } from '../../src/stores/session';
import { colors, layout, navIcons, space, typography } from '../../src/theme';

type Segment = 'active' | 'history';

/** How many cream cards stand in for the list while it loads. */
const SKELETON_ROWS = [0, 1, 2] as const;

/**
 * The backend has no order endpoints yet: the HTTP repository says so with this
 * error, and the screen says "not available yet" rather than "something broke".
 */
function isNotImplemented(error: unknown): boolean {
  return error instanceof Error && error.name === 'OrderApiNotImplementedError';
}

/**
 * Orders — what the diner has ordered, the live ones first.
 *
 * Two segments. Active is anything the kitchen still owes (confirmed,
 * preparing, in progress, ready) placed in the last day; History is the rest.
 */
export default function OrdersScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const paddingBottom = useNavClearance();
  const [segment, setSegment] = useState<Segment>('active');
  const now = useNow();
  const signedIn = useSession((s) => s.signedIn);

  const ordersQuery = useOrders();
  const { data, isLoading, isError, error, refetch, isRefetching } = ordersQuery;
  const offline = isOfflinePaused(ordersQuery) && !data;

  const split = useMemo(() => splitOrders(data ?? [], now), [data, now]);
  const list: readonly Order[] = segment === 'active' ? split.active : split.history;

  const openDetail = (order: Order) =>
    router.push({ pathname: '/order/[orderId]', params: { orderId: order.id } });

  const header = (
    <View style={styles.header}>
      <Text display style={styles.title} accessibilityRole="header">
        {t('orders.title')}
      </Text>
      <SegmentedControl<Segment>
        options={[
          { value: 'active', label: t('orders.active') },
          { value: 'history', label: t('orders.history') },
        ]}
        value={segment}
        onChange={setSegment}
        accessibilityLabel={t('orders.title')}
      />
    </View>
  );

  // Orders are kept on the account. With no session, or one the server no
  // longer takes, the way on is signing in — not an empty tab that reads as if
  // the order had been lost.
  if (!signedIn || error instanceof UnauthorizedError) {
    return (
      <Screen>
        {header}
        <EmptyState
          icon="receipt-outline"
          title={t('orders.signedOut.title')}
          body={t('orders.signedOut.body')}
          action={{ label: t('orders.signedOut.action'), onPress: () => router.push('/auth') }}
        />
      </Screen>
    );
  }

  if (isLoading && !offline) {
    return (
      <Screen>
        {header}
        <View style={[styles.list, { paddingBottom }]}>
          {SKELETON_ROWS.map((row) => (
            <OrderCardSkeleton key={row} style={styles.card} />
          ))}
        </View>
      </Screen>
    );
  }

  if ((isError && !data) || offline) {
    return (
      <Screen>
        {header}
        {isNotImplemented(error) ? (
          <ErrorState
            title={t('net.notAvailable')}
            body={t('net.notAvailableBody')}
            onRetry={() => void refetch()}
          />
        ) : (
          <ErrorState offline={offline} onRetry={() => void refetch()} />
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      <FlatList
        data={list}
        keyExtractor={(order) => order.id}
        contentContainerStyle={[styles.list, { paddingBottom }]}
        refreshing={isRefetching}
        onRefresh={() => void refetch()}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            now={now}
            style={styles.card}
            onViewDetails={() => openDetail(item)}
            // Cancelling asks for a confirmation, which lives on the detail
            // screen; the card takes the diner there rather than cancelling
            // on a single tap in a list.
            onCancel={() => openDetail(item)}
            onTrack={() => openDetail(item)}
          />
        )}
        ListEmptyComponent={
          segment === 'active' ? (
            <EmptyState
              icon={navIcons.orders.outline}
              title={t('orders.empty.active.title')}
              body={t('orders.empty.active.body')}
              action={{ label: t('scan.tabTitle'), onPress: () => router.push('/(tabs)/scan') }}
            />
          ) : (
            <EmptyState
              icon="receipt-outline"
              title={t('orders.empty.history.title')}
              body={t('orders.empty.history.body')}
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.lg,
    paddingBottom: space.md,
    gap: space.lg,
  },
  title: { ...typography.title, color: colors.text },
  list: { paddingHorizontal: layout.screenPadding, paddingTop: space.xs },
  card: { marginBottom: layout.cardGap },
});
