import { ValidationError, describeFailure } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { usingMockData } from '../data/gateway';
import { resetPassword, signOut } from './authSession';
import { LoadingScreen } from './RequireRole';
import { useCurrentUser } from './useCurrentUser';

/**
 * Mirrors `Auth:MinimumPasswordLength` in the backend's `appsettings.json`.
 *
 * Checked here so the usual case is refused before a round trip, and not
 * trusted: the server's own refusal names the real minimum and is rendered
 * verbatim when the two disagree, so a deployment that raises the number does
 * not leave this page insisting on a length the server no longer accepts.
 */
const MINIMUM_PASSWORD_LENGTH = 12;

/**
 * Where a sign-in link lands.
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
 *   this component's state and nowhere else.
 * - A person who already has a console session is shown a notice, not the
 *   form. The link is for someone else: an owner who "tests" it consumes the
 *   only copy and, if they go on, ends up knowing their manager's password.
 * - A 401 from the reset endpoint is the link being unknown, spent or expired.
 *   The call carries no session, so it is never mistaken for a sign-out, and
 *   the page says what happened rather than bouncing to a sign-in form the
 *   person has no password for.
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
  const [busy, setBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // The token has been read; nothing about it belongs in the address bar or
  // the history entry any longer. A replace, so Back does not bring it back.
  useEffect(() => {
    if (location.hash === '' && location.search === '') return;
    navigate({ pathname: location.pathname, search: '', hash: '' }, { replace: true });
  }, [navigate, location.pathname, location.search, location.hash]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFailure(null);
    setPasswordError(null);
    setConfirmError(null);

    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      setPasswordError(t('resetPassword.tooShort', { min: MINIMUM_PASSWORD_LENGTH }));
      return;
    }
    if (password !== confirm) {
      setConfirmError(t('resetPassword.mismatch'));
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
        setPasswordError(error.message);
      } else {
        setFailure(describeFailure(error) === 'offline' ? t('state.offline') : t('state.error'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    await signOut();
    // The router is built from who is signed in; ask again now that nobody is.
    await queryClient.resetQueries({ queryKey: ['currentUser'] });
  }

  if (isLoading) return <LoadingScreen />;

  if (user) {
    const name = user.displayName || t(`role.${user.role}`);
    return (
      <section className="page page-narrow sign-in">
        <div className="card">
          <h1>{t('resetPassword.signedInTitle', { name })}</h1>
          <p className="muted">{t('resetPassword.signedInBody')}</p>
          {/* Only against a real backend: the mock has no session to end, and a
              sign-out that does nothing is worse than none. */}
          {usingMockData ? null : (
            <div className="actions">
              <button type="button" className="button" onClick={() => void leave()}>
                {t('shell.signOut')}
              </button>
            </div>
          )}
        </div>
      </section>
    );
  }

  if (phase === 'done') {
    return (
      <section className="page page-narrow sign-in">
        <div className="card">
          <h1>{t('resetPassword.doneTitle')}</h1>
          <p className="muted">{t('resetPassword.doneBody')}</p>
          <div className="actions">
            <Link className="button button-primary" to="/sign-in">
              {t('resetPassword.goToSignIn')}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (phase === 'invalid') {
    return (
      <section className="page page-narrow sign-in">
        <div className="card">
          <h1>{t('resetPassword.invalidTitle')}</h1>
          <p className="muted">{t('resetPassword.invalidBody')}</p>
          <div className="actions">
            <Link className="button" to="/sign-in">
              {t('resetPassword.goToSignIn')}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page page-narrow sign-in">
      <div className="card">
        <h1>{t('resetPassword.title')}</h1>
        <p className="muted">{t('resetPassword.body')}</p>

        <form onSubmit={(event) => void submit(event)}>
          {/*
            `new-password` on both fields, so a browser offers to generate one
            and never fills in a password it has saved for somebody else on
            this machine. The errors sit outside the labels and are linked with
            `aria-describedby`, as the staff form's are.
          */}
          <div className="labelled">
            <label htmlFor="reset-password">{t('resetPassword.password')}</label>
            <input
              id="reset-password"
              className="field"
              type="password"
              autoComplete="new-password"
              value={password}
              required
              {...(passwordError ? { 'aria-describedby': 'reset-password-error' } : {})}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
            {passwordError ? (
              <span id="reset-password-error" className="field-error" role="alert">
                {passwordError}
              </span>
            ) : null}
          </div>
          <div className="labelled">
            <label htmlFor="reset-confirm">{t('resetPassword.confirm')}</label>
            <input
              id="reset-confirm"
              className="field"
              type="password"
              autoComplete="new-password"
              value={confirm}
              required
              {...(confirmError ? { 'aria-describedby': 'reset-confirm-error' } : {})}
              onChange={(event) => setConfirm(event.currentTarget.value)}
            />
            {confirmError ? (
              <span id="reset-confirm-error" className="field-error" role="alert">
                {confirmError}
              </span>
            ) : null}
          </div>

          {failure ? (
            <p className="error" role="alert">
              {failure}
            </p>
          ) : null}

          <button type="submit" className="button button-primary" disabled={busy}>
            {t('resetPassword.submit')}
          </button>
        </form>
      </div>
    </section>
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
