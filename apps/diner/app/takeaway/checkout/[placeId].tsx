import { Ionicons } from '@expo/vector-icons';
import { TAKEAWAY_LIMITS } from '@yalla/api';
import { formatDram } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../../src/components/Button';
import { Chip } from '../../../src/components/Chip';
import { EmptyState } from '../../../src/components/EmptyState';
import { IconButton } from '../../../src/components/IconButton';
import { BookCta, CtaFooter } from '../../../src/components/place/BookCta';
import { maskPhone } from '../../../src/components/profile/maskPhone';
import { Screen } from '../../../src/components/Screen';
import { SegmentedControl } from '../../../src/components/SegmentedControl';
import { Skeleton } from '../../../src/components/Skeleton';
import { Text, TextInput } from '../../../src/components/Text';
import { haptics } from '../../../src/lib/haptics';
import { usePlace } from '../../../src/places/hooks';
import { formatClock } from '../../../src/places/model';
import { useSession } from '../../../src/stores/session';
import { cartCount, cartFor, cartTotal, useTakeawayCart } from '../../../src/takeaway/cart';
import {
  namesFrom,
  sendFailureLine,
  takeawayFailure,
  type FailureLine,
} from '../../../src/takeaway/failure';
import { usePlaceTakeawayOrder, useTakeawayAvailability } from '../../../src/takeaway/queries';
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
} from '../../../src/theme';

type Mode = 'asap' | 'at';

/**
 * The takeaway checkout (2026-10-22): when the guest will come, what they
 * ordered, a note for the venue, and Send.
 *
 * As soon as possible, or a quarter hour today from the slots the server
 * offers; a busy kitchen takes no ASAP. Nothing is paid here — the box says
 * so — and the venue may call the guest's proved number, so a number that is
 * not proved sends them through the same verification booking uses, and the
 * order waits here for them. Every refusal is said in plain words with its way
 * on; a send whose answer was lost is retried under the same command id.
 */
export default function TakeawayCheckoutScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { placeId } = useLocalSearchParams<{ placeId: string }>();

  const signedIn = useSession((s) => s.signedIn);
  const phone = useSession((s) => s.profile?.phoneE164 ?? s.phoneE164);
  const phoneVerified = useSession((s) => s.profile?.phoneVerified);

  const { data: place } = usePlace(placeId);
  const availabilityQuery = useTakeawayAvailability(placeId);
  const availability = availabilityQuery.data;

  const stored = useTakeawayCart((state) => state.cart);
  const setPickup = useTakeawayCart((state) => state.setPickup);
  const setNote = useTakeawayCart((state) => state.setNote);
  const command = useTakeawayCart((state) => state.command);
  const drop = useTakeawayCart((state) => state.drop);
  const clear = useTakeawayCart((state) => state.clear);
  const cart = cartFor(stored, placeId);
  const count = cartCount(cart);
  const total = cartTotal(cart);

  const send = usePlaceTakeawayOrder();
  const [failure, setFailure] = useState<FailureLine | null>(null);
  /** The server said the number is not proved: Send becomes the verify step. */
  const [verifyRefused, setVerifyRefused] = useState(false);
  const mustVerify = (verifyRefused || phoneVerified === false) && phoneVerified !== true;

  const mode: Mode = cart.pickup.mode;
  const slot = cart.pickup.mode === 'at' ? cart.pickup.at : null;
  const busy = availability?.busy ?? false;
  const closed = availability ? !availability.open || !availability.enabled : false;
  const slots = availability?.slots ?? [];
  // A slot picked earlier and gone since is not sent.
  const slotOffered = slot !== null && slots.includes(slot);
  const pickupReady = mode === 'asap' ? !busy : slotOffered;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else if (placeId) router.replace({ pathname: '/takeaway/menu/[placeId]', params: { placeId } });
  };
  const openMenu = () => {
    if (placeId) router.push({ pathname: '/takeaway/menu/[placeId]', params: { placeId } });
  };

  const submit = async () => {
    if (!signedIn) {
      router.push('/auth');
      return;
    }
    if (mustVerify) {
      router.push('/auth/code');
      return;
    }
    if (!pickupReady || closed || count === 0 || send.isPending) return;
    setFailure(null);
    const names = namesFrom(cart.lines.map((line) => line.item));
    try {
      const order = await send.mutateAsync(command());
      haptics.success();
      clear();
      router.replace({ pathname: '/takeaway/[orderId]', params: { orderId: order.id } });
    } catch (error) {
      const why = takeawayFailure(error);
      if (why.kind === 'signIn') {
        router.push('/auth');
        return;
      }
      if (why.kind === 'verify') {
        setVerifyRefused(true);
        return;
      }
      if (why.kind === 'items') drop(why.menuItemIds);
      // A full kitchen still has later times; a gone slot is picked again.
      if (why.kind === 'busy' || why.kind === 'slot') setPickup({ mode: 'at', at: '' });
      setFailure(sendFailureLine(why, names));
    }
  };

  const header = (
    <View style={styles.header}>
      <IconButton
        icon={actionIcon.back}
        onPress={goBack}
        accessibilityLabel={t('floorPlan.back')}
        variant="surface"
      />
      <View style={styles.headerText}>
        <Text display style={styles.title} accessibilityRole="header">
          {t('takeaway.checkout.title')}
        </Text>
        {place ? (
          <Text numberOfLines={1} style={styles.where}>
            {[place.name, place.address].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (count === 0) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        {header}
        <EmptyState
          icon={actionIcon.takeaway}
          title={t('takeaway.checkout.empty.title')}
          body={t('takeaway.checkout.empty.body')}
          action={{ label: t('takeaway.checkout.empty.action'), onPress: openMenu }}
        />
      </Screen>
    );
  }

  const ctaLabel = !signedIn
    ? t('takeaway.checkout.signIn')
    : mustVerify
      ? t('takeaway.checkout.verify')
      : send.isPending
        ? t('takeaway.checkout.sending')
        : t('takeaway.checkout.send', { total: formatDram(total, locale) });
  const ctaEnabled =
    !signedIn || mustVerify || (pickupReady && !closed && !send.isPending && !!availability);

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      {header}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: FOOTER_CLEARANCE + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* When: as soon as possible, or a quarter hour today. */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              {t('takeaway.checkout.pickupTitle')}
            </Text>
            <SegmentedControl<Mode>
              options={[
                { value: 'asap', label: t('takeaway.checkout.asap') },
                { value: 'at', label: t('takeaway.checkout.pickTime') },
              ]}
              value={mode}
              onChange={(next) =>
                setPickup(next === 'asap' ? { mode: 'asap' } : { mode: 'at', at: slot ?? '' })
              }
              accessibilityLabel={t('takeaway.checkout.pickupTitle')}
            />
            {!signedIn ? null : availabilityQuery.isLoading ? (
              <View style={styles.slots}>
                {[0, 1, 2, 3].map((key) => (
                  <Skeleton
                    key={key}
                    width={76}
                    height={layout.touchTarget}
                    borderRadius={radius.pill}
                  />
                ))}
              </View>
            ) : availabilityQuery.isError && !availability ? (
              <View style={styles.inline}>
                <Text style={styles.muted}>{t('takeaway.checkout.slotsFailed')}</Text>
                <Button
                  label={t('common.retry')}
                  variant="text"
                  fullWidth={false}
                  onPress={() => void availabilityQuery.refetch()}
                />
              </View>
            ) : closed ? (
              <Text style={styles.notice} accessibilityRole="alert">
                {availability?.opensAt
                  ? t('takeaway.checkout.closedFrom', {
                      time: formatClock(availability.opensAt, locale),
                    })
                  : t('takeaway.checkout.closed')}
              </Text>
            ) : mode === 'asap' ? (
              busy ? (
                <Text style={styles.notice} accessibilityRole="alert">
                  {t('takeaway.checkout.busy')}
                </Text>
              ) : availability?.asapReadyAt ? (
                <Text style={styles.muted}>
                  {t('takeaway.checkout.asapLine', {
                    time: formatClock(availability.asapReadyAt, locale),
                    minutes: availability.prepMinutes,
                  })}
                </Text>
              ) : null
            ) : slots.length === 0 ? (
              <Text style={styles.muted}>{t('takeaway.checkout.noSlots')}</Text>
            ) : (
              <>
                <View
                  style={styles.slots}
                  accessibilityRole="radiogroup"
                  accessibilityLabel={t('takeaway.checkout.slotsLabel')}
                >
                  {slots.map((at) => (
                    <Chip
                      key={at}
                      label={formatClock(at, locale)}
                      selected={slot === at}
                      accessibilityRole="radio"
                      onPress={() => setPickup({ mode: 'at', at })}
                      style={styles.slot}
                    />
                  ))}
                </View>
                {availability?.lastPickupAt ? (
                  <Text style={styles.caption}>
                    {t('takeaway.checkout.lastPickup', {
                      time: formatClock(availability.lastPickupAt, locale),
                    })}
                  </Text>
                ) : null}
              </>
            )}
          </View>

          {/* What: the dishes and the total, with a way back to change them. */}
          <View style={styles.summary}>
            <View style={styles.summaryHead}>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                {t('takeaway.checkout.summaryTitle')}
              </Text>
              <Button
                label={t('takeaway.checkout.change')}
                variant="text"
                fullWidth={false}
                onPress={goBack}
              />
            </View>
            {cart.lines.map((line) => (
              <View key={line.item.id} style={styles.line}>
                <Text style={styles.lineName}>
                  {t('takeaway.checkout.line', { count: line.quantity, name: line.item.name })}
                </Text>
                <Text style={styles.lineAmount}>
                  {formatDram(line.quantity * line.item.priceDram, locale)}
                </Text>
              </View>
            ))}
            <View style={[styles.line, styles.totalLine]}>
              <Text style={styles.totalText}>{t('takeaway.checkout.total')}</Text>
              <Text style={[styles.totalText, tabularNumbers]}>{formatDram(total, locale)}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('takeaway.checkout.noteLabel')}</Text>
            <TextInput
              value={cart.note}
              onChangeText={setNote}
              placeholder={t('takeaway.checkout.notePlaceholder')}
              accessibilityLabel={t('takeaway.checkout.noteLabel')}
              multiline
              maxLength={TAKEAWAY_LIMITS.maxNote}
              style={styles.note}
            />
          </View>

          {/* Nothing is paid here. */}
          <View style={styles.payBox}>
            <Ionicons name={actionIcon.payment} size={iconSize.md} color={colors.logoInk} />
            <Text style={styles.payText}>{t('takeaway.checkout.payAtPickup')}</Text>
          </View>
          <Text style={styles.caption}>
            {phone
              ? t('takeaway.checkout.phoneLine', { phone: maskPhone(phone) })
              : t('takeaway.checkout.phoneLinePlain')}
          </Text>

          {mustVerify ? (
            <Text style={styles.notice} accessibilityRole="alert">
              {t('takeaway.checkout.verifyNotice')}
            </Text>
          ) : null}
          {failure ? (
            <Text style={styles.error} accessibilityRole="alert">
              {t(failure.key, failure.params ?? {})}
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footerSlot} pointerEvents="box-none">
        <CtaFooter bottomInset={insets.bottom}>
          <BookCta
            label={ctaLabel}
            busy={send.isPending}
            disabled={!ctaEnabled}
            onPress={() => void submit()}
          />
        </CtaFooter>
      </View>
    </Screen>
  );
}

const FOOTER_CLEARANCE = 120;

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  body: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm, gap: space.lg + 2 },
  section: { gap: space.sm + 2 },
  sectionTitle: { ...typography.body, fontWeight: fontWeight.bold, color: colors.text },
  muted: { ...typography.body, color: colors.textMuted },
  caption: { ...typography.caption, color: colors.textMuted },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  notice: {
    padding: space.md,
    borderRadius: radius.tile,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.logoInk,
    ...typography.body,
    color: colors.text,
  },
  error: {
    padding: space.md,
    borderRadius: radius.tile,
    overflow: 'hidden',
    backgroundColor: colors.errorSoft,
    ...typography.body,
    color: colors.errorInk,
  },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  slot: { minWidth: 76, minHeight: layout.touchTarget, justifyContent: 'center' },
  summary: {
    gap: space.sm,
    padding: space.md + 2,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.logoInk,
  },
  summaryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  lineName: { ...typography.body, color: colors.text, flex: 1 },
  lineAmount: { ...typography.body, ...tabularNumbers, color: colors.text },
  totalLine: {
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  totalText: { ...typography.bodyLg, fontWeight: fontWeight.bold, color: colors.text },
  note: {
    minHeight: 72,
    padding: space.md,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.logoInk,
    ...typography.body,
    color: colors.text,
    textAlignVertical: 'top',
  },
  payBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm + 2,
    padding: space.md,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.logoInk,
  },
  payText: { ...typography.body, color: colors.text, flex: 1 },
  footerSlot: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
