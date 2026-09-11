import { describeFailure } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { signIn } from './authSession';
import { forgetSessionQueries } from './sessionQueries';

interface SignInLocationState {
  readonly returnTo?: string;
  readonly reason?: 'expired' | 'signedOut';
}

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

/**
 * Venue-user sign-in.
 *
 * Reached two ways: by opening the console with no session, and by being sent
 * here when a refresh was rejected. In both cases `returnTo` carries where the
 * person was, so signing in puts them back on that page rather than on the
 * landing page — a manager who lost their session mid-floor-plan goes back to
 * the floor plan.
 */
export function SignInRoute() {
  const { t } = useTranslation(['admin', 'common']);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const state = (location.state ?? {}) as SignInLocationState;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure(null);
    try {
      await signIn(email.trim(), password);
      // The router is built from who is signed in; drop the anonymous answer,
      // and with it whatever the last person on this tab read. The sign-out
      // listener usually has, but not when their session ended somewhere it
      // was not mounted, and this form is the one path every new session
      // passes through.
      await forgetSessionQueries(queryClient);
      navigate(landingAfterSignIn(state.returnTo), { replace: true });
    } catch (error) {
      const kind = describeFailure(error);
      setFailure(
        kind === 'unauthorized'
          ? t('signIn.failed')
          : kind === 'offline'
            ? t('state.offline')
            : t('state.error'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page page-narrow sign-in">
      <div className="card">
        <h1>{t('signIn.title')}</h1>
        <p className="muted">
          {state.reason === 'expired' ? t('signIn.expired') : t('signIn.body')}
        </p>

        <form onSubmit={(event) => void submit(event)}>
          <label className="labelled">
            {t('signIn.email')}
            <input
              className="field"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="labelled">
            {t('signIn.password')}
            <input
              className="field"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {failure ? (
            <p className="error" role="alert">
              {failure}
            </p>
          ) : null}

          <button type="submit" className="button button-primary" disabled={busy}>
            {t('signIn.submit')}
          </button>
        </form>
      </div>
    </section>
  );
}
