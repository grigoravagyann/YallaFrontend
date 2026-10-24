import { isOnShiftAt, type StaffRosterEntry, type StaffSessionIdentity } from '@yalla/api';
import { useNow } from '@yalla/api/react';
import { LOCALES, useLocale, useTranslation, type Locale } from '@yalla/i18n';
import { useEffect, useId, useRef, useState } from 'react';
import { PhoneIcon } from './PhoneShell';

export interface PhoneMoreProps {
  readonly identity: StaffSessionIdentity;
  /** "Lumen · Lumen North". */
  readonly place: string;
  /** The roster, for "My shift"; `undefined` while it is being read. */
  readonly roster: readonly StaffRosterEntry[] | undefined;
  /** The roster could not be read: "My shift" says so rather than "none". */
  readonly rosterFailed: boolean;
  /** A manager, a general manager or an owner: Today, history and the console. */
  readonly manager: boolean;
  readonly onOpenToday: () => void;
  /** The takeaway counter, when the bottom tabs have no room for it. */
  readonly onOpenTakeaway?: (() => void) | undefined;
  /** "Lock now": the tablet's sign-out — the PIN gate comes up over the screen. */
  readonly onLock: () => void;
  /**
   * "Unpair this phone", after its confirm.
   *
   * TODO(staff-phone pairing): a no-op until the device-pairing work lands —
   * it will revoke this phone's device and go back to the pairing screen.
   */
  readonly onUnpair: () => void;
}

/** The venue console's own pages, for a manager on the phone. */
export const CONSOLE_PATHS = {
  messages: '/venue/messages',
  console: '/venue',
} as const;

/**
 * More (the More artboard): who this phone belongs to, a manager's links,
 * "My shift", the language, "Lock now", and "Unpair this phone" behind a
 * confirm.
 */
export function PhoneMore(props: PhoneMoreProps) {
  const { t, i18n } = useTranslation(['staff', 'common']);
  const { locale, setLocale } = useLocale();
  const now = useNow(60_000);
  const [askUnpair, setAskUnpair] = useState(false);
  const unpairHeading = useId();
  const languageLabel = useId();
  const keepRef = useRef<HTMLButtonElement>(null);
  const unpairRef = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);

  // Into the question when it opens; back to the button that asked it when
  // it closes, rather than to the top of the page.
  useEffect(() => {
    if (askUnpair) {
      asked.current = true;
      keepRef.current?.focus();
    } else if (asked.current) {
      asked.current = false;
      unpairRef.current?.focus();
    }
  }, [askUnpair]);

  const { identity } = props;
  const initials = identity.fullName
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase(locale))
    .join('');
  const mine = props.roster?.find((entry) => entry.staffMemberId === identity.staffMemberId);
  const shift = mine?.shift ?? null;
  const shiftText = props.rosterFailed
    ? t('phone.more.shiftUnknown')
    : props.roster === undefined
      ? t('floor.loading')
      : mine && isOnShiftAt(mine, now) && shift
        ? t('phone.more.shiftNow', { to: shift.endsAt })
        : shift
          ? t('phone.more.shiftNext', { from: shift.startsAt, to: shift.endsAt })
          : t('phone.more.shiftNone');

  return (
    <div className="ph-screen ph-more">
      <h1 className="ph-title">{t('phone.tabs.more')}</h1>

      <section className="ph-profile" aria-label={t('phone.more.profile')}>
        <span className="ph-profile-mark" aria-hidden="true">
          {initials}
        </span>
        <span className="ph-profile-text">
          <b>{identity.fullName}</b>
          <span>
            {t(`pin.role.${identity.role}`)} · {props.place}
          </span>
        </span>
      </section>

      {props.manager ? (
        <nav className="ph-list" aria-label={t('phone.more.manage')}>
          <button type="button" className="ph-list-row" onClick={props.onOpenToday}>
            {t('phone.more.today')}
            <PhoneIcon name="chevron" />
          </button>
          <a className="ph-list-row" href={CONSOLE_PATHS.messages}>
            {t('phone.more.history')}
            <PhoneIcon name="chevron" />
          </a>
          <a className="ph-list-row" href={CONSOLE_PATHS.console}>
            {t('phone.more.console')}
            <PhoneIcon name="chevron" />
          </a>
        </nav>
      ) : null}

      <section className="ph-list" aria-label={t('phone.more.mine')}>
        <div className="ph-list-row is-static">
          <span>{t('phone.more.myShift')}</span>
          <span className="ph-list-value">{shiftText}</span>
        </div>
        {props.onOpenTakeaway ? (
          <button type="button" className="ph-list-row" onClick={props.onOpenTakeaway}>
            {t('takeaway.title')}
            <PhoneIcon name="chevron" />
          </button>
        ) : null}
        <div className="ph-list-row is-static ph-language">
          <span id={languageLabel}>{t('common:language.label')}</span>
          <div className="ph-segments" role="radiogroup" aria-labelledby={languageLabel}>
            {LOCALES.map((code) => (
              <label key={code} className={code === locale ? 'ph-segment is-on' : 'ph-segment'}>
                <input
                  type="radio"
                  name="staff-phone-language"
                  value={code}
                  checked={code === locale}
                  onChange={() => void setLocale(code as Locale)}
                />
                <span lang={code}>{i18n.t(`common:language.${code}`, { lng: code })}</span>
              </label>
            ))}
          </div>
        </div>
      </section>

      <button type="button" className="ph-wide-btn" onClick={props.onLock}>
        {t('phone.more.lock')}
      </button>

      {askUnpair ? (
        <section className="ph-confirm" aria-labelledby={unpairHeading}>
          <h2 id={unpairHeading}>{t('phone.more.unpairTitle')}</h2>
          <p>{t('phone.more.unpairBody')}</p>
          <div className="ph-confirm-actions">
            <button
              type="button"
              ref={keepRef}
              className="ph-wide-btn"
              onClick={() => setAskUnpair(false)}
            >
              {t('phone.more.unpairNo')}
            </button>
            <button
              type="button"
              className="ph-wide-btn is-danger-fill"
              onClick={() => {
                setAskUnpair(false);
                props.onUnpair();
              }}
            >
              {t('phone.more.unpairYes')}
            </button>
          </div>
        </section>
      ) : (
        <button
          type="button"
          ref={unpairRef}
          className="ph-wide-btn is-danger"
          onClick={() => setAskUnpair(true)}
        >
          {t('phone.more.unpair')}
        </button>
      )}
    </div>
  );
}
