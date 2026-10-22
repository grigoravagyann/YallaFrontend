import {
  newCommandId,
  onYourWayView,
  preOrderFailure,
  preOrderStateTone,
  preOrderView,
  type Booking,
  type PreOrder,
  type PreOrderViewState,
} from '@yalla/api';
import { useClearPreOrder } from '../../data/preOrderQueries';
import { formatDayAndTime, formatDram, type Locale } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  colors,
  fontWeight,
  iconSize,
  radius,
  space,
  tabularNumbers,
  typography,
  type IoniconName,
} from '../../theme';
import { Button } from '../Button';
import { Card } from '../Card';
import { ConfirmSheet } from '../ConfirmSheet';
import { SectionHeader } from '../SectionHeader';
import { Text } from '../Text';

/** The pre-order's glyph: a plate and cutlery, as the menu's. */
export const PRE_ORDER_ICON: IoniconName = 'restaurant-outline';

type Translate = ReturnType<typeof useTranslation>['t'];

/** "Tomorrow, 17:00" for a pre-order's window, in the branch's clock; lower-cased mid-sentence. */
export function editableUntilWords(
  until: string,
  timeZoneId: string,
  locale: Locale,
  t: Translate,
  now: Date,
): string {
  const moment = formatDayAndTime(until, timeZoneId, locale, now);
  const day =
    moment.day === 'today'
      ? t('booking.today').toLocaleLowerCase(locale)
      : moment.day === 'tomorrow'
        ? t('booking.tomorrow').toLocaleLowerCase(locale)
        : moment.date;
  return `${day}, ${moment.time}`;
}

/**
 * A booking's pre-order, on the booking (2026-10-21).
 *
 * - None yet and the branch takes them: what it is, until when, and "Add a pre-order".
 * - One there: the dishes at their locked prices, the note and the total, and
 *   what has become of it — changeable until two hours before; then "your
 *   table will be ready", sent to the kitchen, waiting because the venue could
 *   not reach the guest, or cancelled with the booking.
 * - A dish sold out since is marked, and the guest is asked to swap or remove
 *   it while they still can; after the lock, to call the venue.
 *
 * "Remove" asks first: the dishes will not be cooked, the booking stays.
 */
export function PreOrderCard({
  booking,
  now,
  onEdit,
  style,
}: {
  readonly booking: Booking;
  readonly now: Date;
  /** Opens the editor; absent where the card is read-only. */
  readonly onEdit?: (() => void) | undefined;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const view = preOrderView(booking, now);
  const clear = useClearPreOrder();
  const [confirming, setConfirming] = useState(false);
  /** One command id per removal, kept across a retry of the same one. */
  const commandId = useRef<string | null>(null);

  if (view.kind === 'none') return null;

  const until =
    view.kind === 'offer' || view.kind === 'editable'
      ? editableUntilWords(view.editableUntilUtc, booking.timeZoneId, locale, t, now)
      : null;

  if (view.kind === 'offer') {
    return (
      <Card style={[styles.card, style]}>
        <SectionHeader label={t('preOrder.title')} icon={PRE_ORDER_ICON} />
        <Text style={styles.body}>{t('preOrder.offerBody')}</Text>
        {until ? (
          <Text style={styles.muted}>{t('preOrder.editableUntil', { when: until })}</Text>
        ) : null}
        {onEdit ? (
          <Button label={t('preOrder.add')} icon={PRE_ORDER_ICON} onPress={onEdit} />
        ) : null}
      </Card>
    );
  }

  const { preOrder } = view;
  const failure = clear.isError
    ? preOrderFailure(clear.error, booking.timeZoneId, locale).line
    : null;

  const remove = () => {
    commandId.current ??= newCommandId();
    clear.mutate(
      { reservationId: booking.id, clientCommandId: commandId.current },
      {
        onSuccess: () => {
          commandId.current = null;
          setConfirming(false);
        },
      },
    );
  };

  return (
    <Card style={[styles.card, style]}>
      <SectionHeader
        label={t('preOrder.title')}
        icon={PRE_ORDER_ICON}
        hint={t('preOrder.dishes', { count: dishCount(preOrder) })}
      />
      <PreOrderStateNote view={view} kitchen={preOrder.kitchenStatus} t={t} />
      <PreOrderLines preOrder={preOrder} locale={locale} />
      {view.kind === 'editable' && preOrder.lines.some((line) => !line.availableNow) ? (
        <Text style={styles.warn}>
          {t('preOrder.unavailableSwap', {
            name: preOrder.lines.find((line) => !line.availableNow)?.name ?? '',
          })}
        </Text>
      ) : view.kind === 'locked' && preOrder.lines.some((line) => !line.availableNow) ? (
        <Text style={styles.warn}>{t('preOrder.unavailableCall')}</Text>
      ) : null}

      {view.kind === 'editable' ? (
        <>
          {view.canEdit && until ? (
            <Text style={styles.muted}>{t('preOrder.editableUntil', { when: until })}</Text>
          ) : null}
          {!view.canEdit ? (
            <Text style={styles.muted}>{t('preOrder.state.notAcceptedBody')}</Text>
          ) : null}
          <View style={styles.actions}>
            {view.canEdit && onEdit ? (
              <Button
                label={t('preOrder.edit')}
                variant="secondary"
                icon="pencil-outline"
                onPress={onEdit}
              />
            ) : null}
            {view.canClear ? (
              <Button
                label={t('preOrder.remove')}
                variant="text"
                onPress={() => {
                  clear.reset();
                  setConfirming(true);
                }}
              />
            ) : null}
          </View>
        </>
      ) : null}

      <ConfirmSheet
        visible={confirming && view.kind === 'editable' && view.canClear}
        title={t('preOrder.removeTitle')}
        body={t('preOrder.removeBody')}
        confirmLabel={t('preOrder.removeConfirm')}
        cancelLabel={t('preOrder.removeKeep')}
        busyLabel={t('preOrder.removing')}
        busy={clear.isPending}
        error={failure ? t(failure.key, failure.params) : null}
        destructive
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      />
    </Card>
  );
}

/**
 * One line on a booking card: "Pre-order · 3 dishes · Sent to the kitchen", or
 * "Are you on your way?" while that is asked. Nothing when there is neither.
 */
export function PreOrderSummaryLine({
  booking,
  now,
  style,
}: {
  readonly booking: Booking;
  readonly now: Date;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation('diner');
  if (onYourWayView({ ...booking, startUtc: booking.slotUtc }, now) === 'ask') {
    return (
      <View style={[styles.summary, style]}>
        <Ionicons name="navigate-outline" size={iconSize.sm} color={colors.primary} />
        <Text numberOfLines={1} style={[styles.summaryText, styles.summaryAsk]}>
          {t('preOrder.onYourWay.title')}
        </Text>
      </View>
    );
  }
  const view = preOrderView(booking, now);
  if (view.kind === 'none' || view.kind === 'offer') return null;
  const state =
    view.kind === 'sent'
      ? t('preOrder.state.sentTitle')
      : view.kind === 'notComing'
        ? t('preOrder.state.notComingTitle')
        : null;
  const text = [
    t('preOrder.title'),
    t('preOrder.dishes', { count: dishCount(view.preOrder) }),
    state,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={[styles.summary, style]}>
      <Ionicons name={PRE_ORDER_ICON} size={iconSize.sm} color={colors.textMuted} />
      <Text
        numberOfLines={1}
        style={[styles.summaryText, view.kind === 'cancelled' && styles.summaryOff]}
      >
        {text}
      </Text>
    </View>
  );
}

function dishCount(preOrder: PreOrder): number {
  return preOrder.lines.reduce((sum, line) => sum + line.quantity, 0);
}

/**
 * What has become of it, in one title and a sentence, in the tone
 * `preOrderStateTone` gives it — a ticket the venue took off is said plainly,
 * never in the green of good news. Editable says nothing: the dates do.
 */
function PreOrderStateNote({
  view,
  kitchen,
  t,
}: {
  readonly view: PreOrderViewState;
  readonly kitchen: PreOrder['kitchenStatus'];
  readonly t: Translate;
}) {
  const note: {
    readonly icon: IoniconName;
    readonly title: string;
    readonly body: string;
  } | null =
    view.kind === 'locked'
      ? {
          icon: 'checkmark-circle-outline',
          title: t('preOrder.state.lockedTitle'),
          body: t('preOrder.state.lockedBody'),
        }
      : view.kind === 'sent'
        ? {
            icon: kitchen === 'voided' ? 'remove-circle-outline' : 'flame-outline',
            title: t('preOrder.state.sentTitle'),
            body:
              kitchen && kitchen !== 'inKitchen' && kitchen !== 'new'
                ? t(`preOrder.kitchen.${kitchen}`)
                : t('preOrder.state.sentBody'),
          }
        : view.kind === 'notComing'
          ? {
              icon: 'alert-circle-outline',
              title: t('preOrder.state.notComingTitle'),
              body: t('preOrder.state.notComingBody'),
            }
          : view.kind === 'cancelled'
            ? {
                icon: 'close-circle-outline',
                title: t('preOrder.state.cancelledBody'),
                body: '',
              }
            : null;
  const tone = preOrderStateTone(view, kitchen);
  if (!note || !tone) return null;
  const ink =
    tone === 'ok' ? colors.successInk : tone === 'wait' ? colors.warningInk : colors.textMuted;
  return (
    <View
      style={[
        styles.state,
        tone === 'ok' ? styles.stateOk : tone === 'wait' ? styles.stateWait : styles.stateOff,
      ]}
      accessibilityLiveRegion="polite"
      testID={`pre-order-state-${tone}`}
    >
      <Ionicons name={note.icon} size={iconSize.sm} color={ink} />
      <View style={styles.stateText}>
        <Text style={[styles.stateTitle, { color: ink }]}>{note.title}</Text>
        {note.body ? <Text style={styles.stateBody}>{note.body}</Text> : null}
      </View>
    </View>
  );
}

/** The dishes, read-only: "2 × Khachapuri — 6 400 ֏", each note under its dish, then the total. */
export function PreOrderLines({
  preOrder,
  locale,
}: {
  readonly preOrder: PreOrder;
  readonly locale: Locale;
}) {
  const { t } = useTranslation('diner');
  return (
    <View style={styles.lines}>
      {preOrder.lines.map((line) => (
        <View key={line.id} style={styles.line}>
          <View style={styles.lineText}>
            <Text style={[styles.lineName, !line.availableNow && styles.lineOut]}>
              {`${line.quantity} × ${line.name}`}
            </Text>
            {line.note ? <Text style={styles.lineNote}>{line.note}</Text> : null}
            {!line.availableNow ? (
              <Text style={styles.outBadge}>{t('preOrder.unavailableNow')}</Text>
            ) : null}
          </View>
          <Text style={styles.linePrice}>{formatDram(line.lineTotalDram, locale)}</Text>
        </View>
      ))}
      {preOrder.note ? (
        <Text style={styles.bookingNote}>
          <Text style={styles.bookingNoteLabel}>{`${t('preOrder.noteShown')} `}</Text>
          {preOrder.note}
        </Text>
      ) : null}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{t('preOrder.total')}</Text>
        <Text style={styles.total}>{formatDram(preOrder.totalDram, locale)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  body: { ...typography.body, color: colors.text },
  muted: { ...typography.caption, color: colors.textMuted },
  warn: { ...typography.caption, color: colors.warningInk },
  actions: { gap: space.sm },
  state: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.tile,
  },
  stateOk: { backgroundColor: colors.successSoft },
  stateWait: { backgroundColor: colors.warningSoft },
  stateOff: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  stateText: { flex: 1, gap: 2 },
  stateTitle: { ...typography.body, fontWeight: fontWeight.bold },
  stateBody: { ...typography.caption, color: colors.text },
  lines: { gap: space.sm },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  lineText: { flex: 1, minWidth: 0, gap: 2 },
  lineName: { ...typography.body, color: colors.text },
  lineOut: { color: colors.textMuted },
  lineNote: { ...typography.caption, color: colors.textMuted },
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
  linePrice: { ...typography.body, ...tabularNumbers, color: colors.text },
  bookingNote: { ...typography.caption, color: colors.text },
  bookingNoteLabel: { fontWeight: fontWeight.bold },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  totalLabel: { ...typography.body, fontWeight: fontWeight.bold, color: colors.text },
  total: {
    ...typography.body,
    ...tabularNumbers,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  summaryText: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
  summaryAsk: { color: colors.primary, fontWeight: fontWeight.bold },
  summaryOff: { textDecorationLine: 'line-through' },
});
