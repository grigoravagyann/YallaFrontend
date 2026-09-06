import {
  actionIsLive,
  canExtendHold,
  isHoldAlreadyExtended,
  isOffline,
  staleTime,
  type ExtendHoldOutcome,
  type ReservationState,
} from '@yalla/api';
import { useGateway } from '@yalla/api/react';
import { formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { newCommandId } from '../lib/commandId';

/**
 * The two things a notification asked the diner to do, on the screen it lands on.
 *
 * **Rendered from the booking's state as it is right now, never from the
 * notification.** A reminder fires an hour ahead and a nudge fires after the
 * slot; either can be read from a lock screen the next morning. Offering
 * "Cancel" on a booking that was cancelled last night, or "Extend hold" to a
 * party already sitting at the table, is how people learn that the buttons on a
 * notification mean nothing. So the payload decides *which screen*, and this
 * query decides *what is offered*.
 *
 * It reads through `getReservationState` rather than `getBooking`: the rich
 * `Booking` contract carries six fields no reservation endpoint has, and the
 * bookings screens are still on the mock because of it. What is real is this
 * narrower shape, and it is exactly what deciding an action needs.
 */

export const reservationKeys = {
  state: (reservationId: string) => ['reservationState', reservationId] as const,
};

export interface ReservationActionsProps {
  readonly reservationId: string;
}

export function ReservationActions({ reservationId }: ReservationActionsProps) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const gateway = useGateway();
  const queryClient = useQueryClient();

  const {
    data: state,
    isLoading,
    isError,
  } = useQuery({
    queryKey: reservationKeys.state(reservationId),
    queryFn: () => gateway.getReservationState(reservationId),
    // Read on landing, and treated as stale immediately: the whole point is
    // that what this device last knew may be hours out of date.
    staleTime: 0,
    gcTime: staleTime.frequent,
  });

  /**
   * One id per reservation, reused on every retry of the same intent.
   *
   * Regenerating it would turn a retry after a lost response into a genuine
   * second attempt, and a genuine second attempt at extending a hold is refused
   * — which would put "you have already let them know" in front of somebody
   * whose first tap never reached the server.
   */
  const extendCommandId = useRef<string | null>(null);

  const [outcome, setOutcome] = useState<
    | { readonly kind: 'extended'; readonly result: ExtendHoldOutcome }
    | { readonly kind: 'alreadyExtended' }
    | { readonly kind: 'cancelled' }
    | { readonly kind: 'offline' }
    | { readonly kind: 'failed' }
    | null
  >(null);

  const cancel = useMutation({
    mutationFn: () => gateway.cancelReservation({ reservationId }),
    retry: false,
    onSuccess: (next: ReservationState) => {
      queryClient.setQueryData(reservationKeys.state(reservationId), next);
      setOutcome({ kind: 'cancelled' });
    },
    onError: (error: unknown) => {
      setOutcome({ kind: isOffline(error) ? 'offline' : 'failed' });
    },
  });

  const extend = useMutation({
    mutationFn: () => {
      extendCommandId.current ??= newCommandId();
      return gateway.extendReservationHold({
        reservationId,
        clientCommandId: extendCommandId.current,
      });
    },
    retry: false,
    onSuccess: (result) => setOutcome({ kind: 'extended', result }),
    onError: (error: unknown) => {
      // The specific message, not a generic failure. The diner did the thing
      // the notification asked; being told "something went wrong" would make
      // them try again, and again, at a table that is being held for somebody.
      if (isHoldAlreadyExtended(error)) {
        setOutcome({ kind: 'alreadyExtended' });
        return;
      }
      setOutcome({ kind: isOffline(error) ? 'offline' : 'failed' });
    },
  });

  if (isLoading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={color.primary} />
      </View>
    );
  }

  // A booking that could not be read is not a booking with no actions — it is a
  // booking whose state is unknown, and offering a cancel against it would be a
  // guess. Saying so is the only honest option.
  if (isError || !state) {
    return (
      <View style={styles.card}>
        <Text style={styles.note}>{t('push.actions.unknown')}</Text>
      </View>
    );
  }

  if (outcome) {
    return (
      <View style={styles.card}>
        <Text style={styles.note}>
          {outcome.kind === 'extended'
            ? t('push.actions.extended', {
                time: formatTime(outcome.result.holdExpiresAtUtc, state.timeZoneId, locale),
              })
            : outcome.kind === 'alreadyExtended'
              ? t('push.actions.alreadyExtended')
              : outcome.kind === 'cancelled'
                ? t('push.actions.cancelled')
                : outcome.kind === 'offline'
                  ? t('push.actions.offline')
                  : t('push.actions.failed')}
        </Text>
      </View>
    );
  }

  // The stale-action rule. Everything past `confirmed` or `pendingApproval` —
  // seated, completed, cancelled by either side, no-show — offers nothing, and
  // says which of them it is rather than rendering an empty card.
  if (!actionIsLive(state.status)) {
    return (
      <View style={styles.card}>
        <Text style={styles.note}>{t(`push.actions.stale.${state.status}`)}</Text>
      </View>
    );
  }

  const busy = cancel.isPending || extend.isPending;

  return (
    <View style={styles.card}>
      {/* Only a confirmed booking holds a table, so only a confirmed one can
          extend that hold. A pending booking has nothing to extend. */}
      {canExtendHold(state.status) ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => extend.mutate()}
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryText}>
            {extend.isPending ? t('push.actions.working') : t('push.action.extendHold')}
          </Text>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={() => cancel.mutate()}
        style={({ pressed }) => [styles.destructive, pressed && styles.pressed]}
      >
        <Text style={styles.destructiveText}>
          {cancel.isPending ? t('push.actions.working') : t('push.action.cancel')}
        </Text>
      </Pressable>

      <Text style={styles.hint}>{t('push.actions.hint')}</Text>
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
  hint: { fontSize: fontSize.xs, lineHeight: lineHeight.xs, color: color.mutedForeground },
  secondary: {
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  secondaryText: { fontWeight: fontWeight.bold, color: color.foreground },
  destructive: {
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.danger,
  },
  destructiveText: { fontWeight: fontWeight.bold, color: color.danger },
  pressed: { opacity: 0.85 },
});
