import { ValidationError, describeFailure } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircleIcon,
  CheckIcon,
  CrossIcon,
  DotIcon,
  EyeIcon,
  EyeOffIcon,
  LinkOffIcon,
  UserIcon,
} from '../console/ui/icons';
import { usingMockData } from '../data/gateway';
import { AuthLayout } from './AuthLayout';
import { resetPassword, signOut } from './authSession';
import { LoadingScreen } from './RequireRole';
import { forgetSessionQueries } from './sessionQueries';
import { landingPathFor, useCurrentUser } from './useCurrentUser';

/**
 * Mirrors `Auth:MinimumPasswordLength` in the backend's `appsettings.json`.
 *
 * Checked here so the usual case is refused before a round trip, and not
 * trusted: the server's own refusal names the real minimum and is rendered
 * verbatim when the two disagree, so a deployment that raises the number does
 * not leave this page insisting on a length the server no longer accepts.
 */
const MINIMUM_PASSWORD_LENGTH = 12;

const STRENGTH = ['empty', 'short', 'fair', 'good', 'strong'] as const;

/**
 * The SetPassword artboard's meter, 0 to 4: nothing typed, under the minimum,
 * then by length and by how many kinds of character (lower, upper, digit,
 * other) it mixes. Advice only — the server's one rule is the length.
 */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  const length = password.length;
  const kinds = [/[a-z]/u, /[A-Z]/u, /\d/u, /[^A-Za-z0-9]/u].filter((kind) =>
    kind.test(password),
  ).length;
  if (length === 0) return 0;
  if (length < MINIMUM_PASSWORD_LENGTH) return 1;
  if (length < 16 && kinds < 3) return 2;
  if (length < 20 && kinds < 4) return 3;
  return 4;
}

/**
 * Where a sign-in link lands (SetPassword artboard).
 *
 * A manager or owner never has a password typed for them. The person who
 * hired them issues a link, hands it over in a chat, and the recipient opens
 * it here and chooses a password of their own. The link is single-use and dies
 * after a day, which shapes everything below:
 *
 * - The token is read from the address bar **once**, on mount, and the address
 *   bar is then rewritten without it. It arrives in the fragment so it never
 *   reaches the static host's access log, and it is stripped so it does not
 *   sit in the browser's history either — a link that stays in the address bar
 *   is a link the next person at that keyboard can use. After that it lives in
 *   this component's state and nowhere else. The strip happens before the
 *   first request leaves, not merely soon after: the current-user query fires
 *   as it subscribes, and a token still in `document.URL` at that moment is
 *   a token in the Referer header of the refresh it triggers.
 * - A person who already has a console session is shown a notice, not the
 *   form. The link is for someone else: an owner who "tests" it consumes the
 *   only copy and, if they go on, ends up knowing their manager's password.
 * - A 401 from the reset endpoint is the link being unknown, spent or expired.
 *   The call carries no session, so it is never mistaken for a sign-out, and
 *   the page says what happened rather than bouncing to a sign-in form the
 *   person has no password for.
 *
 * The same page spends a forgotten-password link (an hour) and an invitation
 * (a day), and nothing in the token says which, so the copy names neither.
 * The artboard's "who this is for" box is left out for the same reason: the
 * token is opaque and no endpoint describes it.
 */
export function ResetPasswordRoute() {
  const { t } = useTranslation(['admin', 'common']);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isLoading } = useCurrentUser();

  const [token, setToken] = useState<string | null>(() => tokenFrom(location));
  const [phase, setPhase] = useState<'form' | 'done' | 'invalid'>(token ? 'form' : 'invalid');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [shown, setShown] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  // The token has been read; nothing about it belongs in the address bar or
  // the history entry any longer. A replace, so Back does not bring it back.
  //
  // A layout effect, deliberately. `useCurrentUser` above subscribes its
  // query in a passive effect and the fetch starts then; on the `?token=`
  // fallback path a passive strip ran after it, so the refresh left with the
  // token still in `document.URL` — eligible for the Referer header, and on a
  // same-origin API for its access log. Layout effects run first, and the
  // router rewrites the address bar synchronously.
  useLayoutEffect(() => {
    if (location.hash === '' && location.search === '') return;
    navigate({ pathname: location.pathname, search: '', hash: '' }, { replace: true });
  }, [navigate, location.pathname, location.search, location.hash]);

  const tooShort = password.length < MINIMUM_PASSWORD_LENGTH;
  const mismatch = confirm.length === 0 || password !== confirm;
  const score = passwordStrength(password);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setFailure(null);
    setServerError(null);

    if (tooShort || mismatch) {
      setTried(true);
      // The cursor goes to the first field a refused submit is about.
      (tooShort ? passwordRef : confirmRef).current?.focus();
      return;
    }
    if (!token) return;

    setBusy(true);
    try {
      await resetPassword(token, password);
      // Spent. Whatever else happens on this page, the token is not sent twice.
      setToken(null);
      setPassword('');
      setConfirm('');
      setPhase('done');
    } catch (error) {
      if (describeFailure(error) === 'unauthorized') {
        setToken(null);
        setPhase('invalid');
      } else if (error instanceof ValidationError) {
        // The server's own sentence: it names the minimum it actually enforces.
        setServerError(error.message);
        passwordRef.current?.focus();
      } else {
        setFailure(describeFailure(error) === 'offline' ? t('state.offline') : t('state.error'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    await signOut();
    // The router is built from who is signed in; ask again now that nobody
    // is. And forget what they read: this page is outside the console's
    // router, so its sign-out listener is not mounted to do it, and the
    // link's recipient signs in next on this very tab.
    await forgetSessionQueries(queryClient);
  }

  const layout = (children: React.ReactNode) => (
    <AuthLayout claim={t('resetPassword.claim')} claimSub={t('resetPassword.claimSub')}>
      {children}
    </AuthLayout>
  );

  if (isLoading) return <LoadingScreen standalone />;

  if (user) {
    const name = user.displayName || t(`role.${user.role}`);
    return layout(
      <div className="yc-auth-card yc-auth-card-wide yc-state" role="alert">
        <span className="yc-state-ic yc-state-ic-warn" aria-hidden="true">
          <UserIcon />
        </span>
        <h1 className="yc-h1">{t('resetPassword.signedInTitle', { name })}</h1>
        <p className="yc-sub">{t('resetPassword.signedInBody')}</p>
        <Link className="yc-btn yc-btn-pri" to={landingPathFor(user.role)}>
          {t('resetPassword.backToConsole')}
        </Link>
        {/* Only against a real backend: the mock has no session to end, and a
            sign-out that does nothing is worse than none. Signing out leaves
            the form, and the link read before it, for the link's owner. */}
        {usingMockData ? null : (
          <button type="button" className="yc-btn yc-btn-sec" onClick={() => void leave()}>
            {t('shell.signOut')}
          </button>
        )}
      </div>,
    );
  }

  if (phase === 'done') {
    return layout(
      <div className="yc-auth-card yc-auth-card-wide yc-state" role="status">
        <span className="yc-state-ic" aria-hidden="true">
          <CheckIcon />
        </span>
        <h1 className="yc-h1">{t('resetPassword.doneTitle')}</h1>
        <p className="yc-sub">{t('resetPassword.doneBody')}</p>
        <Link className="yc-btn yc-btn-pri" to="/sign-in">
          {t('resetPassword.goToSignIn')}
        </Link>
      </div>,
    );
  }

  if (phase === 'invalid') {
    return layout(
      <div className="yc-auth-card yc-auth-card-wide yc-state" role="alert">
        <span className="yc-state-ic yc-state-ic-warn" aria-hidden="true">
          <LinkOffIcon />
        </span>
        <h1 className="yc-h1">{t('resetPassword.invalidTitle')}</h1>
        <p className="yc-sub">{t('resetPassword.invalidBody')}</p>
        <Link className="yc-btn yc-btn-sec" to="/sign-in">
          {t('resetPassword.invalidSignIn')}
        </Link>
      </div>,
    );
  }

  const rules = [
    {
      id: 'length',
      bad: tooShort,
      text: t('resetPassword.tooShort', { min: MINIMUM_PASSWORD_LENGTH }),
    },
    { id: 'match', bad: mismatch, text: t('resetPassword.match') },
  ];
  const passwordInvalid = (tried && tooShort) || serverError !== null;
  const confirmInvalid = tried && mismatch;

  return layout(
    <>
      <form
        className="yc-auth-card yc-auth-card-wide"
        aria-labelledby="sp-h"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <div>
          <h1 className="yc-h1" id="sp-h">
            {t('resetPassword.title')}
          </h1>
          <p className="yc-sub">{t('resetPassword.body')}</p>
        </div>

        {failure ? (
          <div className="yc-alert yc-alert-warn" role="alert">
            <AlertCircleIcon />
            <span>{failure}</span>
          </div>
        ) : null}

        {/*
          `new-password` on both fields, so a browser offers to generate one
          and never fills in a password it has saved for somebody else on
          this machine. The rules under the fields are their description.
        */}
        <div className="yc-fld">
          <label htmlFor="sp-new">{t('resetPassword.password')}</label>
          <div className="yc-pw">
            <input
              ref={passwordRef}
              id="sp-new"
              type={shown ? 'text' : 'password'}
              className="yc-ctl"
              autoComplete="new-password"
              value={password}
              aria-invalid={passwordInvalid}
              aria-describedby={['sp-rules', 'sp-meter', serverError ? 'sp-new-err' : '']
                .filter(Boolean)
                .join(' ')}
              onChange={(event) => {
                setPassword(event.currentTarget.value);
                setServerError(null);
              }}
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
          <div className="yc-meter" aria-hidden="true">
            {[1, 2, 3, 4].map((bar) => (
              <i key={bar} className={bar <= score ? `is-${score}` : undefined} />
            ))}
          </div>
          <span className="yc-mlabel" id="sp-meter">
            {t(`resetPassword.strength.${STRENGTH[score]}`, { min: MINIMUM_PASSWORD_LENGTH })}
          </span>
          {serverError ? (
            <span className="yc-err" id="sp-new-err" role="alert">
              {serverError}
            </span>
          ) : null}
        </div>

        <div className="yc-fld">
          <label htmlFor="sp-rep">{t('resetPassword.confirm')}</label>
          <div className="yc-pw">
            <input
              ref={confirmRef}
              id="sp-rep"
              type={shown ? 'text' : 'password'}
              className="yc-ctl"
              autoComplete="new-password"
              value={confirm}
              aria-invalid={confirmInvalid}
              aria-describedby="sp-rules"
              onChange={(event) => setConfirm(event.currentTarget.value)}
            />
          </div>
        </div>

        <ul className="yc-rules" id="sp-rules" aria-live="polite">
          {rules.map((rule) => (
            <li key={rule.id} className={!rule.bad ? 'is-ok' : tried ? 'is-bad' : undefined}>
              {!rule.bad ? <CheckIcon /> : tried ? <CrossIcon /> : <DotIcon />}
              {rule.text}
              <span className="yc-sr">
                {' '}
                {rule.bad ? t('resetPassword.ruleNotMet') : t('resetPassword.ruleMet')}
              </span>
            </li>
          ))}
        </ul>

        <button type="submit" className="yc-btn yc-btn-pri" aria-busy={busy}>
          {busy ? <span className="yc-spin" aria-hidden="true" /> : null}
          {busy ? t('resetPassword.saving') : t('resetPassword.submit')}
        </button>
      </form>
      <p className="yc-auth-note">{t('resetPassword.linkNote')}</p>
    </>,
  );
}

/**
 * The token from the link, or null.
 *
 * The backend's link puts it in the fragment. The query is read as well so a
 * link that has been through something that drops fragments — some chat apps
 * rewrite URLs — still works; when both are present the fragment wins, since
 * that is the one the backend wrote.
 */
function tokenFrom(location: { readonly hash: string; readonly search: string }): string | null {
  const fromFragment = new URLSearchParams(location.hash.replace(/^#/u, '')).get('token');
  const fromQuery = new URLSearchParams(location.search).get('token');
  const token = fromFragment || fromQuery;
  return token ? token : null;
}
