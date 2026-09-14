import type { YallaGateway } from '@yalla/api';
import { useGateway } from '@yalla/api/react';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Button } from '../components/Button';
import { Text } from '../components/Text';
import { projectId } from '../config';
import { colors, radius, space, typography } from '../theme';
import { permissionState, registerDevice, requestPermission } from './registration';

/**
 * Asking for the notification permission at the one moment it has earned itself.
 *
 * This renders on the booking-confirmed screen and **nowhere else**. Not on
 * launch: a permission prompt somebody sees before they understand what it is
 * for is a permission denied, and on iOS that answer is close to permanent —
 * the way back is a Settings screen nobody visits. Asked here, one line under a
 * booking that has just been made, the question answers itself: *do you want
 * reminding about this?*
 *
 * The other half is that **declining costs nothing**. The booking is already
 * made; it does not depend on this. So a "no" produces one honest sentence
 * saying the reminder will not arrive, and never a second prompt, a nag, or a
 * disabled-looking screen. A person who declines has made a reasonable choice
 * and the app should behave as though they have.
 *
 * There is deliberately no "not now" button. The OS prompt already has one —
 * declining it leaves `canAskAgain` false on iOS — and a custom pre-prompt with
 * three options is a dark pattern wearing a cardigan.
 */

type State = 'checking' | 'offer' | 'granted' | 'declined' | 'unavailable';

/**
 * How long before the start the server queues the reminder:
 * `ReservationPolicy.ReminderHoursBefore`, three hours on every branch. No API
 * response carries it, so it is written down here; if it ever becomes a
 * setting the API returns, read it from there instead.
 */
export const REMINDER_HOURS_BEFORE = 3;

const HOUR_MS = 60 * 60_000;

/**
 * Whether the server queued a reminder for a booking starting at `startUtc`.
 *
 * It queues one only while the reminder time is still ahead
 * (`ReservationService.ScheduleRemindersAsync`: `remindAt > now`), so a table
 * booked two hours out gets no reminder push and no feed row, whatever the
 * phone's permission says.
 */
export function reminderWillBeSent(
  startUtc: string,
  nowMs: number = Date.now(),
  hoursBefore: number = REMINDER_HOURS_BEFORE,
): boolean {
  const start = Date.parse(startUtc);
  return Number.isFinite(start) && start - hoursBefore * HOUR_MS > nowMs;
}

/**
 * Send this device's token up, and say what that means for the reminder. No
 * token means no EAS project or a simulator: permission was granted and nothing
 * will arrive anyway, so it reads the same as a decline rather than claiming a
 * reminder is coming.
 */
async function register(gateway: YallaGateway, locale: string): Promise<'granted' | 'unavailable'> {
  try {
    const deviceId = await registerDevice(gateway, { projectId, locale });
    return deviceId ? 'granted' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export function ReminderOptIn({
  startUtc,
  style,
}: {
  /** The booking's start, to tell whether any reminder is coming at all. */
  readonly startUtc: string;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const gateway = useGateway();
  const [state, setState] = useState<State>('checking');
  // Decided once, when the booking has just been made — the moment the server decided.
  const [willRemind] = useState(() => reminderWillBeSent(startUtc));

  useEffect(() => {
    if (!willRemind) return;
    let cancelled = false;
    void (async () => {
      let current: Awaited<ReturnType<typeof permissionState>>;
      try {
        current = await permissionState();
      } catch {
        // No notifications API here (the web build): say nothing either way.
        return;
      }
      if (cancelled) return;
      if (current !== 'granted') {
        setState(current === 'undetermined' ? 'offer' : 'declined');
        return;
      }
      // Granted on an earlier booking, or by default on older Android. The OS
      // permission says nothing about a token: with no EAS project there is
      // none, and "we will remind you" would be a promise nothing keeps. So the
      // device is registered now, and only a registered device is promised one.
      const outcome = await register(gateway, locale);
      if (!cancelled) setState(outcome);
    })();
    return () => {
      cancelled = true;
    };
  }, [willRemind, gateway, locale]);

  /**
   * Registration follows the grant immediately.
   *
   * A granted permission with no token on the server is the worst of the three
   * outcomes: the diner has agreed to be reminded and will not be, and nothing
   * anywhere says so. The locale goes with it — the backend writes in the
   * language of the most recently seen device, so this argument is where a
   * Russian speaker's Russian reminder comes from.
   */
  async function ask(): Promise<void> {
    const outcome = await requestPermission();
    if (outcome !== 'granted') {
      setState('declined');
      return;
    }

    setState(await register(gateway, locale));
  }

  // No reminder is coming for a booking this close, so there is nothing to
  // offer and nothing to promise; the booking screen says the rest.
  if (!willRemind || state === 'checking') return null;

  if (state === 'granted' || state === 'declined' || state === 'unavailable') {
    // Said once, plainly, and never again. The booking is fine; this is the one
    // thing that will (or will not) happen, and a person who turned it down
    // deserves to know that rather than to wonder later why nothing arrived.
    return (
      <View style={[styles.note, style]}>
        <Text style={styles.noteText}>
          {state === 'granted' ? t('push.optIn.granted') : t('push.optIn.declined')}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.offer, style]}>
      <Text style={styles.offerText}>{t('push.optIn.explain')}</Text>
      <Button label={t('push.optIn.allow')} fullWidth={false} onPress={() => void ask()} />
    </View>
  );
}

const styles = StyleSheet.create({
  offer: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: colors.primarySoft,
  },
  offerText: { ...typography.body, color: colors.text },
  note: { paddingHorizontal: space.xs },
  noteText: { ...typography.caption, color: colors.textMuted },
});
