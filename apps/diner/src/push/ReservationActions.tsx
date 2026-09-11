import { type Booking, type ExtendHoldOutcome } from '@yalla/api';
import { useGateway } from '@yalla/api/react';
import { formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useMutation } from '@tanstack/react-query';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { useNow } from '../hooks/useNow';
import { canKeepTable, keepTableFailureKey } from '../lib/bookingActions';
import { newCommandId } from '../lib/commandId';

/**
 * "Keep my table", on the booking it belongs to.
 *
 * Decided from the booking's state **now**, never from the notification that
 * led here: offered only while a confirmed booking's time has come and not yet
 * gone, which is the only time the server will hold the table longer. It used
 * to be offered on every confirmed booking, where a tap three days early spent
 * the one extension and pinged the floor tablets.
 *
 * Cancel is not here. The detail screen has one cancel control, driven by the
 * same booking, so two buttons can no longer disagree about whether it is
 * still live.
 */

export const reservationKeys = {
  state: (reservationId: string) => ['reservationState', reservationId] as const,
};

export function KeepTableAction({ booking }: { readonly booking: Booking }) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const gateway = useGateway();
  const now = useNow(30_000);

  /**
   * One id per booking, reused on every retry of the same intent.
   *
   * Regenerating it would turn a retry after a lost response into a genuine
   * second attempt, and a second attempt is refused as "already extended" —
   * which would say that to somebody whose first tap never arrived.
   */
  const commandId = useRef<string | null>(null);
  const [outcome, setOutcome] = useState<
    | { readonly kind: 'extended'; readonly result: ExtendHoldOutcome }
    | { readonly kind: 'refused'; readonly key: string }
    | null
  >(null);

  const extend = useMutation({
    mutationFn: () => {
      commandId.current ??= newCommandId();
      return gateway.extendReservationHold({
        reservationId: booking.id,
        clientCommandId: commandId.current,
      });
    },
    retry: false,
    onSuccess: (result) => setOutcome({ kind: 'extended', result }),
    // Each refusal by its own sentence: not started yet, none offered, already
    // used. "Something went wrong" makes a late diner tap again and again.
    onError: (error: unknown) => setOutcome({ kind: 'refused', key: keepTableFailureKey(error) }),
  });

  if (outcome) {
    return (
      <View style={styles.card}>
        <Text style={styles.note}>
          {outcome.kind === 'extended'
            ? t('push.actions.extended', {
                time: formatTime(outcome.result.holdExpiresAtUtc, booking.timeZoneId, locale),
              })
            : t(outcome.key)}
        </Text>
      </View>
    );
  }

  if (!canKeepTable(booking, now)) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.hint}>{t('push.actions.keepTableHint')}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: extend.isPending, busy: extend.isPending }}
        disabled={extend.isPending}
        onPress={() => extend.mutate()}
        style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
      >
        <Text style={styles.secondaryText}>
          {extend.isPending ? t('push.actions.working') : t('push.action.extendHold')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.borderSoft,
    backgroundColor: color.surface,
  },
  note: { fontSize: fontSize.md, lineHeight: lineHeight.md, color: color.foreground },
  hint: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, color: color.mutedForeground },
  secondary: {
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  secondaryText: { fontWeight: fontWeight.bold, color: color.foreground },
  pressed: { opacity: 0.85 },
});
