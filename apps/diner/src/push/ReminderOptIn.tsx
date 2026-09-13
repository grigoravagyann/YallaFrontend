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

export function ReminderOptIn({ style }: { readonly style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const gateway = useGateway();
  const [state, setState] = useState<State>('checking');

  useEffect(() => {
    let cancelled = false;
    void permissionState().then((current) => {
      if (cancelled) return;
      setState(
        current === 'granted' ? 'granted' : current === 'undetermined' ? 'offer' : 'declined',
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

    try {
      const deviceId = await registerDevice(gateway, { projectId, locale });
      // No token means no EAS project or a simulator. Permission was granted and
      // nothing will arrive anyway, so say the same thing as a decline rather
      // than claiming a reminder is coming.
      setState(deviceId ? 'granted' : 'unavailable');
    } catch {
      setState('unavailable');
    }
  }

  if (state === 'checking') return null;

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
