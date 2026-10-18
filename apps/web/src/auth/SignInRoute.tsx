import { TooManyRequestsError, describeFailure } from '@yalla/api';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
} from '../console/ui/icons';
import { AuthLayout } from './AuthLayout';
import { requestPasswordReset, signIn } from './authSession';
import { forgetSessionQueries } from './sessionQueries';

interface SignInLocationState {
  readonly returnTo?: string;
  readonly reason?: 'expired' | 'signedOut';
}

/** How long the welcome card shows before the console opens by itself. */
export const WELCOME_MS = 700;

/** The artboard's check: something, an @, something, a dot, something. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/**
 * Where signing in lands, given where the person was.
 *
 * Two places are never returned to. The sign-in form itself, obviously. And
 * the password page a sign-in link opens: it belongs to whoever holds the link,
 * not to whoever has just signed in, and a signed-in person arriving there is
 * shown a notice rather than a form. Sending them back to it after sign-in
 * would be offering them somebody else's credential.
 */
function landingAfterSignIn(returnTo: string | undefined): string {
  if (!returnTo || returnTo === '/sign-in' || returnTo.startsWith('/reset-password')) return '/';
  return returnTo;
}

type View = 'login' | 'forgot' | 'done';

type Refusal =
  | { readonly kind: 'credentials' }
  | { readonly kind: 'locked'; readonly minutes: number | null; readonly until: number | null }
  | { readonly kind: 'offline' }
  | { readonly kind: 'error' };

type FocusTarget = 'email' | 'password' | 'forgot';

/**
 * Console sign-in (SignIn artboard), for every console role.
 *
 * Reached two ways: by opening the console with no session, and by being sent
 * here when a refresh was rejected. In both cases `returnTo` carries where the
 * person was, so signing in puts them back on that page rather than on the
 * landing page — a manager who lost their session mid-floor-plan goes back to
 * the floor plan.
 *
 * The artboard's rules, kept: errors appear under their field once a submit has
 * been tried, and the cursor goes to the first one; a wrong password is said
 * once, in an alert, with the password cleared and the cursor back in it; too
 * many attempts (a 429) is amber, says how long to wait when the server said,
 * and sends nothing more until then. The server answers a wrong address, a
 * wrong password and a deactivated account the same way, and so does this page.
 */
export function SignInRoute() {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const state = (location.state ?? {}) as SignInLocationState;

  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  const [caps, setCaps] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [forgotTried, setForgotTried] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotFailure, setForgotFailure] = useState<string | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const forgotEmailRef = useRef<HTMLInputElement>(null);
  const leaving = useRef(false);
  const welcomeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A field to focus once the render that shows it has happened. */
  const pendingFocus = useRef<FocusTarget | null>(null);

  const fieldFor = (target: FocusTarget) =>
    ({ email: emailRef, password: passwordRef, forgot: forgotEmailRef })[target].current;

  /** Focus a field now if it is on screen, or right after the render that shows it. */
  function focusField(target: FocusTarget) {
    const field = fieldFor(target);
    if (field) field.focus();
    else pendingFocus.current = target;
  }

  // Every render: a view switch puts the field on screen, then this focuses it.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    fieldFor(target)?.focus();
  });

  useEffect(
    () => () => {
      if (welcomeTimer.current) clearTimeout(welcomeTimer.current);
    },
    [],
  );

  const trimmed = email.trim();
  const emailError = !trimmed
    ? t('signIn.emailRequired')
    : EMAIL_SHAPE.test(trimmed)
      ? null
      : t('signIn.emailInvalid');
  const passwordMissing = password.length === 0;
  const credentialsRefused = refusal?.kind === 'credentials' && !busy;
  const showEmailError = tried && emailError !== null;
  const showPasswordError = tried && passwordMissing && !credentialsRefused;

  async function enterConsole() {
    if (leaving.current) return;
    leaving.current = true;
    if (welcomeTimer.current) clearTimeout(welcomeTimer.current);
    // The router is built from who is signed in; drop the anonymous answer,
    // and with it whatever the last person on this tab read. The sign-out
    // listener usually has, but not when their session ended somewhere it
    // was not mounted, and this form is the one path every new session
    // passes through.
    await forgetSessionQueries(queryClient);
    navigate(landingAfterSignIn(state.returnTo), { replace: true });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (emailError || passwordMissing) {
      setTried(true);
      setRefusal((current) => (current?.kind === 'credentials' ? null : current));
      focusField(emailError ? 'email' : 'password');
      return;
    }
    // Still inside the wait the server named: asking again only restarts it.
    if (refusal?.kind === 'locked' && refusal.until !== null && Date.now() < refusal.until) return;

    setTried(true);
    setBusy(true);
    setRefusal(null);
    try {
      await signIn(trimmed, password);
      setView('done');
      welcomeTimer.current = setTimeout(() => void enterConsole(), WELCOME_MS);
    } catch (error) {
      const kind = describeFailure(error);
      if (error instanceof TooManyRequestsError) {
        const seconds = error.retryAfterSeconds;
        setRefusal({
          kind: 'locked',
          minutes: seconds === null ? null : Math.max(1, Math.ceil(seconds / 60)),
          until: seconds === null ? null : Date.now() + seconds * 1000,
        });
      } else if (kind === 'unauthorized') {
        setRefusal({ kind: 'credentials' });
        setPassword('');
        focusField('password');
      } else {
        setRefusal({ kind: kind === 'offline' ? 'offline' : 'error' });
      }
    } finally {
      setBusy(false);
    }
  }

  function openForgot() {
    setView('forgot');
    setForgotSent(false);
    setForgotTried(false);
    setForgotFailure(null);
    focusField('forgot');
  }

  function backToLogin() {
    setView('login');
    focusField('email');
  }

  async function sendReset(event: FormEvent) {
    event.preventDefault();
    if (forgotBusy) return;
    if (emailError) {
      setForgotTried(true);
      setForgotSent(false);
      focusField('forgot');
      return;
    }
    setForgotTried(false);
    setForgotFailure(null);
    setForgotBusy(true);
    try {
      await requestPasswordReset(trimmed, locale);
      setForgotSent(true);
    } catch (error) {
      setForgotSent(false);
      setForgotFailure(
        error instanceof TooManyRequestsError
          ? t('signIn.forgotPage.tooMany')
          : describeFailure(error) === 'offline'
            ? t('state.offline')
            : t('state.error'),
      );
    } finally {
      setForgotBusy(false);
    }
  }

  const refusalText =
    refusal?.kind === 'credentials'
      ? t('signIn.failed')
      : refusal?.kind === 'locked'
        ? refusal.minutes === null
          ? t('signIn.locked')
          : t('signIn.lockedFor', { count: refusal.minutes })
        : refusal?.kind === 'offline'
          ? t('state.offline')
          : refusal?.kind === 'error'
            ? t('state.error')
            : null;

  /** `aria-describedby` naming only the descriptions that are on screen. */
  const describe = (...ids: (string | false)[]) => {
    const present = ids.filter((id): id is string => Boolean(id));
    return present.length > 0 ? { 'aria-describedby': present.join(' ') } : {};
  };

  return (
    <AuthLayout claim={t('signIn.claim')} claimSub={t('signIn.claimSub')} languagePicker>
      {view === 'login' ? (
        <>
          <form
            className="yc-auth-card"
            aria-labelledby="si-h"
            noValidate
            onSubmit={(event) => void submit(event)}
          >
            <div>
              <h1 className="yc-h1" id="si-h">
                {t('signIn.title')}
              </h1>
              <p className="yc-sub">
                {state.reason === 'expired' ? t('signIn.expired') : t('signIn.body')}
              </p>
            </div>

            {refusalText && !busy ? (
              <div
                className={
                  refusal?.kind === 'credentials' || refusal?.kind === 'error'
                    ? 'yc-alert'
                    : 'yc-alert yc-alert-warn'
                }
                role="alert"
              >
                {refusal?.kind === 'locked' ? <LockIcon /> : <AlertCircleIcon />}
                <span>{refusalText}</span>
              </div>
            ) : null}

            <div className="yc-fld">
              <label htmlFor="si-email">{t('signIn.email')}</label>
              <input
                ref={emailRef}
                id="si-email"
                type="email"
                className="yc-ctl"
                autoComplete="username"
                inputMode="email"
                placeholder={t('signIn.emailPlaceholder')}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={showEmailError || credentialsRefused}
                {...describe(showEmailError && 'si-email-err')}
              />
              {showEmailError ? (
                <span className="yc-err" id="si-email-err">
                  {emailError}
                </span>
              ) : null}
            </div>

            <div className="yc-fld">
              <label htmlFor="si-pass">{t('signIn.password')}</label>
              <div className="yc-pw">
                <input
                  ref={passwordRef}
                  id="si-pass"
                  type={shown ? 'text' : 'password'}
                  className="yc-ctl"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyUp={(event) => setCaps(event.getModifierState('CapsLock'))}
                  aria-invalid={showPasswordError || credentialsRefused}
                  {...describe(showPasswordError && 'si-pass-err', caps && 'si-caps')}
                />
                <button
                  type="button"
                  className="yc-eye"
                  aria-label={shown ? t('signIn.hidePassword') : t('signIn.showPassword')}
                  aria-pressed={shown}
                  onClick={() => setShown(!shown)}
                >
                  {shown ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              {showPasswordError ? (
                <span className="yc-err" id="si-pass-err">
                  {t('signIn.passwordRequired')}
                </span>
              ) : null}
              {caps ? (
                <span className="yc-caps" id="si-caps">
                  {t('signIn.capsLock')}
                </span>
              ) : null}
            </div>

            <div className="yc-row-end">
              <button type="button" className="yc-lnk" onClick={openForgot}>
                {t('signIn.forgot')}
              </button>
            </div>

            <button type="submit" className="yc-btn yc-btn-pri" aria-busy={busy}>
              {busy ? <span className="yc-spin" aria-hidden="true" /> : null}
              {busy ? t('signIn.submitting') : t('signIn.submit')}
            </button>
          </form>
          <p className="yc-auth-note">{t('signIn.noAccount')}</p>
        </>
      ) : null}

      {view === 'done' ? (
        <div className="yc-auth-card yc-state" role="status">
          <span className="yc-state-ic" aria-hidden="true">
            <CheckIcon />
          </span>
          <h1 className="yc-h1">{t('signIn.welcomeTitle')}</h1>
          <p className="yc-sub">{t('signIn.welcomeBody')}</p>
          <Link
            className="yc-btn yc-btn-pri"
            to={landingAfterSignIn(state.returnTo)}
            replace
            onClick={(event) => {
              event.preventDefault();
              void enterConsole();
            }}
          >
            {t('signIn.welcomeGo')}
          </Link>
        </div>
      ) : null}

      {view === 'forgot' ? (
        <form
          className="yc-auth-card"
          aria-labelledby="fg-h"
          noValidate
          onSubmit={(event) => void sendReset(event)}
        >
          <div>
            <h1 className="yc-h1" id="fg-h">
              {t('signIn.forgotPage.title')}
            </h1>
            <p className="yc-sub">{t('signIn.forgotPage.body')}</p>
          </div>

          {forgotSent ? (
            <div className="yc-alert yc-alert-ok" role="status">
              <CheckIcon />
              <span>{t('signIn.forgotPage.sent')}</span>
            </div>
          ) : null}
          {forgotFailure ? (
            <div className="yc-alert yc-alert-warn" role="alert">
              <AlertCircleIcon />
              <span>{forgotFailure}</span>
            </div>
          ) : null}

          <div className="yc-fld">
            <label htmlFor="fg-email">{t('signIn.email')}</label>
            <input
              ref={forgotEmailRef}
              id="fg-email"
              type="email"
              className="yc-ctl"
              autoComplete="username"
              inputMode="email"
              placeholder={t('signIn.emailPlaceholder')}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={forgotTried && emailError !== null}
              {...describe(forgotTried && emailError !== null && 'fg-err')}
            />
            {forgotTried && emailError ? (
              <span className="yc-err" id="fg-err">
                {emailError}
              </span>
            ) : null}
          </div>

          <button type="submit" className="yc-btn yc-btn-pri" aria-busy={forgotBusy}>
            {forgotBusy ? <span className="yc-spin" aria-hidden="true" /> : null}
            {forgotBusy ? t('signIn.forgotPage.sending') : t('signIn.forgotPage.submit')}
          </button>
          <div className="yc-row-center">
            <button type="button" className="yc-lnk yc-lnk-back" onClick={backToLogin}>
              <ArrowLeftIcon />
              {t('signIn.forgotPage.back')}
            </button>
          </div>
        </form>
      ) : null}
    </AuthLayout>
  );
}
