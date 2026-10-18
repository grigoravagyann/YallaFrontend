import {
  PLATFORM_NAME_MAX_LENGTH,
  PLATFORM_PASSWORD_MIN_LENGTH,
  TooManyRequestsError,
  ValidationError,
  type PlatformAdminProfile,
} from '@yalla/api';
import {
  useChangePlatformPassword,
  usePlatformProfile,
  useUpdatePlatformProfile,
} from '@yalla/api/react';
import { LOCALES, useLocale, useTranslation, type Locale } from '@yalla/i18n';
import { useId, useState, type FormEvent } from 'react';
import { CheckIcon, GlobeIcon, UserIcon } from '../ui/icons';
import { PageHeader } from '../ui/PageHeader';
import { useToast } from '../ui/toast';
import { Required, usePendingFocus } from './venue/venueFields';

type Section = 'account' | 'language';

/**
 * Settings (Settings artboard): "My account" — the admin's own name, the
 * email that configuration fixes, and the password — and the console's
 * language. There is one platform admin, so there is no list of admins here
 * (HANDOFF section 3).
 */
export function SettingsRoute() {
  const { t } = useTranslation(['admin', 'common']);
  const [section, setSection] = useState<Section>('account');
  return (
    <div className="yc-settings">
      <PageHeader title={t('settings.title')} sub={t('settings.sub')} />
      <div className="yc-cols">
        <nav className="yc-card yc-subnav" aria-label={t('settings.sections.label')}>
          <button
            type="button"
            className={section === 'account' ? 'is-on' : undefined}
            {...(section === 'account' ? { 'aria-current': 'page' as const } : {})}
            onClick={() => setSection('account')}
          >
            <UserIcon />
            {t('settings.sections.account')}
          </button>
          <button
            type="button"
            className={section === 'language' ? 'is-on' : undefined}
            {...(section === 'language' ? { 'aria-current': 'page' as const } : {})}
            onClick={() => setSection('language')}
          >
            <GlobeIcon />
            {t('settings.sections.language')}
          </button>
        </nav>
        <div className="yc-scontent">
          {section === 'account' ? (
            <>
              <Profile />
              <Password />
            </>
          ) : (
            <Language />
          )}
        </div>
      </div>
    </div>
  );
}

function Profile() {
  const { t } = useTranslation(['admin', 'common']);
  const query = usePlatformProfile();
  const titleId = useId();
  return (
    <section className="yc-card" aria-labelledby={titleId}>
      <div className="yc-card-h">
        <div>
          <h2 className="yc-h2" id={titleId}>
            {t('settings.profile.title')}
          </h2>
          <p className="yc-cap">{t('settings.profile.cap')}</p>
        </div>
      </div>
      {query.data ? (
        <ProfileForm key={query.data.staffMemberId} profile={query.data} />
      ) : query.isError ? (
        <p className="yc-alert yc-sform-note" role="alert">
          {t('settings.profile.loadFailed')}
        </p>
      ) : (
        <p className="yc-empty-line" role="status">
          {t('loading')}
        </p>
      )}
    </section>
  );
}

function ProfileForm({ profile }: { readonly profile: PlatformAdminProfile }) {
  const { t } = useTranslation(['admin', 'common']);
  const save = useUpdatePlatformProfile();
  const focusLater = usePendingFocus();
  const [draft, setDraft] = useState(profile.fullName);
  const [tried, setTried] = useState(false);
  const [saved, setSaved] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const name = draft.trim();
  const problem =
    name.length === 0
      ? t('settings.profile.nameRequired')
      : name.length > PLATFORM_NAME_MAX_LENGTH
        ? t('settings.profile.nameTooLong', { max: PLATFORM_NAME_MAX_LENGTH })
        : null;
  const error = serverError ?? (tried ? problem : null);
  const dirty = name !== profile.fullName && !saved;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (save.isPending) return;
    setTried(true);
    setServerError(null);
    setFailed(false);
    if (problem) {
      focusLater('me-name');
      return;
    }
    try {
      const after = await save.mutateAsync({ fullName: name });
      setDraft(after.fullName);
      setTried(false);
      setSaved(true);
    } catch (caught) {
      const violation =
        caught instanceof ValidationError
          ? caught.violations.find((entry) => entry.field === 'fullName')
          : undefined;
      if (violation) {
        setServerError(
          violation.bound === 'max'
            ? t('settings.profile.nameTooLong', { max: PLATFORM_NAME_MAX_LENGTH })
            : t('settings.profile.nameRequired'),
        );
        focusLater('me-name');
      } else {
        setFailed(true);
      }
    }
  }

  return (
    <form className="yc-sform" noValidate onSubmit={(event) => void submit(event)}>
      <div className="yc-row2">
        <div className="yc-fld">
          <label htmlFor="me-name">
            {t('settings.profile.name')}
            <Required />
          </label>
          <input
            id="me-name"
            className="yc-ctl"
            autoComplete="name"
            aria-required="true"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'me-name-err' : undefined}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setSaved(false);
              setServerError(null);
            }}
          />
          {error ? (
            <span className="yc-err" id="me-name-err">
              {error}
            </span>
          ) : null}
        </div>
        <div className="yc-fld">
          <label htmlFor="me-email">{t('settings.profile.email')}</label>
          <input id="me-email" className="yc-ctl" value={profile.email} readOnly />
        </div>
      </div>
      {failed ? (
        <p className="yc-alert" role="alert">
          {t('settings.profile.failed')}
        </p>
      ) : null}
      <div className="yc-sform-foot">
        <button type="submit" className="yc-btn yc-btn-pri" aria-busy={save.isPending}>
          {save.isPending ? t('settings.profile.saving') : t('settings.profile.save')}
        </button>
        {dirty ? <span className="yc-muted yc-small">{t('settings.profile.dirty')}</span> : null}
        <span role="status" className="yc-saved-slot">
          {saved ? (
            <span className="yc-saved">
              <CheckIcon />
              {t('settings.profile.saved')}
            </span>
          ) : null}
        </span>
      </div>
    </form>
  );
}

type PasswordField = 'current' | 'new' | 'repeat';
const FIELD_ID: Readonly<Record<PasswordField, string>> = {
  current: 'pw-cur',
  new: 'pw-new',
  repeat: 'pw-rep',
};

function Password() {
  const { t } = useTranslation(['admin', 'common']);
  const change = useChangePlatformPassword();
  const toast = useToast();
  const focusLater = usePendingFocus();
  const titleId = useId();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [tried, setTried] = useState(false);
  const [server, setServer] = useState<Partial<Record<PasswordField, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);

  const local: Partial<Record<PasswordField, string>> = {
    ...(current === '' ? { current: t('settings.password.currentRequired') } : {}),
    ...(next.length < PLATFORM_PASSWORD_MIN_LENGTH
      ? { new: t('settings.password.tooShort', { min: PLATFORM_PASSWORD_MIN_LENGTH }) }
      : repeat !== next
        ? { repeat: t('settings.password.mismatch') }
        : {}),
  };
  const errors: Partial<Record<PasswordField, string>> = { ...(tried ? local : {}), ...server };
  const firstInvalid = (found: Partial<Record<PasswordField, string>>) =>
    (['current', 'new', 'repeat'] as const).find((field) => found[field]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (change.isPending) return;
    setTried(true);
    setServer({});
    setFailure(null);
    const invalid = firstInvalid(local);
    if (invalid) {
      focusLater(FIELD_ID[invalid]);
      return;
    }
    try {
      const answer = await change.mutateAsync({ currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setRepeat('');
      setTried(false);
      // "Signed out on your other devices" only when the server renewed this
      // sign-in and ended the rest; otherwise nothing is claimed.
      toast.say(
        answer.sessionRenewed
          ? t('settings.password.changed')
          : t('settings.password.changedPlain'),
      );
    } catch (caught) {
      if (caught instanceof TooManyRequestsError) {
        const seconds = caught.retryAfterSeconds;
        setFailure(
          seconds === null
            ? t('settings.password.tooManyNoWindow')
            : t('settings.password.tooMany', { count: Math.max(1, Math.ceil(seconds / 60)) }),
        );
        return;
      }
      if (!(caught instanceof ValidationError) || caught.violations.length === 0) {
        setFailure(t('settings.password.failed'));
        return;
      }
      // A wrong current password is a form error, not a sign-out: the server
      // answers 422 naming the field, and it goes under that field.
      const found: Partial<Record<PasswordField, string>> = {};
      for (const violation of caught.violations) {
        if (violation.field === 'currentPassword') {
          found.current =
            violation.bound === 'conflict'
              ? t('settings.password.currentWrong')
              : t('settings.password.currentRequired');
        } else if (violation.field === 'newPassword') {
          found.new = t('settings.password.tooShort', {
            min: violation.min ?? PLATFORM_PASSWORD_MIN_LENGTH,
          });
        }
      }
      setServer(found);
      const invalidOnServer = firstInvalid(found);
      if (invalidOnServer) focusLater(FIELD_ID[invalidOnServer]);
      else setFailure(t('settings.password.failed'));
    }
  }

  const field = (
    name: PasswordField,
    label: string,
    value: string,
    onChange: (value: string) => void,
    autoComplete: string,
    hintId?: string,
  ) => {
    const id = FIELD_ID[name];
    const error = errors[name];
    const describedBy = [hintId, error ? `${id}-err` : null].filter(Boolean).join(' ');
    return (
      <div className="yc-fld">
        <label htmlFor={id}>
          {label}
          <Required />
        </label>
        <input
          id={id}
          type="password"
          className="yc-ctl"
          autoComplete={autoComplete}
          aria-required="true"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            if (server[name]) {
              setServer((was) => {
                const rest = { ...was };
                delete rest[name];
                return rest;
              });
            }
          }}
        />
        {hintId ? (
          <span className="yc-help" id={hintId}>
            {t('settings.password.hint', { min: PLATFORM_PASSWORD_MIN_LENGTH })}
          </span>
        ) : null}
        {error ? (
          <span className="yc-err" id={`${id}-err`}>
            {error}
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <section className="yc-card" aria-labelledby={titleId}>
      <div className="yc-card-h">
        <div>
          <h2 className="yc-h2" id={titleId}>
            {t('settings.password.title')}
          </h2>
          <p className="yc-cap">{t('settings.password.cap')}</p>
        </div>
      </div>
      <form className="yc-sform" noValidate onSubmit={(event) => void submit(event)}>
        {field('current', t('settings.password.current'), current, setCurrent, 'current-password')}
        <div className="yc-row2">
          {field('new', t('settings.password.new'), next, setNext, 'new-password', 'pw-hint')}
          {field('repeat', t('settings.password.repeat'), repeat, setRepeat, 'new-password')}
        </div>
        {failure ? (
          <p className="yc-alert" role="alert">
            {failure}
          </p>
        ) : null}
        <div className="yc-sform-foot">
          <button type="submit" className="yc-btn yc-btn-pri" aria-busy={change.isPending}>
            {change.isPending ? t('settings.password.changing') : t('settings.password.submit')}
          </button>
          <p className="yc-legend">
            <span className="yc-req" aria-hidden="true">
              *
            </span>{' '}
            {t('venues.add.required')}
          </p>
        </div>
      </form>
    </section>
  );
}

function Language() {
  const { t, i18n } = useTranslation(['admin', 'common']);
  const { locale, setLocale } = useLocale();
  const toast = useToast();
  const headingId = useId();

  async function choose(next: Locale) {
    if (next === locale) return;
    await setLocale(next);
    // Said in the language just chosen, which is also the proof it worked.
    toast.say(i18n.t('admin:settings.language.changed', { lng: next }));
  }

  return (
    <section className="yc-card" aria-labelledby={headingId}>
      <div className="yc-card-h">
        <div>
          <h2 className="yc-h2" id={headingId}>
            {t('settings.language.title')}
          </h2>
          <p className="yc-cap">{t('settings.language.body')}</p>
        </div>
      </div>
      <div className="yc-radios" role="radiogroup" aria-labelledby={headingId}>
        {LOCALES.map((code) => (
          <label key={code} className={code === locale ? 'yc-radio is-on' : 'yc-radio'}>
            <input
              type="radio"
              name="console-language"
              value={code}
              checked={code === locale}
              onChange={() => void choose(code)}
            />
            <span lang={code}>{t(`common:language.${code}`)}</span>
            {code === 'hy' ? (
              <span className="yc-radio-hint">{t('settings.language.default')}</span>
            ) : null}
          </label>
        ))}
      </div>
    </section>
  );
}
