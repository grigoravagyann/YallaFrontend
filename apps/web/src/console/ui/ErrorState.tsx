import type { FailureKind } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PadlockIcon, SearchIcon, SignOutIcon, WarningIcon, WifiOffIcon } from './icons';
import './console.css';

/** The five states of the Errors artboard. */
export type ErrorKind = 'notFound' | 'forbidden' | 'offline' | 'signedOut' | 'error';

/** Which state a failure the client classified is shown as. */
export function errorKindFor(failure: FailureKind | null): ErrorKind {
  switch (failure) {
    case 'offline':
      return 'offline';
    case 'unauthorized':
      return 'signedOut';
    case 'forbidden':
      return 'forbidden';
    case 'notFound':
      return 'notFound';
    default:
      return 'error';
  }
}

export interface ErrorStateProps {
  readonly kind: ErrorKind;
  /**
   * Offline and server error offer "Try again". The promise settling is the
   * attempt finishing; if this state is still on screen after it, the attempt
   * is counted and said. Offline also tries by itself when the browser comes
   * back online.
   */
  readonly onRetry?: () => unknown;
  /** The server's trace id, for a server error. Never made up when absent. */
  readonly reference?: string | null | undefined;
  /**
   * Where "Back to where you can go" (403) and "Home" (server error) lead: the
   * signed-in role's landing page. A 403 with nobody signed in offers no link;
   * "Home" falls back to `/`, which the router sends to the landing page.
   */
  readonly homeTo?: string | undefined;
  /** Outside the console shell: draws its own canvas, full height. */
  readonly standalone?: boolean;
}

interface Look {
  readonly icon: ReactNode;
  readonly tile: string;
  /** Announced (alert) or a plain labelled region. */
  readonly alert: boolean;
  readonly retry: boolean;
}

const LOOK: Record<ErrorKind, Look> = {
  notFound: { icon: <SearchIcon />, tile: 'yc-eic', alert: false, retry: false },
  forbidden: { icon: <PadlockIcon />, tile: 'yc-eic yc-eic-amber', alert: false, retry: false },
  offline: { icon: <WifiOffIcon />, tile: 'yc-eic yc-eic-amber', alert: true, retry: true },
  signedOut: { icon: <SignOutIcon />, tile: 'yc-eic', alert: true, retry: false },
  error: { icon: <WarningIcon />, tile: 'yc-eic yc-eic-red', alert: true, retry: true },
};

/**
 * One of the console's shared error states (Errors artboard): what happened,
 * whether anything changed, and the one way out that fits.
 *
 * - **404** — a venue that is not there, with the reminder that deleted venues
 *   stay listed under the Deleted filter.
 * - **403** — also what an unknown address shows: telling "does not exist"
 *   from "not yours" apart would say which ids are real.
 * - **Offline** — not red: a dead connection is a state, not a fault.
 * - **Session ended** — signs in and comes back to this very page.
 * - **Server error** — red, with the trace id to quote when there is one.
 */
export function ErrorState({ kind, onRetry, reference, homeTo, standalone }: ErrorStateProps) {
  const { t } = useTranslation(['admin', 'common']);
  const location = useLocation();
  const headingId = useId();
  const look = LOOK[kind];
  const [busy, setBusy] = useState(false);
  const [tries, setTries] = useState(0);
  const busyRef = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const retry = useCallback(async () => {
    if (!onRetry || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await onRetry();
    } finally {
      busyRef.current = false;
      // Still here once it settled: the attempt did not bring the page back.
      if (mounted.current) {
        setBusy(false);
        setTries((count) => count + 1);
      }
    }
  }, [onRetry]);

  useEffect(() => {
    if (kind !== 'offline' || !onRetry) return;
    const onOnline = () => void retry();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [kind, onRetry, retry]);

  const links: { readonly to: string; readonly label: string; readonly primary: boolean }[] =
    kind === 'notFound'
      ? [
          { to: '/platform/venues', label: t('errors.notFound.venues'), primary: true },
          { to: '/platform', label: t('errors.notFound.home'), primary: false },
        ]
      : kind === 'forbidden' && homeTo
        ? [{ to: homeTo, label: t('errors.forbidden.back'), primary: true }]
        : kind === 'error'
          ? [{ to: homeTo ?? '/', label: t('errors.error.home'), primary: false }]
          : [];

  const card = (
    <section
      className="yc-card yc-ecard"
      aria-labelledby={headingId}
      {...(look.alert ? { role: 'alert' } : {})}
    >
      <span className={look.tile} aria-hidden="true">
        {look.icon}
      </span>
      <span className="yc-code">{t(`errors.${kind}.code`)}</span>
      <h1 className="yc-h1" id={headingId}>
        {t(`errors.${kind}.title`)}
      </h1>
      <p className="yc-etext">{t(`errors.${kind}.body`)}</p>
      <div className="yc-eacts">
        {look.retry && onRetry ? (
          <button
            type="button"
            className="yc-btn yc-btn-pri"
            aria-busy={busy}
            onClick={() => void retry()}
          >
            {busy ? <span className="yc-spin" aria-hidden="true" /> : null}
            {busy ? t('errors.checking') : t('errors.retry')}
          </button>
        ) : null}
        {kind === 'signedOut' ? (
          <Link
            className="yc-btn yc-btn-pri"
            to="/sign-in"
            state={{ returnTo: `${location.pathname}${location.search}` }}
          >
            {t('errors.signedOut.signIn')}
          </Link>
        ) : null}
        {links.map((link) => (
          <Link
            key={link.to + link.label}
            className={link.primary ? 'yc-btn yc-btn-pri' : 'yc-btn yc-btn-sec'}
            to={link.to}
          >
            {link.label}
          </Link>
        ))}
      </div>
      {look.retry && tries > 0 ? (
        <span className="yc-tries" role="status">
          {t('errors.stillFailing', { attempt: tries })}
        </span>
      ) : null}
      {kind === 'error' && reference ? (
        <span className="yc-ref">{t('errors.error.reference', { reference })}</span>
      ) : null}
    </section>
  );

  return standalone ? (
    <main className="yc yc-error-page">{card}</main>
  ) : (
    <div className="yc yc-error-wrap">{card}</div>
  );
}
