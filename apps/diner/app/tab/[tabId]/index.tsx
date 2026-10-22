import { Ionicons } from '@expo/vector-icons';
import { HostCannotLeaveError, type DinerTabView } from '@yalla/api';
import { formatDram, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Badge } from '../../../src/components/Badge';
import { Button } from '../../../src/components/Button';
import { CallWaiterSheet } from '../../../src/components/CallWaiterSheet';
import { Card } from '../../../src/components/Card';
import { ConfirmSheet } from '../../../src/components/ConfirmSheet';
import { IconButton } from '../../../src/components/IconButton';
import { LiveBill } from '../../../src/components/LiveBill';
import { Rise, riseDelay } from '../../../src/components/motion/Rise';
import { useToast } from '../../../src/components/motion/Toast';
import { SuccessMark } from '../../../src/components/motion/SuccessMark';
import { usePressScale } from '../../../src/components/motion/usePressScale';
import {
  AvatarRow,
  useParticipantSummary,
  usePeopleLine,
} from '../../../src/components/Participants';
import { Screen } from '../../../src/components/Screen';
import { JoinRequestBanner } from '../../../src/components/tab/JoinRequestBanner';
import { PaySheet } from '../../../src/components/tab/PaySheet';
import { TabNamePrompt } from '../../../src/components/TabNamePrompt';
import { Text } from '../../../src/components/Text';
import { useDinerTab } from '../../../src/data/orderQueries';
import { useLeaveTab } from '../../../src/data/queries';
import { haptics } from '../../../src/lib/haptics';
import { useTray } from '../../../src/order/TrayProvider';
import { useActiveTab } from '../../../src/stores/tab';
import { tabAccessCopy } from '../../../src/tab/access';
import { admissionState, justAdmitted, type AdmissionState } from '../../../src/tab/admission';
import { tabAccessGone } from '../../../src/tab/billRequest';
import { canInvite } from '../../../src/tab/invite';
import { orderingBlock, orderingBlockKey } from '../../../src/tab/ordering';
import { projectTab } from '../../../src/tab/projection';
import { onTab, roster } from '../../../src/tab/roster';
import { useBillRequestWatch } from '../../../src/tab/useBillRequestWatch';
import {
  actionIcon,
  colors,
  displayWeight,
  fontWeight,
  iconSize,
  layout,
  radius,
  ratingIcon,
  shadows,
  space,
  tabularNumbers,
  typography,
  type IoniconName,
} from '../../../src/theme';

/** Slow enough not to be a battery problem, quick enough to feel current. */
const POLL_MS = 8_000;

/**
 * The tab — the main screen for anyone sitting at the table.
 *
 * The bill leads, because it is the thing that changes while you sit here.
 * The people on the tab are a stack of initials in one glass card rather than
 * a list: who is here is a glance, and the full roster with host controls lives
 * one tap away. Under the bill sit the three things a table does — call
 * somebody over, order more, pay — so a waiter is never more than two taps
 * from the bill.
 *
 * Everything here is read from the diner's own tab read (`GET /api/tabs/{id}`
 * with this phone's participant token): who is on the tab, the bill, and
 * whether this person can order right now.
 *
 * A tab a scan opened with no proved number waits for a waiter first
 * (2026-10-20): the screen says a waiter is coming, the menu stays readable
 * and a waiter callable, ordering and the bill wait. Let in, it says so once
 * and ordering opens; turned away, the tab is closed and the screen says so
 * plainly, with the way home — never the paid receipt.
 */
export default function TabScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const { tabId } = useLocalSearchParams<{ tabId: string }>();

  const [waiterOpen, setWaiterOpen] = useState(false);
  /** A call went through from this screen: the Call button says so. */
  const [called, setCalled] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const showToast = useToast((state) => state.show);

  // Polling alongside the event stream, which refetches this same read when
  // somebody asks to join or the roster moves: the poll is what still lands
  // when the stream cannot be read, and staff may close the table meanwhile.
  const {
    data: view,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useDinerTab(tabId, { pollMs: POLL_MS });
  const leaveTab = useLeaveTab();
  const clearActive = useActiveTab((s) => s.clear);
  const joinActive = useActiveTab((s) => s.join);
  const activeTabId = useActiveTab((s) => s.activeTabId);
  // The order this phone last sent, so the bill never announces it as a waiter's.
  const { state: tray } = useTray();

  const lost = tabAccessCopy(error);
  const admission = view ? admissionState(view) : null;
  /*
   * Let in by a waiter while this screen watched: said once, with a little
   * lift. Read from the tab as it changes — the stream's event 21 refetches
   * it, the poll is the backstop — so it is said whichever brings the news.
   */
  const lastAdmission = useRef<AdmissionState | null>(null);
  useEffect(() => {
    if (!admission) return;
    if (justAdmitted(lastAdmission.current, admission)) {
      haptics.success();
      showToast(t('tab.admission.admitted'), 'restaurant-outline');
    }
    lastAdmission.current = admission;
  }, [admission, showToast, t]);
  const over =
    lost !== null ||
    view?.me.status === 'removed' ||
    view?.status === 'closed' ||
    view?.status === 'abandoned';

  // A tab read with this device's token is the tab this device is on — after a
  // reload or a tab's link too, so Explore points back to it. One the server
  // ended is forgotten, so the next launch does not come back to it.
  useEffect(() => {
    if (!tabId) return;
    if (over) {
      if (activeTabId === tabId) clearActive();
    } else if (view?.tabId === tabId && activeTabId !== tabId) {
      joinActive(tabId);
    }
  }, [tabId, over, view?.tabId, activeTabId, clearActive, joinActive]);

  // The bill asked for from the pay sheet, until a waiter acknowledges it or
  // the tab moves on to closing — or this phone can no longer read the tab
  // (401/403, or 404: the read answers `null`), which ends it for good.
  const billRequested = useBillRequestWatch(
    tabId,
    view?.status,
    tabAccessGone(error) || view === null,
  );

  const people = view ? roster(view) : [];
  const summary = useParticipantSummary(people, locale);
  const peopleLine = usePeopleLine(people);
  const count = onTab(people).length;
  const isHost = view?.me.role === 'host' && view.me.status === 'approved';

  // Still waiting for the host: the pending screen says so, and polls faster.
  useEffect(() => {
    if (view?.me.status === 'pendingApproval' && tabId) {
      router.replace({ pathname: '/tab/[tabId]/pending', params: { tabId } });
    }
  }, [view?.me.status, tabId, router]);

  const scanAgain = useCallback(() => {
    clearActive();
    router.replace('/(tabs)/scan');
  }, [clearActive, router]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const confirmLeave = useCallback(async () => {
    if (!tabId) return;
    setLeaveError(null);
    try {
      await leaveTab.mutateAsync({ tabId });
      clearActive();
      setLeaveOpen(false);
      router.replace('/(tabs)/scan');
    } catch (caught) {
      // The sheet stays open. The screen must not claim you are off a tab the
      // server still has you on — and a host with nobody to hand it to is told
      // who can close it instead.
      setLeaveError(
        caught instanceof HostCannotLeaveError ? t('tab.hostCannotLeave') : t('tab.leaveFailed'),
      );
    }
  }, [tabId, leaveTab, clearActive, router, t]);

  if (isLoading) {
    return (
      <Shell>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>{t('tab.loading')}</Text>
        </View>
      </Shell>
    );
  }

  // Taken off, turned away, or the tab closed under this phone. The server
  // answers all three with the same bare 401/403, so this does not guess which.
  // A tab this device holds no token for was never refused: it asks for a
  // scan rather than claiming the tab closed.
  if (lost || view?.me.status === 'removed') {
    const copy = lost ?? { title: 'tab.accessEnded.title', body: 'tab.accessEnded.body' };
    return (
      <Shell>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>{t(copy.title)}</Text>
          <Text style={styles.muted}>{t(copy.body)}</Text>
          <Button label={t('scan.scanAgain')} onPress={scanAgain} />
        </View>
      </Shell>
    );
  }

  if (!view) {
    return (
      <Shell>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>
            {isError ? t('tab.loadError') : t('tab.notFoundTitle')}
          </Text>
          {isError ? null : <Text style={styles.muted}>{t('tab.notFoundBody')}</Text>}
          <Button
            label={isError ? t('net.retry') : t('scan.scanAgain')}
            onPress={isError ? () => void refetch() : scanAgain}
          />
        </View>
      </Shell>
    );
  }

  // Turned away by a waiter: closed, and nothing was ever ordered on it. A
  // clear word and the way home, never the paid receipt.
  if (admission === 'rejected') {
    return (
      <Shell>
        <View style={styles.centered}>
          <View style={styles.rejectedMark}>
            <Ionicons name="close" size={iconSize.xl} color={colors.errorInk} />
          </View>
          <Text display style={styles.emptyTitle} accessibilityRole="header">
            {t('tab.admission.rejectedTitle')}
          </Text>
          <Text style={styles.muted}>{t('tab.admission.rejectedBody')}</Text>
          <Button
            label={t('tab.admission.home')}
            onPress={() => {
              clearActive();
              router.replace('/');
            }}
          />
        </View>
      </Shell>
    );
  }

  // Settled and closed by staff: the receipt, and a way to say how it was.
  if (view.status === 'closed') {
    return <PaidView view={view} onDone={() => router.replace('/')} />;
  }

  if (view.status === 'abandoned') {
    return (
      <Shell>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>{t('tab.closedTitle')}</Text>
          <Text style={styles.muted}>{t('tab.closedBody')}</Text>
          <Button label={t('scan.scanAgain')} onPress={scanAgain} />
        </View>
      </Shell>
    );
  }

  const block = orderingBlock(view);
  const awaiting = admission === 'awaiting';
  const goTo = (screen: 'invite' | 'people' | 'menu' | 'settle') =>
    router.push({ pathname: `/tab/[tabId]/${screen}`, params: { tabId: view.tabId } });

  // "Table 4" stays its own words in the line: it is what a person (and the
  // end-to-end suite) looks for.
  const where = [
    view.venueName,
    t('tab.title', { label: view.tableLabel }),
    t('tab.openedAt', { time: formatTime(view.openedAtUtc, view.timeZoneId, locale) }),
  ].join(' · ');

  return (
    <Shell>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Rise delay={riseDelay(0)}>
          <View style={styles.header}>
            <IconButton
              icon={actionIcon.back}
              onPress={goBack}
              accessibilityLabel={t('floorPlan.back')}
            />
            <View style={styles.headerText}>
              <Text display style={styles.title} accessibilityRole="header">
                {t('tab.bill')}
              </Text>
              <Text style={styles.where}>{where}</Text>
            </View>
            {view.status === 'closing' ? (
              <Badge variant="reserved" dot label={t('tab.closingChip')} style={styles.chip} />
            ) : (
              <Badge variant="open" dot style={styles.chip} />
            )}
          </View>
        </Rise>

        {/* Somebody at the table asking to be let on, answered from here. The
            host's alone, as the server's approve route is. */}
        {isHost ? <JoinRequestBanner tabId={view.tabId} people={people} /> : null}

        {/* Who is here, as faces and their names. Tapping it opens the full
            roster: the host's controls and the people asking to join. */}
        <Rise delay={riseDelay(1)}>
          <Card padded={false} radiusToken="hero" style={styles.people}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={[t('tab.peopleCount', { count }), summary]
                .filter(Boolean)
                .join('. ')}
              onPress={() => goTo('people')}
              style={({ pressed }) => [styles.peopleTap, pressed && styles.pressed]}
            >
              <AvatarRow people={people} />
              <View style={styles.peopleText}>
                <Text style={styles.names} numberOfLines={1}>
                  {peopleLine || t('tab.peopleCount', { count })}
                </Text>
                <Text style={styles.role} numberOfLines={1}>
                  {isHost ? t('tab.youHost') : t('tab.peopleCount', { count })}
                </Text>
              </View>
            </Pressable>
            {/* Host-only, because the server's invitation route is: offered to a
                guest, it was a button whose every tap ended in a refusal. */}
            {canInvite(view) ? (
              <Button
                label={t('tab.invite')}
                variant="outline"
                size="small"
                icon="qr-code-outline"
                fullWidth={false}
                onPress={() => goTo('invite')}
              />
            ) : null}
          </Card>
        </Rise>

        {/* Not let in yet: a waiter is coming. The menu and a call work meanwhile. */}
        {awaiting ? (
          <Rise delay={riseDelay(1)}>
            <View style={styles.awaiting} accessibilityRole="summary">
              <View style={styles.awaitingMark}>
                <Ionicons name="hourglass-outline" size={iconSize.md} color={colors.infoInk} />
              </View>
              <View style={styles.awaitingText}>
                <Text style={styles.awaitingTitle} accessibilityRole="header">
                  {t('tab.admission.waitingTitle')}
                </Text>
                <Text style={styles.awaitingBody}>{t('order.blocked.awaitingAdmission')}</Text>
              </View>
            </View>
          </Rise>
        ) : null}

        {/* Somebody the tab only knows as "Guest 2" is offered a name, once. */}
        <TabNamePrompt tabId={view.tabId} currentName={view.me.displayName} />

        {/* A stale list that looks live is the failure mode here, so say when
            the last refresh did not land rather than showing nothing. */}
        {isError ? <Text style={styles.offline}>{t('tab.offline')}</Text> : null}

        {view.status === 'closing' ? (
          <Text style={styles.closing}>{t('tab.closingBanner')}</Text>
        ) : null}

        {/* The bill as it grows. Live through the tab's event sequence, so a
            waiter adding a spoken order on the tablet appears here without
            anybody refreshing anything. */}
        <Rise delay={riseDelay(2)}>
          <LiveBill
            tabId={view.tabId}
            timeZoneId={view.timeZoneId}
            active={view.me.status === 'approved'}
            ownOrderId={tray.lastSent?.orderId ?? null}
          />
        </Rise>

        <Rise delay={riseDelay(3)} style={styles.actionsBlock}>
          <View style={styles.actions}>
            <ActionButton
              icon="notifications-outline"
              label={called ? t('tab.called') : t('tab.call')}
              accessibilityLabel={called ? t('tab.called') : t('waiter.call')}
              tone={called ? 'success' : 'glass'}
              onPress={() => setWaiterOpen(true)}
            />
            {/* The menu is readable by everyone at the table. Ordering is not,
                and when this person cannot order the reason is said here
                rather than discovered as a refusal after building a tray. */}
            <ActionButton
              label={block ? t('menu.title') : t('tab.order')}
              tone="glass"
              onPress={() => goTo('menu')}
            />
            {/* Once the bill is asked for, Pay says so, quietly, until a
                waiter has it; a tap shows what is on its way. */}
            {billRequested ? (
              <ActionButton
                icon="receipt-outline"
                label={t('tab.billRequested')}
                accessibilityLabel={t('tab.closingChip')}
                tone="calm"
                onPress={() => setPayOpen(true)}
              />
            ) : (
              <ActionButton
                label={t('tab.settle')}
                tone="brand"
                // No bill before a waiter has let the table in: said above.
                disabled={awaiting}
                onPress={() => setPayOpen(true)}
              />
            )}
          </View>
          {block && !awaiting ? (
            <Text style={styles.blocked}>{t(orderingBlockKey(block))}</Text>
          ) : null}
        </Rise>

        <View style={styles.quiet}>
          {isHost ? (
            <Button label={t('tab.manage')} variant="text" onPress={() => goTo('people')} />
          ) : null}
          <Button
            label={isFetching ? t('pending.checking') : t('tab.refresh')}
            variant="text"
            busy={isFetching}
            onPress={() => void refetch()}
          />
          <Button label={t('tab.leave')} variant="destructive" onPress={() => setLeaveOpen(true)} />
        </View>
      </ScrollView>

      <CallWaiterSheet
        tabId={view.tabId}
        visible={waiterOpen}
        onClose={() => setWaiterOpen(false)}
        tableLabel={view.tableLabel}
        onSent={() => setCalled(true)}
      />

      <PaySheet
        tabId={view.tabId}
        visible={payOpen}
        onClose={() => setPayOpen(false)}
        tab={view}
        onShowShares={() => {
          setPayOpen(false);
          goTo('settle');
        }}
      />

      <ConfirmSheet
        visible={leaveOpen}
        title={t('tab.leaveTitle')}
        body={isHost ? t('tab.leaveHostBody') : t('tab.leaveBody')}
        confirmLabel={t('tab.leaveConfirm')}
        cancelLabel={t('tab.leaveKeep')}
        busy={leaveTab.isPending}
        error={leaveError}
        destructive
        onConfirm={() => void confirmLeave()}
        onCancel={() => {
          setLeaveOpen(false);
          setLeaveError(null);
        }}
      />
    </Shell>
  );
}

/**
 * One of the three presses under the bill. Equal thirds, which is narrower
 * than `Button` lays out: a glass pill, the brand pill for Pay, a solid green
 * once the waiter has been called, and a calm glass pill with green ink once
 * the bill has been asked for.
 */
function ActionButton({
  label,
  icon,
  tone,
  onPress,
  accessibilityLabel,
  disabled = false,
}: {
  readonly label: string;
  readonly icon?: IoniconName;
  readonly tone: 'glass' | 'brand' | 'success' | 'calm';
  readonly onPress: () => void;
  readonly accessibilityLabel?: string;
  readonly disabled?: boolean;
}) {
  const press = usePressScale();
  const ink =
    tone === 'brand'
      ? colors.onPrimary
      : tone === 'success'
        ? colors.onSuccessStrong
        : tone === 'calm'
          ? colors.successInk
          : colors.text;
  const glass = tone === 'glass' || tone === 'calm';
  return (
    <Animated.View style={[styles.actionWrap, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) => [
          styles.action,
          glass && styles.actionGlass,
          tone === 'brand' && styles.actionBrand,
          tone === 'success' && styles.actionSuccess,
          pressed && glass && styles.actionGlassPressed,
          pressed && tone === 'brand' && styles.actionBrandPressed,
          disabled && styles.actionDisabled,
        ]}
      >
        {icon ? <Ionicons name={icon} size={iconSize.sm + 1} color={ink} /> : null}
        <Text
          numberOfLines={1}
          style={[styles.actionLabel, tone === 'brand' && styles.actionLabelStrong, { color: ink }]}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * The tab once staff have closed it: paid and done.
 *
 * What was paid leads, then the receipt as the server last described it, then
 * a way to say how it was — the stars open the place's reviews, because there
 * is no review attached to a tab. Tips left with the payments get their own
 * row, outside the total as the server keeps them. No payment method: the tab
 * does not carry one.
 */
function PaidView({ view, onDone }: { readonly view: DinerTabView; readonly onDone: () => void }) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const [rating, setRating] = useState(0);

  const rendered = projectTab(view, view.timeZoneId);
  const lines = (rendered.tableLines ?? rendered.myLines).filter((line) => !line.isVoided);
  const money = rendered.money;
  // The paid figure when the server has one, else the bill it closed on. Not
  // shown at all to someone the host kept the total from.
  const amount =
    money.kind === 'table' ? (money.paidDram > 0 ? money.paidDram : money.totalDram) : null;
  const rate = rendered.serviceChargePercent;
  // Beside the bill, never in it: a tip folded into the total would make the
  // receipt disagree with what the table owed.
  const tips = view.money.kind === 'table' ? (view.money.tipsDram ?? 0) : 0;

  const rateVisit = (stars: number) => {
    setRating(stars);
    haptics.select();
    // The place page's Reviews section, where the composer is.
    router.push({
      pathname: '/place/[placeId]',
      params: { placeId: view.branchId, section: 'reviews', rating: String(stars) },
    });
  };

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.paidBody} showsVerticalScrollIndicator={false}>
        <View style={styles.paidTop}>
          <IconButton
            icon={actionIcon.close}
            onPress={onDone}
            accessibilityLabel={t('waiter.close')}
          />
        </View>

        <SuccessMark style={styles.paidMark} />
        <Rise delay={120}>
          <Text display style={styles.paidTitle} accessibilityRole="header">
            {t('tab.paid.title')}
          </Text>
        </Rise>
        <Rise delay={180}>
          <Text style={styles.paidThanks}>{t('tab.paid.thanks')}</Text>
        </Rise>
        {amount !== null ? (
          <Rise delay={220}>
            <Text display style={styles.paidAmount}>
              {formatDram(amount, locale)}
            </Text>
          </Rise>
        ) : null}

        <Rise delay={260} style={styles.stretch}>
          <Card radiusToken="hero" style={styles.receipt}>
            <View style={styles.receiptHead}>
              <Text numberOfLines={1} style={styles.receiptWhere}>
                {`${view.venueName} · ${t('tab.title', { label: view.tableLabel })}`}
              </Text>
              <Badge variant="closed" tone="soft" size="sm" label={t('tab.paid.closed')} />
            </View>
            <Dashed />
            {lines.map((line) => (
              <View key={line.id} style={styles.receiptRow}>
                <Text style={styles.receiptLine}>{`${line.quantity} × ${line.name}`}</Text>
                <Text style={styles.receiptAmount}>{formatDram(line.lineTotalDram, locale)}</Text>
              </View>
            ))}
            {money.kind === 'table' ? (
              <View style={styles.receiptRow}>
                <Text style={styles.receiptMuted}>
                  {rate > 0
                    ? t('bill.serviceChargeRate', { percent: rate })
                    : t('bill.serviceCharge')}
                </Text>
                <Text style={styles.receiptMuted}>
                  {formatDram(money.serviceChargeDram, locale)}
                </Text>
              </View>
            ) : null}
            {tips > 0 ? (
              <View style={styles.receiptRow}>
                <Text style={styles.receiptMuted}>{t('tab.pay.tip')}</Text>
                <Text style={styles.receiptMuted}>{formatDram(tips, locale)}</Text>
              </View>
            ) : null}
            <View style={styles.receiptRule} />
            <View style={styles.receiptRow}>
              <Text style={styles.receiptTotal}>
                {money.kind === 'table' ? t('bill.total') : t('bill.yourItems')}
              </Text>
              <Text style={styles.receiptTotal}>
                {formatDram(
                  money.kind === 'table' ? money.totalDram : money.yourItemsSubtotalDram,
                  locale,
                )}
              </Text>
            </View>
            {view.closedAtUtc ? (
              <Text style={styles.receiptMuted}>
                {t('tab.paid.closedAt', {
                  time: formatTime(view.closedAtUtc, view.timeZoneId, locale),
                })}
              </Text>
            ) : null}
          </Card>
        </Rise>

        <Rise delay={320} style={styles.stretch}>
          <View style={styles.rateCard}>
            <Text style={styles.rateTitle}>{t('tab.paid.rate')}</Text>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((stars) => (
                <Pressable
                  key={stars}
                  accessibilityRole="button"
                  accessibilityLabel={t('place.review.starLabel', { rating: stars })}
                  onPress={() => rateVisit(stars)}
                  style={({ pressed }) => [styles.star, pressed && styles.pressed]}
                >
                  <Ionicons
                    name={stars <= rating ? ratingIcon.filled : ratingIcon.empty}
                    size={iconSize.xl}
                    color={colors.warningInk}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        </Rise>
      </ScrollView>

      <View style={styles.paidFooter}>
        <Button label={t('booking.done')} size="large" onPress={onDone} />
      </View>
    </Screen>
  );
}

/**
 * A receipt's dashed rule. A dashed border on one side alone does not draw on
 * iOS, so a dashed box is clipped down to its top edge.
 */
function Dashed() {
  return (
    <View style={styles.dashedClip}>
      <View style={styles.dashed} />
    </View>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      {children}
    </Screen>
  );
}

const ACTION_HEIGHT = 50;

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    paddingBottom: space.xl,
    gap: layout.cardGap,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 24, lineHeight: 32, color: colors.text },
  where: { ...typography.caption, color: colors.textMuted },
  chip: { marginTop: space.xs },

  people: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
  },
  peopleTap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    minHeight: layout.touchTarget,
  },
  peopleText: { flex: 1, minWidth: 0 },
  names: { ...typography.body, fontWeight: fontWeight.medium, color: colors.text },
  role: { ...typography.caption, color: colors.textMuted },

  offline: {
    padding: space.sm,
    borderRadius: radius.small,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.body,
    color: colors.textMuted,
  },
  closing: {
    padding: space.md,
    borderRadius: radius.chip,
    overflow: 'hidden',
    backgroundColor: colors.warningSoft,
    ...typography.body,
    color: colors.text,
  },

  actionsBlock: { gap: space.sm },
  actions: { flexDirection: 'row', gap: space.sm },
  actionWrap: { flex: 1, minWidth: 0 },
  action: {
    height: ACTION_HEIGHT,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.sm,
  },
  actionGlass: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  actionGlassPressed: { opacity: 0.7 },
  actionBrand: {
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: colors.brandEdge,
    ...shadows.brand,
  },
  actionBrandPressed: { backgroundColor: colors.brandPressed },
  actionSuccess: { backgroundColor: colors.successStrong },
  actionDisabled: { opacity: 0.45 },

  awaiting: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.infoSoft,
  },
  awaitingMark: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  awaitingText: { flex: 1, minWidth: 0, gap: space.xs },
  awaitingTitle: { ...typography.body, fontWeight: fontWeight.bold, color: colors.text },
  awaitingBody: { ...typography.body, color: colors.text },
  rejectedMark: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.errorSoft,
    marginBottom: space.sm,
  },
  actionLabel: { ...typography.body, fontWeight: fontWeight.medium, flexShrink: 1 },
  actionLabelStrong: { fontWeight: fontWeight.bold },
  blocked: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  quiet: { alignItems: 'center', marginTop: space.xs },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: space.xl,
  },
  emptyTitle: { ...typography.h3, color: colors.text, textAlign: 'center' },
  muted: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  pressed: { opacity: 0.75 },

  paidBody: {
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    paddingBottom: space.xl,
  },
  paidTop: { alignSelf: 'stretch', flexDirection: 'row' },
  paidMark: { marginTop: space.xs + 2 },
  paidTitle: {
    marginTop: space.lg + 2,
    fontSize: 25,
    lineHeight: 32,
    color: colors.text,
    textAlign: 'center',
  },
  paidThanks: {
    marginTop: space.xs + 2,
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  paidAmount: {
    marginTop: space.md + 2,
    fontSize: 34,
    lineHeight: 42,
    fontWeight: displayWeight.semibold,
    color: colors.primary,
    ...tabularNumbers,
  },
  stretch: { alignSelf: 'stretch' },
  receipt: { marginTop: space.lg + 2, gap: space.sm + 2, padding: space.md + 2 },
  receiptHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  receiptWhere: { ...typography.body, fontWeight: fontWeight.bold, color: colors.text, flex: 1 },
  dashedClip: { height: 1.5, overflow: 'hidden' },
  dashed: {
    height: 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: 1,
  },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  receiptLine: { ...typography.body, color: colors.text, flex: 1 },
  receiptAmount: { ...typography.body, color: colors.text, ...tabularNumbers },
  receiptMuted: { ...typography.caption, color: colors.textMuted, ...tabularNumbers },
  receiptRule: { height: 1, backgroundColor: colors.border },
  receiptTotal: {
    ...typography.body,
    fontWeight: fontWeight.bold,
    color: colors.text,
    ...tabularNumbers,
  },
  rateCard: {
    marginTop: space.md,
    padding: space.md + 2,
    borderRadius: radius.hero,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: space.sm,
  },
  rateTitle: { ...typography.body, fontWeight: fontWeight.medium, color: colors.text },
  stars: { flexDirection: 'row', gap: space.xs },
  star: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paidFooter: { paddingHorizontal: layout.screenPadding, paddingTop: space.md },
});
