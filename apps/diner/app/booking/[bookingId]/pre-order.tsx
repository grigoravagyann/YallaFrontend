import { Ionicons } from '@expo/vector-icons';
import {
  addOne,
  addOneAt,
  canAddMore,
  canAddMoreAt,
  canClearPreOrder,
  canEditPreOrder,
  draftCommand,
  draftQuantity,
  isDirty,
  newCommandId,
  PRE_ORDER_LIMITS,
  preOrderDraftViolations,
  preOrderFailure,
  PreOrderItemsUnavailableError,
  preOrderLimitLine,
  preOrderView,
  priceDraft,
  pricedLineText,
  quantityOf,
  rememberDishes,
  removeLine,
  removeOne,
  removeOneAt,
  setLineNote,
  setNote,
  startDraft,
  type Booking,
  type EditorDraft,
  type MenuItemDetail,
  type SeenDishes,
} from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { formatDram } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { editableUntilWords, PRE_ORDER_ICON } from '../../../src/components/bookings/PreOrderCard';
import { Button } from '../../../src/components/Button';
import { Card } from '../../../src/components/Card';
import { Chip } from '../../../src/components/Chip';
import { ConfirmSheet } from '../../../src/components/ConfirmSheet';
import { EmptyState } from '../../../src/components/EmptyState';
import { IconButton } from '../../../src/components/IconButton';
import { QueryErrorState } from '../../../src/components/QueryErrorState';
import { Screen } from '../../../src/components/Screen';
import { SectionHeader } from '../../../src/components/SectionHeader';
import { Text, TextInput } from '../../../src/components/Text';
import {
  useClearPreOrder,
  usePreOrderMenu,
  useReplacePreOrder,
} from '../../../src/data/preOrderQueries';
import { useBooking } from '../../../src/data/queries';
import { useNow } from '../../../src/hooks/useNow';
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

/**
 * The pre-order editor (2026-10-21): the dishes a guest chooses ahead for a
 * booking, until two hours before it.
 *
 * The branch's pre-order menu only (`isAvailable && availableForPreOrder`),
 * a − n + on each dish, a note for the kitchen per dish and one for the
 * venue, and the total at the prices the server keeps: a dish already on the
 * pre-order keeps the price it was locked at, a new one costs what it costs now.
 * Saving sends the **whole** list; emptied, the pre-order is removed instead
 * (an empty one cannot exist), after asking.
 *
 * A dish sold out since is marked and must be removed or swapped before the
 * save — the server refuses a save that keeps it, and so does this screen.
 * Every refusal is said (`preOrderFailure`); a save whose answer was lost is
 * resent with the same command id, so it is never saved twice. The rules are
 * the manage link's too (`@yalla/api`'s editor draft), so they cannot drift.
 *
 * The list and its footer share a `KeyboardAvoidingView`, as the booking
 * screens do: the footer is in the flow under the list, never over it, so a
 * note typed at the foot stays in view and a long failure line covers nothing.
 */
export default function PreOrderScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const bookingQuery = useBooking(bookingId);
  const booking = bookingQuery.data;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else if (bookingId) router.replace({ pathname: '/booking/[bookingId]', params: { bookingId } });
    else router.replace('/(tabs)/bookings');
  };

  const header = (
    <View style={styles.header}>
      <IconButton
        icon={actionIcon.back}
        onPress={goBack}
        accessibilityLabel={t('preOrder.back')}
        variant="ghost"
      />
      <View style={styles.headerText}>
        <Text display style={styles.title} accessibilityRole="header">
          {t('preOrder.title')}
        </Text>
        {booking ? (
          <Text numberOfLines={1} style={styles.where}>
            {`${booking.venueName ?? booking.branchName} · ${booking.branchName}`}
          </Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      {header}
      {booking ? (
        <Editor booking={booking} onDone={goBack} />
      ) : isOfflinePaused(bookingQuery) ? (
        <QueryErrorState offline onRetry={() => void bookingQuery.refetch()} />
      ) : bookingQuery.isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : bookingQuery.isError ? (
        <QueryErrorState error={bookingQuery.error} onRetry={() => void bookingQuery.refetch()} />
      ) : (
        <EmptyState
          icon={actionIcon.error}
          title={t('booking.notFound.title')}
          body={t('booking.notFound.body')}
          action={{ label: t('preOrder.back'), onPress: goBack }}
        />
      )}
    </Screen>
  );
}

function Editor({ booking, onDone }: { readonly booking: Booking; readonly onDone: () => void }) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const menuQuery = usePreOrderMenu(booking.branchId);
  const menu = menuQuery.data;
  const replace = useReplacePreOrder();
  const clear = useClearPreOrder();

  const saved = booking.preOrder ?? null;
  const [draft, setDraft] = useState<EditorDraft>(() => startDraft(saved));
  /** The dishes the last save was refused for. */
  const [refused, setRefused] = useState<readonly string[]>([]);
  /** Every dish the picker has offered, so one that sells out keeps its name on the list. */
  const [seen, setSeen] = useState<SeenDishes>(() => rememberDishes(new Map(), menu));
  const [seenMenu, setSeenMenu] = useState(menu);
  // Each menu read adds its dishes, adjusted during render rather than in an effect.
  if (menu !== seenMenu) {
    setSeenMenu(menu);
    setSeen(rememberDishes(seen, menu));
  }
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  /** After "it changed in the meantime": take the pre-order as it now reads. */
  const resync = useRef(false);
  /** One command id per draft sent: a resend of the same draft is the same command. */
  const attempt = useRef<{ readonly key: string; readonly id: string } | null>(null);
  /** The removal's own command id, kept across a retry of it — never a save's. */
  const clearId = useRef<string | null>(null);

  useEffect(() => {
    if (!resync.current) return;
    resync.current = false;
    setDraft(startDraft(booking.preOrder));
    setRefused([]);
  }, [booking.preOrder?.updatedAtUtc, booking.preOrder]);

  const priced = useMemo(
    () => priceDraft(draft, { preOrder: saved, menu, refused, seen }),
    [draft, saved, menu, refused, seen],
  );
  const categories = menu?.categories ?? [];
  const activeCategory = categoryId ?? categories[0]?.id ?? null;
  const items = categories.find((category) => category.id === activeCategory)?.items ?? [];

  const editable = canEditPreOrder(booking, now) || replace.isPending;
  if (!editable) return <Closed booking={booking} now={now} onDone={onDone} />;

  const command = draftCommand(draft);
  const violations = draft.lines.length > 0 ? preOrderDraftViolations(command) : [];
  const dirty = isDirty(draft, saved);
  const empty = draft.lines.length === 0;
  const blocked = priced.unavailable.length > 0 || violations.length > 0;
  const pending = replace.isPending || clear.isPending;

  const refusedOne =
    replace.error instanceof PreOrderItemsUnavailableError && replace.error.items.length === 1
      ? replace.error.items[0]?.menuItemId
      : undefined;
  const failure = replace.isError
    ? preOrderFailure(replace.error, booking.timeZoneId, locale, {
        dishName: priced.lines.find((line) => line.menuItemId === refusedOne)?.name,
      })
    : null;
  // The removal's own failure, said in its sheet — never a save's.
  const clearFailure = clear.isError
    ? preOrderFailure(clear.error, booking.timeZoneId, locale)
    : null;
  const violationText = (field: string): string | null => {
    const found = violations.find((violation) => violation.field === field);
    if (!found) return null;
    const limit = preOrderLimitLine(found);
    return t(limit.key, limit.params);
  };

  /**
   * Any change clears the last save's failure, except a sold-out refusal while
   * a dish it named is still on the list: that sentence stays until the dish
   * goes, then goes with it.
   */
  const edit = (next: EditorDraft) => {
    setDraft(next);
    if (!replace.isError) return;
    const error = replace.error;
    const stillRefused =
      error instanceof PreOrderItemsUnavailableError &&
      next.lines.some((line) => error.items.some((item) => item.menuItemId === line.menuItemId));
    if (!stillRefused) replace.reset();
  };

  const save = () => {
    if (blocked || pending) return;
    const key = JSON.stringify(command);
    if (attempt.current?.key !== key) attempt.current = { key, id: newCommandId() };
    replace.mutate(
      { reservationId: booking.id, ...command, clientCommandId: attempt.current.id },
      {
        onSuccess: () => {
          attempt.current = null;
          onDone();
        },
        onError: (error) => {
          if (error instanceof PreOrderItemsUnavailableError) {
            setRefused(error.items.map((item) => item.menuItemId));
            // The picker's menu is what was stale: read it again, so a dish
            // sold out since cannot be added straight back.
            void menuQuery.refetch();
          }
          if (preOrderFailure(error, booking.timeZoneId, locale).kind === 'conflict') {
            resync.current = true;
          }
        },
      },
    );
  };

  const doClear = () => {
    clearId.current ??= newCommandId();
    clear.mutate(
      { reservationId: booking.id, clientCommandId: clearId.current },
      {
        onSuccess: () => {
          clearId.current = null;
          setConfirmingClear(false);
          onDone();
        },
      },
    );
  };

  const until = booking.preOrderEditableUntilUtc
    ? editableUntilWords(booking.preOrderEditableUntilUtc, booking.timeZoneId, locale, t, now)
    : null;
  const swap = priced.lines.find((line) => line.unavailable);

  return (
    <>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {until ? (
            <Text style={styles.muted}>{t('preOrder.editableUntil', { when: until })}</Text>
          ) : null}

          <Card style={styles.chosen}>
            <SectionHeader
              label={t('preOrder.chosen')}
              icon={PRE_ORDER_ICON}
              {...(empty ? {} : { hint: t('preOrder.dishes', { count: draftQuantity(draft) }) })}
            />
            {empty ? <Text style={styles.muted}>{t('preOrder.empty')}</Text> : null}
            {priced.lines.map((line) => {
              const name = line.name || t('preOrder.title');
              const noteError = violationText(`lines[${line.index}].note`);
              const quantityError = violationText(`lines[${line.index}].quantity`);
              return (
                <View key={`${line.menuItemId}-${line.index}`} style={styles.line}>
                  <View style={styles.lineTop}>
                    <View style={styles.lineText}>
                      <Text style={[styles.lineName, line.unavailable && styles.lineOut]}>
                        {name}
                      </Text>
                      <Text style={styles.linePrice}>{pricedLineText(line, locale)}</Text>
                      {line.unavailable ? (
                        <Text style={styles.outBadge}>{t('preOrder.unavailableNow')}</Text>
                      ) : null}
                    </View>
                    {line.unavailable ? (
                      <Button
                        label={t('preOrder.removeLine')}
                        accessibilityLabel={t('preOrder.removeLineNamed', { name })}
                        variant="secondary"
                        size="small"
                        fullWidth={false}
                        disabled={pending}
                        onPress={() => {
                          edit(removeLine(draft, line.index));
                          setRefused(refused.filter((id) => id !== line.menuItemId));
                        }}
                      />
                    ) : (
                      <Stepper
                        name={name}
                        quantity={line.quantity}
                        canAdd={canAddMoreAt(draft, line.index)}
                        disabled={pending}
                        onAdd={() => edit(addOneAt(draft, line.index))}
                        onRemove={() => edit(removeOneAt(draft, line.index))}
                      />
                    )}
                  </View>
                  {quantityError ? <Text style={styles.fieldError}>{quantityError}</Text> : null}
                  {line.unavailable ? null : (
                    <TextInput
                      style={styles.input}
                      value={line.note}
                      onChangeText={(value) => edit(setLineNote(draft, line.index, value))}
                      placeholder={t('preOrder.lineNotePlaceholder')}
                      accessibilityLabel={t('preOrder.lineNoteLabel', { name })}
                      maxLength={PRE_ORDER_LIMITS.maxLineNote}
                      editable={!pending}
                    />
                  )}
                  {noteError ? <Text style={styles.fieldError}>{noteError}</Text> : null}
                  {line.unavailable ? null : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('preOrder.removeLineNamed', { name })}
                      onPress={() => edit(removeLine(draft, line.index))}
                      disabled={pending}
                      style={styles.removeLink}
                    >
                      <Text style={styles.removeText}>{t('preOrder.removeLine')}</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
            {swap ? (
              <Text style={styles.warn}>{t('preOrder.unavailableSwap', { name: swap.name })}</Text>
            ) : null}
            {violationText('lines') ? (
              <Text style={styles.fieldError}>{violationText('lines')}</Text>
            ) : null}

            <Text style={styles.label}>{t('preOrder.noteLabel')}</Text>
            <TextInput
              style={[styles.input, styles.noteInput]}
              value={draft.note}
              onChangeText={(value) => edit(setNote(draft, value))}
              placeholder={t('preOrder.notePlaceholder')}
              accessibilityLabel={t('preOrder.noteLabel')}
              maxLength={PRE_ORDER_LIMITS.maxNote}
              multiline
              editable={!pending}
            />
            {violationText('note') ? (
              <Text style={styles.fieldError}>{violationText('note')}</Text>
            ) : null}
            <Text style={styles.muted}>{t('preOrder.priceNote')}</Text>
          </Card>

          <SectionHeader label={t('preOrder.menuTitle')} />
          {menuQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : menuQuery.isError ? (
            <View style={styles.menuState}>
              <Text style={styles.muted}>{t('preOrder.menuError')}</Text>
              <Button
                label={t('preOrder.retry')}
                variant="outline"
                fullWidth={false}
                onPress={() => void menuQuery.refetch()}
              />
            </View>
          ) : categories.length === 0 ? (
            <Text style={styles.muted}>{t('preOrder.noMenu')}</Text>
          ) : (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
              >
                {categories.map((category) => (
                  <Chip
                    key={category.id}
                    label={category.name}
                    selected={category.id === activeCategory}
                    accessibilityRole="tab"
                    onPress={() => setCategoryId(category.id)}
                  />
                ))}
              </ScrollView>
              {items.map((item) => (
                <DishRow
                  key={item.id}
                  item={item}
                  quantity={quantityOf(draft, item.id)}
                  canAdd={canAddMore(draft, item.id)}
                  disabled={pending}
                  onAdd={() => edit(addOne(draft, item.id))}
                  onRemove={() => edit(removeOne(draft, item.id))}
                />
              ))}
            </>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>
          {failure ? (
            <Text style={styles.failure} accessibilityRole="alert">
              {t(failure.line.key, failure.line.params)}
            </Text>
          ) : null}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('preOrder.total')}</Text>
            <Text style={styles.total} accessibilityLiveRegion="polite">
              {formatDram(priced.totalDram, locale)}
            </Text>
          </View>
          {empty && saved ? (
            <Button
              label={t('preOrder.remove')}
              variant="destructive"
              disabled={pending}
              onPress={() => {
                clear.reset();
                setConfirmingClear(true);
              }}
            />
          ) : (
            <Button
              label={replace.isPending ? t('preOrder.saving') : t('preOrder.save')}
              size="large"
              busy={replace.isPending}
              disabled={empty || blocked || pending || (!dirty && !replace.isError)}
              onPress={save}
            />
          )}
        </View>
      </KeyboardAvoidingView>

      <ConfirmSheet
        visible={confirmingClear}
        title={t('preOrder.removeTitle')}
        body={t('preOrder.removeBody')}
        confirmLabel={t('preOrder.removeConfirm')}
        cancelLabel={t('preOrder.removeKeep')}
        busyLabel={t('preOrder.removing')}
        busy={clear.isPending}
        error={clearFailure ? t(clearFailure.line.key, clearFailure.line.params) : null}
        destructive
        onConfirm={doClear}
        onCancel={() => setConfirmingClear(false)}
      />
    </>
  );
}

/**
 * Past the window, sent, or the branch stopped taking them: said, with the way
 * back — and, while the pre-order may still be cleared (the branch stopped
 * taking them, its window still open), "Remove", asked first, as the body says.
 */
function Closed({
  booking,
  now,
  onDone,
}: {
  readonly booking: Booking;
  readonly now: Date;
  readonly onDone: () => void;
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const clear = useClearPreOrder();
  const [confirming, setConfirming] = useState(false);
  /** One command id per removal, kept across a retry of the same one. */
  const clearId = useRef<string | null>(null);
  const view = preOrderView(booking, now);
  const clearable = canClearPreOrder(booking, now);
  const clearFailure = clear.isError
    ? preOrderFailure(clear.error, booking.timeZoneId, locale)
    : null;
  const remove = () => {
    clearId.current ??= newCommandId();
    clear.mutate(
      { reservationId: booking.id, clientCommandId: clearId.current },
      {
        onSuccess: () => {
          clearId.current = null;
          setConfirming(false);
          onDone();
        },
      },
    );
  };
  const body =
    view.kind === 'sent'
      ? t('preOrder.error.alreadySent')
      : view.kind === 'cancelled'
        ? t('preOrder.state.cancelledBody')
        : view.kind === 'editable'
          ? t('preOrder.state.notAcceptedBody')
          : view.kind === 'none'
            ? t('preOrder.error.notAccepted')
            : t('preOrder.state.lockedBody');
  return (
    <View style={styles.closed}>
      <Ionicons name="lock-closed-outline" size={iconSize.xl} color={colors.textMuted} />
      <Text style={styles.closedTitle} accessibilityRole="header">
        {t('preOrder.closedTitle')}
      </Text>
      <Text style={styles.closedBody}>{body}</Text>
      {clearable ? (
        <Button
          label={t('preOrder.remove')}
          variant="destructive"
          onPress={() => {
            clear.reset();
            setConfirming(true);
          }}
        />
      ) : null}
      <Button label={t('preOrder.back')} variant="secondary" onPress={onDone} />
      <ConfirmSheet
        visible={confirming && clearable}
        title={t('preOrder.removeTitle')}
        body={t('preOrder.removeBody')}
        confirmLabel={t('preOrder.removeConfirm')}
        cancelLabel={t('preOrder.removeKeep')}
        busyLabel={t('preOrder.removing')}
        busy={clear.isPending}
        error={clearFailure ? t(clearFailure.line.key, clearFailure.line.params) : null}
        destructive
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}

/** One dish on the picker: name, price, and + — a − n + once it is chosen. */
function DishRow({
  item,
  quantity,
  canAdd,
  disabled,
  onAdd,
  onRemove,
}: {
  readonly item: MenuItemDetail;
  readonly quantity: number;
  readonly canAdd: boolean;
  readonly disabled: boolean;
  readonly onAdd: () => void;
  readonly onRemove: () => void;
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  return (
    <View style={[styles.dish, quantity > 0 && styles.dishOn]}>
      <View style={styles.dishText}>
        <Text style={styles.dishName}>{item.name}</Text>
        {item.description ? (
          <Text style={styles.dishDesc} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
        <Text style={styles.dishPrice}>{formatDram(item.priceDram, locale)}</Text>
      </View>
      {quantity === 0 ? (
        <RoundPress
          icon="add"
          accessibilityLabel={t('preOrder.addDish', { name: item.name })}
          disabled={disabled || !canAdd}
          onPress={onAdd}
          filled
        />
      ) : (
        <Stepper
          name={item.name}
          quantity={quantity}
          canAdd={canAdd}
          disabled={disabled}
          onAdd={onAdd}
          onRemove={onRemove}
        />
      )}
    </View>
  );
}

function Stepper({
  name,
  quantity,
  canAdd,
  disabled,
  onAdd,
  onRemove,
}: {
  readonly name: string;
  readonly quantity: number;
  readonly canAdd: boolean;
  readonly disabled: boolean;
  readonly onAdd: () => void;
  readonly onRemove: () => void;
}) {
  const { t } = useTranslation('diner');
  return (
    <View
      role="group"
      accessibilityLabel={t('preOrder.quantity', { name, count: quantity })}
      style={styles.stepper}
    >
      <RoundPress
        icon="remove"
        accessibilityLabel={t('preOrder.fewer', { name })}
        disabled={disabled}
        onPress={onRemove}
      />
      <Text style={styles.quantity} accessibilityLiveRegion="polite">
        {quantity}
      </Text>
      <RoundPress
        icon="add"
        accessibilityLabel={t('preOrder.more', { name })}
        disabled={disabled || !canAdd}
        onPress={onAdd}
      />
    </View>
  );
}

/** A 44pt round press with a glyph. */
function RoundPress({
  icon,
  accessibilityLabel,
  disabled,
  onPress,
  filled = false,
}: {
  readonly icon: 'add' | 'remove';
  readonly accessibilityLabel: string;
  readonly disabled: boolean;
  readonly onPress: () => void;
  readonly filled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.round,
        filled && styles.roundFilled,
        disabled && styles.roundDisabled,
        pressed && styles.roundPressed,
      ]}
    >
      <Ionicons name={icon} size={iconSize.md} color={colors.onPrimary} />
    </Pressable>
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
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 20, lineHeight: 26, color: colors.text },
  where: { ...typography.caption, color: colors.textMuted },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.xs,
    paddingBottom: space.lg,
    gap: space.md,
  },
  muted: { ...typography.caption, color: colors.textMuted },
  warn: { ...typography.caption, color: colors.warningInk },
  chosen: { gap: space.md },
  line: {
    gap: space.sm,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  lineTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  lineText: { flex: 1, minWidth: 0, gap: 2 },
  lineName: { ...typography.body, fontWeight: fontWeight.medium, color: colors.text },
  lineOut: { color: colors.textMuted },
  linePrice: { ...typography.caption, ...tabularNumbers, color: colors.textMuted },
  outBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: colors.warningSoft,
    color: colors.warningInk,
    ...typography.caption,
    fontWeight: fontWeight.bold,
  },
  label: { ...typography.caption, fontWeight: fontWeight.bold, color: colors.text },
  input: {
    minHeight: layout.touchTarget,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
    ...typography.body,
    fontSize: 16,
    color: colors.text,
  },
  noteInput: { minHeight: 88, textAlignVertical: 'top' },
  fieldError: { ...typography.caption, color: colors.errorInk },
  removeLink: {
    alignSelf: 'flex-start',
    minHeight: layout.touchTarget,
    justifyContent: 'center',
  },
  removeText: { ...typography.caption, fontWeight: fontWeight.bold, color: colors.primary },
  menuState: { alignItems: 'flex-start', gap: space.sm },
  chips: { gap: space.sm, paddingVertical: space.xs },
  dish: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
    borderRadius: radius.tile,
    backgroundColor: colors.surface,
  },
  dishOn: { backgroundColor: colors.primarySoft },
  dishText: { flex: 1, minWidth: 0, gap: 2 },
  dishName: { ...typography.body, fontWeight: fontWeight.medium, color: colors.text },
  dishDesc: { ...typography.caption, color: colors.textMuted },
  dishPrice: {
    ...typography.body,
    ...tabularNumbers,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  quantity: {
    minWidth: 20,
    textAlign: 'center',
    ...typography.body,
    ...tabularNumbers,
    fontWeight: fontWeight.bold,
    color: colors.onPrimary,
  },
  round: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundFilled: { backgroundColor: colors.brand },
  roundDisabled: { opacity: 0.4 },
  roundPressed: { opacity: 0.8 },
  footer: {
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    backgroundColor: colors.sheet,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  failure: {
    ...typography.caption,
    color: colors.errorInk,
    padding: space.sm,
    borderRadius: radius.tile,
    overflow: 'hidden',
    backgroundColor: colors.errorSoft,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  totalLabel: { ...typography.body, fontWeight: fontWeight.bold, color: colors.text },
  total: {
    ...typography.h3,
    ...tabularNumbers,
    color: colors.primary,
  },
  closed: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },
  closedTitle: { ...typography.h3, color: colors.text, textAlign: 'center' },
  closedBody: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
});
