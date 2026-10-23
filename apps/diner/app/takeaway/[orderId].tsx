import { Ionicons } from '@expo/vector-icons';
import { UnauthorizedError, type TakeawayOrder } from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { YEREVAN, formatDram, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../src/components/Button';
import { EmptyState } from '../../src/components/EmptyState';
import { IconButton } from '../../src/components/IconButton';
import { InlineConfirm } from '../../src/components/InlineConfirm';
import { BookCta, CtaFooter } from '../../src/components/place/BookCta';
import { directionsUrl, openUrl } from '../../src/components/place/PlaceActions';
import { QueryErrorState } from '../../src/components/QueryErrorState';
import { Screen } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { Text } from '../../src/components/Text';
import { useMenuDetail } from '../../src/data/orderQueries';
import { MessagesCard } from '../../src/messages/MessagesCard';
import { usePlace } from '../../src/places/hooks';
import { formatClock } from '../../src/places/model';
import { useSession } from '../../src/stores/session';
import { cartFromOrder, useTakeawayCart } from '../../src/takeaway/cart';
import { cancelFailureLine, takeawayFailure } from '../../src/takeaway/failure';
import { useCancelTakeawayOrder, useTakeawayOrder } from '../../src/takeaway/queries';
import {
  readyLine,
  showsCode,
  statusCase,
  takeawaySteps,
  type StepView,
} from '../../src/takeaway/status';
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

/**
 * One takeaway order (2026-10-22): where it stands, the code to say at the
 * counter, the steps with their times, what is in it and what it costs —
 * paid at pickup — and the way to the venue.
 *
 * Read again while it moves (every ten seconds while the venue has not
 * answered, every twenty after; in the foreground only), and at once on a
 * push. Cancel is offered only while it is sent, and asks first; after that
 * it is a phone call. A declined order says why — sorry, when nobody answered
 * — and offers the same dishes for another time.
 */
export default function TakeawayStatusScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const signedIn = useSession((s) => s.signedIn);
  const orderQuery = useTakeawayOrder(orderId);
  const { data: order, isLoading, isError, error, refetch } = orderQuery;

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/orders');
  };

  if (!order) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <Header title={null} onClose={close} />
        {!signedIn || error instanceof UnauthorizedError ? (
          <EmptyState
            icon="receipt-outline"
            title={t('orders.signedOut.title')}
            body={t('orders.signedOut.body')}
            action={{ label: t('orders.signedOut.action'), onPress: () => router.push('/auth') }}
          />
        ) : isOfflinePaused(orderQuery) ? (
          <QueryErrorState offline onRetry={() => void refetch()} />
        ) : isLoading ? (
          <StatusSkeleton />
        ) : isError ? (
          <QueryErrorState error={error} onRetry={() => void refetch()} />
        ) : (
          <EmptyState
            icon={actionIcon.error}
            title={t('takeaway.status.notFound.title')}
            body={t('takeaway.status.notFound.body')}
            action={{
              label: t('takeaway.status.orders'),
              onPress: () => router.replace('/(tabs)/orders'),
            }}
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <Header title={t('takeaway.status.header', { place: order.venueName })} onClose={close} />
      <StatusBody order={order} onRefresh={() => refetch()} />
    </Screen>
  );
}

function Header({
  title,
  onClose,
}: {
  readonly title: string | null;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('diner');
  return (
    <View style={styles.header}>
      <IconButton
        icon={actionIcon.close}
        onPress={onClose}
        accessibilityLabel={t('takeaway.status.close')}
        variant="surface"
      />
      {title ? (
        <Text numberOfLines={1} style={styles.headerTitle}>
          {title}
        </Text>
      ) : null}
    </View>
  );
}

function StatusBody({
  order,
  onRefresh,
}: {
  readonly order: TakeawayOrder;
  readonly onRefresh: () => Promise<unknown>;
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: place } = usePlace(order.branchId);
  const zone = place?.timeZoneId ?? YEREVAN;
  const cancel = useCancelTakeawayOrder();
  const [confirming, setConfirming] = useState(false);
  const [pulling, setPulling] = useState(false);
  const restore = useTakeawayCart((state) => state.restore);

  const which = statusCase(order);
  const declined = order.status === 'declined';
  // The menu only for "Choose another time": the same dishes, at today's menu.
  const { data: menu } = useMenuDetail(declined ? order.branchId : undefined);
  const steps = takeawaySteps(order);
  const ready = readyLine(order);
  const canCancel = order.canCancel && order.status === 'sent';
  const confirmOpen = confirming && canCancel;
  const cancelError = cancel.isError ? cancelFailureLine(takeawayFailure(cancel.error)) : null;
  const time = (utc: string) => formatTime(utc, zone, locale);

  const doCancel = () => cancel.mutate(order.id, { onSuccess: () => setConfirming(false) });

  const tryAgain = () => {
    const items = menu?.categories.flatMap((category) => category.items) ?? [];
    const cart = cartFromOrder(order.branchId, items, order.lines);
    if (cart.lines.length > 0) {
      restore(cart);
      router.push({
        pathname: '/takeaway/checkout/[placeId]',
        params: { placeId: order.branchId },
      });
    } else {
      router.push({ pathname: '/takeaway/menu/[placeId]', params: { placeId: order.branchId } });
    }
  };

  const cta = declined
    ? { label: t('takeaway.status.chooseAnotherTime'), onPress: tryAgain }
    : order.status === 'collected'
      ? {
          label: t('takeaway.status.rate'),
          onPress: () =>
            router.push({
              pathname: '/place/[placeId]',
              params: { placeId: order.branchId, section: 'reviews' },
            }),
        }
      : {
          label: t('takeaway.status.orders'),
          onPress: () => router.replace('/(tabs)/orders'),
        };

  const payLabel =
    order.status === 'collected'
      ? t('takeaway.status.paid')
      : order.status === 'sent' || order.status === 'accepted' || order.status === 'ready'
        ? t('takeaway.status.payAtPickup')
        : t('takeaway.status.total');

  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: FOOTER_CLEARANCE + insets.bottom }]}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            tintColor={colors.primary}
            onRefresh={() => {
              setPulling(true);
              void onRefresh().finally(() => setPulling(false));
            }}
          />
        }
      >
        <View style={styles.intro} accessibilityLiveRegion="polite">
          <Text display style={styles.title} accessibilityRole="header">
            {t(`takeaway.status.case.${which}.title`)}
          </Text>
          <Text style={styles.lead}>
            {t(`takeaway.status.case.${which}.body`, { place: order.venueName })}
          </Text>
          {declined && order.declineReason ? (
            <Text style={styles.lead}>
              {t('takeaway.status.reason', { reason: order.declineReason })}
            </Text>
          ) : null}
        </View>

        {showsCode(order.status) ? (
          <View
            style={[
              styles.codeCard,
              order.status === 'sent' && styles.codeSent,
              order.status === 'ready' && styles.codeReady,
            ]}
          >
            <Text style={styles.codeLabel}>{t('takeaway.status.codeLabel')}</Text>
            <Text display style={styles.code} accessibilityLabel={order.code.split('').join(' ')}>
              {order.code}
            </Text>
            {ready ? (
              <Text style={styles.readyLine}>
                {t(ready.key, { time: formatClock(ready.time, locale) })}
              </Text>
            ) : null}
          </View>
        ) : null}

        {steps.length > 0 ? (
          <View accessibilityRole="list" accessibilityLabel={t('takeaway.status.stepsLabel')}>
            {steps.map((step, index) => (
              <Step key={step.step} step={step} index={index} time={time} />
            ))}
          </View>
        ) : null}

        {/* "Messages with the venue" (2026-10-23): "no onions?", "we're out of
            tan — ayran instead?". Nothing for an order with no thread that can
            no longer have one. */}
        <MessagesCard subject={{ kind: 'takeaway', id: order.id }} />

        <View style={styles.lines}>
          {order.lines.map((line) => (
            <View key={line.id} style={styles.line}>
              <Text style={styles.lineName}>
                {t('takeaway.checkout.line', { count: line.quantity, name: line.name })}
              </Text>
              <Text style={styles.lineAmount}>{formatDram(line.lineTotalDram, locale)}</Text>
            </View>
          ))}
          <View style={[styles.line, styles.totalLine]}>
            <Text style={styles.totalText}>{payLabel}</Text>
            <Text style={[styles.totalText, tabularNumbers]}>
              {formatDram(order.totalDram, locale)}
            </Text>
          </View>
        </View>

        <View style={styles.ways}>
          {order.branchPhoneE164 ? (
            <Button
              label={t('takeaway.status.call')}
              icon={actionIcon.call}
              variant="outline"
              onPress={() => openUrl(`tel:${order.branchPhoneE164}`)}
              style={styles.way}
            />
          ) : null}
          <Button
            label={t('takeaway.status.directions')}
            icon={actionIcon.directions}
            variant="outline"
            onPress={() =>
              openUrl(
                directionsUrl(
                  { latitude: order.latitude, longitude: order.longitude },
                  order.venueName,
                ),
              )
            }
            style={styles.way}
          />
        </View>

        {canCancel && !confirmOpen ? (
          <View style={styles.cancelArea}>
            <Button
              label={t('takeaway.status.cancel')}
              variant="destructive"
              onPress={() => {
                cancel.reset();
                setConfirming(true);
              }}
              style={styles.cancelButton}
            />
            <Text style={styles.hint}>{t('takeaway.status.cancelHint')}</Text>
          </View>
        ) : null}
        {confirmOpen ? (
          <InlineConfirm
            title={t('takeaway.status.cancelTitle')}
            body={t('takeaway.status.cancelBody')}
            confirmLabel={t('takeaway.status.cancelConfirm')}
            keepLabel={t('takeaway.status.cancelKeep')}
            busyLabel={t('takeaway.status.cancelling')}
            busy={cancel.isPending}
            error={cancelError ? t(cancelError.key) : null}
            onConfirm={doCancel}
            onKeep={() => setConfirming(false)}
          />
        ) : cancelError ? (
          <Text style={styles.error} accessibilityRole="alert">
            {t(cancelError.key)}
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.footerSlot} pointerEvents="box-none">
        <CtaFooter bottomInset={insets.bottom}>
          <BookCta label={cta.label} onPress={cta.onPress} />
        </CtaFooter>
      </View>
    </>
  );
}

function Step({
  step,
  index,
  time,
}: {
  readonly step: StepView;
  readonly index: number;
  readonly time: (utc: string) => string;
}) {
  const { t } = useTranslation('diner');
  const label = t(`takeaway.status.step.${step.step}`);
  const when = step.atUtc ? time(step.atUtc) : null;
  return (
    <View
      style={styles.step}
      accessibilityRole="text"
      accessibilityLabel={[label, when].filter(Boolean).join(', ')}
      accessibilityState={{ selected: step.state === 'current' }}
    >
      <View
        style={[
          styles.stepDot,
          step.state === 'current' && styles.stepDotCurrent,
          step.state === 'done' && styles.stepDotDone,
        ]}
        aria-hidden
      >
        {step.state === 'done' ? (
          <Ionicons name="checkmark-outline" size={iconSize.sm} color={colors.successInk} />
        ) : (
          <Text style={[styles.stepNumber, step.state === 'current' && styles.stepNumberCurrent]}>
            {index + 1}
          </Text>
        )}
      </View>
      <View style={styles.stepText}>
        <Text
          style={[
            styles.stepLabel,
            step.state === 'current' && styles.stepLabelCurrent,
            step.state === 'todo' && styles.stepLabelTodo,
          ]}
        >
          {label}
        </Text>
        {when ? <Text style={styles.stepWhen}>{when}</Text> : null}
      </View>
    </View>
  );
}

function StatusSkeleton() {
  return (
    <View style={styles.body}>
      <Skeleton width="70%" height={28} style={styles.centerSelf} />
      <Skeleton width="85%" height={16} style={styles.centerSelf} />
      <Skeleton height={120} borderRadius={radius.hero} />
      <Skeleton height={160} borderRadius={radius.card} />
    </View>
  );
}

const FOOTER_CLEARANCE = 120;
const DOT = 28;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  headerTitle: { ...typography.caption, fontSize: 13, color: colors.textMuted, flex: 1 },
  body: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm, gap: space.lg },
  centerSelf: { alignSelf: 'center' },
  intro: { alignItems: 'center', gap: space.xs + 2 },
  title: {
    fontSize: 25,
    lineHeight: 31,
    fontWeight: fontWeight.bold,
    color: colors.text,
    textAlign: 'center',
  },
  lead: { ...typography.body, color: colors.textMuted, textAlign: 'center', maxWidth: 320 },
  codeCard: {
    alignItems: 'center',
    gap: space.xs,
    padding: space.lg,
    borderRadius: radius.hero,
    borderWidth: 2,
    borderColor: colors.brand,
    backgroundColor: colors.surface,
  },
  // Not yet accepted: dashed, so it never looks like a promise.
  codeSent: { borderColor: colors.logoInk, borderStyle: 'dashed' },
  codeReady: { borderColor: colors.successInk, backgroundColor: colors.successSoft },
  codeLabel: { ...typography.caption, color: colors.textMuted },
  code: {
    fontSize: 40,
    lineHeight: 48,
    fontWeight: fontWeight.bold,
    letterSpacing: 3,
    color: colors.text,
    ...tabularNumbers,
  },
  readyLine: { ...typography.body, fontWeight: fontWeight.bold, color: colors.text },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, minHeight: 46 },
  stepDot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stepDotCurrent: { backgroundColor: colors.brand, borderColor: colors.brand },
  stepDotDone: { backgroundColor: colors.successSoft, borderColor: colors.successSoft },
  stepNumber: { ...typography.caption, fontWeight: fontWeight.bold, color: colors.textMuted },
  stepNumberCurrent: { color: colors.onPrimary },
  stepText: { flex: 1, paddingTop: 3 },
  stepLabel: { ...typography.body, color: colors.text },
  stepLabelCurrent: { fontWeight: fontWeight.bold },
  stepLabelTodo: { color: colors.textMuted },
  stepWhen: { ...typography.caption, ...tabularNumbers, color: colors.textMuted },
  lines: {
    gap: space.xs + 2,
    padding: space.md + 2,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  lineName: { ...typography.body, color: colors.text, flex: 1 },
  lineAmount: { ...typography.body, ...tabularNumbers, color: colors.text },
  totalLine: {
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  totalText: { ...typography.bodyLg, fontWeight: fontWeight.bold, color: colors.text },
  ways: { flexDirection: 'row', gap: space.sm },
  way: { flex: 1, paddingHorizontal: space.md, borderColor: colors.logoInk },
  cancelArea: { gap: space.xs + 2 },
  cancelButton: { minHeight: layout.controlHeight, backgroundColor: colors.errorSoft },
  hint: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  error: {
    padding: space.md,
    borderRadius: radius.tile,
    overflow: 'hidden',
    backgroundColor: colors.errorSoft,
    ...typography.body,
    color: colors.errorInk,
  },
  footerSlot: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
