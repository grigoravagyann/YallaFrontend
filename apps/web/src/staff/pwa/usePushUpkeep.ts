import {
  useSaveStaffNotificationSettings,
  useStaffGateway,
  useStaffNotificationSettings,
} from '@yalla/api/react';
import { useLocale } from '@yalla/i18n';
import { useEffect, useRef } from 'react';
import { keepPushCurrent, notificationPermission, pushSupport } from './webPush';

/**
 * Keep a device's pushes working without anybody opening the switches:
 *
 * - **The subscription.** Once per unlock, when notifications were allowed:
 *   a subscription made with an old VAPID key (a Development server makes a
 *   new pair every start), one the server dropped after the push service
 *   answered 404/410, or one the server never heard of is made again and sent
 *   (`keepPushCurrent`).
 * - **The language.** Pushes are written in the language the server has for
 *   the device; when the app's changes (More → Language), it is sent with
 *   the switches, once per change.
 *
 * Asks for nothing: a device that never allowed notifications makes no read.
 */
export function usePushUpkeep(active: boolean): void {
  const gateway = useStaffGateway();
  const { locale } = useLocale();
  const allowed = pushSupport() === 'supported' && notificationPermission() === 'granted';
  const settings = useStaffNotificationSettings(active && allowed);
  const save = useSaveStaffNotificationSettings();

  const checked = useRef(false);
  useEffect(() => {
    if (!active) {
      checked.current = false;
      return;
    }
    if (checked.current || !settings.data) return;
    checked.current = true;
    void keepPushCurrent(gateway, settings.data.subscribed).catch(() => undefined);
  }, [active, gateway, settings.data]);

  const sentLocale = useRef<string | null>(null);
  const { mutate } = save;
  useEffect(() => {
    const current = settings.data;
    if (!active || !current?.subscribed) return;
    if ((current.locale ?? 'hy') === locale || sentLocale.current === locale) return;
    sentLocale.current = locale;
    mutate({
      approvals: current.approvals,
      guestMessages: current.guestMessages,
      tableCalls: current.tableCalls,
      takeaway: current.takeaway,
      kitchenReady: current.kitchenReady,
      onlyDuringShift: current.onlyDuringShift,
      locale,
    });
  }, [active, locale, settings.data, mutate]);
}
