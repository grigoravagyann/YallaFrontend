import type { UserRole } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { Link } from 'react-router-dom';
import { landingPathFor, useCurrentUser } from './useCurrentUser';

export interface RequireRoleProps {
  readonly allow: readonly UserRole[];
  readonly children: React.ReactNode;
}

/**
 * The second line of defence, not the first.
 *
 * The first is that a route a role cannot use is **never built into their
 * router** — a waiter's route tree contains no platform route to hide, so there
 * is nothing to reveal by editing CSS or guessing a URL. This guard exists for
 * the cases where one route is shared and the content differs, and as a
 * backstop if a route table and a role list ever drift apart.
 *
 * The third and only authoritative line is the server, which 403s regardless of
 * what the client believes.
 */
export function RequireRole({ allow, children }: RequireRoleProps) {
  const { user, isLoading } = useCurrentUser();

  if (isLoading) return <LoadingScreen />;
  if (!user || !allow.includes(user.role)) return <Forbidden />;

  return <>{children}</>;
}

export function LoadingScreen() {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <section className="page">
      <p className="muted">{t('loading')}</p>
    </section>
  );
}

/**
 * A plain refusal, and deliberately not a redirect.
 *
 * A redirect to "somewhere you can go" is how you build a loop: the target
 * bounces back, the bounce re-evaluates, and the address bar flickers forever.
 * A page that says what happened, changes nothing, and offers one link out is
 * both calmer and easier to debug.
 *
 * It is also what an unknown URL renders. Distinguishing "does not exist" from
 * "exists but is not yours" would tell someone which venue ids are real.
 */
export function Forbidden() {
  const { t } = useTranslation(['admin', 'common']);
  const { user } = useCurrentUser();

  return (
    <section className="page page-narrow">
      <h1>{t('forbidden.title')}</h1>
      <p className="muted">{t('forbidden.body')}</p>
      {user ? (
        <Link className="button" to={landingPathFor(user.role)}>
          {t('forbidden.back')}
        </Link>
      ) : null}
    </section>
  );
}
