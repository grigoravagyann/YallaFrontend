import {
  STAFF_NOTIFICATION_KINDS,
  type StaffNotificationKind,
  type StaffNotificationSettings,
  type StaffNotificationSwitches,
} from '@yalla/api';
import {
  queryKeys,
  useSaveStaffNotificationSettings,
  useStaffGateway,
  useStaffNotificationSettings,
  useStaffPushConfig,
} from '@yalla/api/react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useId, useState } from 'react';
import { useInstallPrompt } from '../pwa/installPrompt';
import {
  disablePush,
  enablePush,
  isIos,
  isStandalone,
  notificationPermission,
  pushSupport,
  type PushSupport,
} from '../pwa/webPush';

export interface PhoneInstallProps {
  /** Right after pairing: the "Start" button ends the screen. */
  readonly onboarding?: boolean | undefined;
  readonly onStart?: (() => void) | undefined;
  /** Test seam: what the browser can do. */
  readonly support?: PushSupport | undefined;
}

type Platform = 'ios' | 'android';

/**
 * "Two things, and you're ready" (Install artboard): add SHURJ to the home
 * screen, then turn notifications on and choose which.
 *
 * 1. **Home screen.** iPhone gets the Share → Add to Home Screen steps (iOS
 *    delivers Web Push only to an app opened from there); Android gets
 *    Chrome's own install dialog when it offers one, else the menu's words.
 * 2. **Notifications.** Ask (from the tap — Safari insists), subscribe with
 *    the server's VAPID key, tell the server; then the five switches and
 *    "only during my shift", saved as they are flipped, in the app's language.
 *
 * Also More → Notifications, without the Start button.
 */
export function PhoneInstall({ onboarding = false, onStart, support }: PhoneInstallProps) {
  const { t } = useTranslation(['staff', 'common']);
  const { locale } = useLocale();
  const ids = useId();
  const gateway = useStaffGateway();
  const queryClient = useQueryClient();
  const installPrompt = useInstallPrompt();
  const [platform, setPlatform] = useState<Platform>(() => (isIos() ? 'ios' : 'android'));
  const standalone = isStandalone() || installPrompt.installed;
  const can = support ?? pushSupport();

  const config = useStaffPushConfig(can === 'supported');
  const settings = useStaffNotificationSettings(can === 'supported');
  const save = useSaveStaffNotificationSettings();
  const [enabling, setEnabling] = useState(false);
  const [outcome, setOutcome] = useState<'denied' | 'unavailable' | 'failed' | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  const permission = notificationPermission();
  const on = Boolean(settings.data?.subscribed) && permission === 'granted';

  async function enable(): Promise<void> {
    const key = config.data?.publicKey;
    if (!key || enabling) return;
    setEnabling(true);
    setOutcome(null);
    try {
      const result = await enablePush(gateway, key);
      if (result !== 'subscribed') {
        setOutcome(result);
        return;
      }
      // Saved once now, so the server writes pushes in the app's language
      // and the switches are the person's from the first one.
      const current = settings.data ?? (await gateway.getNotificationSettings());
      await save.mutateAsync({ ...switchesOf(current), locale });
      await queryClient.invalidateQueries({ queryKey: queryKeys.staffNotificationSettings });
    } catch {
      setOutcome('failed');
    } finally {
      setEnabling(false);
    }
  }

  async function turnOff(): Promise<void> {
    await disablePush(gateway);
    await queryClient.invalidateQueries({ queryKey: queryKeys.staffNotificationSettings });
  }

  function flip(key: keyof StaffNotificationSwitches): void {
    const current = settings.data;
    if (!current) return;
    setSaveFailed(false);
    save.mutate(
      { ...switchesOf(current), [key]: !current[key], locale },
      { onError: () => setSaveFailed(true) },
    );
  }

  const tabId = (which: Platform) => `${ids}-tab-${which}`;
  const panelId = `${ids}-panel`;

  const pushBody = (() => {
    if (can === 'needsInstall')
      return <p className="ph-install-text">{t('phone.install.needsInstall')}</p>;
    if (can === 'insecure') return <p className="ph-install-text">{t('phone.install.insecure')}</p>;
    if (can === 'unsupported')
      return <p className="ph-install-text">{t('phone.install.unsupported')}</p>;
    if (config.isLoading || settings.isLoading) {
      return (
        <p className="ph-install-text" role="status">
          {t('phone.install.loading')}
        </p>
      );
    }
    if (config.isError || settings.isError) {
      return (
        <p className="ph-install-text is-error" role="alert">
          {t('phone.install.loadFailed')}
        </p>
      );
    }
    if (!config.data?.enabled) {
      return <p className="ph-install-text">{t('phone.install.serverOff')}</p>;
    }
    if (permission === 'denied' || outcome === 'denied') {
      return (
        <p className="ph-install-text is-error" role="alert">
          {t('phone.install.denied')}
        </p>
      );
    }
    if (!on || !settings.data) {
      return (
        <>
          <p className="ph-install-text">{t('phone.install.pushWhy')}</p>
          {outcome === 'unavailable' || outcome === 'failed' ? (
            <p className="ph-install-text is-error" role="alert">
              {t(outcome === 'unavailable' ? 'phone.install.unavailable' : 'phone.install.failed')}
            </p>
          ) : null}
          <button
            type="button"
            className="ph-pair-btn is-primary is-compact"
            aria-busy={enabling || undefined}
            disabled={enabling}
            onClick={() => void enable()}
          >
            {enabling ? t('phone.install.enabling') : t('phone.install.enable')}
          </button>
        </>
      );
    }
    return (
      <Switches
        settings={settings.data}
        onFlip={flip}
        saveFailed={saveFailed}
        onTurnOff={() => void turnOff()}
      />
    );
  })();

  return (
    <div className="ph-install">
      <section className="ph-install-card" aria-labelledby={`${ids}-home`}>
        <div className="ph-install-head">
          <b className="ph-install-step" aria-hidden="true">
            1
          </b>
          <h2 id={`${ids}-home`}>{t('phone.install.homeTitle')}</h2>
          {standalone ? <span className="ph-install-done">{t('phone.install.done')}</span> : null}
        </div>
        {standalone ? null : (
          <>
            <div
              className="ph-install-tabs"
              role="tablist"
              aria-label={t('phone.install.platform')}
            >
              {(['ios', 'android'] as const).map((which) => (
                <button
                  key={which}
                  type="button"
                  role="tab"
                  id={tabId(which)}
                  aria-selected={platform === which}
                  aria-controls={platform === which ? panelId : undefined}
                  tabIndex={platform === which ? 0 : -1}
                  className={platform === which ? 'is-on' : undefined}
                  onClick={() => setPlatform(which)}
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                    event.preventDefault();
                    const next = which === 'ios' ? 'android' : 'ios';
                    setPlatform(next);
                    document.getElementById(tabId(next))?.focus();
                  }}
                >
                  {which === 'ios' ? 'iPhone' : 'Android'}
                </button>
              ))}
            </div>
            <div
              id={panelId}
              role="tabpanel"
              aria-labelledby={tabId(platform)}
              className="ph-install-panel"
            >
              {platform === 'ios' ? (
                <>
                  <ol className="ph-install-list">
                    <li>{t('phone.install.ios1')}</li>
                    <li>{t('phone.install.ios2')}</li>
                    <li>{t('phone.install.ios3')}</li>
                  </ol>
                  <p className="ph-install-text is-small">{t('phone.install.iosNote')}</p>
                </>
              ) : installPrompt.available ? (
                <button
                  type="button"
                  className="ph-pair-btn is-primary is-compact"
                  onClick={() => void installPrompt.install()}
                >
                  {t('phone.install.androidInstall')}
                </button>
              ) : (
                <p className="ph-install-text">{t('phone.install.androidMenu')}</p>
              )}
            </div>
          </>
        )}
      </section>

      <section className="ph-install-card" aria-labelledby={`${ids}-push`}>
        <div className="ph-install-head">
          <b className="ph-install-step" aria-hidden="true">
            2
          </b>
          <h2 id={`${ids}-push`}>{t('phone.install.pushTitle')}</h2>
          {on ? <span className="ph-install-done">{t('phone.install.done')}</span> : null}
        </div>
        {pushBody}
      </section>

      {onboarding ? (
        <button type="button" className="ph-pair-btn is-primary" onClick={onStart}>
          {t('phone.install.start')}
        </button>
      ) : null}
    </div>
  );
}

function switchesOf(settings: StaffNotificationSettings): StaffNotificationSwitches {
  return {
    approvals: settings.approvals,
    guestMessages: settings.guestMessages,
    tableCalls: settings.tableCalls,
    takeaway: settings.takeaway,
    kitchenReady: settings.kitchenReady,
    onlyDuringShift: settings.onlyDuringShift,
  };
}

function Switches({
  settings,
  onFlip,
  saveFailed,
  onTurnOff,
}: {
  readonly settings: StaffNotificationSettings;
  readonly onFlip: (key: keyof StaffNotificationSwitches) => void;
  readonly saveFailed: boolean;
  readonly onTurnOff: () => void;
}) {
  const { t } = useTranslation(['staff']);
  const ids = useId();
  const row = (key: StaffNotificationKind | 'onlyDuringShift', label: string, help: string) => (
    <div
      key={key}
      className={key === 'onlyDuringShift' ? 'ph-switch-row is-shift' : 'ph-switch-row'}
    >
      <span className="ph-switch-text">
        <span id={`${ids}-${key}`}>{label}</span>
        <small id={`${ids}-${key}-help`}>{help}</small>
      </span>
      <button
        type="button"
        role="switch"
        className="ph-switch"
        aria-checked={settings[key]}
        aria-labelledby={`${ids}-${key}`}
        aria-describedby={`${ids}-${key}-help`}
        onClick={() => onFlip(key)}
      >
        <span aria-hidden="true" />
      </button>
    </div>
  );
  return (
    <>
      <p className="visually-hidden" role="status">
        {t('phone.install.on')}
      </p>
      {STAFF_NOTIFICATION_KINDS.map((kind) =>
        row(kind, t(`phone.install.kinds.${kind}.label`), t(`phone.install.kinds.${kind}.help`)),
      )}
      {row('onlyDuringShift', t('phone.install.onlyShift'), t('phone.install.onlyShiftHelp'))}
      {saveFailed ? (
        <p className="ph-install-text is-error" role="alert">
          {t('phone.install.saveFailed')}
        </p>
      ) : null}
      <button type="button" className="ph-pair-link" onClick={onTurnOff}>
        {t('phone.install.turnOff')}
      </button>
    </>
  );
}
