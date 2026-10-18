import { LOCALES, useLocale, useTranslation, type Locale } from '@yalla/i18n';
import { useId, type ReactNode } from 'react';
import roomPhoto from '../assets/signin-room.jpg';
import '../console/ui/console.css';

export interface AuthLayoutProps {
  /** The sentence on the photo. */
  readonly claim: string;
  /** The smaller line under it, hidden on a phone. */
  readonly claimSub: string;
  /** Only the sign-in page offers the language; the password page follows it. */
  readonly languagePicker?: boolean;
  readonly children: ReactNode;
}

/**
 * The sign-in and password pages' frame (SignIn and SetPassword artboards): a
 * room photo with the brand and a sentence on one side, the card on the other.
 * Below 960px the photo becomes a band across the top.
 *
 * The photo is decoration (`alt=""`): the brand word on it is text, and the
 * card's own heading says what the page is for.
 */
export function AuthLayout({ claim, claimSub, languagePicker = false, children }: AuthLayoutProps) {
  const { t } = useTranslation(['admin', 'common']);

  return (
    <div className="yc yc-auth">
      <section className="yc-auth-room" aria-label={t('common:appName')}>
        <img className="yc-auth-photo" src={roomPhoto} alt="" />
        <div className="yc-auth-shade" aria-hidden="true" />
        <div className="yc-auth-brand">{t('common:appName')}</div>
        <p className="yc-auth-claim">
          {claim}
          <small>{claimSub}</small>
        </p>
      </section>

      <main className="yc-auth-side">
        {children}
        {languagePicker ? <LanguagePicker /> : null}
      </main>
    </div>
  );
}

/** The language, chosen before signing in: the only other place it is offered is Settings. */
function LanguagePicker() {
  const { t } = useTranslation(['admin', 'common']);
  const { locale, setLocale } = useLocale();
  const id = useId();

  return (
    <div className="yc-lang">
      <label htmlFor={id}>{t('common:language.label')}</label>
      <select
        id={id}
        value={locale}
        onChange={(event) => void setLocale(event.target.value as Locale)}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code} lang={code}>
            {t(`common:language.${code}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
