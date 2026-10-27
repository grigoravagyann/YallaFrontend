import type { UserRole } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { ErrorState } from '../console/ui/ErrorState';
import '../console/ui/console.css';
// After console.css: the phone rules for single pages (2026-10-27).
import '../console/ui/phone-pages.css';
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

/**
 * Waiting for whoever is signed in.
 *
 * `standalone` before any shell exists — a full reload, while the session is
 * restored and the identity read, which takes a refresh round trip: a page of
 * the console's own, on its canvas, saying so, with the spinner the console's
 * reduced-motion rule stops. Without it that wait was a lone line on the bare
 * ground, which read as a blank grey page for two seconds.
 */
export function LoadingScreen({ standalone = false }: { readonly standalone?: boolean }) {
  const { t } = useTranslation(['admin', 'common']);
  if (standalone) {
    return (
      <div className="yc yc-boot" aria-busy="true">
        <p className="yc-boot-line" role="status">
          <span className="yc-spin" aria-hidden="true" />
          {t('loading')}
        </p>
      </div>
    );
  }
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
 * "exists but is not yours" would tell someone which venue ids are real — so
 * this is the Errors artboard's 403, whose copy covers both on purpose.
 *
 * `standalone` outside a console shell: a role with no console layout, or no
 * identity at all, still gets a whole page rather than a card on nothing.
 */
export function Forbidden({ standalone = false }: { readonly standalone?: boolean }) {
  const { user } = useCurrentUser();

  return (
    <ErrorState
      kind="forbidden"
      homeTo={user ? landingPathFor(user.role) : undefined}
      standalone={standalone}
    />
  );
}
